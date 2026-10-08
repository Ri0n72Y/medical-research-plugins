#!/usr/bin/env node
import { createHash, randomUUID } from 'node:crypto'
import { readFile, mkdir, rename, rm, stat, appendFile } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { join, relative, resolve, sep, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildExpressionMatrices } from './m2-expression.mjs'
import { buildClinicalTables } from './m2-clinical.mjs'
import { clinicalDigest } from './lib/gdc.mjs'

const implementation = 'capn1-m2-processing-v1'
const outputs = ['counts-unstranded.tsv','tpm-unstranded.tsv','gene-annotation.tsv','clinical-cases.tsv',
  'clinical-diagnoses.tsv','clinical-followups.tsv','expression-files.tsv','qc-issues.tsv','qc.json','qc.md']

function shaText(text) { return createHash('sha256').update(text).digest('hex') }
async function hashFile(path, algorithm = 'sha256') {
  const hash = createHash(algorithm)
  for await (const data of createReadStream(path)) hash.update(data)
  return hash.digest('hex')
}
function contained(workspace, relativePath) {
  if (typeof relativePath !== 'string' || !relativePath || relativePath.includes('\\')) throw Error('Invalid workspace path')
  const path = resolve(workspace, relativePath)
  if (path === resolve(workspace) || !path.startsWith(`${resolve(workspace)}${sep}`)) throw Error(`Workspace escape: ${relativePath}`)
  return path
}
async function loadJson(path) { return JSON.parse(await readFile(path, 'utf8')) }
async function scriptDigest() {
  const files = ['m2-prepare.mjs','m2-expression.mjs','m2-clinical.mjs','lib/gdc.mjs']
  const root = dirname(fileURLToPath(import.meta.url))
  const scripts = await Promise.all(files.map(async name => [name, await readFile(join(root, name), 'utf8')]))
  return shaText(JSON.stringify(scripts))
}
async function cacheValid(workspace, current, sourceDigest, scriptHash) {
  if (!current || current.status !== 'complete' || current.source_digest !== sourceDigest || current.script_digest !== scriptHash) return false
  for (const entry of current.outputs ?? []) {
    const file = contained(workspace, entry.path)
    try { if ((await stat(file)).size !== entry.bytes || await hashFile(file) !== entry.sha256) return false }
    catch { return false }
  }
  return current.outputs?.length >= outputs.length
}

export async function prepare(workspace, { rerun = false, onProgress = () => {} } = {}) {
  const source = await loadJson(join(workspace, 'study/source.json'))
  if (source.status !== 'complete' || !/^gdc-[0-9a-f]{12}$/.test(source.snapshot) || !source.digest || !source.manifest || !source.clinical) {
    throw Error('M2 requires a completed M1 GDC source')
  }
  const sourceManifest = await loadJson(contained(workspace, source.manifest))
  if (sourceManifest.status !== 'complete' || sourceManifest.digest !== source.digest) throw Error('Source manifest does not match active source')
  const clinicalPath = contained(workspace, source.clinical)
  const cases = await loadJson(clinicalPath)
  if (!cases?.data?.hits?.length || clinicalDigest(cases) !== source.clinical_digest) throw Error('Clinical source integrity check failed')
  const scriptHash = await scriptDigest()
  const activePath = join(workspace, 'study/processed.json')
  let previous
  try { previous = await loadJson(activePath) } catch (err) { if (err.code !== 'ENOENT') throw err }
  // A prior processed output is not a verified cache if its raw lineage has been damaged.
  // Verify GDC source bytes before returning a completed processing cache hit.
  for (const file of source.files ?? []) {
    if (!file.file_id || !file.md5sum || !file.path || !file.file_size) throw Error('Invalid GDC source file manifest')
    const path = contained(workspace, file.path)
    if ((await stat(path)).size !== file.file_size || await hashFile(path, 'md5') !== file.md5sum) throw Error(`GDC raw integrity check failed: ${file.file_id}`)
  }
  if (!source.files?.length) throw Error('No expression files in GDC source')
  if (!rerun && await cacheValid(workspace, previous, source.digest, scriptHash)) return { status: 'cache-hit', manifest: previous }
  const base = join(workspace, 'data/processed', source.snapshot)
  const id = `m2-${Date.now()}-${randomUUID().slice(0,8)}`
  const pending = join(base, `.pending-${id}`)
  const published = join(base, id)
  await mkdir(pending, { recursive: true })
  try {
    onProgress('expression')
    const expression = await buildExpressionMatrices(workspace, source.files, pending)
    onProgress('clinical')
    const clinical = await buildClinicalTables(cases, source.files, pending, { capn1Resolved: expression.capn1_resolved })
    const qc = { status: 'requires-researcher-review', source_snapshot: source.snapshot,
      total_expression_files: expression.files, genes: expression.genes, capn1_gene_ids: expression.capn1_gene_ids,
      clinical_cases: clinical.clinical_cases, diagnosis_rows: clinical.diagnoses, followup_rows: clinical.followups,
      issues: clinical.issues, no_samples_excluded: true, cohort_approved: false, survival_endpoint_defined: false,
      sample_selection_defined: false, selection_limit: 'M1 file manifest has case IDs, not specific biospecimen/sample IDs' }
    await appendFile(join(pending, 'qc.json'), `${JSON.stringify(qc, null, 2)}\n`, { flag: 'wx' })
    const lines = ['# CAPN1 / AML — M2 QC', '', `Source: ${source.snapshot}`, `Expression files: ${expression.files}`,
      `Gene IDs: ${expression.genes}`, `Clinical cases: ${clinical.clinical_cases}`, `QC issues: ${qc.issues.length}`,
      '', '**No files or cases were excluded.** Cohort and survival endpoint remain unapproved.',
      '', '## Issues', ...qc.issues.map(i => `- ${i.code} — ${i.subject}: ${i.detail}`), '']
    await appendFile(join(pending, 'qc.md'), lines.join('\n'), { flag: 'wx' })
    const artifactNames = expression.capn1_resolved ? [...outputs, 'capn1-expression.tsv'] : outputs
    const manifest = { schema: 1, status: 'complete', implementation,
      runtime: { node: process.version, platform: process.platform, arch: process.arch },
      id, source_snapshot: source.snapshot,
      source_digest: source.digest, script_digest: scriptHash, clinical_input_sha256: await hashFile(clinicalPath),
      created_at: new Date().toISOString(), qc_status: qc.status, cohort_approved: false,
      outputs: await Promise.all(artifactNames.map(async name => {
        const path = join(pending, name)
        return { path: relative(workspace, join(published, name)).replaceAll('\\','/'), bytes: (await stat(path)).size, sha256: await hashFile(path) }
      })) }
    await mkdir(base, { recursive: true })
    await appendFile(join(pending, 'run-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' })
    await rename(pending, published)
    // Publication happens only after every output has been written and verified.
    const tmp = `${activePath}.tmp-${randomUUID().slice(0,8)}`
    await appendFile(tmp, `${JSON.stringify(manifest,null,2)}\n`, { flag:'wx' })
    await rename(tmp, activePath)
    return { status: 'processed', manifest }
  } catch(error) {
    await rm(pending, { recursive: true, force: true })
    throw error
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const option = { rerun: args.includes('--rerun') }
  const position = args.indexOf('--workspace')
  if (position !== -1 && !args[position+1]) throw Error('Missing --workspace value')
  const workspace = position < 0 ? process.cwd() : resolve(args[position+1])
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--rerun') continue
    if (args[i] === '--workspace') { i += 1; continue }
    throw Error(`Unknown argument: ${args[i]}`)
  }
  prepare(workspace, option).then(result => console.log(JSON.stringify(result, null, 2))).catch(err => { console.error(err); process.exitCode = 1 })
}
