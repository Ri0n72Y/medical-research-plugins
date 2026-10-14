# M11 — Paper-derived research record

The original CAPN1/AML publication is the process case. A second research object is **DSH Harness orchestration**, specifically how researcher choices become inspectable, resumable work rather than only a chat response.

## Operate

From a workspace containing any subset of completed stages:

```sh
pnpm run record --workspace /absolute/study/path
```

This reads the explicit mapping `references/paper-workflow.json`, `study/source.json`, the M2–M7 pointers, all three `study/paper-*.json` pointers, and `study/reconstruction-report.json`. It also reads (if present) `study/decisions.yaml` and `study/harness-session.md`. It does **not** run analysis, download resources, infer biomarker results or change M8.

Open the generated active pointer `study/research-record.json` to find the immutable `runs/m11-record/<run-id>/` directory. Outputs:
- `study-record.md`: paper step → real implementation → recorded workspace outputs → decisions and substitution labels, including a separate Harness research question.
- `workflow.tsv`: all eleven paper-derived process nodes, present or absent.
- `artifacts.tsv`: paths and declared digests from stage manifests.
- `harness-observations.md`: evaluation claims and the current DSH runtime observation boundary.

Run it again to reuse an unchanged index. Use `--rerun` to issue a new immutable index without recomputing scientific work. An upstream pointer, decision file or observation note change creates a new index automatically.

## Roles and evidence

**Researcher:** chooses route, assumptions and substantive methods, responds to decision gates, determines interpretations and follow-up. **DSH Agent/Harness:** may interpret the chosen route, call the existing deterministic scripts and public APIs, relay errors, present outputs and resume from workspace. **Scientific tools:** actually compute models and statistics.

The record does not infer that an Agent used a tool from the existence of outputs. In a real DSH session, an operator may record observed actions in `study/harness-session.md`: chosen method/decision, Agent-selected next step, actual executed call, saved output, cache hit, failure/recovery and cold-start reopening. Such notes are **operator-supplied** evidence; absent notes remain explicitly unobserved.

## Scope

The mapping is based on the publicly indexed paper method shape; it is not a verified figure-by-figure full text index. M8 still summarizes M1–M7, while M11 indexes M8 and three independent supplemental slices. Public NNLS is not original CIBERSORT. Missing M6/M7, missing supplementary runs, and M8 incomplete drafts are represented rather than filled in.
