# M8 — CAPN1 / TCGA-LAML reconstruction evidence report

M8 is a deterministic Node synthesis of **existing M1–M7 artifacts**. It is neither a new statistical analysis nor a final researcher-approved scientific interpretation.

## Inputs and evidence rules

M1: active `study/source.json` metadata. M2–M7: active stage manifests and **all** registered output files, whose byte counts and SHA-256 hashes are verified before any observation is included. M5/M7 public reference snapshots are separately checksum-verified when present; the M7 signature reference is required. M8 checks upstream source digests and M2/M3/M4 identifiers. It does not re-download GDC, rerun lifelines/PyDESeq2/SciPy/STRING/GSEApy, or hash the entire upstream raw GDC archive again.

Each verified stage contributes only an identified method, declared run identity, and excerpt from its own verified stage report. A missing stage contributes a clearly labeled gap, not a substituted numerical result. A present corrupted or inconsistent stage is a hard error.

The indexed Wang et al. paper (PMID 37114994) anchors the *publicly described method shape*. The original paper's unrecorded effect sizes, parameters and signatures are never fabricated or numerically matched. Directional agreement is **UNASSESSED** unless a separate verified comparison source is later provided.

## Run

`pnpm run report --workspace /absolute/path/to/study`

This creates immutable `runs/m8-reconstruction/<run-id>/` containing `report.md`, `evidence-register.tsv`, `gaps.tsv`, `provenance.json` and `run-manifest.json`; `study/reconstruction-report.json` points to the last successful generated run. Repeating the same inputs is a cache hit.

- `--require-complete` refuses to publish an incomplete report. All seven stages must have verified active results, M6 must be from live STRING, and M7 must carry a live public signature retrieval. This yields only **ready_for_researcher_review**, never scientific approval.
- `--rerun` reassembles an immutable report from local inputs, without any upstream execution or public data refresh.

Missing M6/M7 real results and unresolved D4/D5 choices must remain visible. Even a report marked ready for researcher review is *not* a clinical result or independent experimental validation.

## Scope

This narrow M8 implementation reuses DSH workspace state and the existing CLI/CI. It does not introduce a report framework, LLM-generated numbers, additional diseases, publication submission, or M9 exploration.
