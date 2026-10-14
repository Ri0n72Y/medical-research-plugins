# CAPN1 paper coverage — three supplement commands

These are small, case-specific analysis slices to demonstrate the paper's remaining workflow shape. They **do not** change the validated M1–M8 research pipeline.

- `pnpm run paper:pancan --workspace /study`: fetch single-gene CAPN1 from UCSC Xena PanCanAtlas, group by `_primary_disease`, report sample and cohort summary TSVs and SVG. Or use `--pancan-input /export.tsv` to reuse a public export and avoid HTTP.
- `pnpm run paper:clinical --workspace /study`: compare existing M3 CAPN1 high/low groups to M2 patient age, sex and available ELN risk category. No new data acquisition.
- `pnpm run paper:composition --workspace /study`: use the M7 cached Panglao marker GMT and M2 TPM for a **non-CIBERSORT**, nonnegative least-squares relative marker proxy. `--cibersort-result /authorized.tsv` imports third-party CIBERSORT output for plotting only, subject to appropriate user rights.

All commands emit an SVG, tabular inputs/summaries and `report.md`, and save their own `study/paper-*.json` pointer. `--rerun` forces that local step. A no-parameter call uses compatible caches where present.

Do not claim Xena public download, external CIBERSORT operation or DSH UI success solely from offline CI. No additional academic validity gate, statistical model expansion, license bypass, or registry work is part of these supplements.
