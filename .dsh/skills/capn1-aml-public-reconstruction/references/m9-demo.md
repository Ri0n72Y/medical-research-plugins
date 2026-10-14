# M9 — Engineering demonstration of the CAPN1 / AML workflow

M9 is a **showcase and acceptance guide**, not a new biomedical research milestone. The project reproduces the **publicly described sequence** of a CAPN1/AML paper to demonstrate DSH's agent/harness integration, deterministic scientific tools, durable workspace state and transparent orchestration. It does **not** undertake independent scientific adjudication of the paper.

## What to show (in order)

1. **Entry and scope.** Start the source-linked DSH Web profile with `pnpm run web --workspace <study>`. Invoke `/capn1-aml-public-reconstruction` and show that its Skill discovers the workflow and inspects existing workspace state before any operation. This DSH UI path still requires acceptance on an actual target machine.
2. **Single-paper workflow.** Traverse M1 GDC/TCGA-LAML acquisition -> M2 expression/clinical normalization -> M3 expression/survival -> M4 differential expression -> M5 GO/KEGG -> M6 STRING/NetworkX -> M7 ssGSEA -> additional paper gaps (pan-cancer, clinical associations, public immune-composition proxy) -> M8 reconstruction report (M8 covers M1–M7; open supplemental reports separately). Show actual artifacts at each boundary; explain the scientific engine (Python or public API) rather than suggesting the model computes the statistics.
3. **Visible demo choices.** D4 can be supplied as `pnpm run ppi --required-score 400`; D5 as `pnpm run immune --immune-mode ssgsea-only`. These are **explicit demonstration settings**, not researcher endorsement or restoration of unspecified paper parameters. The harness should ask rather than silently assume where a configured decision is mandatory.
4. **Durability.** Show `study/*.json` active pointers, `runs/` immutable outputs, input/output manifests and M8 `report.md`. Close and reopen the DSH session: the workspace, not conversation memory, remains the source of truth.
5. **Cache-first behavior.** Repeat one completed stage and observe a cache-hit with no duplicated GDC/STRING/GMT fetch. Explain that source refresh, stage rerun and report regeneration are distinct actions. Only execute a refresh when explicitly requested.
6. **Human-readable evidence.** Open the generated tables, figures and final report in the workspace. Show M8 incomplete-draft behavior if not all stages have been run: an incomplete demonstration must not pretend to contain results that were never generated.
7. **Tool ownership.** For each stage identify the DSH native capability (Skill/session/filesystem/shell/jobs/web/questions), external method (GDC/Python/STRING/Enrichr), and minimal repository-owned thin scripts. The engineering choice is reuse over new Cordis services.

## Recommended observable demo

Use one consistent public TCGA-LAML workspace. If no compatible source is present, run data preparation once. Then reuse that workspace for remaining stages:

```sh
pnpm run data:prepare --workspace <study>
pnpm run survival --workspace <study>
pnpm run deg --workspace <study>
pnpm run enrichment --workspace <study>
pnpm run ppi --workspace <study> --required-score 400
pnpm run immune --workspace <study> --immune-mode ssgsea-only
pnpm run paper:clinical --workspace <study>
pnpm run paper:pancan --workspace <study>           # UCSC Xena CAPN1-only
pnpm run paper:composition --workspace <study>      # explicit NNLS proxy, NOT CIBERSORT
pnpm run report --workspace <study>
```

This command sequence is an **acceptance plan**, not evidence that a full live run has completed. It can entail substantial public data download and scientific computation. CI already runs deterministic offline tests; a full public end-to-end demonstration, plus actual DSH Web UX acceptance, must be evidenced separately rather than inferred from unit-test success.

## Evidence to capture

- DSH Skill entry and workspace selection, with any manual step honestly documented;
- per-stage command/status, sample outputs and whether reused or computed;
- saved run paths (not invented screenshots or numbers), M8 final Markdown/report;
- session restart and cache-hit; stage rerun/source refresh distinction;
- errors and recovery path, if observed;
- an explicit table of **demonstrated / CI-only / unverified** capabilities.

## Boundaries

This is a workflow **reconstruction**, not a numerical confirmation of Wang et al. (PMID 37114994). Clearly label original versus substituted methods (e.g. DAVID -> public GO/KEGG; CIBERSORT -> ssGSEA-only), but do not add hypothesis-testing standards, biological peer-review, external cohorts or a scientific sign-off stage to this engineering showcase. Keep optional academic exploration outside this milestone. No new validator framework, runtime, plugin, CLI or workflow is needed for M9.
