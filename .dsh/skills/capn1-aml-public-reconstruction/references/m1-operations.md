# M1 operations — workspace initialization and GDC source cache

Read this file before executing M1.

## Resources

Use the exact resolved resource paths supplied by the DSH skill loader:

- `scripts/init-workspace.mjs`;
- `scripts/gdc-source.mjs`.

Do not assume that a packaged skill lives under the repository's `.dsh/skills` path.

The current scripts require Node 18+ with built-in `fetch`.

If the active DSH carrier cannot execute the bundled Node resource, stop and report the compatibility gap. Do not install an unrelated runtime or create a new project Cordis service during the study.

## Initialize

First inspect whether `study/reconstruction.yaml` exists.

If absent, execute the init resource against the active workspace.

Conceptually:

```text
node <resolved init-workspace.mjs> --workspace <current workspace>
```

It must not overwrite existing study files.

Initialization is not permission to download data. Continue to source acquisition only when needed for the user's request.

## Inspect source state

Inspect both:

- `study/source.json` — the last completed active source;
- `study/source-pending.json` — an incomplete acquisition, when one exists.

A completed active source is reusable only when its manifest matches, clinical content digest matches, and **every expression file MD5** matches GDC metadata. Revalidation reads cached files but makes no network request.

For ordinary explain/show/continue-analysis requests, prefer the completed active source and disclose local cache use.

A pending source does not invalidate or replace a completed active source. The normal source command prefers the verified active cache; with both present, use `--resume` only after an explicit request to finish the pending acquisition.

If the user's intent is to continue an interrupted acquisition, resume the pending source.

## Fresh acquisition

When no compatible completed source exists and no resumable pending source exists, run the source resource without `--refresh`.

Conceptually:

```text
node <resolved gdc-source.mjs> --workspace <current workspace>
```

The GDC result pages must be complete (`data.pagination.total` equals returned hits); an incomplete page fails visibly instead of producing a partial cohort.

The script:

1. queries public TCGA-LAML STAR - Counts file metadata;
2. queries public TCGA-LAML case/clinical metadata;
3. computes a source fingerprint;
4. creates a content-addressed source snapshot;
5. saves the exact queries and GDC responses;
6. writes `study/source-pending.json` before expression transfer;
7. streams expression files into the snapshot;
8. validates each new/repair download against GDC byte size and MD5;
9. marks the snapshot complete only after all files validate;
10. atomically publishes it as `study/source.json`;
11. removes `study/source-pending.json`;
12. updates `study/status.md`.

For a long acquisition, use DSH's existing background-job support when available.

## Interrupted acquisition

If `study/source-pending.json` is partial and the user wants to continue acquisition, use `--resume` when an active complete source also exists. Without an active complete source the normal command resumes automatically.

It resumes from the saved manifest.

Already valid local expression files are reused.

It must not re-query GDC merely to resume a transfer.

If a previous completed `study/source.json` also exists, it remains the usable active source until the pending snapshot fully completes.

## Explicit refresh

Only add `--refresh` when the user explicitly requests:

- refetch;
- latest/current public data;
- download again;
- start over from public source.

Do not add `--refresh` because a new DSH session started.

A refresh re-queries GDC.

If the source fingerprint is unchanged and the active local snapshot is complete:

- record a refresh-check artifact;
- return `refresh-unchanged`;
- do not redownload expression files.

If the fingerprint changed:

- write the new acquisition to `study/source-pending.json`;
- keep the previous completed `study/source.json` active during transfer;
- publish the new source only after every file validates;
- if refresh fails, preserve the previous completed active source.

Do not delete old snapshot directories.

## Status values

### `cache-hit`

Local completed source reused. No GDC request occurred.

Tell the user explicitly.

### `downloaded`

A new/needed source snapshot completed and became active.

Report the snapshot id, file count, and whether files were downloaded/reused.

### `resumed-complete`

A pending source snapshot was resumed from its saved manifest, completed, and became active.

### `refresh-unchanged`

GDC was queried because the user requested refresh, but the public source fingerprint did not change. No redundant expression download occurred.

## Source truth

`study/source.json` is the machine-readable active **completed** source.

`study/source-pending.json` is transient durable state for an unfinished acquisition.

`study/status.md` is only the human-readable summary.

The snapshot manifest and raw cached data remain the durable provenance for later processing.

M1 does not create an analysis-ready matrix. That begins in Stage 3.
