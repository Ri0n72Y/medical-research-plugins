# Architecture Baseline

Status: **v0 baseline**

This document defines the initial architecture for the CAPN1 / AML medical research skill pack. It deliberately describes a narrow reference implementation rather than a general research platform.

## 1. Problem statement

Medical researchers increasingly need to supervise AI / "smart medicine" interdisciplinary work, but an LLM chat interface does not by itself explain where agent engineering belongs in a real research process.

The project should provide a runnable example showing that an agent harness is most useful for:

- repetitive research operations;
- large-scale text and metadata handling;
- calling deterministic scientific tools;
- preserving a transparent workflow;
- exposing missing information and decisions;
- continuing from durable workspace state;
- helping the researcher explore after the formal workflow is complete.

The project must also make the boundary clear: experiments, clinical collection, study design, and scientific interpretation still belong to researchers.

## 2. Canonical study

v0 reconstructs the public-data workflow of the 2023 CAPN1 / AML study led by Houcai Wang.

The target is a **public reconstruction**, not bit-for-bit reproduction of the original unpublished environment.

Where the original implementation is not publicly recoverable, v0 either:

1. declares a reproducible public substitute; or
2. exposes an explicit researcher decision point.

The canonical study stays singular in v0. No abstraction for multiple diseases or papers is required.

## 3. Product shape

The intended deliverable is a DSH plugin / skill pack.

It should run inside an existing DSH workspace rather than introduce a standalone application.

Conceptually:

```text
Researcher
   |
   v
DSH conversation + CAPN1 skill
   |
   +--> DSH native tools / questions / web / MCP
   |
   +--> deterministic scientific scripts and packages
   |
   v
Workspace artifacts and research state
```

The agent coordinates and explains. Scientific software computes. The workspace persists.

## 4. Use DSH before adding infrastructure

The first implementation must reuse DSH's existing capability seams wherever possible.

| Need | DSH capability | v0 decision |
|---|---|---|
| Durable files and research state | workspace filesystem / fs tools | reuse |
| File safety / containment | filesystem policy / sandbox | reuse |
| Shell execution | bash / pwsh | reuse |
| Long-running local work | jobs | reuse if needed |
| Researcher choices | user questions | reuse |
| Sensitive-operation permission | approval | reuse for permission only |
| Agent operating procedure | skills | reuse |
| Public web discovery | web search / fetch | reuse |
| External scientific tools | MCP client | reuse when a suitable server already exists |
| Parallel analysis/review | subagents / workflow | optional, local orchestration only |
| Persistent study state machine | workspace files | do not build a new service in v0 |

A new Cordis service is justified only after a concrete missing capability is demonstrated.

## 5. Skill-first implementation

The CAPN1 study procedure should primarily be expressed as a packaged DSH skill plus deterministic resources.

A probable package shape is:

```text
medical-research-plugins/
  README.md
  AGENTS.md
  docs/
    architecture.md

  plugin/                 # thin bundle/provider layer only if needed
  skills/
    capn1-aml-public-reconstruction/
      SKILL.md
      references/
      scripts/
      templates/
      checks/
```

This is a direction, not a required directory layout before implementation evidence exists.

The plugin layer should stay thin. Domain logic belongs near the skill and scripts.

## 6. Workspace is the research state

The user's active DSH workspace owns initialized study data and outputs.

A study workspace may eventually look like:

```text
study/
  brief.md
  reconstruction.yaml
  decisions.yaml
  status.md

references/
  searches/
  papers/
  notes/

data/
  manifests/
  raw/
  processed/

runs/
  expression-001/
  survival-001/
  deg-001/
  enrichment-001/
  ppi-001/
  immune-001/

artifacts/
  tables/
  figures/
  reports/

exploration/
  searches/
  analyses/
  notes/
```

These names are descriptive, not yet a rigid schema.

The important invariant is that formal research state does not depend on conversation memory.

## 7. Cache-first execution contract

The initialized workspace is also the project cache.

### 7.1 Default rule

```text
inspect before fetch
reuse before compute
tell before reuse
refresh only on request
never overwrite completed research artifacts
```

A later session should use an existing compatible result immediately when possible.

Example:

> Using the local cached survival result from `survival-001`; no public data was refetched and the survival model was not rerun.

The exact user-facing wording may vary, but cache use must be disclosed.

### 7.2 Source cache and analysis cache are different

"Rerun the analysis" must not imply "redownload the public dataset."

Likewise, "refresh the public data" invalidates downstream compatibility but does not delete historical runs.

Typical behavior:

| User intent | Source data | Processing | Analysis |
|---|---|---|---|
| explain/show/continue | reuse | reuse | reuse |
| reanalyze this step | reuse | reuse where compatible | rerun requested step |
| change a parameter | reuse | reuse where compatible | new affected run |
| refetch / latest data | refresh | new downstream processing | new downstream runs |
| start over from source | refresh | new | new |

### 7.3 Cache validity

The model must not decide cache validity from memory or filenames alone.

A reusable run should expose at least:

- input artifact identity;
- input version or digest;
- method / implementation;
- material parameters;
- referenced researcher decisions;
- completion status;
- output locations.

A minimal run manifest might resemble:

```yaml
run: survival-001
status: completed

inputs:
  expression:
    path: data/processed/expression.tsv
    digest: sha256:...
  clinical:
    path: data/processed/clinical.tsv
    digest: sha256:...

method:
  implementation: survival::coxph

parameters:
  gene: CAPN1
  endpoint: OS
  grouping: median

decisions:
  - D1

outputs:
  - artifacts/tables/survival-001.csv
  - artifacts/figures/km-001.svg
```

The exact schema can evolve after implementation pressure appears.

### 7.4 No destructive rerun

A new valid run gets a new identity.

Do not overwrite `survival-001` with different parameters and pretend it is the same analysis.

## 8. Public reconstruction labels

Every canonical stage must have one of four statuses.

### PUBLIC-FIXED

Public evidence and stable public tooling are sufficient to define the operation.

The harness may execute it automatically after prerequisites are satisfied.

### RECONSTRUCTED

The original implementation is not publicly recoverable, but a public reproducible substitute can answer approximately the same methodological question.

The substitution must be visible in the workspace and report.

### DECISION

The missing choice can materially affect scientific interpretation.

The agent must return the choice to the researcher through DSH's human-question surface.

### OPTIONAL

The step can add context but is not required for the canonical reconstruction.

It must not silently become part of the formal result.

## 9. Initial public method map

The first implementation should start from the following map and refine it only when stronger public evidence appears.

| Stage | v0 source / implementation | Class | Notes |
|---|---|---|---|
| AML public cohort | TCGA-LAML through NCI GDC | PUBLIC-FIXED | record GDC queries/manifests and dataset metadata |
| RNA expression acquisition | current public GDC harmonized expression outputs | PUBLIC-FIXED | preserve source representation and release metadata |
| Clinical data | GDC public clinical/case metadata | PUBLIC-FIXED | missing fields stay missing; do not invent |
| CAPN1 group cutoff | median as conservative default | DECISION | researcher may choose another documented rule |
| Survival execution | established R survival tooling | PUBLIC-FIXED | endpoint and cohort must be explicit |
| Multivariable covariates | no hidden default | DECISION | researcher owns inclusion of covariates |
| Differential expression | count-based established R/Bioconductor implementation | PUBLIC-FIXED | threshold is separately reviewable |
| DEG threshold | initial declared default, e.g. FDR and log2FC | DECISION | do not tune to published significance |
| GO / KEGG enrichment | public Bioconductor implementation such as clusterProfiler | RECONSTRUCTED | original paper used DAVID; substitution must be declared |
| PPI | STRING public interface | PUBLIC-FIXED | material confidence parameter stays explicit |
| STRING confidence | transparent default | DECISION | preserve chosen threshold |
| ssGSEA | GSVA / ssGSEA public implementation | PUBLIC-FIXED | pin gene-set source and package/runtime version |
| CIBERSORT | not bundled | OPTIONAL / DECISION | licensed assets may be supplied by user; otherwise use a declared public substitute or skip |
| public immune substitute | e.g. a supported open deconvolution method | RECONSTRUCTED | never label it as CIBERSORT reproduction |
| pan-cancer / normal context | public cross-cohort source such as UCSC Xena | OPTIONAL | exploratory context, not core AML evidence |

Useful upstream references:

- NCI GDC API: https://docs.gdc.cancer.gov/API/Users_Guide/Search_and_Retrieval/
- GDC RNA expression pipeline: https://docs.gdc.cancer.gov/Data/Bioinformatics_Pipelines/Expression_mRNA_Pipeline/
- clusterProfiler: https://bioconductor.org/packages/release/bioc/html/clusterProfiler.html
- GSVA: https://bioconductor.org/packages/release/bioc/html/GSVA.html
- STRING API: https://string-db.org/help/api/

These are dependencies or upstream capabilities, not project-owned implementations.

## 10. Initial researcher decision ports

The canonical skill should expose at least these visible decision ports unless public evidence later removes one.

### D1 — CAPN1 high / low grouping

Default reconstruction proposal: cohort median.

The agent must explain that the original public cutoff could not be established before asking the researcher to accept or revise it.

### D2 — Multivariable survival covariates

Do not auto-select clinically meaningful covariates merely because they are available.

The researcher chooses whether and which variables enter the model.

### D3 — DEG threshold

The analysis implementation may be fixed, while FDR and effect-size thresholds remain explicit and reviewable.

### D4 — STRING confidence

Use a transparent default only after showing it to the researcher.

### D5 — Immune deconvolution path

Possible choices:

1. use ssGSEA only;
2. use a declared fully public substitute;
3. use user-supplied licensed CIBERSORT assets;
4. skip deconvolution.

A public substitute must not be represented as the original method.

Decision records should live in the workspace and be referenced by downstream runs.

## 11. Canonical reconstruction flow

The initial skill should guide the agent through roughly these stages.

### Stage 0 — Inspect / initialize

Before doing anything external:

1. inspect the workspace;
2. detect an existing study and compatible artifacts;
3. disclose cache reuse;
4. initialize only missing study state.

### Stage 1 — Reference and method map

Capture what is publicly known about the 2023 study and identify reconstruction gaps.

Do not infer hidden method details as facts.

### Stage 2 — Public data acquisition

Resolve and fetch TCGA-LAML data only when a compatible local source cache is absent or the researcher requested refresh.

Store manifests and source metadata.

### Stage 3 — Processing and cohort QC

Prepare expression and clinical tables.

Report missingness, duplicate/sample mapping issues, and proposed exclusions.

Scientifically material exclusion choices belong to the researcher.

### Stage 4 — Expression and survival

Run deterministic analysis with declared parameters.

Use existing compatible outputs if present.

### Stage 5 — DEG, enrichment, PPI, immune

Execute the public reconstruction map step by step.

Substitutions and decision ports remain visible.

### Stage 6 — Reconstruction report

Build the report from formal workspace artifacts, not from chat memory.

Separate:

- what the original publication reported;
- what this public reconstruction did;
- what matched directionally;
- what differed;
- what was substituted;
- what remains uncertain.

### Stage 7 — Exploration

After or alongside the canonical workflow, the researcher may ask additional questions.

Exploratory searches and analyses remain under an exploration area or otherwise clearly marked as non-canonical.

They become formal only through an explicit new run / revision.

## 12. Human-in-the-loop semantics

Human-in-the-loop is not a generic "approve every tool call" pattern.

There are two different mechanisms:

### Scientific decision

Use DSH user questions.

Examples:

- cutoff;
- cohort exclusion;
- endpoint;
- covariates;
- whether to substitute a method.

### Execution permission

Use DSH approval only for operations that need permission under the configured execution / sandbox policy.

Do not conflate permission with scientific validity.

## 13. Scientific execution boundary

LLMs may:

- parse and summarize papers;
- generate search strategies;
- organize references;
- explain a proposed method;
- orchestrate tools;
- summarize tool outputs;
- compare formal artifacts;
- identify uncertainty;
- help explore alternatives.

LLMs must not be the numerical implementation for:

- statistical tests;
- survival models;
- differential expression;
- enrichment calculations;
- gene ID conversion;
- deconvolution;
- PPI scoring.

Those belong to deterministic scientific tools and scripts.

## 14. Provenance without a new provenance service

Do not introduce a generic provenance subsystem in v0.

Use two existing evidence layers:

1. DSH session / trajectory for interaction and tool execution history;
2. small workspace manifests for durable scientific lineage.

The workspace manifest exists because the research artifact must remain understandable outside one chat session.

## 15. Runtime strategy

DSH already provides process execution. The unresolved implementation question is **scientific environment reproducibility**, especially R / Bioconductor dependencies.

Do not answer this by inventing a new runtime service.

Implementation should first evaluate the smallest reproducible option, for example:

- an R `renv.lock` plus Python lockfile if needed;
- a pinned container image if DSH execution can use it cleanly;
- a packaged dependency payload only if the first two approaches do not fit the target DSH environment.

This remains an implementation decision, not an architecture requirement yet.

## 16. Community reuse policy

Before implementing a scientific integration:

1. check whether DSH already exposes it directly or through MCP;
2. check established scientific packages / official APIs;
3. check mature community tool collections where appropriate;
4. wrap rather than rewrite.

Potential ecosystems worth evaluating include biomedical tool collections such as ToolUniverse / Biomni and benchmark organization ideas from BioAgent Bench / BioCodex.

Do not import another agent runtime into DSH merely to reuse one scientific capability.

## 17. v0 non-goals

v0 does not include:

- autonomous scientific discovery;
- clinical decision support;
- patient-specific diagnosis or treatment;
- private hospital data;
- HIS / LIS integration;
- wet-lab automation;
- a generic biomedical workflow engine;
- a general provenance database;
- a general cache service;
- a second canonical study;
- a new foundation model;
- hidden optimization to match the published paper.

## 18. Success criteria

The architecture is working when a medical researcher can:

1. install the pack into a compatible DSH environment;
2. open a workspace;
3. invoke the CAPN1 reconstruction skill;
4. understand what the harness will and will not do;
5. run the workflow using public data and public tools;
6. make explicit scientific decisions at the relevant boundaries;
7. close and reopen DSH without losing research state;
8. ask follow-up questions and receive fast answers from disclosed local cached artifacts;
9. explicitly request reanalysis or data refresh when desired;
10. inspect how a formal result was produced;
11. explore beyond the canonical case without silently corrupting it.

The technical goal is not "maximum agent autonomy."

The goal is a reusable, inspectable demonstration of how an AI harness can make biomedical research operations more efficient while keeping the science under researcher control.
