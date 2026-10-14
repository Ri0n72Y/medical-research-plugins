# M11 — Research record as a test of Harness capabilities

## Two coupled research objects

**CAPN1/AML** is a concrete bioinformatics workflow: public TCGA data → processing → pan-cancer expression → survival and clinical comparisons → DEG → GO/KEGG → STRING → ssGSEA/immune-composition counterpart → report.

**DSH Harness** is the engineering research object: can a general-purpose agent system translate a researcher-selected route into existing tools, reconstruct a complete observable sequence from persistent outputs, expose material decision boundaries and recover from a new session without relying on chat memory?

These are not interchangeable questions. We are demonstrating the **execution model**, not making independent clinical claims. This case establishes a researchable capability question; it does not by itself prove the Harness is more accurate or faster than a person.

## What the integration makes observable

The single [paper-step map](../.dsh/skills/capn1-aml-public-reconstruction/references/paper-workflow.json) encodes eleven sequentially readable stages and links to their current `study/*.json` pointers, direct commands, method substitutions and D1–D5 decisions. Running `pnpm run record --workspace <study>` creates:

| Output | Observable fact |
|---|---|
| `study-record.md` | Research method → chosen tool route → run identity → outputs; M8 and three supplements are separately referenced |
| `workflow.tsv` | Which paper steps have an active run, draft, missing, or incomplete |
| `artifacts.tsv` | File paths and declared SHA-256 hashes from run manifests, not fabricated figures or reverified raw data |
| `harness-observations.md` | Capability questions, what static scripts can establish, what only a real DSH session can establish |
| `study/research-record.json` | Active immutable record snapshot pointer, recoverable after session restart |

The researcher's current `study/decisions.yaml` is preserved verbatim in the record. Actual per-run parameters are displayed independently from proposals; the program **does not** infer implicit researcher approval from default values.

## Candidate engineering claims and how to test them

1. **Intent → plan:** present the original paper's method steps and a researcher choice to DSH; observe which existing command or library it chooses. A static command list alone cannot establish this behavior.
2. **Plan → work:** inspect real DSH tool calls, errors and file outputs. The numerical results come from established packages, not generated AI prose.
3. **Work → durable state:** close the conversation/session, start a new one, and ask DSH to read the active workspace and recover the same run/decisions. A cache-hit without an actual DSH restart only proves the deterministic CLI cache.
4. **Researcher intervention:** change a meaningful parameter at the researcher boundary; inspect which stage is rerun and whether earlier outputs persist.
5. **Accountability:** reconstruct a missing, failing or method-substituted stage from the output index. Do not silently turn a missing part into a positive scientific conclusion.

A future evaluation could compare interventions, recoveries and mistakes across runs; **none of those measurements is asserted here**.

## Operating example and limitations

```sh
pnpm run data:prepare --workspace /study
pnpm run survival --workspace /study
pnpm run deg --workspace /study
pnpm run enrichment --workspace /study
pnpm run ppi --workspace /study --required-score 400
pnpm run immune --workspace /study --immune-mode ssgsea-only
pnpm run paper:pancan --workspace /study
pnpm run paper:clinical --workspace /study
pnpm run paper:composition --workspace /study
pnpm run report --workspace /study
pnpm run record --workspace /study
```

This is a **planned execution sequence**, not a claim of completed live TCGA/Xena/STRING data acquisition or DSH UI demonstration. M8 remains its original M1–M7 synthesis; M11 supplies a cross-cutting index, not new science. A missing stage remains missing and an M8 draft remains labeled draft.

Documentation is grounded in the available indexed [Wang et al. CAPN1/AML article](https://pubmed.ncbi.nlm.nih.gov/37114994/) and the actual repository's workflow—not in an inaccessible, presumed complete figure index. Real DSH session observations may be written manually into `study/harness-session.md`; static script execution does not count as direct Agent participation evidence.
