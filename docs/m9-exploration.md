# M9 — Exploratory questions after CAPN1/AML reconstruction

**Scope:** Optional research extension, not part of the canonical M1–M8 numerical reconstruction. This note identifies useful next questions without claiming that they have been answered by real TCGA-LAML runs. The researcher decides which question, if any, to investigate.

## Why exploration is different

The existing skill implements a reproducible pipeline through M8; it does not establish that all stages have been executed on the same live cohort. In particular, a full M6 STRING and M7 immune analysis, and the study-specific D4/D5 choices, remain independently unverified. Exploration notes must not repair these gaps by inventing values, reusing synthetic CI fixtures as evidence, or relabeling exploratory outcomes as canonical.

The anchor paper is Houcai Wang et al., *CAPN1 is a novel biomaker of patients with AML based on comprehensive analysis*, online publication April 28, 2023; published in volume 40, issue 4, December 2024 (PMID [37114994](https://pubmed.ncbi.nlm.nih.gov/37114994/), DOI [10.1080/02648725.2023.2204688](https://doi.org/10.1080/02648725.2023.2204688)). The original abstract reports an association of CAPN1 expression with unfavorable AML prognosis, extracellular-matrix and receptor–ligand-related analysis, and immune associations including CD56-related cells and neutrophils. **An abstract-level report does not establish independent causal function or prove the same result in the current public reconstruction.**

## 1. Prognosis: robustness to case mix

**Question.** Does a CAPN1 association with overall survival persist after accounting for ordinary AML prognostic factors, rather than reflecting differences in the cohort's age, WBC, subtype or cytogenetic/molecular risk distribution?

**Current constraint.** M3 provides a median CAPN1 split with unadjusted survival statistics. D2 has not authorized a new adjusted Cox model. No adjusted hazard ratio should be generated from speculation or described as an existing outcome.

**Useful exploration.** Examine which clinically meaningful covariates are available for the same paired cases, missingness and selection effects; document hypotheses for confounding. An adjusted model, alternative cutoff or new cohort requires an explicit scientific decision and separate analysis.

**Related methodology, not CAPN1 confirmation.** A 2025 AML study of **HPCAL1** observed that associations for some immune features attenuated after covariate adjustment, while its separately studied gene retained significance; this demonstrates why adjustment can matter without establishing anything about CAPN1 ([Cheng et al., Scientific Reports, 2025](https://www.nature.com/articles/s41598-025-23386-0)).

## 2. Immune biology: marker scores versus cell fractions

**Question.** Are observed immune-associated signals likely driven by CAPN1-associated biological differences or by AML sample cellular composition/subtype?

**Current constraint.** M7 applies public PanglaoDB marker signatures with GSEApy ssGSEA. These scores are not CIBERSORT fractions, cell counts, tissue infiltration, or an experimental mechanism. A high score does not imply that a given cell type increased in absolute abundance.

**Useful exploration.** Ask which CD56/NK-like and neutrophil-related signatures can be mapped to the exact public marker library and to M7's results if/when live results exist. Compare alternative annotations, relevant sample-subtype data, and independent measurements if available. Contradictory interpretations must be recorded.

**Related context, not CAPN1 evidence.** A 2024 AML immune-subgroup study reported subtype-dependent immune features and associated clinical/genetic differences. It is useful for framing confounding questions, not for assigning the paper's effect sizes to CAPN1 ([Frontiers in Immunology, 2024](https://www.frontiersin.org/journals/immunology/articles/10.3389/fimmu.2024.1451486/full)).

## 3. Reproducibility in independent cohorts

**Question.** Does the original directional claim survive a genuinely independent AML dataset, comparable assay and endpoint?

**Current constraint.** The canonical M1–M8 source is TCGA-LAML. No extra cohort should silently enter `study/` or retroactively change the canonical source manifest.

**Useful exploration.** First compare publicly described AML cohorts and record their platform, specimen type, availability of age and other covariates, sample overlap, batch considerations, gene ID/probe mapping, endpoint definitions and access constraints. External cohorts can be analyzed in a separate exploratory path only when explicitly chosen. A 2025 multicenter AML prognostic-model study stresses the importance of independent cohort evaluation, as models may not generalize beyond the training data ([Frontiers in Oncology, 2025](https://www.frontiersin.org/journals/oncology/articles/10.3389/fonc.2025.1649594/full)). Its models are not CAPN1 validation.

## Working in DSH

Use the existing CAPN1 skill and DSH session to discuss one question at a time. When a question merits documentation, save a simple Markdown note in the workspace `exploration/`, with the question, verified references and local paths, hypotheses and counter-explanations, unanswered points, and the researcher's decision. Do not add a report generator, schema registry, automated validation system or new runtime for M9.

Only a subsequent explicit researcher decision can promote an exploratory method or observation into a new formal run/protocol revision. The previous M8 report remains a snapshot of the formal work, not a mutable notebook.
