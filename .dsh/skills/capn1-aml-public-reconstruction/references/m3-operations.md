# M3 — CAPN1 paired expression and survival

This stage demonstrates public reconstruction of Wang et al.'s CAPN1/AML research flow. Do not tune results to reproduce original p-values.

## Prerequisites

- A complete, verified M2 workspace with study/processed.json, CAPN1 TSV and clinical TSVs.
- Rscript on PATH with the recommended survival package.
- The one-file GDC smoke artifact cannot support this analysis.

## Execute and reuse

1. Inspect study/survival.json and study/processed.json. Reuse a compatible verified completed M3 run without recomputing.
2. If no compatible M3 result exists, execute the bundled scripts/m3-survival.mjs resource with --workspace pointing at the current DSH workspace.
3. On explicit reanalysis only, pass --rerun to create a new immutable run from cached M2. Never refetch GDC as part of M3.
4. Read report.md, cohort-summary.json, exclusions.tsv, statistics.tsv, and kaplan-meier.svg. Disclose sample exclusions and method substitutions.
5. Do not claim completion when statistical tooling is unavailable or fewer than four eligible cases remain.

## Declared conventional defaults

- Pair by one expression file to one case, excluding duplicate or ambiguous mappings.
- Use tpm_unstranded CAPN1. High expression means TPM > median among eligible pairs; ties are low.
- Dead: demographic.days_to_death; alive: maximum usable diagnosis/followup day, right-censored.
- R survival::survfit, survival::survdiff, unadjusted survival::coxph, Efron ties.
- Preserve all input/output digests, exclusions, R and package versions.

These are transparent demonstration choices, not claims about the paper's unpublished methods. Biological causation, medical significance, and experimental verification require independent scientific judgment and evidence.
