# M9 — DSH engineering demonstration and end-to-end acceptance

## Purpose

This project uses Wang et al.'s CAPN1/AML paper ([PMID 37114994](https://pubmed.ncbi.nlm.nih.gov/37114994/)) as **one concrete workflow example**. The research subject is the demonstration vehicle. We are evaluating whether DSH can orchestrate an existing scientific process, call stable external methods, save verifiable outputs, and resume work across sessions—not determining whether CAPN1 is a clinically valid AML biomarker.

M1–M8 engineering code has been merged. Completing those implementations is **not** the same as producing a full public-data run, and neither implies a successful on-machine DSH Web demonstration. M9 exists to explain how these engineering claims should be demonstrated.

## Capabilities and observable proof

| Capability | Existing implementation | Observable evidence in demonstration |
|---|---|---|
| DSH Skill as operator | CAPN1 reconstruction skill | Skill invoked in a real DSH session; task and current workspace clearly visible |
| Native DSH integration | Web profile, shell/filesystem/jobs, user questions | The same session can inspect, execute and explain the workflow without adding a specialized Cordis service |
| Workflow decomposition | M1–M8 stages | Each step yields a real saved output (table, figure or Markdown report); no invented figures |
| Reuse of scientific tooling | GDC, Python lifelines/PyDESeq2/SciPy/NetworkX/GSEApy, STRING, public GMT | Recorded external tool/method and its outputs; model orchestrates, it does not perform statistics itself |
| State outside conversation | `study/*.json`, `runs/`, manifests | Restart a session and continue from workspace files, without past conversation memory |
| Cache-first and refresh boundaries | Existing stage caches | Repeat a completed step for cache-hit; new source acquisition only when explicitly requested |
| Human-controlled material parameters | D4 STRING score, D5 immune path | Explicit CLI demo parameters or recorded human choice, not silent defaults |
| Final synthesis | M8 report | Open `report.md` and its stage evidence/gap register; incomplete reports remain marked incomplete |
| Evidence of integration | Current CI and target machine | Keep **unit/CI green**, **actual public-data run**, and **DSH runtime acceptance** as three distinct claims |

## End-to-end scenario

Run the one-paper TCGA-LAML sequence: public source -> normalized expression/clinical tables -> CAPN1 survival -> differential expression -> GO/KEGG -> STRING -> ssGSEA -> aggregate M8 report. The exact documented command order and parameter examples are in the Skill's [M9 operations guide](../.dsh/skills/capn1-aml-public-reconstruction/references/m9-demo.md).

As an engineering demonstration, `--required-score 400` and `--immune-mode ssgsea-only` may be deliberately chosen and recorded. They do not represent missing original paper settings and do not require a separate biomedical review exercise. The ssGSEA path is a public stand-in, **not** CIBERSORT and not inferred cell fractions.

After completion, re-enter DSH Web with the same workspace. Verify the prior M8 report is available and request reuse of an earlier stage. The visible success condition is correct result continuity, cache-first behavior and an intelligible explanation of which operation ran or was reused.

## Additional original-paper analysis coverage

The base M1–M8 chain is supplemented by `paper:clinical`, `paper:pancan` and `paper:composition`. These three commands have their **own** TSV/SVG/Markdown reports. Present them alongside M8 rather than claiming M8 already includes the supplements. The public immune composition step is **NNLS marker contribution**, not CIBERSORT; if licensed CIBERSORT results are available they may be imported/visualized instead, subject to applicable terms. See [paper coverage](paper-coverage.md).

## Evidence and closeout

Record outcomes as **demonstrated**, **CI-only**, **unverified** or **blocked**. Do not label a capability demonstrated solely because a script exists or deterministic tests passed. If only M1–M5 actual public runs exist, exhibit an honest M8 draft with M6/M7 gaps instead of manufacturing those missing outputs.

Recommended final engineering narrative: Why a general-purpose agent harness, coupled to mature scientific tooling and durable artifacts, is a better fit here than a bespoke scientific agent framework. Show the remaining limitations plainly (for example, DSH target-machine integration may still require visual/manual acceptance).

## Deliberately excluded

No extra CAPN1 hypothesis generation, multivariable prognostic model, outside AML cohort, biological mechanism evaluation, new scientific validity gate or generic data-validation layer. This project does not act as a clinical decision tool or assert scientific results not actually computed. Optional research exploration remains independent of the engineering demonstration.
