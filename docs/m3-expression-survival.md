# M3 — CAPN1 expression and overall-survival demonstration

Status: implementation proposed. Results are a public-data workflow demonstration, not numerical or scientific validation of the Wang et al. publication.

## Purpose and capability boundary

The canonical CAPN1/AML paper supplies the research question and a realistic workflow. Matching unpublished processing details, software versions, cutoffs, or reported p-values is not an acceptance condition. Where a paper detail is missing, choose a documented, conventional public method and continue. An unavailable original parameter is not, by itself, a Harness capability boundary.

The Harness may orchestrate literature, data, cohort preparation, established statistics, plots, comparisons, and transparent interpretation. Statistical association is not evidence of biological causation; the agent can support analysis of medical significance with clinical context, but cannot establish biological causality from association or independently validate untested hypotheses.

## Inputs and prerequisites

1. Run pnpm run data:prepare to obtain a verified complete M2 study/processed.json.
2. Install R with the recommended survival package; Rscript must be on PATH.
3. The one-file example under examples/public-gdc-smoke is insufficient for M3.
4. M3 verifies M2 output SHA-256 digests and active source/processed lineage. It never queries GDC.

## Default scientific methods

- Unit: one GDC case. Require exactly one expression file per case and exactly one case per expression file. Do not invent a biospecimen ID.
- Expression: CAPN1 tpm_unstranded; retain TPM and display log2(TPM+1). Use median TPM of eligible paired cases. High means strictly above the median; ties belong to low.
- Overall survival: dead cases use demographic.days_to_death. Alive cases are censored at the greatest non-negative time among all diagnoses.days_to_last_follow_up and follow_ups.days_to_follow_up. Missing, ambiguous, or contradictory status/time is excluded with a reason.
- Analysis: Kaplan–Meier, log-rank, and unadjusted Cox PH high versus low (low reference; Efron ties). Report HR, 95% CI, p values. No clinical covariates are silently included.
- Failure conditions: fewer than four paired cases, empty group, no deaths, or non-finite Cox estimates stop publication.

These are RECONSTRUCTED demonstration defaults, not claims about the original paper's hidden parameters.

Official GDC survival documentation:
https://docs.gdc.cancer.gov/Data_Portal/Users_Guide/clinical_data_analysis/

GDC 2026 update covering follow-up fields:
https://docs.gdc.cancer.gov/API/Release_Notes/API_Release_Notes/

## Run

    pnpm run data:prepare
    pnpm run survival
    pnpm run survival --rerun
    pnpm run survival --workspace /absolute/path/to/study

The first command is needed only when M2 data are absent. The survival command never downloads public data. The rerun option creates a new analysis from the same source.

## Outputs

Immutable runs/m3-survival/<id>/ contains:

- cohort.tsv: paired cases, CAPN1 TPM/log2, OS time, events, group;
- exclusions.tsv: each excluded expression file with reason;
- cohort-summary.json: sample counts and default methods;
- statistics.tsv: log-rank and unadjusted Cox statistics;
- km-steps.tsv and kaplan-meier.svg: figure and underlying curves;
- runtime.tsv: R and survival package versions;
- report.md: methods, outcomes, and limits;
- run-manifest.json: lineage and output SHA-256 checksums.

study/survival.json points to the last successful M3 run. Compatible subsequent runs return cache-hit. Explicit reruns preserve earlier runs. Failures leave the previous pointer intact.

## Scientific limitations

M2's GDC file-to-case mapping does not establish biospecimen/sample type or timing. Cases with duplicate file mappings are conservatively excluded. The analysis may have selection bias and is not a validated clinical cohort. A multivariable Cox model would need a declared covariate plan, missingness review, and proportional-hazards assessment; this default demonstration is unadjusted.

Do not claim an observed CAPN1 effect until a real full-cohort run has been completed. Agreement with original published p-values is not a test or success requirement.
