# M6 — STRING human functional association network

M6 is the next step in the CAPN1/AML public reconstruction. It consumes the M4 DEG output and uses Python 3.11+, the Python standard-library HTTP client, and NetworkX. It does not depend on R.

## Data selection and provenance

Input: active, checksum-verified `study/deg.json` → `deg-significant.tsv` with matching M2/M3 lineage. Only M4-significant, protein-coding, nonempty and locally non-duplicate `gene_name` symbols are queried. STRING then selects one **best match** per query; this is not independent verification that a symbol uniquely identifies a protein. The raw input and any exclusions are in `input-genes.tsv`; STRING lookup mapping and its raw response are separately preserved.

Public STRING endpoint: `https://version-12-5.string-db.org/api`, taxon 9606. First POST `/tsv/get_string_ids` with `echo_query=1`. Then POST `/tsv/network` with STRING IDs, `network_type=functional`, `add_nodes=0` and explicit `required_score`. Scores in the request are integer **0–1000**; TSV output `score` is a floating value **0–1**. We record both units and filter any inconsistent response below the specified threshold. Retry transient 429/5xx errors with bounded backoff.

Provider API: https://string-db.org/help/api/

The STRING graph is a protein functional-association graph, **not evidence that every pair physically binds**. Connectedness and degree do not imply mechanisms or clinical outcomes.

## D4 — explicit confidence decision

`study/decisions.yaml` initially has `D4.selected: null`. Do not silently turn the template's proposed 400 into an approved researcher decision.

Specify a run-level confidence explicitly:

```sh
python -m pip install -r requirements.txt
pnpm run ppi --workspace /absolute/path/to/study --required-score 400
```

The number in the example is not a completed research decision; it is intentionally provided as an explicit CLI argument. Alternatively, set both `D4.status: selected` (or `approved`) and an integer `D4.selected` in the workspace decision record; then omit `--required-score`. An unresolved decision carrying a numeric value is rejected as contradictory. An explicit CLI setting is valid with `D4.status: unresolved` and `D4.selected: null`.

## Output and cache

A successful run writes a new immutable `runs/m6-ppi/<run-id>/`, with:
`input-genes.tsv`, `string-id-mapping-raw.tsv`, `string-id-mapping.tsv`,
`string-network-raw.tsv`, `string-requests.json`,
`ppi-nodes.tsv`, `ppi-edges.tsv`, `ppi-metrics.tsv`,
`ppi-network.svg`, `runtime.tsv`, `statistics.json`,
`report.md` and `run-manifest.json`.

`study/ppi.json` points to the last successfully published M6 run. A compatible subsequent invocation checks hashes and is a cache hit. Explicit `--refresh-string` asks STRING for a new snapshot, recording its new response and run ID. Any failed remote or computational step leaves the prior completed pointer intact. When an existing active cache is corrupt or differs from current input/code/parameters, the default command **fails closed and performs no STRING request**; inspect the mismatch and explicitly use `--refresh-string` before a new provider retrieval.

STRING can automatically add neighbors for a singleton protein query. To honor input-only semantics, a one-mapped-protein run deliberately skips the network endpoint and emits a truthful singleton zero-edge graph; its request record marks this explicitly. For multi-protein network requests, the workflow observes the provider's recommended one-second spacing between calls. Mapping requests use the supported `identifiers`, `species`, `echo_query` and `caller_identity` parameters only. Official `get_string_ids` returns a single STRING-selected **best matching ID** for each query, not all alternative candidates. The mapping table labels `string_best_match`; it must not be interpreted as a verified unique biological mapping. If the response contains multiple different IDs for a query, that query is excluded.

The graph keeps isolated proteins even when STRING returns no interactions. The overview SVG displays up to 60 highest-degree nodes and is not a full network representation; use TSVs for complete information.

## Validation and boundaries

CI uses deterministic, offline fixtures that still execute real Python NetworkX. These cover best-match mapping provenance, zero edges, extra response proteins, confidence units, cache reuse, damaged-cache fail-closed behavior, D4 state validation, failed refresh and invalid input lineage. A network of zero edges is a valid negative finding when mapped proteins exist. External live STRING availability is not guaranteed by offline tests.

M6 does not change M1–M5, fetch GDC again, perform immune deconvolution (M7), or assemble the final comprehensive report (M8).
