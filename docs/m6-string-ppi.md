# M6 — STRING human functional association network

M6 is the next step in the CAPN1/AML public reconstruction. It consumes the M4 DEG output and uses Python 3.11+, the Python standard-library HTTP client, and NetworkX. It does not depend on R.

## Data selection and provenance

Input: active, checksum-verified `study/deg.json` → `deg-significant.tsv` with matching M2/M3 lineage. Only M4-significant, protein-coding, nonempty, unambiguous `gene_name` symbols are queried. The raw input and any exclusions are in `input-genes.tsv`; STRING lookup mapping and its raw response are separately preserved.

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

The number in the example is not a completed research decision; it is intentionally provided as an explicit CLI argument. Alternatively, after selecting an integer in the workspace D4 decision record, omit `--required-score`.

## Output and cache

A successful run writes a new immutable `runs/m6-ppi/<run-id>/`, with:
`input-genes.tsv`, `string-id-mapping-raw.tsv`, `string-id-mapping.tsv`,
`string-network-raw.tsv`, `string-requests.json`,
`ppi-nodes.tsv`, `ppi-edges.tsv`, `ppi-metrics.tsv`,
`ppi-network.svg`, `runtime.tsv`, `statistics.json`,
`report.md` and `run-manifest.json`.

`study/ppi.json` points to the last successfully published M6 run. A compatible subsequent invocation checks hashes and is a cache hit. Explicit `--refresh-string` asks STRING for a new snapshot, recording its new response and run ID. Any failed remote or computational step leaves the prior completed pointer intact.

The graph keeps isolated proteins even when STRING returns no interactions. The overview SVG displays up to 60 highest-degree nodes and is not a full network representation; use TSVs for complete information.

## Validation and boundaries

CI uses deterministic, offline fixtures that still execute real Python NetworkX. These cover mapping, zero edges, extra response proteins, confidence units, cache reuse, failed refresh and invalid input lineage. A network of zero edges is a valid negative finding when mapped proteins exist. External live STRING availability is not guaranteed by offline tests.

M6 does not change M1–M5, fetch GDC again, perform immune deconvolution (M7), or assemble the final comprehensive report (M8).
