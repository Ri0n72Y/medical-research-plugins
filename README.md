# Medical Research Plugins for DeepSeek Harness

A DSH-native, human-in-the-loop research workflow reference implementation for medical researchers.

The project starts deliberately narrow: **reconstruct one real 2023 CAPN1 / acute myeloid leukemia (AML) public-data study end to end**, using public data and existing scientific software, and use that concrete workflow to show what an AI agent harness can and cannot do for biomedical research.

This repository is not an autonomous scientist and is not a general biomedical platform.

## Why this project exists

Many medical supervisors are now expected to propose "smart medicine", AI, or other interdisciplinary projects without having an engineering model for where modern LLM agents actually fit.

This project demonstrates a conservative answer:

- the researcher owns the scientific question, method choices, and interpretation;
- DSH provides the agent harness, workspace, tools, skills, approvals, questions, sessions, and execution substrate;
- mature scientific tools perform the actual statistics and bioinformatics;
- the agent coordinates repetitive work, handles large amounts of text and metadata, explains the workflow, and helps the researcher explore;
- durable research state lives in the workspace, not in chat memory.

The first example is intentionally overfit to one study instead of prematurely designing a universal research framework.

## Canonical v0 case

**CAPN1 in AML — public reconstruction of the 2023 study led by Houcai Wang.**

The v0 workflow is expected to cover, where public information and public tooling allow:

1. reference and method mapping;
2. TCGA-LAML public data acquisition;
3. expression and clinical-data preparation;
4. cohort QC;
5. CAPN1 expression analysis;
6. survival analysis;
7. differential expression;
8. GO / KEGG enrichment;
9. STRING PPI analysis;
10. immune analysis with public implementations or an explicit decision point;
11. reconstruction report;
12. optional post-reconstruction exploration.

This is a **public reconstruction**, not a claim of bit-for-bit reproduction of the authors' original 2023 environment.

## Core operating principles

### Researcher owns the science

AI may organize, execute approved steps, summarize evidence, and expose uncertainty. It must not silently choose scientific assumptions or promote correlation into mechanism.

### DSH owns the harness

Before adding project-specific infrastructure, reuse DSH's existing capabilities:

- workspace filesystem and containment;
- read / write / edit tools;
- shell execution and jobs;
- user questions for scientific decisions;
- approval for sensitive tool execution;
- skills and packaged skill providers;
- web search / fetch where appropriate;
- MCP for suitable external scientific services;
- subagents / workflows only where they genuinely help local orchestration.

### Workspace owns the research state

Downloaded public data, normalized datasets, run manifests, scripts, decisions, figures, tables, references, notes, and reports stay in the workspace.

Chat history is an interface, not the source of truth.

### Cache first, refresh explicitly

After the first successful run:

1. inspect the workspace before fetching;
2. reuse compatible local data before downloading;
3. reuse compatible analysis artifacts before recomputing;
4. explicitly tell the user when cached local results are being used;
5. refresh only when the user asks to fetch again, use current data, or rerun an analysis;
6. never overwrite prior completed research artifacts.

"Rerun the analysis" and "refetch the source data" are different operations.

### Public gaps stay visible

Every workflow step is classified as one of:

- **PUBLIC-FIXED** — public evidence is sufficient to define the step;
- **RECONSTRUCTED** — the original implementation is unavailable, so a public reproducible substitute is declared;
- **DECISION** — the choice can materially affect scientific interpretation and must return to the researcher;
- **OPTIONAL** — useful context that is not required for the canonical reconstruction.

The agent must not guess across a DECISION boundary.

### Canonical work and exploration do not silently mix

The canonical reconstruction stays traceable to its protocol and decisions.

Follow-up literature searches, alternative parameters, extra datasets, and speculative ideas may be explored, but they remain separate until the researcher explicitly promotes them into a new formal run.

## Intended deliverable

The intended product is a **DSH plugin/skill pack**, not a standalone research application.

A user should be able to install it into a compatible DSH environment, open a workspace, invoke the CAPN1 skill, and reproduce or continue the workflow through ordinary interaction with the agent.

Most domain behavior should live in:

- skills;
- deterministic scripts;
- public scientific APIs and packages;
- workspace artifacts.

New Cordis services or tools should exist only where DSH and mature community tooling leave a real capability gap.

## Repository status

Current phase: **CAPN1 skill baseline**.

The project now includes a DSH project-local skill at:

`.dsh/skills/capn1-aml-public-reconstruction/`

The skill is intentionally procedural rather than computational. It defines:

- workspace-first and cache-first behavior;
- canonical stage boundaries;
- researcher decision ports;
- public reconstruction vs. original-method distinctions;
- DSH/native/public-tool reuse order;
- minimal study and run-manifest templates.

Scientific analysis scripts and the reproducible R/Bioconductor runtime are the next implementation layer.

When this repository itself is opened as a DSH project workspace, the project-local skill path is already in DSH's normal skill discovery surface. The later distributable plugin/bundle should package the same skill rather than invent a second workflow definition.

See [docs/architecture.md](docs/architecture.md) for the v0 architecture and [AGENTS.md](AGENTS.md) for contributor and agent constraints.
