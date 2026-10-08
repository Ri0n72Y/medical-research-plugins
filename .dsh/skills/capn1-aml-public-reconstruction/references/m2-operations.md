# M2 operations — data preparation and QC

Read this after M1 source acquisition has completed.

## Tool

Use the bundled `scripts/m2-prepare.mjs` with the **active DSH workspace path**. Resolve the script via the skill resource directory, not a hard-coded repository path.

```sh
node <resolved m2-prepare.mjs> --workspace <active workspace>
```

Do not call the GDC API for M2. Do not add `--rerun` unless the researcher explicitly asks to redo processing.

## First inspect

1. Check `study/source.json` is `complete`.
2. Check `study/processed.json` for an existing compatible processed output.
3. If the processed cache is compatible, tell the user it is a **local cached processing result** and reuse it.
4. Otherwise execute the script; the script itself validates source and output digests before publishing results.

## Output contract

The script returns `processed` or `cache-hit` and an active processed manifest. Inspect the referenced output paths, especially `qc.md`, `qc.json`, `expression-files.tsv`, and `clinical-cases.tsv`.

Use the GDC **file ID** as the expression column identity. M1 currently does not identify a unique patient specimen. Do not guess a sample ID from a filename.

Do not conflate `counts-unstranded.tsv` and `tpm-unstranded.tsv`.

## Human gate

After processing, explain that all source files/cases are retained and the QC report **does not approve a cohort**.

Show the user:

- source snapshot and number of cases / expression files;
- multiple expression files per case and unresolved file-to-sample identity;
- missing or ambiguous clinical records;
- whether exactly one CAPN1 gene symbol was found;
- what researcher decisions must be made before survival/DEG analysis.

Do not select a biological representative, derive a final OS endpoint, or silently exclude records.

## Explicit reprocessing

Only `--rerun` when requested. A rerun creates a new immutable processing directory and updates `study/processed.json` only after full success. Earlier completed runs remain.

Reprocessing is different from `--refresh` in M1. A changed M1 source digest automatically requires new processing.

## Failure

On invalid raw counts/TPM, source MD5 mismatch, conflicting gene order, corrupted clinical metadata, or a write failure, stop and report the exact issue. Do not describe partial output as complete. The prior processed pointer must survive a failed attempt.
