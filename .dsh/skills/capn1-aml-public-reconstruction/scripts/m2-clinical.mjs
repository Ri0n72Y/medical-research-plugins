import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const cell = value => value === undefined || value === null ? '' : String(value).replaceAll('\t', ' ').replaceAll('\r', ' ').replaceAll('\n', ' ')
const table = (columns, rows) => [columns.join('\t'), ...rows.map(row => columns.map(key => cell(row[key])).join('\t'))].join('\n') + '\n'

export async function buildClinicalTables(response, files, outDir, { capn1Resolved = true } = {}) {
  const hits = response?.data?.hits
  if (!Array.isArray(hits) || !hits.length) throw new Error('Missing GDC clinical case hits')
  const cases = [...hits].sort((a, b) => String(a.case_id).localeCompare(String(b.case_id)))
  const caseIds = new Set()
  const rows = []
  const diagnoses = []
  const followups = []
  const issues = []
  for (const c of cases) {
    if (!c.case_id || caseIds.has(c.case_id)) throw new Error('Missing or duplicate GDC case_id in clinical source')
    caseIds.add(c.case_id)
    const ds = Array.isArray(c.diagnoses) ? c.diagnoses : []
    const fs = Array.isArray(c.follow_ups) ? c.follow_ups : []
    const demographic = c.demographic ?? {}
    rows.push({ case_id: c.case_id, submitter_id: c.submitter_id, vital_status: demographic.vital_status,
      days_to_death: demographic.days_to_death, sex_at_birth: demographic.sex_at_birth,
      age_at_index: demographic.age_at_index, diagnosis_count: ds.length, followup_count: fs.length })
    if (!ds.length) issues.push({ code: 'NO_DIAGNOSIS', subject: c.case_id, detail: 'No diagnoses in GDC case metadata' })
    if (ds.length > 1) issues.push({ code: 'MULTIPLE_DIAGNOSES', subject: c.case_id, detail: `Diagnoses: ${ds.length}` })
    const vital = String(demographic.vital_status ?? '').trim().toLowerCase()
    if (!vital) issues.push({ code: 'MISSING_VITAL_STATUS', subject: c.case_id, detail: 'No demographic vital status' })
    else if (vital !== 'alive' && vital !== 'dead') {
      issues.push({ code: 'UNRESOLVED_VITAL_STATUS', subject: c.case_id, detail: `Vital status is ${demographic.vital_status}; not Alive/Dead` })
    }
    const hasDays = value => value !== null && value !== undefined && value !== '' &&
      Number.isFinite(Number(value)) && Number(value) >= 0
    if (vital === 'dead' && !hasDays(demographic.days_to_death)) {
      issues.push({ code: 'MISSING_DEATH_TIME', subject: c.case_id, detail: 'Dead without a usable days_to_death' })
    }
    if (vital === 'alive' && !ds.some(d => hasDays(d.days_to_last_follow_up)) &&
      !fs.some(f => hasDays(f.days_to_follow_up))) {
      issues.push({ code: 'MISSING_CENSOR_FOLLOWUP', subject: c.case_id,
        detail: 'Alive without a usable diagnosis/follow-up time; censor time remains undefined' })
    }
    for (const d of ds) diagnoses.push({ case_id: c.case_id, diagnosis_id: d.diagnosis_id, primary_diagnosis: d.primary_diagnosis,
      age_at_diagnosis: d.age_at_diagnosis, days_to_last_follow_up: d.days_to_last_follow_up,
      eln_risk_classification: d.eln_risk_classification })
    for (const f of fs) followups.push({ case_id: c.case_id, follow_up_id: f.follow_up_id, days_to_follow_up: f.days_to_follow_up })
  }
  const sampleRows = []
  const linked = new Map()
  for (const f of files) {
    const ids = [...new Set((f.cases ?? []).map(c => c.case_id))]
    sampleRows.push({ file_id: f.file_id, file_name: f.file_name, case_ids: ids.join(';'), case_count: ids.length, sample_id: '' })
    if (ids.length !== 1) issues.push({ code: 'AMBIGUOUS_FILE_CASE', subject: f.file_id, detail: `Linked cases: ${ids.length}` })
    for (const id of ids) {
      linked.set(id, (linked.get(id) ?? 0) + 1)
      if (!caseIds.has(id)) issues.push({ code: 'CASE_NOT_IN_CLINICAL', subject: f.file_id, detail: id })
    }
  }
  for (const [id, count] of linked) {
    if (count > 1) issues.push({ code: 'MULTIPLE_FILES_PER_CASE', subject: id, detail: `Expression files: ${count}; no representative selected` })
  }
  if (!capn1Resolved) issues.push({ code: 'CAPN1_ANNOTATION_AMBIGUOUS', subject: 'CAPN1', detail: 'CAPN1 gene symbol absent or non-unique' })
  await writeFile(join(outDir, 'clinical-cases.tsv'), table(['case_id','submitter_id','vital_status','days_to_death','sex_at_birth','age_at_index','diagnosis_count','followup_count'], rows))
  await writeFile(join(outDir, 'clinical-diagnoses.tsv'), table(['case_id','diagnosis_id','primary_diagnosis','age_at_diagnosis','days_to_last_follow_up','eln_risk_classification'], diagnoses))
  await writeFile(join(outDir, 'clinical-followups.tsv'), table(['case_id','follow_up_id','days_to_follow_up'], followups))
  await writeFile(join(outDir, 'expression-files.tsv'), table(['file_id','file_name','case_ids','case_count','sample_id'], sampleRows))
  await writeFile(join(outDir, 'qc-issues.tsv'), table(['code','subject','detail'], issues))
  return { clinical_cases: cases.length, diagnoses: diagnoses.length, followups: followups.length,
    issues, multi_file_cases: [...linked.values()].filter(n => n > 1).length, endpoint_defined: false,
    sample_selection_defined: false }
}
