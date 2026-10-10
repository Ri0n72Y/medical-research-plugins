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

Scientifically meaningful exclusion choices belong to the researcher and must be recorded before applying them.

## Stage 4 — CAPN1 expression and survival

The existing `scripts/m3-cohort.mjs` and `scripts/m3-survival.R` can produce a strictly **exploratory** patient cohort, Kaplan–Meier curve and univariable Cox sensitivity estimates from current GDC data. Read the bundled `references/m3-operations.md` first. Do not treat its median-TPM cutoff or its censored endpoint reconstruction as exact paper methods; keep D1 and D2 unresolved unless the researcher formally confirms them.

Reuse compatible processed inputs.

D1 must be resolved before grouped CAPN1 survival analysis.

Use established statistical software for survival computation; do not calculate statistics in model text.

D2 must be resolved before a formal multivariable model is introduced.

A parameter or cohort change creates a new run. Do not overwrite an earlier completed survival run.

## Stage 5 — Differential expression

Use a deterministic count-based implementation.

D3 must be explicit before a filtered DEG result becomes canonical.

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
