import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export function parseTsv(text, required) {
  const lines = text.trimEnd().split(/\r?\n/)
  const columns = lines.shift().split('\t')
  if (new Set(columns).size !== columns.length || required.some(name => !columns.includes(name))) {
    throw Error('Missing or duplicate TSV columns: ' + required.join(', '))
  }
  return lines.filter(Boolean).map((line, index) => {
    const cells = line.split('\t')
    if (cells.length !== columns.length) throw Error('Malformed TSV line ' + (index + 2))
    return Object.fromEntries(columns.map((name, i) => [name, cells[i]]))
  })
}

export function asTsv(columns, rows) {
  const cell = value => String(value ?? '').replaceAll('\t', ' ').replaceAll('\n', ' ')
  return [columns.join('\t'), ...rows.map(row => columns.map(name => cell(row[name])).join('\t'))].join('\n') + '\n'
}

const numberOrNull = value => {
  if (value === null || value === undefined || String(value).trim() === '') return null
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : null
}
const idsOf = value => String(value ?? '').split(';').filter(Boolean)
const byKey = (rows, key) => {
  const map = new Map()
  for (const row of rows) {
    if (!row[key] || map.has(row[key])) throw Error('Missing or duplicate ' + key)
    map.set(row[key], row)
  }
  return map
}
const median = values => {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export function compileCohort({ expression, files, cases, diagnoses, followups }) {
  const expressions = byKey(expression, 'file_id')
  const caseById = byKey(cases, 'case_id')
  const filesById = byKey(files, 'file_id')
  const fileCounts = new Map()
  for (const file of files) {
    const ids = idsOf(file.case_ids)
    if (ids.length === 1) fileCounts.set(ids[0], (fileCounts.get(ids[0]) ?? 0) + 1)
  }
  const times = new Map()
  for (const row of diagnoses) {
    const value = numberOrNull(row.days_to_last_follow_up)
    if (value !== null) times.set(row.case_id, Math.max(times.get(row.case_id) ?? 0, value))
  }
  for (const row of followups) {
    const value = numberOrNull(row.days_to_follow_up)
    if (value !== null) times.set(row.case_id, Math.max(times.get(row.case_id) ?? 0, value))
  }
  const excluded = []
  const eligible = []
  const exclude = (fileId, caseId, reason) => excluded.push({ file_id: fileId, case_id: caseId, reason })
  for (const file of [...files].sort((a, b) => a.file_id.localeCompare(b.file_id))) {
    const ids = idsOf(file.case_ids)
    const caseId = ids.length === 1 ? ids[0] : ''
    const expr = expressions.get(file.file_id)
    if (!caseId || file.case_count !== '1') {
      exclude(file.file_id, caseId, 'AMBIGUOUS_FILE_CASE')
      continue
    }
    if ((fileCounts.get(caseId) ?? 0) !== 1) {
      exclude(file.file_id, caseId, 'MULTIPLE_FILES_PER_CASE')
      continue
    }
    if (!expr || idsOf(expr.case_ids).length !== 1 || expr.case_ids !== caseId) {
      exclude(file.file_id, caseId, 'MISSING_OR_MISMATCHED_CAPN1')
      continue
    }
    const patient = caseById.get(caseId)
    if (!patient) {
      exclude(file.file_id, caseId, 'NO_CLINICAL_CASE')
      continue
    }
    const tpm = numberOrNull(expr.tpm_unstranded)
    if (tpm === null) {
      exclude(file.file_id, caseId, 'INVALID_CAPN1_TPM')
      continue
    }
    const vital = patient.vital_status.trim().toLowerCase()
    const death = numberOrNull(patient.days_to_death)
    let osDays
    let event
    if (vital === 'dead') {
      osDays = death
      event = 1
    } else if (vital === 'alive' && death === null) {
      osDays = times.get(caseId) ?? null
      event = 0
    } else {
      exclude(file.file_id, caseId, 'UNKNOWN_OR_CONFLICTING_VITAL_STATUS')
      continue
    }
    if (osDays === null || osDays === undefined) {
      exclude(file.file_id, caseId, 'MISSING_OS_TIME')
      continue
    }
    eligible.push({ case_id: caseId, file_id: file.file_id, capn1_tpm: tpm,
      capn1_log2_tpm: Math.log2(tpm + 1), os_days: osDays, event })
  }
  if (eligible.length < 4) throw Error('M3 needs at least four uniquely mapped cases with usable CAPN1 and OS')
  const cutoff = median(eligible.map(row => row.capn1_tpm))
  const cohort = eligible.map(row => ({ ...row, group: row.capn1_tpm > cutoff ? 'high' : 'low' }))
    .sort((a, b) => a.case_id.localeCompare(b.case_id))
  const high = cohort.filter(row => row.group === 'high').length
  if (high === 0 || high === cohort.length) throw Error('CAPN1 median cannot form two non-empty groups')
  if (cohort.every(row => row.event === 0)) throw Error('No observed deaths available for survival analysis')
  const reasons = {}
  for (const row of excluded) reasons[row.reason] = (reasons[row.reason] ?? 0) + 1
  return { cohort, exclusions: excluded, summary: {
    total_expression_files: files.length, total_clinical_cases: cases.length,
    paired_cases: cohort.length, high, low: cohort.length - high,
    events: cohort.filter(row => row.event === 1).length,
    excluded_expression_files: excluded.length, exclusion_reasons: reasons,
    clinical_without_selected_expression: cases.length - cohort.length,
    capn1_cutoff_tpm: cutoff,
    grouping_rule: 'high > paired-cohort median TPM; low <= median TPM',
    survival_rule: 'Dead: demographic days_to_death. Alive: max diagnosis/follow-up time.',
    sample_rule: 'Exactly one GDC expression file linked to exactly one case; no biospecimen type inference',
  } }
}

export async function loadCohortInputs(outputDir) {
  const specs = {
    expression: ['capn1-expression.tsv', ['file_id', 'case_ids', 'tpm_unstranded']],
    files: ['expression-files.tsv', ['file_id', 'case_ids', 'case_count']],
    cases: ['clinical-cases.tsv', ['case_id', 'vital_status', 'days_to_death']],
    diagnoses: ['clinical-diagnoses.tsv', ['case_id', 'days_to_last_follow_up']],
    followups: ['clinical-followups.tsv', ['case_id', 'days_to_follow_up']],
  }
  const entries = await Promise.all(Object.entries(specs).map(async ([key, [name, columns]]) =>
    [key, parseTsv(await readFile(join(outputDir, name), 'utf8'), columns)]))
  return Object.fromEntries(entries)
}
