# AGENTS.md

## Mission

Build a DSH-native medical research workflow reference implementation that demonstrates, through one concrete CAPN1 / AML public-data study, how an LLM agent harness can assist biomedical researchers without taking ownership of scientific judgment.

The v0 project is intentionally overfit. Do not turn it into a general-purpose biomedical research framework unless later evidence from real use requires that abstraction.

## Source of truth

The project architecture baseline is `docs/architecture.md`.

The canonical v0 case is the public reconstruction of the 2023 CAPN1 / AML study led by Houcai Wang.

When code and documentation disagree, stop and reconcile the architecture instead of silently inventing new behavior.

## Reuse before building

Before adding a package, service, tool, or framework layer, inspect the target DSH version and relevant upstream scientific tooling.

Use this order:

1. existing DSH capability;
2. mature public scientific API / package / command-line tool;
3. a thin deterministic script or adapter;
4. a new Cordis plugin or service only when a real capability gap remains.

Do not duplicate DSH workspace state, filesystem, shell execution, jobs, skills, user questions, approvals, session logging, web tools, MCP bridging, subagents, or workflow infrastructure.

## DSH responsibility boundaries

Use DSH's existing concepts according to their meaning:

- **Workspace / filesystem**: durable research state and artifacts.
- **Skill**: operating procedure and agent guidance.
- **Tool / script**: deterministic capability or execution.
- **User question**: scientific choice that belongs to the researcher.
- **Approval**: permission for a sensitive operation, not a substitute for scientific review.
- **Session / trajectory**: interaction and execution audit, not the canonical research dataset.
- **Workflow / subagent**: optional local orchestration; do not use it as the durable study state machine.

The project must remain usable after a conversation ends because research state is stored in the workspace.

## v0 scope

The only canonical study is CAPN1 / AML.

Use public data only.

Expected public components include TCGA-LAML / GDC plus established R, Bioconductor, and public database tooling as needed for the reconstructed method.

Do not add a second disease, biomarker, paper, or generalized study schema simply to prove extensibility.

## Public reconstruction labels

Every canonical stage must be classified as:

- `PUBLIC-FIXED`
- `RECONSTRUCTED`
- `DECISION`
- `OPTIONAL`

If an original paper parameter is unavailable:

- use a declared reproducible public substitute when the scientific meaning remains reasonable;
- expose a DECISION port when the choice can materially change interpretation;
- never tune hidden parameters merely to match the published result.

A mismatch with the original paper is a result to report, not an error to conceal.

## Human-in-the-loop rule

The researcher owns:

- the research question;
- cohort inclusion / exclusion choices;
- scientifically meaningful thresholds;
- endpoint definitions;
- model covariates;
- biological interpretation;
- promotion of exploratory findings into formal analysis;
- final scientific conclusions.

The agent may explain defaults and alternatives, but must not silently cross these boundaries.

## Cache contract

The default behavior is cache-first and refresh-explicit.

Always:

1. inspect local workspace state before external fetch;
2. inspect compatible completed artifacts before recomputation;
3. reuse a compatible cache by default;
4. tell the user that a local cached artifact or dataset is being used;
5. recompute only the smallest affected stage when parameters change;
6. refetch external data only when the user explicitly asks for a refresh, latest/current data, or a full restart from source;
7. preserve old completed runs.

Interpret intent carefully:

- "continue", "explain", "show the result", "look again" -> reuse compatible cache;
- "reanalyze", "rerun this analysis" -> recompute the requested analysis while reusing compatible source data;
- "refetch", "get the latest data", "download again" -> refresh the external source and invalidate downstream compatibility;
- "start over from source" -> fresh source acquisition plus new downstream runs, while retaining historical artifacts.

Cache validity must be determined from explicit inputs, versions, parameters, and run status rather than model memory.

## Artifact rules

Formal results must be reconstructable from workspace artifacts.

A completed analytical run should record enough information to identify:

- input artifact(s);
- input version or digest;
- data source / dataset release when known;
- implementation or script;
- relevant software / package version;
- parameters;
- decision references;
- outputs;
- warnings;
- completion status.

Never overwrite a previous completed run to make a new result look canonical.

## Canonical vs exploration

Keep canonical reconstruction and open-ended exploration visibly separate.

Exploration may include:

- recent literature;
- alternative cutoffs;
- extra public cohorts;
- alternative methods;
- candidate hypotheses.

Exploration must not silently alter the canonical reconstruction.

If the researcher decides an exploratory change should become formal, create a new explicit run or protocol revision.

## Scientific safety and interpretation

The harness assists research operations. It is not a clinical decision system.

Do not:

- provide patient-specific diagnosis or treatment through the canonical workflow;
- claim causal mechanism from association alone;
- let an LLM perform numerical statistics that should be executed by R, Python, or a scientific tool;
- present a public substitute as if it were the paper's original implementation;
- hide missing data, failed tools, parameter uncertainty, or method substitutions.

## Engineering discipline

Prefer small, composable changes.

Keep domain-specific behavior close to the CAPN1 skill and deterministic scripts.

Avoid broad abstractions until at least two real use cases demonstrate the same stable boundary.

When adding a Cordis plugin, document why DSH native capabilities and upstream scientific tooling were insufficient.

When adding a dependency, prefer a maintained scientific package over custom reimplementation.

Do not embed large public datasets in Git unless a tiny deterministic fixture is specifically needed for tests.

## Architecture changes

Update `docs/architecture.md` when changing any of the following:

- ownership boundaries between researcher, agent, DSH, and scientific tools;
- workspace layout;
- cache / invalidation semantics;
- canonical stage definitions;
- classification of PUBLIC-FIXED / RECONSTRUCTED / DECISION / OPTIONAL steps;
- DSH capability reuse decisions;
- scientific runtime strategy.

Do not let implementation silently redefine these contracts.
