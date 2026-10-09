# Public GDC smoke evidence — 2026-10-09

This directory holds **small, public, reproducibility-oriented artifacts**, not a full TCGA-LAML study cohort.

## What was verified

- [Online sandbox run 37895926420](https://github.com/Ri0n72Y/medical-research-plugins/actions/runs/37895926420): Node 24.21.0, pnpm 11.7.0, DSH CLI 0.2.0-rc.2, **24/24 tests passed**.
- GDC metadata returned **151** open TCGA-LAML STAR Counts expression files and **200** public case records.
- One actual GDC STAR Counts file (4,235,226 bytes) was downloaded, MD5 checked, parsed into M2 counts/TPM and CAPN1 values.
- The same M2 processing step run a second time returned **cache-hit**, without reprocessing.
- The sample yielded **60,660 genes** and 14 clinical-QC warnings across the public case metadata.
- An earlier online run [37895560277](https://github.com/Ri0n72Y/medical-research-plugins/actions/runs/37895560277) also downloaded all 151 files (~640 MB) and completed M2. That run unexpectedly triggered data preparation through pnpm's `prepare` lifecycle. [PR #5](https://github.com/Ri0n72Y/medical-research-plugins/pull/5) fixed it by renaming the explicit command to `pnpm run data:prepare`; the post-fix run confirms no automatic download during `pnpm test`.

The compact source verification and QC artifacts were retained in [the online workflow artifact](https://github.com/Ri0n72Y/medical-research-plugins/actions/runs/37895926420/artifacts/11599469772) (14-day retention). A durable subset is checked in here.

## Important limits

The committed CAPN1 value belongs to **one source file**, not 151 patients or an approved cohort. Clinical-QC warnings reflect the public case metadata returned with that source, not a validated OS definition.

Do not interpret this as publication reproduction or a prognostic finding. The full expression files are *not* committed to Git: ~640 MB of redundant public STAR files would bloat repository history, and each can be retrieved from GDC by UUID. The workspace remains the intended cache for full runs.

To reproduce a complete source/processed workspace yourself:

```sh
pnpm run data:prepare
```

The explicit command records the exact GDC metadata, MD5-verified raw files, processed outputs and local manifests; subsequent invocations use local cache.
