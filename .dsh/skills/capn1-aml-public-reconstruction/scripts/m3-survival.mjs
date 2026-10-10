#!/usr/bin/env node
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile, writeFile, mkdir, rename, rm, stat } from 'node:fs/promises'
import { join, dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseTsv, asTsv, compileCohort, loadCohortInputs } from './m3-cohort.mjs'

const exec = promisify(execFile)
const implementation = 'capn1-m3-survival-demo-v1'
const names = ['cohort.tsv','exclusions.tsv','cohort-summary.json','statistics.tsv',
  'km-steps.tsv','runtime.tsv','kaplan-meier.svg','report.md']
const scriptDir = dirname(fileURLToPath(import.meta.url))
const hashText = s => createHash('sha256').update(s).digest('hex')
async function sha(path) {
  const hash = createHash('sha256')
  for await (const bytes of createReadStream(path)) hash.update(bytes)
  return hash.digest('hex')
}
function pathIn(workspace, path) {
  if (!path || typeof path !== 'string' || path.includes('\\')) throw Error('Invalid M2 artifact path')
  const full = resolve(workspace, path)
  if (!full.startsWith(resolve(workspace) + sep)) throw Error('M2 artifact outside workspace')
  return full
}
async function json(path) { return JSON.parse(await readFile(path, 'utf8')) }
async function scriptDigest() {
  const parts = await Promise.all(['m3-cohort.mjs','m3-survival.mjs','m3-survival.R']
    .map(async name => [name, await readFile(join(scriptDir, name), 'utf8')]))
  return hashText(JSON.stringify(parts))
}
async function verifyM2(workspace, processed) {
  if (processed.status !== 'complete' || !processed.id || !processed.source_digest) {
    throw Error('M3 requires completed M2 processed.json')
  }
  const source = await json(join(workspace, 'study/source.json'))
  if (source.status !== 'complete' || source.digest !== processed.source_digest) {
    throw Error('M3 M2/source lineage mismatch; run data:prepare')
  }
  const artifacts = new Map()
  for (const entry of processed.outputs ?? []) {
    const path = pathIn(workspace, entry.path)
    if ((await stat(path)).size !== entry.bytes || await sha(path) !== entry.sha256) {
      throw Error('M2 artifact checksum mismatch: ' + entry.path)
    }
    artifacts.set(entry.path.split('/').at(-1), path)
  }
  for (const name of ['capn1-expression.tsv','expression-files.tsv','clinical-cases.tsv',
    'clinical-diagnoses.tsv','clinical-followups.tsv']) {
    if (!artifacts.has(name)) throw Error('Missing required M2 output: ' + name)
  }
  return dirname(artifacts.get('capn1-expression.tsv'))
}
async function validCache(workspace, current, fingerprint, scriptHash) {
  if (!current || current.status !== 'complete' || current.fingerprint !== fingerprint ||
    current.script_digest !== scriptHash || current.outputs?.length !== names.length) return false
  for (const entry of current.outputs) {
    try {
      const path = pathIn(workspace, entry.path)
      if ((await stat(path)).size !== entry.bytes || await sha(path) !== entry.sha256) return false
    } catch { return false }
  }
  return true
}
const fmt = value => Number(value).toPrecision(4)
function report(cohort, stats, runtime, processed) {
  const s = cohort.summary
  const lines = [
    '# CAPN1 / AML — M3 expression and survival demonstration', '',
    'This is a public workflow demonstration, not a validation of the original paper.',
    '',
    '## Source and cohort',
    '- M2 processed run: ' + processed.id,
    '- Unique expression–clinical pairs: ' + s.paired_cases,
    '- High / low CAPN1: ' + s.high + ' / ' + s.low,
    '- Observed deaths: ' + s.events,
    '- Expression files excluded: ' + s.excluded_expression_files,
    '- Median CAPN1 TPM: ' + s.capn1_cutoff_tpm,
    '',
    '## Survival results',
    '- Kaplan–Meier and log-rank p: ' + fmt(stats.logrank_p),
    '- Unadjusted Cox HR (high vs low): ' + fmt(stats.hazard_ratio_high_vs_low),
    '- 95% CI: ' + fmt(stats.hazard_ratio_ci_lower) + '–' + fmt(stats.hazard_ratio_ci_upper),
    '- Cox Wald p: ' + fmt(stats.cox_wald_p),
    '',
    '## Declared methods and limits',
    '- High: TPM strictly above the median of eligible paired cases; ties are low.',
    '- Alive: censor at the maximum recorded diagnosis/follow-up time; dead: days_to_death.',
    '- One expression file per case only; ambiguous file mappings and missing OS are excluded.',
    '- Biospecimen identity/type is not established by the available M2 file-case manifest.',
    '- Cox model is unadjusted; no clinical covariates are silently selected.',
    '- R ' + runtime.r_version + ', survival ' + runtime.survival_package_version + ' (Efron ties).',
    '- The default choices are documented public substitutes; numeric agreement with the paper is not required.',
    '- Association is not causation; medical significance and experimental validation require researchers.',
    '',
    'See cohort.tsv, exclusions.tsv, statistics.tsv, km-steps.tsv, and kaplan-meier.svg.',
    ''
  ]
  return lines.join('\n')
}
export async function analyze(workspace, { rerun = false } = {}) {
  const processed = await json(join(workspace, 'study/processed.json'))
  const m2Dir = await verifyM2(workspace, processed)
  const scriptHash = await scriptDigest()
  const fingerprint = hashText(JSON.stringify({ implementation, processed_id: processed.id,
    source: processed.source_digest, m2_outputs: processed.outputs.map(x => [x.path, x.sha256]),
    script: scriptHash, grouping: 'median-tpm', os: 'gdc-greatest-followup' }))
  const pointer = join(workspace, 'study/survival.json')
  let previous
  try { previous = await json(pointer) }
  catch (error) { if (error.code !== 'ENOENT') throw error }
  if (!rerun && await validCache(workspace, previous, fingerprint, scriptHash)) {
    return { status: 'cache-hit', manifest: previous }
  }
  const base = join(workspace, 'runs/m3-survival')
  const id = 'm3-' + Date.now() + '-' + randomUUID().slice(0, 8)
  const pending = join(base, '.pending-' + id)
  const published = join(base, id)
  await mkdir(pending, { recursive: true })
  try {
    const cohort = compileCohort(await loadCohortInputs(m2Dir))
    await writeFile(join(pending, 'cohort.tsv'), asTsv(
      ['case_id','file_id','capn1_tpm','capn1_log2_tpm','group','os_days','event'], cohort.cohort))
    await writeFile(join(pending, 'exclusions.tsv'), asTsv(
      ['file_id','case_id','reason'], cohort.exclusions))
    await writeFile(join(pending, 'cohort-summary.json'), JSON.stringify(cohort.summary, null, 2) + '\n')
    await exec(process.env.RSCRIPT_BINARY || 'Rscript',
      ['--vanilla', join(scriptDir, 'm3-survival.R'), join(pending, 'cohort.tsv'), pending],
      { maxBuffer: 1024 * 1024 })
    const stats = Object.fromEntries(parseTsv(await readFile(join(pending, 'statistics.tsv'), 'utf8'),
      ['metric','value']).map(row => [row.metric, Number(row.value)]))
    const runtime = Object.fromEntries(parseTsv(await readFile(join(pending, 'runtime.tsv'), 'utf8'),
      ['name','value']).map(row => [row.name, row.value]))
    await writeFile(join(pending, 'report.md'), report(cohort, stats, runtime, processed))
    const outputs = await Promise.all(names.map(async name => {
      const path = join(pending, name)
      return { path: relative(workspace, join(published, name)).replaceAll('\\','/'),
        bytes: (await stat(path)).size, sha256: await sha(path) }
    }))
    const manifest = { schema: 1, status: 'complete', implementation, id,
      created_at: new Date().toISOString(), m2_id: processed.id, source_digest: processed.source_digest,
      script_digest: scriptHash, fingerprint, cohort: cohort.summary,
      runtime, methods: { grouping: 'median-tpm', os: 'gdc-greatest-followup',
        sample: 'unique-file-case', cox: 'unadjusted-high-vs-low' }, outputs }
    await writeFile(join(pending, 'run-manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
    await rename(pending, published)
    const temp = pointer + '.tmp-' + randomUUID().slice(0, 8)
    await writeFile(temp, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' })
    await rename(temp, pointer)
    return { status: 'analyzed', manifest }
  } catch (error) {
    await rm(pending, { recursive: true, force: true })
    throw error
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const index = args.indexOf('--workspace')
  if (index >= 0 && !args[index + 1]) throw Error('Missing --workspace path')
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--rerun') continue
    if (args[i] === '--workspace') { i++; continue }
    throw Error('Unknown argument: ' + args[i])
  }
  const workspace = index >= 0 ? resolve(args[index + 1]) : process.cwd()
  analyze(workspace, { rerun: args.includes('--rerun') })
    .then(value => console.log(JSON.stringify(value, null, 2)))
    .catch(error => { console.error(error.message); process.exitCode = 1 })
}
