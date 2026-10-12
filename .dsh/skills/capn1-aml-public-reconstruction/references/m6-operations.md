# M6 STRING / NetworkX operating contract

Class: PUBLIC-FIXED data provider with an explicitly chosen D4 parameter. No R.

1. Inspect `study/ppi.json`, `study/deg.json` and `study/decisions.yaml` before doing anything external.
2. Require a completed compatible M2/M3/M4 lineage. Verify **every** active M4 output checksum. Reuse `deg-significant.tsv`; never automatically re-download 640 MB of GDC data.
3. D4 confidence is unresolved by default. Ask the researcher to record a scalar integer `selected` under `D4` in the workspace decision file, **or** supply an explicit run-level `--required-score N`; do not silently choose 400. Scores must be integer 0–1000; 400 is an example, not an approval.
4. Use `pnpm run ppi --workspace /path/to/study --required-score 400` only if explicitly chosen. Omit the score if already recorded as a selected D4 in the workspace. Repeat without refresh reuses verified cached artifacts.
5. If needed, `--refresh-string` reruns and explicitly re-fetches STRING mapping and network associations. Failure must preserve the last completed `study/ppi.json`.
6. Select M4 significant, unique protein-coding symbols; preserve excluded inputs. Resolve identifiers with STRING `get_string_ids`, then request only interactions among the mapped human 9606 proteins using `network_type=functional`, `add_nodes=0` and `required_score=N`.
7. Record the version-pinned STRING host, request bodies, raw TSV responses, provider species, confidence score and mapping exclusions. Retain all mapped nodes including isolates, as well as the full edge table and optional evidence columns.
8. Run Python NetworkX to obtain degrees, components and a deterministic network overview. `ppi-network.svg` displays no more than 60 nodes by degree, while TSVs retain the complete network.
9. Review `input-genes.tsv`, `string-id-mapping-raw.tsv`, `string-id-mapping.tsv`, `string-network-raw.tsv`, `ppi-nodes.tsv`, `ppi-edges.tsv`, `ppi-metrics.tsv`, `report.md` and `study/ppi.json`.

Interpret STRING scores as **functional associations**, not experimentally confirmed physical binding. Scientific interpretation and independent experimental validation are outside M6. No M7/M8 work is included.
