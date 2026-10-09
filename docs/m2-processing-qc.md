# M2 — Expression / clinical processing and cohort QC

Status: implemented as a deterministic data preparation slice. No scientific cohort has been approved.

## Boundary

M2 consumes only the **completed** M1 source at `study/source.json`. It does not download data, choose a representative specimen, exclude patients, define OS, fit survival models, or run DESeq2.

M2 continues using Node's built-in filesystem/stream/crypto capabilities. It does **not** require a new Cordis service or R/Bioconductor runtime.

The source remains the raw research record. M2 derives inspectable tables without silently resolving biological ambiguities.

## Inputs

- `study/source.json` with `status=complete`;
- matching source manifest;
- GDC per-file STAR - Counts TSV files;
- GDC clinical cases JSON.

The current M1 file manifest maps expression **files to cases**, not reliably to individual biospecimen/sample identities. Each expression column therefore uses its **GDC file UUID**, not an invented sample ID.

M2 verifies source presence, expression file byte sizes and GDC MD5 values, and the clinical source digest **before processing or claiming a processed-cache hit**. This preserves the distinction between an intact cached result and verifiable raw lineage.

## Outputs

Each completed processing run lives at:

`data/processed/<source snapshot>/<m2 run id>/`

- `counts-unstranded.tsv`: gene-ID × GDC-file-ID raw unstranded counts matrix;
- `tpm-unstranded.tsv`: gene-ID × GDC-file-ID GDC TPM matrix;
- `gene-annotation.tsv`: gene ID / symbol / type;
- `capn1-expression.tsv`: CAPN1 values per source file, **only if one unambiguous CAPN1 gene symbol exists**;
- `expression-files.tsv`: GDC-file-ID to case mapping; sample ID deliberately blank;
- `clinical-cases.tsv`: one row per case with demographic fields;
- `clinical-diagnoses.tsv`: all diagnosis entries, uncollapsed;
- `clinical-followups.tsv`: all follow-up entries, uncollapsed;
- `qc-issues.tsv`, `qc.json`, `qc.md`: inspectable ambiguity and missingness report;
- `run-manifest.json`: immutable run-level lineage and output SHA-256 digests.

`study/processed.json` points to the latest successfully published processing run. Failed processing must not replace the previous completed pointer.

## Clinical safety boundary

The pipeline **does not** derive OS time or censoring status automatically. In GDC data these may depend on demographic, diagnosis, and follow-up records; M2 preserves those inputs for researcher review.

M2 never selects a representative file among multiple expression files mapped to one case. It reports `MULTIPLE_FILES_PER_CASE`. Other QC issues include missing vital status, missing death time, missing/multiple diagnoses, ambiguous file-to-case mapping, unmatched case IDs, and ambiguous CAPN1 annotation.

Additional descriptive warnings cover non-actionable vital status (for example `Not Reported`) and `Alive` cases with no usable diagnosis/follow-up censor time. These are **QC observations**, not automatic case exclusions. The output is marked `requires-researcher-review`, with `cohort_approved=false` and `survival_endpoint_defined=false`.

## Cache and reprocessing

```sh
node <skill-resource>/scripts/m2-prepare.mjs --workspace <workspace>
node <skill-resource>/scripts/m2-prepare.mjs --workspace <workspace> --rerun
```

Default behavior: if source digest, processing script digest, all output files and their SHA-256 digests match, return `cache-hit`. No fresh processing, no GDC fetch.

`--rerun` is reserved for an explicit user request to redo processing; it creates a new run from cached source data. It never means refetch GDC. A new GDC source becomes a different processing input and cannot use a stale matrix.

The manifest also records the Node version, platform, and CPU architecture used for processing.

Output files are first written to a private staging directory and published only after successful processing; the active pointer is atomically replaced afterward. Earlier completed directories remain intact.

## QC review gate

Before any formal survival or differential analysis, show the researcher the QC report, source snapshot, expression files and missingness/ambiguities. The next step requires decisions about sample eligibility, cohort selection and the analysis-specific endpoint. Do not infer these choices from the existence of an M2 output.

## Scientific formats

GDC STAR Counts includes both **raw unstranded counts** and **TPM**. M2 preserves them as separate matrices. Raw counts are suitable input candidates for count-based differential methods; TPM is a distinct normalized representation and must not be silently substituted for counts.

The current implementation requires consistent gene IDs and annotations across source files. It fails visibly on mismatches rather than silently taking intersections or realigning genes.

## Validation

Use Node's built-in test runner:

```sh
node --test .dsh/skills/capn1-aml-public-reconstruction/tests/m2-processing.test.mjs
```

The mocked-fixture tests cover file-indexed raw/TPM outputs, clinical and QC preservation, cache reuse, explicit reprocessing, source change invalidation, corrupted input, mismatched gene order, failed-rerun pointer preservation, post-processing raw source corruption, and missing censor follow-up / unknown vital status.

A complete **real GDC + DSH** smoke has not yet been established; M1/M2 public source compatibility must be verified in the target environment. M2 does not claim medical or statistical validation of the cohort.

## Deferred

A researcher-approved cohort, final survival endpoint, statistical models, and reproducible R/Bioconductor packages are outside M2.
