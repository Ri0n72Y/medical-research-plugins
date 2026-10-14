# M9 — CAPN1/AML exploratory research (optional)

M9 is an **exploration procedure**, not a new scientific runtime or extension of the canonical M1–M8 results. Use DSH's native conversation, web/search, filesystem, and (only when requested) shell/scientific packages. Do not introduce an exploration plugin, code framework, generic evidence validator, cache layer, or automated conclusion generator.

## Entry
1. Read the existing workspace M8 report if it exists; if not, inspect existing M1–M7 research outputs and state what evidence is missing. Do not download or recompute merely to fill a gap.
2. Select **one** research question at a time. Record why it matters, what source evidence exists, what is only a hypothesis, and the smallest feasible test. The researcher chooses the question and material analytical changes.
3. Write notes or a plain Markdown draft under `exploration/`. Suggested filename: `exploration/capn1-aml-<topic>.md`. Do not modify `study/*.json`, completed run manifests, source data, or the M8 canonical report.
4. Use the existing DSH session for discussion and revisions; cite the publication/source URLs and the exact local run/artifact paths when making data-specific statements. Label contrary evidence, unexplained results and missing data, rather than forcing a positive association.
5. Do not promote exploratory results to formal reconstruction without explicit researcher choice and a new declared analysis/protocol revision.

## Priority questions (not established results)

**Q1 — Prognostic robustness.** The Wang et al. public abstract describes an unfavorable CAPN1–AML prognosis association. M3 currently uses a median CAPN1 split and **unadjusted** Cox analysis. Could age, baseline WBC, cytogenetic/molecular risk or other case-mix differences explain an apparent association? A formal adjusted analysis requires the researcher's D2 covariate decision. Do not call CAPN1 an independent prognostic factor based on M3 alone.

**Q2 — Cell composition versus biological regulation.** The source abstract mentions immune associations, particularly CD56 cells and neutrophils. The M7 public substitute returns ssGSEA **marker-set scores**, not CIBERSORT cell fractions. Could apparent differences reflect varying AML subtype or sample cell composition rather than CAPN1-driven immune regulation? Consider availability and reliability of orthogonal cell-type evidence, and avoid equating signature enrichment with infiltration or causality.

**Q3 — External reproducibility.** Would an independently sourced AML cohort with documented platform, endpoint, and clinical covariates show a similar CAPN1 association? Check gene-probe mappings, sample overlap, transformations, AML subtype composition and endpoint comparability before interpreting disagreement. New cohort acquisition is opt-in and separate from the canonical TCGA-LAML snapshot.

## Evidence distinction

In each exploratory note, separate:
- **Original publication**: a method or claim that is actually in the indexed article; quote/link exact source.
- **Canonical local observation**: the actual report/table and run ID, if present. Never infer real study results from CI fixtures or README examples.
- **External literature**: findings about their own studied genes/cohorts, not proof about CAPN1 in our cohort.
- **Hypothesis / alternative explanation**: what could be true, what would disconfirm it, and what data would be required.
- **Decision / next action**: whether to investigate further, request a researcher choice, or leave the question open.

## Live acceptance boundary

The M6/M7 engineering code exists, but a full public TCGA-LAML run and any D4/D5 decisions are **not established by code-only CI**. Exploration cannot silently approve D4/D5, create missing real study findings, or mark M8 as scientifically final.

See `docs/m9-exploration.md` for the initial evidence map and external references. No fixed M9 output schema or additional tests are required.
