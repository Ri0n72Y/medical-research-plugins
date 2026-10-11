# M4 operations — DESeq2 raw-count differential expression

## Prerequisites
Verify an existing complete M2 dataset and M3 survival cohort. The one-file public GDC smoke cannot support a DEG result. R with Bioconductor DESeq2 must be available.

## Procedure
1. Inspect `study/deg.json`, `study/processed.json`, and `study/survival.json`.
2. If compatible complete M4 cache exists and SHA-256 inputs and outputs match, disclose the cache hit and reuse it.
3. Otherwise call the bundled `scripts/m4-deg.mjs` with the active workspace. This does **not** download new source data or modify M2/M3.
4. Run DESeq2 on the **M2 raw unstranded integer count** matrix and M3 median-TPM high/low groups, using an explicit `~group` design and high-vs-low Wald comparison.
5. Use a documented low-count prefilter and the conventional FDR < 0.05 plus abs(log2FC) >= 1 for the final DEG list. Keep the complete all-gene output with statistical NA status. This is a post-test screen.
6. Inspect `statistics.tsv`, `deg-all.tsv`, `deg-significant.tsv`, `volcano.svg`, `report.md` and provenance manifest.
7. For an explicit reanalysis request only, use `--rerun`; keep the old completed outputs.

## Interpretation
Unpublished original thresholds are not a blocker. The M3 cohort depends on available survival information, so the resulting DEG dataset may be selected. File-to-case mapping does not prove biological sample identity. CAPN1 defines group membership; a CAPN1 differential signal is expected by construction, not independent validation. Do not infer mechanisms or medical usefulness from DEG associations alone.

See repo `docs/m4-differential-expression.md` for detailed methods and installation prerequisites.
