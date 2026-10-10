#!/usr/bin/env node
// M3: build a reviewable patient-level candidate cohort. No implicit approval.
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const validDay = value => {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : null
}
const clean = value => String(value ?? '').replace(/[\t\r\n]/g, ' ')
const encode = (columns, rows) => [columns.join('\t'),
  ...rows.map(row => columns.map(key => clean(row[key])).join('\t'))].join('\n') + '\n'
const sha256 = text => createHash('sha256').update(text).digest('hex')

function endpoint(caseData) {
  const d = caseData.demographic ?? {}
  const vital = String(d.vital_status ?? '').toLowerCase()
  if (vital !== 'alive' && vital !== 'dead') return { reason: 'UNRESOLVED_VITAL_STATUS' }
  const diagnoses = caseData.diagnoses ?? []
  const followups = caseData.follow_ups ?? []
  if (vital === 'dead') {
    const death = validDay(d.days_to_death)
    // A missing death date must not be replaced by a follow-up duration.
    return death == null ? { reason: 'NO_DEATH_TIME' } : { event: 1, os_days: death, source: 'demographic.days_to_death' }
  }
  const times = [
    ...diagnoses.map(x => validDay(x.days_to_last_follow_up)),
    ...followups.map(x => validDay(x.days_to_follow_up)),
  ].filter(x => x != null)
  if (!times.length) return { reason: 'NO_CENSOR_TIME' }
  return { event: 0, os_days: Math.max(...times), source: 'latest_valid_diagnosis_or_followup',
    spread_days: Math.max(...times) - Math.min(...times), time_candidates: times.length }
}

function tsvTable(text) {
  const lines = text.trimEnd().split(/\r?\n/), columns = lines.shift().split('\t')
  const seen = new Set()
  for (const col of columns) {
    if (!col || seen.has(col)) throw Error('Duplicate/empty column in M2 CAPN1 table')
    seen.add(col)
  }
  return lines.map(line => Object.fromEntries(line.split('\t').map((value, i) => [columns[i], value])))
}
async function loadJson(path) { return JSON.parse(await readFile(path, 'utf8')) }
function fromOutputs(manifest, suffix) {
  const output = manifest.outputs?.find(item => item.path.endsWith('/' + suffix))
  if (!output) throw Error(`Missing M2 output: ${suffix}`)
  return output.path
}
export function constructCohort(source, processed, cases, expression) {
  if (source.status !== 'complete' || processed.status !== 'complete' ||
      source.digest !== processed.source_digest) throw Error('M1/M2 source mismatch')
  const clinical = new Map()
  for (const c of cases.data?.hits ?? []) {
    if (!c.case_id || clinical.has(c.case_id)) throw Error('Duplicate/invalid clinical case')
    clinical.set(c.case_id, c)
  }
  const byCase = new Map()
  for (const f of source.files ?? []) {
    const ids = [...new Set((f.cases ?? []).map(c => c.case_id))]
    for (const id of ids) byCase.set(id, [...(byCase.get(id) ?? []), f.file_id])
  }
  const geneByFile = new Map()
  for (const row of expression) {
    if (!row.file_id || geneByFile.has(row.file_id)) throw Error('Duplicate/missing file in CAPN1 expression')
    if (!Number.isFinite(Number(row.tpm_unstranded)) || Number(row.tpm_unstranded) < 0) throw Error('Invalid CAPN1 TPM')
    geneByFile.set(row.file_id, row)
  }
  const audit = [], eligible = []
  for (const [caseId, c] of clinical) {
    const ids = [...new Set(byCase.get(caseId) ?? [])]
    const os = endpoint(c), reasons = []
    if (ids.length !== 1) reasons.push(ids.length ? 'MULTIPLE_EXPRESSION_FILES' : 'NO_EXPRESSION_FILE')
    if (os.reason) reasons.push(os.reason)
    if (ids.length === 1 && !geneByFile.has(ids[0])) reasons.push('NO_CAPN1_EXPRESSION')
    const row = { case_id: caseId, file_id: ids.length === 1 ? ids[0] : '',
      number_expression_files: ids.length, vital_status: c.demographic?.vital_status,
      event: os.event, os_days: os.os_days, endpoint_source: os.source,
      followup_candidates: os.time_candidates, followup_spread_days: os.spread_days,
      tpm: ids.length === 1 ? geneByFile.get(ids[0])?.tpm_unstranded : '',
      exclusion_reasons: reasons.join(';') }
    audit.push(row)
    if (!reasons.length) eligible.push(row)
  }
  return { audit, eligible, clinicalCases: clinical.size, files: source.files.length }
}

export async function buildCohort(workspace) {
  const study = join(workspace, 'study')
  const source = await loadJson(join(study, 'source.json'))
  const processed = await loadJson(join(study, 'processed.json'))
  const cases = await loadJson(resolve(workspace, source.clinical))
  const path = resolve(workspace, fromOutputs(processed, 'capn1-expression.tsv'))
  const content = await readFile(path, 'utf8')
  const { audit, eligible, clinicalCases, files } = constructCohort(source, processed, cases, tsvTable(content))
  if (eligible.length < 3) throw Error('Too few eligible patient records for exploratory analysis')
  const id = `m3-${Date.now()}-${randomUUID().slice(0, 8)}`
  const base = join(workspace, 'exploration', 'capn1-os')
  const pending = join(base, `.${id}.pending`), complete = join(base, id)
  await mkdir(pending, { recursive: true })
  const auditKeys = ['case_id','file_id','number_expression_files','vital_status',
    'event','os_days','endpoint_source','followup_candidates','followup_spread_days','tpm','exclusion_reasons']
  const candidateKeys = ['case_id','file_id','event','os_days','tpm']
  const summary = { id, status: 'exploratory-not-canonical', study: 'TCGA-LAML',
    publication: '10.1080/02648725.2023.2204688',
    cutoff: 'median-TPM-is-an-explicit-reconstruction-not-verified-paper-parameter',
    endpoint: 'dead=demographic.days_to_death; alive=max(diagnosis/followup day); unresolvable cases omitted',
    multiplicity: 'only cases with exactly one GDC file; no inferred specimen selection',
    cases: clinicalCases, expressionFiles: files, candidates: eligible.length,
    excluded: audit.length - eligible.length, rawSource: source.snapshot,
    sourceDigest: source.digest, processedRun: processed.id,
    inputSha256: sha256(content), original_methods_verified: false,
    notes: ['No researcher-approved cohort', 'No original paper methods/full text verified',
      'No covariate adjustment or biological inference'] }
  await writeFile(join(pending, 'cohort-audit.tsv'), encode(auditKeys, audit))
  await writeFile(join(pending, 'candidate-cohort.tsv'), encode(candidateKeys, eligible))
  await writeFile(join(pending, 'manifest.json'), JSON.stringify(summary, null, 2) + '\n')
  await rename(pending, complete)
  return { directory: complete, ...summary }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), i = args.indexOf('--workspace')
  if (i < 0 || !args[i + 1] || args.length !== 2) throw Error('Usage: node m3-cohort.mjs --workspace <path>')
  buildCohort(resolve(args[i + 1])).then(result => console.log(JSON.stringify(result)))
    .catch(error => { console.error(error); process.exitCode = 1 })
}
