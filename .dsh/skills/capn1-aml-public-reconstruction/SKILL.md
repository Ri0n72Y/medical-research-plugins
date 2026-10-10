---
name: capn1-aml-public-reconstruction
description: Reconstruct and continue the 2023 CAPN1 / AML public-data study in a DSH workspace using public data, deterministic scientific tools, explicit researcher decisions, and cache-first reuse.
whenToUse: Use when the user wants to initialize, reproduce, continue, inspect, explain, rerun, refresh, or explore the CAPN1 / AML canonical study in this workspace.
---

# CAPN1 / AML Public Reconstruction

This is the canonical v0 workflow. It is intentionally overfit to one study. Do not generalize it into a biomedical workflow framework while executing it.

## Core boundary

The researcher owns the science.

You may inspect the workspace, organize evidence, fetch approved public data, call deterministic scientific tools, summarize formal artifacts, and help explore alternatives.

Do not silently choose scientifically material assumptions. Do not turn association into mechanism. Do not use the language model itself as the numerical implementation of statistics or bioinformatics.

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

Read `qc.md` and `qc.json` before proceeding. M2 retains all cases and files, does not resolve biological sample identity, and does not define a clinical survival endpoint. Stop at the researcher QC gate before analysis.

## M3 — Explicit exploratory survival reconstruction

A bounded, **non-canonical** public reconstruction is available through `pnpm run data:survival:explore` after a complete verified M1/M2 cache and installation of R `survival`. It does not fetch data. Read `docs/m3-survival-reconstruction.md` for the exact patient-selection and endpoint assumptions.

The publication's full Methods have not yet been verified. Median TPM cutoff and demographic/follow-up OS rules are **provisional assumptions**, never recovered paper parameters. Keep M3 outputs under `exploration/`; do not mark D1/D2 resolved or a cohort approved. A cache hit must be disclosed. Only create new exploration outputs on input/method change or explicit `--rerun`.

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
