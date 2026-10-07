#!/usr/bin/env node
import { mkdir, rm } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { caseIds, casesUrl, clinicalDigest, downloadExpressionFile, fetchJson, filesUrl, normalizeFiles, snapshotIsComplete, sourceDigest } from './lib/gdc.mjs'
import { readJsonIfExists, writeJsonAtomic, writeTextAtomic } from './lib/io.mjs'

export function parseArgs(argv) {
  const result = { workspace: process.cwd(), refresh: false, concurrency: 4 }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--workspace') result.workspace = argv[++i]
    else if (arg === '--refresh') result.refresh = true
    else if (arg === '--concurrency') result.concurrency = Number(argv[++i])
    else throw new Error(`unknown argument: ${arg}`)
  }
  if (!Number.isInteger(result.concurrency) || result.concurrency < 1 || result.concurrency > 16) {
    throw new Error('--concurrency must be an integer from 1 to 16')
  }
  return result
}

async function mapLimit(items, limit, worker) {
  let index = 0
  const outputs = new Array(items.length)
  async function run() {
    while (index < items.length) {
      const current = index++
      outputs[current] = await worker(items[current], current)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run))
  return outputs
}

function nowIso() {
  return new Date().toISOString()
}

function stamp(value = new Date()) {
  return value.toISOString().replaceAll(':', '').replaceAll('-', '').replace('.000Z', 'Z')
}

function workspacePath(workspace, target) {
  return relative(workspace, target).replaceAll('\\', '/')
}

async function writeStudyStatus(workspace, source, note) {
  const next = source.status === 'complete' ? 'processing and cohort QC' : 'resume source acquisition'
  const lines = [
    '# Study status', '',
    `- Source acquisition: ${source.status}.`,
    source.status === 'complete'\n      ? `- Active source snapshot: ${source.snapshot}.`\n      : `- Pending source snapshot: ${source.snapshot}.`,
    `- TCGA-LAML cases: ${source.cases ?? 'unknown'}.`,
    `- STAR - Counts files: ${source.files?.length ?? 0}.`,
    `- Source bytes: ${source.total_bytes ?? 'unknown'}.`,
    `- Note: ${note}.`,
    `- Next canonical stage: ${next}.`, '',
  ]
  await writeTextAtomic(join(workspace, 'study/status.md'), lines.join('\n'))
}

async function recordRefreshCheck(workspace, payload) {
  const path = join(workspace, 'data/manifests/gdc/refresh-checks', `${stamp()}.json`)
  await writeJsonAtomic(path, payload)
}

export async function acquireSource({ workspace, refresh = false, concurrency = 4, fetchImpl = fetch, onProgress = () => {} }) {
  const statePath = join(workspace, 'study/source.json')
  const pendingPath = join(workspace, 'study/source-pending.json')
  const active = await readJsonIfExists(statePath)
  const pending = await readJsonIfExists(pendingPath)

  if (!refresh && pending?.status === 'partial' && Array.isArray(pending.files)) {
    onProgress({ phase: 'resume', snapshot: pending.snapshot, files: pending.files.length })
    return finishSnapshot({ workspace, statePath, pendingPath, source: pending, concurrency, fetchImpl, resumed: true, onProgress })
  }

  if (!refresh && await snapshotIsComplete(workspace, active)) {
    await writeStudyStatus(workspace, active, 'local cached source reused; no GDC request was made')
    return { status: 'cache-hit', snapshot: active.snapshot, files: active.files.length, source: active }
  }

  const queryStartedAt = nowIso()
  const fileQuery = filesUrl()
  const caseQuery = casesUrl()
  const [filesResponse, casesResponse] = await Promise.all([
    fetchJson(fileQuery, fetchImpl),
    fetchJson(caseQuery, fetchImpl),
  ])
  const files = normalizeFiles(filesResponse)
  const cases = caseIds(casesResponse)
  const clinical = clinicalDigest(casesResponse)
  const digest = sourceDigest(files, clinical)
  const snapshot = `gdc-${digest.slice(0, 12)}`
  const totalBytes = files.reduce((sum, file) => sum + file.file_size, 0)
  onProgress({ phase: 'manifest', snapshot, files: files.length, cases: cases.length, total_bytes: totalBytes })

  if (refresh && active?.snapshot === snapshot && await snapshotIsComplete(workspace, active)) {
    await recordRefreshCheck(workspace, {
      checked_at: nowIso(), query_started_at: queryStartedAt, project: 'TCGA-LAML',
      observed_snapshot: snapshot, observed_digest: digest, changed: false,
    })
    await writeStudyStatus(workspace, active, 'GDC was re-queried; the public source fingerprint was unchanged')
    return { status: 'refresh-unchanged', snapshot, files: files.length, source: active }
  }

  const manifestDir = join(workspace, 'data/manifests/gdc', snapshot)
  const rawRoot = join(workspace, 'data/raw/gdc', snapshot)
  await mkdir(manifestDir, { recursive: true })
  await mkdir(join(rawRoot, 'clinical'), { recursive: true })
  await writeJsonAtomic(join(manifestDir, 'queries.json'), { files: fileQuery, cases: caseQuery })
  await writeJsonAtomic(join(manifestDir, 'files-response.json'), filesResponse)
  await writeJsonAtomic(join(rawRoot, 'clinical/cases.json'), casesResponse)

  const source = {
    schema: 1,
    project: 'TCGA-LAML',
    status: 'partial',
    snapshot,
    digest,
    queried_at: queryStartedAt,
    manifest: workspacePath(workspace, join(manifestDir, 'source-manifest.json')),
    clinical: workspacePath(workspace, join(rawRoot, 'clinical/cases.json')),
    cases: cases.length,
    clinical_digest: clinical,
    total_bytes: totalBytes,
    files: files.map(file => ({ ...file, path: workspacePath(workspace, join(rawRoot, 'expression', file.file_name)) })),
  }
  await writeJsonAtomic(join(manifestDir, 'source-manifest.json'), source)
  await writeJsonAtomic(pendingPath, source)
  await writeStudyStatus(workspace, source, 'source manifest created; expression download is incomplete')
  return finishSnapshot({ workspace, statePath, pendingPath, source, concurrency, fetchImpl, resumed: false, onProgress })
}

async function finishSnapshot({ workspace, statePath, pendingPath, source, concurrency, fetchImpl, resumed, onProgress }) {
  const expressionDir = join(workspace, 'data/raw/gdc', source.snapshot, 'expression')
  let completedCount = 0
  const results = await mapLimit(source.files, concurrency, async file => {
    const result = await downloadExpressionFile(file, expressionDir, fetchImpl)
    completedCount += 1
    onProgress({ phase: 'download', completed: completedCount, total: source.files.length, file: file.file_name, reused: result.reused })
    return result
  })
  const completed = {
    ...source,
    status: 'complete',
    completed_at: nowIso(),
    files_reused: results.filter(item => item.reused).length,
    files_downloaded: results.filter(item => !item.reused).length,
  }
  await writeJsonAtomic(join(workspace, source.manifest), completed)
  await writeJsonAtomic(statePath, completed)
  await rm(pendingPath, { force: true })
  await writeStudyStatus(workspace, completed, resumed ? 'source acquisition resumed and completed' : 'public source acquired and verified')
  return {
    status: resumed ? 'resumed-complete' : 'downloaded',
    snapshot: completed.snapshot,
    files: completed.files.length,
    reused: completed.files_reused,
    downloaded: completed.files_downloaded,
    source: completed,
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2))
    const result = await acquireSource({ ...args, onProgress: event => console.error(JSON.stringify(event)) })
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error))
    process.exitCode = 1
  }
}
