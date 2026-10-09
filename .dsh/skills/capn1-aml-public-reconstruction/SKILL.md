---
name: capn1-aml-public-reconstruction
description: Reconstruct and continue the 2023 CAPN1 / AML public-data study in a DSH workspace using public data, deterministic scientific tools, explicit researcher decisions, and cache-first reuse.
whenToUse: Use when the user wants to initialize, reproduce, continue, inspect, explain, rerun, refresh, or explore the CAPN1 / AML canonical study in this workspace.
---

# CAPN1 / AML Public Reconstruction

This skill is the canonical v0 workflow for this repository.

It is intentionally overfit to one study. Do not generalize it into a biomedical workflow framework while executing this skill.

## Core boundary

The researcher owns the science.

You may organize information, inspect the workspace, fetch approved public data, call deterministic scientific tools, summarize formal artifacts, and help explore alternatives.

Do not silently decide scientifically material assumptions.

Do not treat association as mechanism.

Do not use the language model itself as the numerical implementation of statistics or bioinformatics.

## First action: inspect the workspace

Before any external fetch or analysis:

1. inspect the current workspace for an initialized CAPN1 study;
2. inspect study state, decisions, source manifests, processed datasets, run manifests, and formal artifacts;
3. determine whether a compatible completed artifact already answers the user's request;
4. if a compatible cache exists, tell the user that you are using the local cached result and do not recompute;
5. if the user asked to continue, resume from the first incomplete required stage;
6. fetch or recompute only when no compatible artifact exists or the user explicitly requests refresh / reanalysis.

Never infer cache validity from chat memory alone.

## Cache intent

Interpret common requests this way unless the user clearly says otherwise:

- explain / show / inspect / continue -> reuse compatible local cache;
- analyze from another angle -> reuse existing source and processed data where compatible;
- reanalyze / rerun this analysis -> rerun the smallest affected analysis, but do not refetch source data;
- change a parameter -> create a new affected run from compatible local inputs;
- refetch / download again / use latest data -> refresh the external source and create new downstream artifacts;
- start over from source -> refresh the source and create a new downstream lineage without deleting old completed runs.

Whenever cache is reused, disclose it plainly.

## Workspace contract

Prefer these study areas when they exist:

- `study/` — brief, reconstruction definition, decisions, status;
- `references/` — paper metadata, searches, notes;
- `data/manifests/` — external source queries and retrieval metadata;
- `data/raw/` — source cache;
- `data/processed/` — derived reusable datasets;
- `runs/` — immutable completed or failed analytical runs;
- `artifacts/` — formal tables, figures, and reports;
- `exploration/` — non-canonical searches, analyses, and notes.

Do not create a database or hidden state service for v0.

## Reconstruction classes

Every canonical step has one of four meanings:

- `PUBLIC-FIXED`: public evidence and tooling are sufficient; execute deterministically when prerequisites are met.
- `RECONSTRUCTED`: use a declared public substitute because the original implementation is not publicly recoverable.
- `DECISION`: ask the researcher before crossing this boundary.
- `OPTIONAL`: useful context that must not silently enter the canonical result.

Read `references/dependency-cut.md` before implementing or changing a stage.

## Scientific decisions

Use the DSH human-question mechanism for scientific decisions.

Do not misuse execution approval as scientific review.

The initial decision ports are:

- D1 — CAPN1 high / low grouping;
- D2 — multivariable survival covariates;
- D3 — DEG threshold;
- D4 — STRING confidence;
- D5 — immune deconvolution path.

Record every accepted decision in workspace study state before downstream formal analysis depends on it.

## Canonical stages

### Stage 0 — Inspect / initialize

If the study is absent, initialize only the minimal workspace state from the templates bundled with this skill.

Do not fetch public data merely because the study was initialized.

If the study already exists, preserve it and continue from its recorded state.

### Stage 1 — Public reference and method map

Use the canonical paper metadata in `references/canonical-paper.md` and current public sources as needed.

Record what is public evidence and what is reconstruction.

Do not invent unavailable original parameters.

### Stage 2 — TCGA-LAML source acquisition

Class: `PUBLIC-FIXED`.

Use NCI GDC public data.

If compatible local source data and manifests exist, reuse them unless the user explicitly requests refresh.

On a fresh acquisition, preserve the public query / manifest / release metadata needed to explain exactly what was retrieved.

### Stage 3 — Processing and cohort QC

Prepare reusable expression and clinical artifacts using deterministic scripts.

Report missingness, duplicate or sample-mapping issues, and any proposed exclusions.

If an exclusion requires scientific judgment rather than mechanical data validity, ask the researcher before applying it.

### Stage 4 — CAPN1 expression and survival

Reuse compatible processed inputs.

D1 must be resolved before formal grouped survival analysis.

Use established R statistical tooling; do not calculate statistics in model text.

D2 is required before a formal multivariable model is introduced.

Create a new run rather than overwriting a previous completed survival run.

### Stage 5 — Differential expression

Use a deterministic count-based implementation.

D3 must be explicit before the DEG result becomes canonical.

Preserve the full result table as an artifact; filtered lists are derived views.

### Stage 6 — GO / KEGG enrichment

Class: `RECONSTRUCTED`.

The original study used DAVID. v0 may use a pinned public Bioconductor implementation such as clusterProfiler.

Always disclose the substitution in the run and report.

### Stage 7 — STRING PPI

Use the public STRING interface.

D4 must be explicit.

Preserve identifier mapping, query parameters, and returned network data needed to reconstruct the result.

### Stage 8 — Immune analysis

ssGSEA may use a pinned public GSVA implementation and a versioned public gene-signature resource.

For CIBERSORT-style deconvolution, resolve D5:

1. ssGSEA only;
2. declared public substitute;
3. user-supplied licensed CIBERSORT assets;
4. skip deconvolution.

Never bundle or imply access to licensed CIBERSORT assets.

Never call a public substitute "CIBERSORT reproduction."

### Stage 9 — Reconstruction report

Build the report from formal workspace artifacts.

Separate clearly:

- original publication claim;
- public reconstruction method;
- reconstructed result;
- directional agreement or disagreement;
- method substitutions;
- unresolved uncertainty.

A failed reproduction or numerical mismatch is a reportable result, not something to hide by parameter tuning.

### Stage 10 — Exploration

After the canonical work, the user may ask for current literature, alternative cutoffs, other datasets, or new hypotheses.

Keep such work under an exploration area or otherwise mark it non-canonical.

Do not silently mutate canonical decisions or runs.

## Execution rules

Prefer, in order:

1. DSH native capability;
2. official public scientific API or maintained scientific package;
3. a thin deterministic script;
4. a new Cordis tool or service only after a concrete capability gap is demonstrated.

Use existing DSH file tools for workspace state.

Use shell execution for deterministic local scripts.

Use DSH web or MCP capability when it is the appropriate existing integration.

Use workflow / subagents only for useful local parallel work; do not make them the durable study state machine.

## Formal run requirement

A completed analytical run must record enough information to identify:

- inputs and their digests or versions;
- source dataset / release when known;
- implementation or script;
- relevant software versions;
- parameters;
- researcher decisions;
- outputs;
- warnings;
- completion status.

If these cannot be established, do not present the run as a reusable canonical cache.

## User-facing communication

Keep the workflow understandable to a medical researcher.

When using cache, say so.

When substituting a method, say so.

When a decision belongs to the researcher, stop and ask instead of hiding it in a default.

When a tool fails or data are incomplete, expose the failure before proceeding.

The goal is not maximum autonomy. The goal is transparent, reusable research operations under researcher control.
