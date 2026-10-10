# M3 — CAPN1–AML patient cohort and exploratory survival analysis

**Status: independent public reconstruction, NOT exact replication of the paper.**

Reference: Wang H et al., *CAPN1 is a novel biomaker of patients with AML based on comprehensive analysis*, DOI [10.1080/02648725.2023.2204688](https://doi.org/10.1080/02648725.2023.2204688), PubMed PMID 37114994.

## Method evidence boundary

The accessible official PubMed abstract establishes a TCGA-based bioinformatic study performed using R and reports a poor-prognosis association for CAPN1 in AML. It **does not establish** the exact TCGA data release, original high/low cutoff, sample selection, survival endpoint construction, Cox covariates or statistical output. The publisher full Methods text has not been independently verified in this iteration.

Consequently the M3 implementation **never describes its median-TPM or GDC-derived OS definitions as the author's original choices**. These are explicit, bounded reconstruction assumptions whose output goes to `exploration/`; researcher decisions D1/D2 and the final protocol remain unresolved.

## Pipeline from the existing M1/M2 artifacts

Inputs: verified `study/source.json`, matching `study/processed.json`, public GDC clinical case JSON, and M2 `capn1-expression.tsv`.

1. Construct a patient-level file-to-case audit; do not infer or invent specimen identifiers.
2. Candidate survival cohort contains **exactly one** expression file linked to a case, with unambiguous CAPN1 TPM.
3. For GDC `vital_status=Dead`, mark event 1 **only** if positive demographic `days_to_death` exists. Do not substitute follow-up time for a missing death time.
4. For `Alive`, mark censored event 0 and use the latest positive `days_to_last_follow_up` or `days_to_follow_up` from all provided diagnosis/follow-up records. This is a **candidate endpoint rule**, not a verified paper OS algorithm.
5. Exclude ambiguous/missing entries **only from the exploratory candidate analysis**; preserve every case and its reason in `cohort-audit.tsv`. No canonical sample exclusion or cohort approval is performed.
6. As a provisional reconstruction, split cases by the median CAPN1 `tpm_unstranded` (high ≥ median; low < median), recording n and ties.
7. Use R `survival` to generate Kaplan–Meier estimates, log-rank P, univariable Cox HR+95% CI for high versus low, and a continuous `log2(TPM+1)` Cox sensitivity analysis. Check proportional hazards using `cox.zph`.
8. Record the precise R and `survival` versions and publish plot, case audit, results table and report.

**No** multivariable claims, tumor-versus-normal comparisons, pathway enrichment, mechanistic conclusions, or confirmed reproduction claims.

## Public exploratory run (2026-10-10)

A completed GitHub Actions public run using all 151 expression files and 200 clinical cases produced a **candidate** cohort of 130 (78 deaths). Median CAPN1 TPM = 83.6826; log-rank P = 0.0010775; high/low Cox HR = 2.113 (95% CI 1.340–3.333), P = 0.00129. Continuous log2(TPM+1) Cox HR = 1.798 (95% CI 1.188–2.721), P = 0.00555. A second full public run matched these results. Independent Python PHReg / survdiff computations matched R numerically.

These numbers are **method-contingent exploratory results**, not paper-exact findings. Full report and exclusion counts: [public M3 evidence](../examples/public-gdc-survival-2026-10-10/README.md).

## Reproducible execution

First prepare source + processed data as usual, preserving the cache:

```sh
pnpm run data:prepare
```

Then build a transparent candidate:

```sh
node .dsh/skills/capn1-aml-public-reconstruction/scripts/m3-cohort.mjs --workspace research-workspace
```

Pass the returned `directory` path to:

```sh
Rscript .dsh/skills/capn1-aml-public-reconstruction/scripts/m3-survival.R <directory>
```

The analysis is intentionally *not* automatically run by `data:prepare`. A compatible scientific R installation with the `survival` package is required. A temporary GitHub Actions run uses R 4.5.1 (see PR workflow). This is not a claim that the paper used R 4.5.1.

## Artifacts

For each explicit run, `exploration/capn1-os/<run-id>/` contains:

- `manifest.json`: provenance, assumptions, unresolved paper details, output status;
- `cohort-audit.tsv`: every clinical case, file multiplicity, endpoint/eligibility reason;
- `candidate-cohort.tsv`: candidate subjects included in provisional analysis;
- `provisional-analysis-cohort.tsv`: actual high/low split;
- `provisional-results.tsv`: n, events, cutoff, log-rank, Cox HR / CI / P, PH tests;
- `provisional-kaplan-meier.png`: clearly labeled KM curves;
- `provisional-report.md`: results and methodological caveats.

The R output is not canonical; no `study/decisions.yaml` entry is silently changed.

## Acceptance

A successful one-off public run requires a complete M1/M2 cache, verified candidate cohort, analysis estimates from R, and data/parameter provenance. A statistical association must be interpreted as **data-dependent exploratory evidence** until the paper's exact methods and a researcher-approved cohort are available.

To claim an exact-method replication in future, acquire and reconcile the original full Methods/supplementary information (cohort, release, filters, transformation, cutoff, endpoints, covariates, multiple comparisons). Rerun under that versioned protocol and compare numerical results, rather than retrospectively calling this provisional analysis identical.
