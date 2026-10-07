import { basename, join } from 'node:path'
import { mkdir, rename, rm, stat } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { fastFileMatches, md5File, sha256Text, stableJson } from './io.mjs'

export const GDC_API = 'https://api.gdc.cancer.gov'
export const PROJECT_ID = 'TCGA-LAML'

function term(field, value) {
  return { op: 'in', content: { field, value: Array.isArray(value) ? value : [value] } }
}

export function fileFilters() {
  return {
    op: 'and',
    content: [
      term('cases.project.project_id', PROJECT_ID),
      term('data_category', 'Transcriptome Profiling'),
      term('data_type', 'Gene Expression Quantification'),
      term('analysis.workflow_type', 'STAR - Counts'),
      term('access', 'open'),
    ],
  }
}

export function caseFilters() {
  return term('project.project_id', PROJECT_ID)
}

export function filesUrl() {
  const url = new URL(`${GDC_API}/files`)
  url.searchParams.set('filters', JSON.stringify(fileFilters()))
  url.searchParams.set('fields', [
    'file_id', 'file_name', 'file_size', 'md5sum', 'data_category', 'data_type',
    'data_format', 'access', 'analysis.workflow_type', 'cases.case_id', 'cases.submitter_id',
  ].join(','))
  url.searchParams.set('format', 'JSON')
  url.searchParams.set('size', '10000')
  return url.toString()
}

export function casesUrl() {
  const url = new URL(`${GDC_API}/cases`)
  url.searchParams.set('filters', JSON.stringify(caseFilters()))
  url.searchParams.set('fields', 'case_id,submitter_id')
  url.searchParams.set('expand', 'demographic,diagnoses,diagnoses.treatments,follow_ups')
  url.searchParams.set('format', 'JSON')
  url.searchParams.set('size', '1000')
  return url.toString()
}

export async function fetchJson(url, fetchImpl = fetch) {
  const response = await fetchImpl(url, { headers: { accept: 'application/json' } })
  if (!response.ok) throw new Error(`GDC request failed ${response.status}: ${url}`)
  return response.json()
}

export function normalizeFiles(response) {
  const hits = response?.data?.hits
  if (!Array.isArray(hits) || hits.length === 0) throw new Error('GDC returned no STAR - Counts files for TCGA-LAML')
  return hits.map(hit => ({
    file_id: hit.file_id,
    file_name: hit.file_name,
    file_size: Number(hit.file_size),
    md5sum: hit.md5sum,
    data_format: hit.data_format,
    access: hit.access,
    workflow_type: hit.analysis?.workflow_type,
    cases: (hit.cases ?? []).map(item => ({ case_id: item.case_id, submitter_id: item.submitter_id }))
      .sort((a, b) => a.case_id.localeCompare(b.case_id)),
  })).sort((a, b) => a.file_id.localeCompare(b.file_id))
}

export function caseIds(response) {
  const hits = response?.data?.hits
  if (!Array.isArray(hits) || hits.length === 0) throw new Error('GDC returned no cases for TCGA-LAML')
  return hits.map(hit => ({ case_id: hit.case_id, submitter_id: hit.submitter_id }))
    .sort((a, b) => a.case_id.localeCompare(b.case_id))
}

export function clinicalDigest(response) {
  const hits = response?.data?.hits
  if (!Array.isArray(hits)) throw new Error('invalid GDC cases response')
  const ordered = [...hits].sort((a, b) => String(a.case_id).localeCompare(String(b.case_id)))
  return sha256Text(stableJson(ordered))
}

export function sourceDescriptor(files, clinical) {
  return { schema: 1, project: PROJECT_ID, expression: 'STAR - Counts', files, clinical_digest: clinical }
}

export function sourceDigest(files, clinical) {
  return sha256Text(stableJson(sourceDescriptor(files, clinical)))
}

export function safeFileName(name) {
  if (!name || basename(name) !== name || name === '.' || name === '..') throw new Error(`unsafe GDC file name: ${name}`)
  return name
}

export async function snapshotIsComplete(workspace, sourceState) {
  if (!sourceState || sourceState.status !== 'complete' || !Array.isArray(sourceState.files)) return false
  for (const file of sourceState.files) {
    const path = join(workspace, file.path)
    if (!(await fastFileMatches(path, file.file_size))) return false
  }
  return true
}

export async function downloadExpressionFile(file, targetDir, fetchImpl = fetch) {
  safeFileName(file.file_name)
  await mkdir(targetDir, { recursive: true })
  const target = join(targetDir, file.file_name)
  if (await fastFileMatches(target, file.file_size)) {
    const md5 = await md5File(target)
    if (md5 === file.md5sum) return { reused: true, path: target }
  }

  const temp = `${target}.part-${process.pid}`
  await rm(temp, { force: true })
  const response = await fetchImpl(`${GDC_API}/data/${file.file_id}`)
  if (!response.ok || !response.body) throw new Error(`GDC download failed ${response.status}: ${file.file_id}`)
  await pipeline(Readable.fromWeb(response.body), createWriteStream(temp, { flags: 'wx' }))
  const info = await stat(temp)
  if (Number(info.size) !== Number(file.file_size)) {
    await rm(temp, { force: true })
    throw new Error(`size mismatch for ${file.file_name}: expected ${file.file_size}, got ${info.size}`)
  }
  const md5 = await md5File(temp)
  if (md5 !== file.md5sum) {
    await rm(temp, { force: true })
    throw new Error(`md5 mismatch for ${file.file_name}`)
  }
  await rename(temp, target)
  return { reused: false, path: target }
}
