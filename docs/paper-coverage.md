# Three missing original-paper process elements

This adds **demonstrable analysis steps** to the CAPN1/AML workflow, not new criteria for deciding whether Wang et al.'s conclusions are scientifically valid. The original indexed abstract describes CAPN1 pan-cancer expression, AML clinical correlations, and CIBERSORT + ssGSEA immune analysis (PMID 37114994).

## 1. Pan-cancer CAPN1 expression

Run `pnpm run paper:pancan --workspace /study`. The Python script uses UCSC Xena's [PanCan Atlas expression dataset](https://xenabrowser.net/datapages/?dataset=EB%2B%2BAdjustPANCAN_IlluminaHiSeq_RNASeqV2.geneExp.xena&host=https%3A%2F%2Fpancanatlas.xenahubs.net) to query **CAPN1 only**, plus Xena `_primary_disease` metadata and TCGA barcode sample type. This is more appropriate for an engineering demonstration than downloading every TCGA project's raw expression matrix. The dataset is batch-adjusted RNASeqV2 expression, **not** the TPM units of the M2 STAR pipeline.

For an offline exported dataset, use `--pancan-input /absolute/path/to/export.tsv` with `sample_id`, `cancer_type`, `capn1_expression` tab-separated headers. TCGA barcode sample-type suffixes 01–09 are treated as tumor and 10–19 as normal; where paired cancer categories contain both, a two-sided Mann–Whitney comparison is shown. Both routes create `pancan-samples.tsv`, `pancan-summary.tsv`, `pancan-expression.svg` and `report.md`. Public Xena network availability cannot be inferred from offline CI.

## 2. AML clinical characteristics

Run `pnpm run paper:clinical --workspace /study` after M2/M3. Reuses the paired case/file IDs in `study/survival.json` M3 `cohort.tsv`, plus M2 `clinical-cases.tsv` and `clinical-diagnoses.tsv`. Produces `clinical-paired.tsv`, `clinical-associations.tsv`, `clinical-associations.svg` and `report.md`. Demonstrates an available-fields comparison for age, sex-at-birth and available ELN risk classification; it does not add a multivariable survival model or infer missing clinical fields.

## 3. Immune-cell composition workflow counterpart

CIBERSORTx is a restricted service under [Stanford's terms of use](https://cibersortx.stanford.edu/), **not** an open library. This repository does not redistribute LM22/CIBERSORT code, log in on a user's behalf or imply that an unlicensed execution took place.

Run `pnpm run paper:composition --workspace /study` after M7 to compute a **public marker-based NNLS relative-contribution proxy** from M2 TPM and the already cached Panglao GMT. The binary marker design is only a demonstration of a composition *computation step*: coefficients are not cell fractions, immune counts or authentic CIBERSORT estimates.

Alternatively, a user who has legitimately generated CIBERSORT outputs may pass `--cibersort-result /path/to/table.tsv` for **import and visualization only**; the table's `Mixture` or `sample_id` values must match M3 file/case IDs. The imported table is not recomputed. Both paths write `immune-contributions.tsv`, `immune-summary.tsv`, `immune-composition.svg`, and `report.md`.

## Visible evidence and boundaries

Each slice creates an immutable `runs/paper-{clinical,pancan,composition}/<run-id>/` output with TSV, SVG, Markdown and a pointer in `study/paper-<kind>.json`. Repeating a compatible command reuses output; `--rerun` explicitly reexecutes that slice. The existing M8 reconstruction report remains unchanged, and its formal M1–M7 statuses should not be interpreted as including these supplementary steps.

**Engineering acceptance is separate from scientific interpretation.** CI uses synthetic TSVs and an offline Xena-export fixture; a full live Xena request, external CIBERSORT import and integrated DSH user-interface demonstration still require observable target-environment evidence.
