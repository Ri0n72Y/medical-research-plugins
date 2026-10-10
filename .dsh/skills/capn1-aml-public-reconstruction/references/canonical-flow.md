# Canonical CAPN1 / AML flow

This reference holds the detailed stage procedure so the main `SKILL.md` can stay below DSH's normal skill-result trimming threshold.

## Stage 0 — Inspect / initialize

Inspect the workspace before executing a helper.

If `study/reconstruction.yaml` is absent, use `scripts/init-workspace.mjs`. It creates only missing directories and copies only missing initial study files.

Do not fetch public data merely because the study was initialized.

Treat:

- `study/source.json` as machine-readable source state;
- `study/status.md` as a human-readable status summary;
- `study/decisions.yaml` as the current scientific decision record.

## Stage 1 — Public reference and method map

Use `canonical-paper.md` and current public sources as needed.

Record:

- what the publication publicly establishes;
- what the reconstruction assumes;
- what is unavailable;
- what requires a researcher decision;
- what is replaced by a public reproducible method.

Do not infer hidden original parameters as facts.

## Stage 2 — TCGA-LAML source acquisition

Class: `PUBLIC-FIXED`.

Follow `m1-operations.md`.

Default source:

- NCI GDC;
- TCGA-LAML;
- public Gene Expression Quantification;
- STAR - Counts;
- public clinical case metadata.

Reuse the active local source snapshot unless the researcher explicitly asks to refresh.

## Stage 3 — Processing and cohort QC

Prepare reusable expression and clinical artifacts with deterministic scripts.

Preserve raw source inputs.

Report:

- sample / case mapping;
- missingness;
- duplicate or repeated sample conditions;
- mechanically invalid records;
- proposed scientifically meaningful exclusions.

Mechanical validity checks may be automatic.

For demonstration, declared conservative structural exclusions can run automatically and must be audited. Clinical judgments or research-question changes belong to the researcher.

## Stage 4 — CAPN1 expression and survival

Reuse compatible processed inputs.

The demonstration D1 default is eligible-cohort median CAPN1 TPM, with ties in low. Record this method; do not block only because the paper's cutoff is unavailable.

Use established R survival software for Kaplan–Meier, log-rank and unadjusted Cox; do not calculate statistics in model text. Numerical agreement with the original paper is not required.

D2 must be resolved before a formal multivariable model is introduced.

A parameter or cohort change creates a new run. Do not overwrite an earlier completed survival run.

## Stage 5 — Differential expression

Use the official deterministic R/Bioconductor DESeq2 implementation on raw M2 counts, grouped by verified M3 paired cohort (never substitute TPM).

D3 demonstration default: BH adjusted p < 0.05 and abs(log2FC) >= 1. Record this choice; it is not a requirement to recover hidden original thresholds.

Preserve the complete result table. Thresholded gene sets are derived artifacts and must reference the threshold decision.

## Stage 6 — GO / KEGG enrichment

Class: `RECONSTRUCTED`.

The original publication reports DAVID.

v0 may use a pinned public Bioconductor implementation such as clusterProfiler.

Record this as a method substitution. Do not describe it as the original DAVID execution.

## Stage 7 — STRING PPI

Class: `PUBLIC-FIXED` with a parameter decision.

Use the public STRING interface.

D4 must be explicit.

Preserve:

- identifier mapping;
- species;
- confidence / score settings;
- query parameters;
- raw returned network data;
- derived figures/tables.

## Stage 8 — Immune analysis

ssGSEA may use a pinned public GSVA implementation and a versioned public gene-signature resource.

CIBERSORT assets are not bundled.

Resolve D5 before deconvolution:

1. ssGSEA only;
2. declared fully public substitute;
3. user-supplied licensed CIBERSORT assets;
4. skip deconvolution.

Never represent a public substitute as CIBERSORT reproduction.

## Stage 9 — Reconstruction report

Build the report from formal workspace artifacts, not chat memory.

Separate:

- original publication claim;
- public reconstruction method;
- current reconstructed result;
- directional agreement or disagreement;
- method substitutions;
- missing information;
- unresolved uncertainty.

A mismatch is a reportable result. Do not tune hidden parameters merely to reproduce a published p-value or figure.

## Stage 10 — Exploration

The researcher may ask for:

- current literature;
- alternative cutoffs;
- other public cohorts;
- alternative methods;
- candidate hypotheses.

Keep this work in `exploration/` or otherwise mark it non-canonical.

Exploration may become formal only through an explicit new run or protocol revision.
