# M3 — bounded public-data survival exploration

**Method identity:** the publication's PubMed abstract supports TCGA-based R analysis and poor prognosis association for CAPN1, but the paper's original Methods/cutoff/cohort/OS endpoint have not yet been verified. Never call this exploratory analysis an exact reproduction.

## Required inputs

- Completed verified M1 `study/source.json`;
- matching completed M2 `study/processed.json` with the CAPN1 per-file table;
- a researcher instruction to conduct an exploratory reconstruction;
- a working R `Rscript` with package `survival`.

Do not run `data:prepare` or fetch public data merely to explain prior M3 results.

## Execution

Resolve this **skill's own** `scripts/m3-explore.mjs` resource through DSH. From an active research workspace, run:

```sh
node <resolved-skill-resource>/scripts/m3-explore.mjs --workspace <active-workspace>
```

The runner:

1. verifies M1/M2 source linkage and CAPN1 processed input checksum;
2. reuses matching completed exploratory analysis outputs if hashes/method identity match;
3. otherwise prepares a full per-case audit, including reasons for every excluded *candidate*;
4. calls the bundled `scripts/m3-survival.R` via the installed `Rscript` binary;
5. publishes a KM chart, log-rank/Cox tables and method-qualification report under `exploration/capn1-os/`.

Only pass `--rerun` after explicit request. A normal run never refetches source data. Do not enter this result into `runs/` as a canonical survival study and do not mark D1/D2 resolved.

## Provisional assumptions

- Only clinical cases linked to exactly one GDC expression file.
- Death: `vital_status=Dead` plus positive demographic `days_to_death`.
- Alive: maximum positive diagnosis or follow-up days.
- Never assign an event time from follow-up when death time is missing.
- CAPN1 high/low: median `tpm_unstranded` (high greater than or equal to median).
- R `survival`: Kaplan–Meier/log-rank, grouped univariate Cox and continuous log2(TPM+1) Cox.
- No author-verified covariates or propensity adjustment.

The full human-readable assumptions, result comparison and limitations are in the repository `docs/m3-survival-reconstruction.md`, but the skill must be executable without assuming this documentation path is within the user's research workspace.

## How to communicate results

Give n, event count, exclusion reasons, cutoff, HR/CI/P and source snapshot. State the author-method uncertainty **before** any claim of concordance. Interpret P only as evidence within this reconstructed cohort, not as proof of mechanism, independent prognosis or exact paper replication. Ask for the published full Methods before approving a formal protocol.
