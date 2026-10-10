import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { analyze } from '../scripts/m3-survival.mjs'
import { compileCohort, asTsv } from '../scripts/m3-cohort.mjs'

const cases = Array.from({ length: 6 }, (_, i) => ({
  case_id: 'case-' + (i + 1), vital_status: [0,2,3,5].includes(i) ? 'Dead' : 'Alive',
  days_to_death: ({0:15,2:110,3:25,5:75})[i] ?? '',
}))
const files = cases.map((c, i) => ({
  file_id: 'file-' + i, case_ids: c.case_id, case_count: '1',
}))
const expression = files.map((f, i) => ({
  file_id: f.file_id, case_ids: f.case_ids, tpm_unstranded: String(i + 1),
}))
const diagnoses = cases.map(c => ({ case_id: c.case_id, days_to_last_follow_up: '20' }))
const followups = [
  { case_id: 'case-2', days_to_follow_up: '80' },
  { case_id: 'case-5', days_to_follow_up: '100' },
]
const inputs = { expression, files, cases, diagnoses, followups }

test('M3 pairs by case, uses median TPM, and uses greatest follow-up for living patients', () => {
  const { cohort, summary } = compileCohort(inputs)
  assert.equal(summary.paired_cases, 6)
  assert.equal(summary.capn1_cutoff_tpm, 3.5)
  assert.equal(summary.high, 3)
  assert.equal(summary.low, 3)
  assert.equal(summary.events, 4)
  assert.equal(cohort.find(r => r.case_id === 'case-5').os_days, 100)
  assert.equal(cohort.find(r => r.case_id === 'case-2').event, 0)
})

test('M3 excludes repeated file-case mappings and missing death times, with reasons', () => {
  const extra = { file_id: 'extra', case_ids: 'case-1', case_count: '1' }
  const modified = { ...inputs,
    files: [...files, extra],
    expression: [...expression, { file_id: 'extra', case_ids: 'case-1', tpm_unstranded: '2.5' }],
    cases: cases.map(c => c.case_id === 'case-4' ? { ...c, days_to_death: '' } : c),
  }
  const result = compileCohort(modified)
  assert.equal(result.summary.paired_cases, 4)
  assert.equal(result.summary.exclusion_reasons.MULTIPLE_FILES_PER_CASE, 2)
  assert.equal(result.summary.exclusion_reasons.MISSING_OS_TIME, 1)
  assert.ok(result.exclusions.every(x => x.reason))
})

test('M3 refuses ambiguous or single-group cohorts instead of inventing a result', () => {
  assert.throws(() => compileCohort({ ...inputs,
    expression: expression.map(r => ({ ...r, tpm_unstranded: '1' })),
  }), /cannot form two/)
  assert.throws(() => compileCohort({ ...inputs,
    cases: cases.map(c => ({ ...c, vital_status: 'Not Reported' })),
  }), /at least four/)
})

const sha = value => createHash('sha256').update(value).digest('hex')
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'capn1-m3-'))
  const source = { status: 'complete', digest: 'mock-gdc-source' }
  const outputs = []
  const dir = 'data/processed/gdc-fixture/m2-fixture'
  const specs = {
    'capn1-expression.tsv': [['file_id','case_ids','tpm_unstranded'], expression],
    'expression-files.tsv': [['file_id','case_ids','case_count'], files],
    'clinical-cases.tsv': [['case_id','vital_status','days_to_death'], cases],
    'clinical-diagnoses.tsv': [['case_id','days_to_last_follow_up'], diagnoses],
    'clinical-followups.tsv': [['case_id','days_to_follow_up'], followups],
  }
  await mkdir(join(root, dir), { recursive: true })
  await mkdir(join(root, 'study'), { recursive: true })
  await writeFile(join(root, 'study/source.json'), JSON.stringify(source))
  for (const [name, [columns, rows]] of Object.entries(specs)) {
    const content = asTsv(columns, rows)
    const path = dir + '/' + name
    await writeFile(join(root, path), content)
    outputs.push({ path, bytes: Buffer.byteLength(content), sha256: sha(content) })
  }
  await writeFile(join(root, 'study/processed.json'), JSON.stringify({
    status: 'complete', id: 'm2-fixture', source_digest: source.digest, outputs,
  }))
  return { root, dir }
}
const hasR = spawnSync('Rscript', ['--version'], { encoding: 'utf8' }).status === 0

test('M3 R survival generates formal outputs, cache hit, and integrity-safe failure', {
  skip: !hasR && 'Rscript is not installed (CI provisions R)',
}, async () => {
  const { root, dir } = await fixture()
  const first = await analyze(root)
  assert.equal(first.status, 'analyzed')
  assert.equal(first.manifest.cohort.paired_cases, 6)
  assert.ok(first.manifest.outputs.some(x => x.path.endsWith('kaplan-meier.svg')))
  const statsPath = first.manifest.outputs.find(x => x.path.endsWith('statistics.tsv')).path
  const stats = await readFile(join(root, statsPath), 'utf8')
  assert.match(stats, /hazard_ratio_high_vs_low/)
  const cached = await analyze(root)
  assert.equal(cached.status, 'cache-hit')
  assert.equal(cached.manifest.id, first.manifest.id)
  await writeFile(join(root, dir, 'clinical-cases.tsv'), 'corrupted input')
  await assert.rejects(analyze(root), /checksum mismatch/)
  const current = JSON.parse(await readFile(join(root, 'study/survival.json'), 'utf8'))
  assert.equal(current.id, first.manifest.id)
})
