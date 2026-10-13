# M7 — Python ssGSEA immune-marker analysis

M7 is a documented **ssGSEA-only** public-substitute demonstration. It is not CIBERSORT, and it cannot infer immune cell proportions.

Prerequisites: completed `study/source.json`, M2 `study/processed.json` (TPM + gene annotation) and M3 `study/survival.json` (paired cohort). All manifest outputs must be hash-verified. Python 3.11+ GSEApy is used instead of R GSVA.

The D5 decision remains unresolved by default; the presence of `proposed_default: ssgsea-only` is **not** an approval. For an explicit demonstration, invoke `pnpm run immune --workspace /path/to/study --immune-mode ssgsea-only` or set both `D5.status: selected` and `D5.selected: ssgsea-only` in the workspace study decisions. The current implementation rejects other D5 modes without fallback.

The first M7 run fetches the public Enrichr `PanglaoDB_Augmented_2021` human gene-symbol GMT and persists an immutable SHA-256 snapshot under `data/references/immune-panglao`. Subsequent runs reuse the verified snapshot. `--refresh-signatures` explicitly re-fetches it and is needed if the existing active cache is inconsistent. No GDC refetch.

The deterministic Python script maps unique protein-coding GDC symbols to the whole M2 TPM matrix for the selected M3 paired files, excludes duplicates, applies a regex-based predeclared immune-term selector to the Panglao library, records signature-gene overlap and runs GSEApy `ssgsea`: `sample_norm_method=rank`, `correl_norm_type=rank`, `weight=0.25`, `min_size=5`, `max_size=500`, `permutation_num=0`, `threads=1`, seed 42. It records raw ES and normalized NES for each patient/term and exploratory Mann–Whitney p-values with BH FDR over all retained terms.

Outputs: `runs/m7-immune/<id>/gene-mapping.tsv`, `signature-coverage.tsv`, `immune-scores.tsv`, `group-comparison.tsv`, `immune-signatures.svg`, `statistics.json`, `runtime.tsv`, `report.md`, `run-manifest.json`, and `study/immune.json`. Do not call signature scores inferred immune infiltration or cell fractions; the public marker collection is a method substitution with heterogeneous source biology. M7 does not include CIBERSORT deconvolution, independent hypothesis validation or M8 report assembly.
