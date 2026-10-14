# M8 — Evidence-grounded reconstruction synthesis

Class: RECONSTRUCTED report assembly from verified workspace state. No scientific computation, no HTTP calls, no models, no additional research runtime.

1. Inspect active study pointers: `source.json`, `processed.json`, `survival.json`, `deg.json`, `enrichment.json`, `ppi.json`, `immune.json` under `study/`. Do not run M1–M7 merely because they exist as scripts.
2. Run `pnpm run report --workspace /absolute/path/to/study`. The generator verifies each present M2–M7 manifest, all registered output byte counts and SHA-256 digests, public GO/KEGG and immune-marker reference digests when declared, and compatible source / upstream IDs. For M1 it checks the source identity record; it **does not** rehash the original large GDC raw archive.
3. An absent stage produces an explicitly labeled `INCOMPLETE DRAFT` with a gaps table. If an existing manifest is incomplete, damaged, or incompatible, stop rather than treating it as absent. No findings for M6/M7 may be inferred when their active runs are missing.
4. `--require-complete` fails before publication unless every active M1–M7 stage is verified and M6/M7 declare live provider/source modes. Even then the output is only `READY FOR RESEARCHER REVIEW`, not a signed-off scientific claim.
5. Repeated compatible requests use a verified M8 cache. `--rerun` explicitly creates a fresh immutable synthesis from the existing artifacts only. Any failure must retain prior `study/reconstruction-report.json`.
6. Inspect `runs/m8-reconstruction/<id>/report.md`, `evidence-register.tsv`, `gaps.tsv`, `provenance.json` and `run-manifest.json`. The report separates public paper method-level claims, reconstructed methods/results, unavailable comparisons, missing inputs, and researcher decisions.

The indexed Wang et al. publication is the method anchor (PMID 37114994), not a source of invented effect sizes. Directional comparison is UNASSESSED without a comparable published number and method. No R, no M9, no clinical prediction or causality conclusion.