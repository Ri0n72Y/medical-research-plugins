# M1 — Workspace Initialization + GDC Source Cache

Status: implemented on `feat/m1-source-cache`.

M1 establishes the first executable research-workspace loop without introducing a new Cordis service or a scientific runtime.

## Goal

Given a DSH workspace and the CAPN1 skill:

1. initialize the study workspace without overwriting existing study state;
2. acquire the current public TCGA-LAML source from NCI GDC;
3. persist source queries, metadata, clinical JSON, and STAR - Counts files in the workspace;
4. validate downloaded expression files against the GDC size and MD5 metadata;
5. activate the completed source snapshot through `study/source.json`;
6. on a later invocation, reuse the compatible local source without a network request;
7. only re-query GDC when the user explicitly requests refresh;
8. resume an interrupted source download from the saved partial manifest.

M1 stops before expression-matrix construction, cohort transformation, or statistical analysis.

## Why this is a script, not a Cordis service

DSH already owns:

- workspace filesystem access;
- shell execution and jobs;
- sandbox / approval;
- skill resources;
- session trajectory.

The missing operation is a bounded domain task: query GDC, stream public files to the current workspace, validate them, and write a source manifest.

That is implemented as a thin deterministic Node script bundled with the skill.

If later DSH carrier testing shows that executing the bundled script is not portable enough, that evidence may justify a small Cordis tool. M1 does not assume that gap in advance.

## Skill resources

- `scripts/init-workspace.mjs`
- `scripts/gdc-source.mjs`
- `scripts/lib/io.mjs`
- `scripts/lib/gdc.mjs`
- `tests/m1-source-cache.test.mjs`

## Workspace initialization

`init-workspace.mjs` creates only missing directories and copies only missing initial study files.

It never overwrites:

- `study/reconstruction.yaml`;
- `study/decisions.yaml`;
- `study/brief.md`;
- `study/status.md`.

This makes repeated initialization idempotent with respect to existing researcher state.

## Public GDC source

The M1 expression query is intentionally narrow:

- project: `TCGA-LAML`;
- data category: `Transcriptome Profiling`;
- data type: `Gene Expression Quantification`;
- workflow: `STAR - Counts`;
- access: `open`.

Clinical source metadata is queried from the GDC Cases endpoint for TCGA-LAML with demographic, diagnosis, treatment, and follow-up expansion.

The exact URLs used for a snapshot are written into the workspace.

## Source fingerprint

A source fingerprint covers:

- the normalized expression-file manifest, including GDC file IDs, names, sizes, MD5 values, workflow and case mapping;
- a digest of the returned public clinical-case content.

The snapshot identity is:

`gdc-<first 12 characters of source SHA-256>`

A clinical-data change therefore produces a new source snapshot even if the expression file list is unchanged.

## Workspace layout after acquisition

```text
study/
  source.json                    # last completed active source
  source-pending.json            # unfinished acquisition, only when present
  status.md                     # human-readable current source status

data/
  manifests/
    gdc/
      <snapshot>/
        queries.json
        files-response.json
        source-manifest.json
      refresh-checks/
        <timestamp>.json

  raw/
    gdc/
      <snapshot>/
        clinical/
          cases.json
        expression/
          <GDC STAR - Counts files...>
```

Paths stored inside manifests are workspace-relative and normalized to forward slashes so the state is portable across Windows and Unix-style hosts.

## Cache behavior

### Normal invocation

If `study/source.json` says the source is complete and its manifest, clinical content digest and all expression file GDC MD5 checks pass:

- return `cache-hit`;
- make zero GDC requests;
- reuse the local snapshot;
- update the human-readable status to say that local cache was used.

The first download or repair validates the GDC MD5 checksum before publishing a file into the snapshot.

### Partial invocation

Before expression transfer starts, the candidate source is written to `study/source-pending.json` as `partial`.

If a transfer is interrupted:

- already valid files remain in the candidate snapshot;
- the next acquisition continuation reads the saved pending manifest; if a valid active source already exists, `--resume` explicitly selects pending instead of normal cache reuse;
- it resumes missing/invalid files;
- it does not re-query GDC merely to resume the transfer;
- an older completed `study/source.json`, when present, remains the active usable source.

The download layout is UUID-keyed (`expression/<file_id>/<original_filename>`) so identical original filenames cannot collide. GDC response pagination is checked for completeness before creating a snapshot.

Only a fully validated candidate is published to `study/source.json`; successful publication removes `study/source-pending.json`.

### Explicit refresh

`--refresh` always re-queries the GDC file and case endpoints.

If the resulting fingerprint is unchanged and the active snapshot remains locally complete:

- return `refresh-unchanged`;
- record a refresh-check artifact;
- do not re-download expression files.

If the fingerprint changed, M1 creates/finishes the new snapshot under pending state and only then updates `study/source.json`.

If the changed refresh fails, the previous completed active source is preserved. The unfinished candidate remains resumable in `study/source-pending.json`.

Historical snapshot directories are not deleted.

## CLI shape

The skill should resolve the bundled resource path rather than assume the repository-relative path after packaging.

Conceptually:

```sh
node <skill-resource>/scripts/init-workspace.mjs --workspace <workspace>
node <skill-resource>/scripts/gdc-source.mjs --workspace <workspace>
node <skill-resource>/scripts/gdc-source.mjs --workspace <workspace> --refresh
```

Source acquisition can be long-running. In DSH, prefer the existing background-job surface when available rather than adding a project-owned job system.

## Output status vocabulary

`gdc-source.mjs` returns one of:

- `cache-hit`;
- `downloaded`;
- `resumed-complete`;
- `refresh-unchanged`.

During acquisition it emits progress records on stderr so a DSH background job can expose manifest and download progress.

## Tests

The M1 tests use mocked GDC responses and Node's built-in test runner.

They cover:

- the intended GDC query scope;
- source fingerprint sensitivity to clinical content;
- non-destructive workspace initialization;
- first download followed by a network-free cache hit;
- explicit refresh without redundant re-download when the source is unchanged;
- interrupted acquisition followed by local-manifest resume;
- failed changed-source refresh preserving the previous completed active source;
- same-filename / different-file-ID downloads;
- same-byte-length corruption rejection;
- incomplete GDC metadata page rejection;
- valid active source winning over pending unless `--resume` is explicit.

Local validation command:

```sh
node --test .dsh/skills/capn1-aml-public-reconstruction/tests/m1-source-cache.test.mjs
```

## Current validation boundary

Unit/integration behavior is validated with mocked GDC transport.

A live GDC smoke is intentionally separate because it depends on external network availability and can transfer a non-trivial amount of public data. The first real DSH acceptance should verify the current GDC API response shape and end-to-end transfer in the target environment.

## Deferred to M2

M1 deliberately does not:

- merge per-sample STAR - Counts files into an analysis matrix;
- normalize expression values;
- derive the clinical analysis table;
- define cohort exclusions;
- run CAPN1 expression statistics;
- run survival analysis;
- install R or Bioconductor.

Those belong to the processing / QC and scientific-runtime layers that follow.
