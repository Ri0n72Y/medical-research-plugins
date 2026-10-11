---
name: capn1-aml-public-reconstruction
description: Reconstruct and continue the 2023 CAPN1 / AML public-data study in a DSH workspace using public data, deterministic scientific tools, explicit researcher decisions, and cache-first reuse.
whenToUse: Use when the user wants to initialize, reproduce, continue, inspect, explain, rerun, refresh, or explore the CAPN1 / AML canonical study in this workspace.
---

# CAPN1 / AML Public Reconstruction

This is the canonical v0 Harness capability demonstration. It is intentionally overfit to one study. Do not generalize it into a biomedical workflow framework while executing it.

## Core boundary

The researcher owns the science.

You may inspect the workspace, organize evidence, fetch approved public data, call deterministic scientific tools, summarize formal artifacts, and help explore alternatives.

Missing original-paper parameters are not a stop condition: use declared, conventional public substitutes. Do not silently choose scientifically material assumptions. Do not turn association into mechanism. Do not use the language model itself as the numerical implementation of statistics or bioinformatics.

## First action: inspect, then reuse

Before any external fetch or analysis:

1. inspect `study/`, source state, decisions, processed data, run manifests, and formal artifacts;
2. determine whether a compatible completed artifact already answers the request;
3. if yes, explicitly tell the user that the local cached result is being used and do not recompute;
4. if the user asked to continue, resume from the first incomplete required stage;
5. fetch or recompute only when no compatible artifact exists or the user explicitly requests refresh / reanalysis.

Never infer cache validity from chat memory alone.

Interpret intent conservatively:

- explain / show / inspect / continue -> reuse compatible cache;
- another angle -> reuse source and processed data where compatible;
- reanalyze / rerun analysis -> recompute only the smallest affected analysis;
- change a parameter -> create a new affected run;
- refetch / latest / download again -> refresh external source;
- start over from source -> refresh source and create a new lineage without deleting prior completed work.

## Workspace contract

Research truth lives in workspace artifacts, not chat history.

Use these areas when initialized:

- `study/` — brief, reconstruction definition, decisions, source state, status;
- `references/` — searches, papers, notes;
- `data/manifests/` — external queries and retrieval metadata;
- `data/raw/` — source cache;
- `data/processed/` — reusable derived datasets;
- `runs/` — immutable analytical runs;
- `artifacts/` — formal tables, figures, reports;
- `exploration/` — non-canonical work.

Do not create a database or hidden state service for v0.

## Reconstruction classes

- `PUBLIC-FIXED` — public evidence and tooling are sufficient.
- `RECONSTRUCTED` — use a declared public substitute because the original implementation is unavailable.
- `DECISION` — ask the researcher before crossing the boundary.
- `OPTIONAL` — useful context that must not silently enter the canonical result.

Read `references/dependency-cut.md` before implementing or changing a stage. Read `references/canonical-flow.md` when executing beyond M1.

## Human-in-the-loop

Use DSH user questions for scientific choices. Use DSH approval only for execution permission under the active policy.

Initial decision ports:

- D1 — CAPN1 high / low grouping;
- D2 — multivariable survival covariates;
- D3 — DEG threshold;
- D4 — STRING confidence;
- D5 — immune deconvolution path.

Record accepted decisions in workspace state before downstream formal analysis depends on them.

## M1 — initialization and GDC source cache

Read `references/m1-operations.md` before running M1.

M1 resources:

- `scripts/init-workspace.mjs`;
- `scripts/gdc-source.mjs`.

Resolve resource paths from DSH's loaded skill resources; do not assume repository-relative paths after packaging.

The current M1 runner requires Node 18+ with built-in `fetch`. Use the existing DSH execution surface. If the target carrier cannot execute the bundled resource, report that compatibility gap; do not install an ad-hoc runtime or invent a Cordis service during the research run.

For initialization, run the init resource only if `study/reconstruction.yaml` is absent. It must preserve existing researcher files.

For source acquisition, inspect both `study/source.json` and `study/source-pending.json`:

- compatible completed `study/source.json` -> disclose cache use and reuse it for ordinary research work;
- pending acquisition + no valid active -> run normally to resume it;
- pending acquisition + valid active -> reuse active by default; use `--resume` only if the user explicitly wants to finish the pending acquisition;
- no completed or pending source -> run without `--refresh` to acquire public TCGA-LAML;
- explicit refresh/latest request -> run with `--refresh`.

A valid active source is preferred over pending work; cache validity includes content checksums, not just file sizes. A pending acquisition does not invalidate an older completed active source. A changed refresh becomes active only after the new snapshot fully validates.

Never add `--refresh` merely because a new chat/session began.

Recognize source statuses:

- `cache-hit` — zero GDC requests;
- `downloaded` — source snapshot acquired;
- `resumed-complete` — interrupted snapshot completed from saved manifest;
- `refresh-unchanged` — GDC re-queried, fingerprint unchanged, no redundant expression download.

Source acquisition can be long-running. Prefer DSH's existing background job support when available.

## M2 — processing and QC

When the completed M1 source is available, read `references/m2-operations.md` and use the bundled `scripts/m2-prepare.mjs`. Check `study/processed.json` first; disclose a compatible local processed cache hit. Only use `--rerun` after an explicit reprocessing request; never refetch GDC as part of M2.

Read `qc.md` and `qc.json` before proceeding. M2 retains all cases and files, does not resolve biological sample identity, and does not define a clinical survival endpoint. Read and disclose QC. Continue M3 with declared conservative structural exclusions and conventional survival defaults when source fields support them; stop if the data or assumptions are not valid.

## M3 — CAPN1 expression and survival demonstration

Read references/m3-operations.md from the loaded DSH skill resources and use the bundled scripts/m3-survival.mjs after complete M2 preparation. R with the survival package is required.

Use pnpm run survival, and --rerun only when explicitly requested. M3 does not refetch GDC. Its default records unique case/file mappings, median CAPN1 TPM grouping, GDC OS follow-up, Kaplan–Meier, log-rank, and unadjusted Cox. Inspect cohort.tsv, exclusions.tsv, statistics.tsv and report.md.

The aim is a valid, end-to-end Harness research demonstration, not a perfect reconstruction of Wang et al.'s reported results. The Agent may reason about medical significance using relevant evidence and explicit uncertainty, but must not assert causal biological mechanisms from association alone or claim experimental validation without independent experiments. The researcher retains decision accountability.

## M4 — Differential expression demonstration

Read references/m4-operations.md from loaded skill resources. Use scripts/m4-deg.mjs or pnpm run deg when completed M2/M3 workspace data are available. M4 uses original GDC integer counts, M3 CAPN1 grouping, and R/Bioconductor DESeq2. Default significant gene screen: padj < 0.05 and abs(log2FC) >= 1. Preserve all gene results and their filter/NA status; do not treat CAPN1's expected split difference as independent confirmation. Store immutable formal outputs, with cached reuse by default.

## M5 — GO / KEGG enrichment

Read references/m5-operations.md from the deployed Skill. Use `pnpm run enrichment` or bundled scripts/m5-enrich.mjs after a completed, verified M4 run. Use the M4 tested-gene universe and significant foreground, excluding ambiguous Ensembl-to-Entrez mapping. GO BP/MF/CC and KEGG use clusterProfiler; cached KEGG reference data are immutable and explicitly refreshable.

The original method was DAVID; our implementation is a documented alternative. Keep negative enrichment results, mapping limitations, package versions and complete term tables. Do not infer causality.

## Later canonical stages

After M2, follow `references/canonical-flow.md` for researcher-approved cohort, CAPN1 expression and survival, differential expression, enrichment, STRING, immune analysis, reconstruction reporting, and exploration.

Do not execute a later stage merely because it exists. Continue only when prerequisites and required researcher decisions are satisfied.

## Execution order

Prefer, in order:

1. DSH native capability;
2. official public scientific API or maintained scientific package;
3. a thin deterministic script;
4. a new Cordis tool/service only after a demonstrated capability gap.

Use DSH file tools for workspace state, shell/jobs for deterministic local scripts, web/MCP for appropriate existing integrations, and subagents/workflow only for useful local orchestration. Do not use workflow/subagents as the durable study state machine.

## Formal result rule

A reusable formal run must identify its inputs and digests/versions, source dataset/release, implementation or script, material software versions, parameters, referenced researcher decisions, outputs, warnings, and completion status.

If that lineage cannot be established, do not present the result as canonical reusable cache.

Canonical reconstruction and exploration must remain visibly separate. Exploration becomes formal only through an explicit new run or protocol revision.

## Communication

Keep the workflow understandable to a medical researcher.

When using cache, say so. When substituting a method, say so. When a scientific decision belongs to the researcher, stop and ask. When a tool fails or data are incomplete, expose the failure before proceeding.

The goal is not maximum autonomy. The goal is transparent, reusable research operations under researcher control.
