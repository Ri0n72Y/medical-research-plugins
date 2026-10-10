# CAPN1 v0 dependency cut

This file maps each canonical stage to existing DSH capabilities, public scientific tooling, thin project scripts, and unresolved gaps.

The purpose is to prevent duplicate infrastructure.

## Decision rule

For every implementation task, use this order:

1. existing DSH capability;
2. official or mature scientific tool;
3. thin deterministic project script;
4. new Cordis capability only if the first three cannot satisfy the requirement.

## Current cut

| Stage / need | DSH responsibility | External scientific responsibility | Project-owned work | New Cordis capability? |
|---|---|---|---|---|
| skill discovery and invocation | DSH skills / project skill provider | none | this SKILL.md and resources | no |
| workspace persistence | DSH filesystem / workspace | none | file conventions only | no |
| cache inspection | DSH read/list tools | none | skill rules + run manifests | no |
| cache invalidation decision | DSH files + agent reasoning | none | deterministic compatibility fields in manifests | no |
| scientific human decision | DSH user question | none | decision templates and wording | no |
| execution permission | DSH approval / sandbox | none | none | no |
| shell execution | DSH bash/pwsh/jobs | R/Python/CLI runtime | scripts | no |
| public web reading | DSH web search/fetch | public web | search strategy in skill | no |
| external tool bridge | DSH MCP client | suitable MCP server | configuration only if used | no |
| GDC discovery / download | DSH shell/jobs | NCI GDC API | M1 `scripts/gdc-source.mjs` | no |
| clinical/expression normalization | DSH shell | R/Python scientific stack | thin deterministic script | no |
| cohort QC | DSH shell | R/Python table tooling | thin deterministic script | no |
| survival analysis | DSH shell | R survival ecosystem | thin deterministic script | no |
| differential expression | DSH shell | DESeq2 or equivalent pinned implementation | thin deterministic script | no |
| GO / KEGG | DSH shell | clusterProfiler or equivalent pinned public implementation | thin wrapper/script | no |
| PPI | DSH web/shell | STRING public API | thin query/export script | no |
| ssGSEA | DSH shell | GSVA + pinned gene sets | thin deterministic script + versioned resource | no |
| CIBERSORT | DSH question + shell if user supplies assets | user-licensed assets | adapter only if needed | no for v0 |
| open immune substitute | DSH shell | maintained open package | thin deterministic script | no |
| report assembly | DSH file tools + model narrative | none | template and artifact selection rules | no |
| trajectory/audit | DSH session / trajectory | none | no duplicate event system | no |
| multi-agent review | DSH subagent/workflow | none | optional skill guidance | no |

## M3 provisional survival implementation

R `survival` is now used in the explicitly non-canonical M3 exploratory path, after GDC source caching and M2 preprocessing. Patient eligibility is audited by `scripts/m3-cohort.mjs`, and Kaplan–Meier/log-rank/Cox computation uses `scripts/m3-survival.R` through `pnpm run data:survival:explore`. The scientific decisions D1/D2 remain unresolved; this is not a claim that R version or original cutoff matches the author.

## Real unresolved capability

M1 did not reveal a need for a new Cordis service. Public source acquisition is currently covered by a thin Node script plus DSH shell/jobs.

Two runtime questions remain:

1. validate that the packaged skill can execute its bundled Node resource across the intended DSH carriers;
2. establish a reproducible scientific runtime for later R / Bioconductor analysis.

For the scientific runtime, evaluate the smallest workable option before adding infrastructure:

1. `renv.lock` plus any minimal Python lockfile;
2. a pinned container if it integrates cleanly with the target DSH environment;
3. a packaged runtime payload only if the above are not suitable.

Do not create a `research-runtime` Cordis service merely to solve package versioning.

## Current expected project-owned deterministic scripts

The exact filenames are not locked yet, but v0 likely needs thin scripts for:

- GDC manifest/query and download bookkeeping — **implemented in M1**;
- expression/clinical preparation;
- cohort QC;
- CAPN1 expression summary;
- survival analysis;
- differential expression;
- enrichment;
- STRING export;
- ssGSEA / selected immune analysis;
- run-manifest generation or validation if plain shell/R code cannot do it cleanly.

Each script should do one bounded scientific or data-engineering task.

Do not embed orchestration policy in these scripts. The Skill owns the operating procedure.

## Trigger for a future Cordis plugin

Do not add one because a helper function is inconvenient.

A new plugin is justified only if a stable capability must:

- participate in DSH lifecycle or scope;
- expose a model-facing tool that cannot be represented safely by shell/MCP;
- provide UI / resource behavior that workspace files cannot supply;
- enforce a cross-tool invariant that cannot live in the existing DSH seams.

Document the demonstrated gap before implementation.
