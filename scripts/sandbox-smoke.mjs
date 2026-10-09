import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  filesUrl, casesUrl, fetchJson, normalizeFiles, caseIds,
  clinicalDigest, sourceDigest, downloadExpressionFile, snapshotIsComplete,
} from '../.dsh/skills/capn1-aml-public-reconstruction/scripts/lib/gdc.mjs'
import { prepare } from '../.dsh/skills/capn1-aml-public-reconstruction/scripts/m2-prepare.mjs'

const workspace = join(process.cwd(), 'smoke-workspace')
const artifactDir = join(process.cwd(), 'smoke-artifacts')
const filesResponse = await fetchJson(filesUrl())
const files = normalizeFiles(filesResponse)
const casesResponse = await fetchJson(casesUrl())
const cases = caseIds(casesResponse)
console.log(JSON.stringify({ stage: 'metadata', publicStarFiles: files.length, clinicalCases: cases.length }))

// One real public STAR-Counts file. Never start the entire TCGA-LAML download in CI.
const first = files[0]
const clinicalHash = clinicalDigest(casesResponse)
const digest = sourceDigest([first], clinicalHash)
const snapshot = `gdc-${digest.slice(0, 12)}`
const rawRoot = join(workspace, 'data/raw/gdc', snapshot)
const manifestRoot = join(workspace, 'data/manifests/gdc', snapshot)
await mkdir(join(rawRoot, 'clinical'), { recursive: true })
await mkdir(join(rawRoot, 'expression'), { recursive: true })
await mkdir(manifestRoot, { recursive: true })
await mkdir(join(workspace, 'study'), { recursive: true })
await mkdir(artifactDir, { recursive: true })
const fetched = await downloadExpressionFile(first, join(rawRoot, 'expression'))
const relativePath = relative(workspace, fetched.path).replaceAll('\\', '/')
const source = {
  status: 'complete', schema: 1, project: 'TCGA-LAML',
  snapshot, digest, clinical_digest: clinicalHash,
  clinical: `data/raw/gdc/${snapshot}/clinical/cases.json`,
  manifest: `data/manifests/gdc/${snapshot}/source-manifest.json`,
  cases: cases.length, files: [{ ...first, path: relativePath }],
}
await writeFile(join(workspace, source.clinical), JSON.stringify(casesResponse))
await writeFile(join(workspace, source.manifest), JSON.stringify(source))
await writeFile(join(workspace, 'study/source.json'), JSON.stringify(source))
if (!await snapshotIsComplete(workspace, source)) throw Error('real downloaded source failed M1 checksum validation')
const processed = await prepare(workspace)
if (processed.status !== 'processed') throw Error('Expected fresh M2 processing')
const repeat = await prepare(workspace)
if (repeat.status !== 'cache-hit') throw Error('M2 cache failed to reuse completed output')
const qcPath = processed.manifest.outputs.find(item => item.path.endsWith('/qc.md'))?.path
const qcJson = processed.manifest.outputs.find(item => item.path.endsWith('/qc.json'))?.path
const capn1Path = processed.manifest.outputs.find(item => item.path.endsWith('/capn1-expression.tsv'))?.path
if (!qcPath || !qcJson) throw Error('Missing QC outputs')
await copyFile(join(workspace, qcPath), join(artifactDir, 'qc.md'))
await copyFile(join(workspace, qcJson), join(artifactDir, 'qc.json'))
if (capn1Path) await copyFile(join(workspace, capn1Path), join(artifactDir, 'capn1-expression.tsv'))
await writeFile(join(artifactDir, 'smoke-manifest.json'), JSON.stringify({
  mode: 'one-public-file-sample-only',
  note: 'Not a full TCGA-LAML study or approved research cohort',
  source: { project: 'TCGA-LAML', file_id: first.file_id, file_name: first.file_name, file_size: first.file_size, md5sum: first.md5sum, snapshot },
  expression_files_available: files.length, cases_available: cases.length,
  verified_raw_md5: true,
  m2_run: processed.manifest.id, m2_cache_hit_after_second_run: repeat.status === 'cache-hit',
  output_filenames: processed.manifest.outputs.map(x => x.path.split('/').at(-1)),
}, null, 2))
console.log(JSON.stringify({
  stage: 'complete', sampleFile: first.file_id, sourceBytes: first.file_size,
  qcPath, m2Outputs: processed.manifest.outputs.length, repeatedM2: repeat.status,
}))
