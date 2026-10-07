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

Read `study/source.json` when present.

A source is reusable only when its state is complete and its referenced manifest, clinical cache, and expression files are locally present.

If it is reusable:

- tell the user that the local cached GDC source is being used;
- do not query GDC;
- continue from local data.

## Fresh acquisition

When no compatible source exists, run the source resource without `--refresh`.

Conceptually:

```text
node <resolved gdc-source.mjs> --workspace <current workspace>
```

The script:

1. queries public TCGA-LAML STAR - Counts file metadata;
2. queries public TCGA-LAML case/clinical metadata;
3. computes a source fingerprint;
4. creates a content-addressed source snapshot;
5. saves the exact queries and GDC responses;
6. writes `study/source.json` as partial;
7. streams expression files into the snapshot;
8. validates each new/repair download against GDC byte size and MD5;
9. marks the source complete only after all files validate;
10. updates `study/status.md`.

For a long acquisition, use DSH's existing background-job support when available.

## Interrupted acquisition

If `study/source.json` is `partial`, run the normal source command again without `--refresh`.

It resumes from the saved manifest.

Already valid local expression files are reused.

It must not re-query GDC merely to resume a transfer.

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

If the fingerprint changed, finish a new snapshot before updating the active source pointer.

Do not delete old snapshot directories.

## Status values

### `cache-hit`

Local source reused. No GDC request occurred.

Tell the user explicitly.

### `downloaded`

A new/needed source snapshot completed.

Report the snapshot id, file count, and whether files were downloaded/reused.

### `resumed-complete`

A partial source snapshot was resumed from its saved manifest and completed.

### `refresh-unchanged`

GDC was queried because the user requested refresh, but the public source fingerprint did not change. No redundant expression download occurred.

## Source truth

`study/source.json` is the machine-readable active source state.

`study/status.md` is only the human-readable summary.

The snapshot manifest and raw cached data remain the durable provenance for later processing.

M1 does not create an analysis-ready matrix. That begins in Stage 3.
