# CAPN1/AML public survival reconstruction — provisional run (2026-10-10)

**Exploratory only. Not the exact published analysis, not an approved research cohort.**

## Evidence and execution

- [GitHub Actions full public analysis run](https://github.com/Ri0n72Y/medical-research-plugins/actions/runs/38031507334), successfully completed.
- [Independent second complete run](https://github.com/Ri0n72Y/medical-research-plugins/actions/runs/38031566686) produced the same results from an independently acquired public source snapshot.
- R 4.5.1, `survival` 3.8.3; Node 24, pnpm 11.7.0.
- TCGA-LAML: 151 verified GDC open STAR Counts expression files (639,823,772 bytes); 200 GDC clinical cases.
- Source fingerprint: `gdc-41b543bf72da` / SHA-256 `41b543bf72da31545b6aa9831d12ff9875c54b2fd858b13c013e40ab3bf8b15c`.
- CAPN1 processed table SHA-256: `99a9493a7382ad095d7e82ecd17c0334492963be2369bc816c84d1967c81b370`.

## Patient eligibility audit (200 cases)

- 130 cases entered a **candidate** OS cohort (one linked expression file plus usable endpoint).
- 43 had no expression file.
- 19 lacked a usable death time.
- 6 had both no expression file and no death time.
- 2 lacked a usable censoring time.
- Sum: 130 eligible + 70 excluded from **provisional analysis only**.

The rule is derived from current GDC public case metadata, not verified as identical to the Wang et al. 2023/2024 paper's patient selection or survival definitions.

## Results

| Metric | Provisional estimate |
|---|---:|
| Candidate patients | 130 |
| Death events | 78 |
| High / low | 65 / 65 |
| Median CAPN1 TPM | 83.6826 |
| KM log-rank χ² | 10.6894 |
| KM log-rank P | 0.0010775 |
| High vs low Cox HR | 2.113 |
| 95% CI | 1.340–3.333 |
| Cox P | 0.0012905 |
| Continuous log2(TPM+1) Cox HR | 1.798 |
| 95% CI continuous | 1.188–2.721 |
| Continuous Cox P | 0.0055548 |

The analysis used a **provisional** median split (high ≥ median), demographic `days_to_death` for events, and maximum valid recorded diagnosis/follow-up time for censoring. It did **not** adjust for clinical risk factors or confirm specimen identity. Original paper's exact methods remain unverified.

Independent verification of the saved 130-case candidate TSV with Python `statsmodels` (PHReg Efron ties and survdiff) reproduced the R HRs, confidence intervals and log-rank χ² to numerical tolerance. This verifies computations, **not** original cohort/method equivalence.

## Retrieve exact audit and graph

The archived GitHub Actions artifact includes the full `cohort-audit.tsv`, `candidate-cohort.tsv`, the KM PNG, per-model results and their associated method manifest. It has limited retention, so run `pnpm run data:prepare` then `pnpm run data:survival:explore` in a persistent local workspace for a durable personal research cache.

See [M3 methodological limitations](../../docs/m3-survival-reconstruction.md). **Do not use the unadjusted exploratory HR for clinical decisions or as proof that CAPN1 is causally prognostic.**
