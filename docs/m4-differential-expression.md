# M4 — CAPN1-associated differential expression demonstration

M4 continues the CAPN1/AML Harness research demonstration. It illustrates reproducible differential expression on public data, **not** the replication of Wang et al.'s exact gene list or p-values.

## Inputs and scientific method

- Requires verified **M2** `counts-unstranded.tsv` and `gene-annotation.tsv`.
- Requires the completed **M3** `cohort.tsv` and its matching M2/source lineage.
- M3 uses uniquely mapped GDC file IDs and an eligible-cohort median TPM CAPN1 split. M4 follows **the same high/low groups**; it never reassigns groups based on the count matrix.
- M4 uses **raw integer counts**, not TPM. DESeq2 performs its own normalization and dispersion estimation.
- Each group requires at least three cases. A gene survives the explicit low-count prefilter if it has >=10 counts in at least the smaller group's number of cases.
- R DESeq2: design `~ group`; high-versus-low Wald test, default normalization, dispersion estimation, BH adjusted p values and default independent filtering at declared `alpha=0.05`. If DESeq2 reports that all gene-wise dispersion estimates are near the minimum, use its documented `fitType="mean"` fallback and record the actual fit in `runtime.tsv`. Other errors are not silently retried.
- The declared filtered gene set uses `padj < 0.05` and `abs(log2FoldChange) >= 1`. This is an after-test effect-size filter, **not** a hypothesis test of a fold-change threshold.
- The complete result lists all M2 genes with markers for low counts, independent filtering, or other unresolved test outcomes. Do not discard NA results without explanation.

Official method: https://bioconductor.org/packages/release/bioc/vignettes/DESeq2/inst/doc/DESeq2.html

## Installation and execution

R and Bioconductor DESeq2 are prerequisites. Install using the active R/Bioconductor release:

```r
if (!requireNamespace("BiocManager", quietly = TRUE))
    install.packages("BiocManager")
BiocManager::install("DESeq2", ask = FALSE, update = FALSE)
```

After an existing complete M2/M3 workspace:

```sh
pnpm run deg
# Force a fresh M4 run while preserving prior M2/M3 data and outputs:
pnpm run deg --rerun
pnpm run deg --workspace /absolute/path/to/study
```

The command never invokes a GDC download. It verifies the M2/M3 cached artifact checksums, and will refuse missing or stale lineage.

## Outputs and reuse

Each immutable `runs/m4-deg/<id>/` contains:

- `deg-all.tsv`: every gene, annotated, including NA values and test status.
- `deg-significant.tsv`: FDR/effect-size filtered results.
- `statistics.tsv`: total genes, filtered/tested genes, up/down count and thresholds.
- `runtime.tsv`: R/DESeq2/Bioconductor versions and the actual dispersion fit (including an exceptional fallback).
- `volcano.svg`: annotated, reproducible descriptive visualization.
- `report.md`: methods, sample counts, key numbers and scientific limitations.
- `run-manifest.json`: method, input fingerprints and output SHA-256 digests.

`study/deg.json` points to the last successful result. A compatible invocation reports `cache-hit` and does not rerun DESeq2. An explicit `--rerun` creates a fresh immutable run. Failures leave the previous completed pointer unchanged.

## Limitations and next phase

The M3 cohort is **survival-eligible**. Reusing it for DEG improves workflow continuity but can bias differential expression because patients without usable survival data were excluded. File-to-case GDC mappings do not establish tumor/sample type. M4 does not model batch or clinical covariates, and it is not an independent diagnostic/causal test.

AI may assess possible medical significance with clinical evidence and uncertainty; lack of independent experimentation is an evidence boundary, not a ban on medical interpretation.

CAPN1 itself defines high/low group assignment. A CAPN1 differential signal is therefore expected **by construction**. Preserve it in the complete results but never interpret it as independent biomarker confirmation.

M5 can take the resulting `deg-significant.tsv` into GO/KEGG enrichment and later STRING/immune tasks with declared method substitutions and explicit gene-universe handling.
