#!/usr/bin/env node
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile, writeFile, mkdir, rename, rm, stat } from 'node:fs/promises'
import { join, dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseTsv } from './m3-cohort.mjs'

const exec = promisify(execFile)
const root = dirname(fileURLToPath(import.meta.url))
const impl = 'capn1-m4-deseq2-demo-v1'
const artifacts = ['deg-all.tsv', 'deg-significant.tsv', 'statistics.tsv',
  'runtime.tsv', 'volcano.svg', 'report.md']
const shaText = value => createHash('sha256').update(value).digest('hex')
async function sha(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}
async function json(path) { return JSON.parse(await readFile(path, 'utf8')) }
function within(workspace, path) {
  if (typeof path !== 'string' || !path || path.includes('\\')) throw Error('Invalid artifact path')
  const absolute = resolve(workspace, path)
  if (!absolute.startsWith(resolve(workspace) + sep)) throw Error('Artifact outside workspace: ' + path)
  return absolute
}
async function checkedOutputs(workspace, manifest, required) {
  if (manifest?.status !== 'complete' || !Array.isArray(manifest.outputs)) {
    throw Error('An input manifest is not complete')
  }
  const out = new Map()
  for (const item of manifest.outputs) {
    const path = within(workspace, item.path)
    if ((await stat(path)).size !== item.bytes || await sha(path) !== item.sha256) {
      throw Error('Input artifact checksum mismatch: ' + item.path)
    }
    const name = item.path.split('/').at(-1)
    if (out.has(name)) throw Error('Duplicate output name in input manifest')
    out.set(name, path)
  }
  for (const name of required) if (!out.has(name)) throw Error('Missing input artifact: ' + name)
  return out
}
async function inputs(workspace) {
  const [source, m2, m3] = await Promise.all([
    json(join(workspace, 'study/source.json')),
    json(join(workspace, 'study/processed.json')),
    json(join(workspace, 'study/survival.json')),
  ])
  if (source.status !== 'complete' || m2.source_digest !== source.digest ||
    m3.source_digest !== source.digest || m3.m2_id !== m2.id) {
    throw Error('M4 requires matching active M2/M3 lineage; rerun previous stages first')
  }
  if (!String(m3.implementation).startsWith('capn1-m3-survival-')) {
    throw Error('M4 requires the declared CAPN1 M3 grouping method')
  }
  const m2Files = await checkedOutputs(workspace, m2,
    ['counts-unstranded.tsv', 'gene-annotation.tsv'])
  const m3Files = await checkedOutputs(workspace, m3, ['cohort.tsv'])
  const cohort = parseTsv(await readFile(m3Files.get('cohort.tsv'), 'utf8'),
    ['case_id', 'file_id', 'group'])
  if (cohort.length < 6) {
    throw Error('M4 requires at least six paired M3 cases')
  }
  if (new Set(cohort.map(x => x.file_id)).size !== cohort.length ||
    new Set(cohort.map(x => x.case_id)).size !== cohort.length) throw Error('Duplicate M3 case or file')
  const groups = cohort.reduce((counts, x) => {
    if (!['high','low'].includes(x.group)) throw Error('Invalid M3 group')
    counts[x.group] = (counts[x.group] ?? 0) + 1
    return counts
  }, {})
  if ((groups.high ?? 0) < 3 || (groups.low ?? 0) < 3) {
    throw Error('M4 needs at least three paired cases in each group')
  }
  return { m2, m3, m2Files, m3Files, groups }
}
async function digestScripts() {
  const contents = await Promise.all(['m4-deg.R', 'm4-deg.mjs', 'm3-cohort.mjs']
    .map(async name => [name, await readFile(join(root, name), 'utf8')]))
  return shaText(JSON.stringify(contents))
}
async function cacheValid(workspace, manifest, fingerprint, scriptHash) {
  if (manifest?.fingerprint !== fingerprint || manifest.script_digest !== scriptHash ||
    manifest.outputs?.length !== artifacts.length) return false
  try { await checkedOutputs(workspace, manifest, artifacts); return true }
  catch { return false }
}
function makeReport({ source, stats, runtime, input, alpha, lfc }) {
  const count = (name) => Number(stats[name])
  return [
    '# CAPN1 / AML — M4 Differential Expression', '',
    'Research-workflow demonstration. Numerical agreement with the original paper is not required.', '',
    '## Provenance', '- M2 run: ' + input.m2.id, '- M3 survival cohort: ' + input.m3.id,
    '- Group sizes: high ' + input.groups.high + ', low ' + input.groups.low, '',
    '## Findings',
    '- Genes in matrix: ' + count('total_genes'),
    '- Passed minimum-count filter: ' + count('fit_genes'),
    '- Genes with valid adjusted p-values: ' + count('tested_genes'),
    '- Significant genes: ' + count('significant_genes'),
    '- Up (high vs low): ' + count('up_genes'),
    '- Down (high vs low): ' + count('down_genes'), '',
    '## Declared analysis method',
    '- Input: raw GDC unstranded counts, never TPM.',
    '- DESeq2 ~ group, high versus low; default size-factor normalization, dispersion and Wald test.',
    '- Low-count prefilter: at least 10 reads in at least the smallest group size.',
    '- Default independent filtering and BH adjusted p-values.',
    '- Significant: padj < ' + alpha + ' and |log2 fold change| >= ' + lfc + '.',
    '- R ' + runtime.r_version + ', DESeq2 ' + runtime.deseq2_version + ', Bioconductor ' + runtime.bioconductor_version + '.',
    '- Dispersion fit: ' + runtime.dispersion_fit + ' (mean fallback only when estimates are near minimum).', '',
    '## Scientific limits',
    '- M3 cohort selection requires survival data; this may introduce selection bias in the DEG analysis.',
    '- No batch correction or clinical covariate adjustment is applied.',
    '- CAPN1 defines the grouping. Its differential expression is expected by construction, not independent evidence.',
    '- Other DEG associations do not establish biological causality or clinical usefulness.',
    '- Case-to-file linkage does not establish biospecimen identity or timing.',
    '- No inference is drawn until full public data have been processed and reviewed.', '',
    'See deg-all.tsv, deg-significant.tsv, statistics.tsv, runtime.tsv and volcano.svg.', ''
  ].join('\n')
}
export async function analyzeDeg(workspace, { rerun = false, alpha = 0.05, lfc = 1 } = {}) {
  if (!(Number.isFinite(alpha) && alpha > 0 && alpha < 1 && Number.isFinite(lfc) && lfc >= 0)) {
    throw Error('Invalid DEG thresholds')
  }
  const input = await inputs(workspace)
  const scriptHash = await digestScripts()
  const fingerprint = shaText(JSON.stringify({ implementation: impl, m2: input.m2.id,
    m2_outputs: input.m2.outputs.map(x => [x.path, x.sha256]), m3: input.m3.id,
    m3_outputs: input.m3.outputs.map(x => [x.path, x.sha256]), alpha, lfc, scriptHash }))
  const pointer = join(workspace, 'study/deg.json')
  let previous
  try { previous = await json(pointer) }
  catch (error) { if (error.code !== 'ENOENT') throw error }
  if (!rerun && await cacheValid(workspace, previous, fingerprint, scriptHash)) {
    return { status: 'cache-hit', manifest: previous }
  }
  const base = join(workspace, 'runs/m4-deg')
  const id = 'm4-' + Date.now() + '-' + randomUUID().slice(0, 8)
  const pending = join(base, '.pending-' + id)
  const published = join(base, id)
  await mkdir(pending, { recursive: true })
  try {
    await exec(process.env.RSCRIPT_BINARY || 'Rscript', [
      '--vanilla', join(root, 'm4-deg.R'),
      input.m2Files.get('counts-unstranded.tsv'),
      input.m2Files.get('gene-annotation.tsv'),
      input.m3Files.get('cohort.tsv'), pending, String(alpha), String(lfc),
    ], { maxBuffer: 1024 * 1024 })
    const rows = parseTsv(await readFile(join(pending, 'statistics.tsv'), 'utf8'), ['metric','value'])
    const stats = Object.fromEntries(rows.map(row => [row.metric, row.value]))
    const runtime = Object.fromEntries(parseTsv(await readFile(join(pending, 'runtime.tsv'), 'utf8'),
      ['name','value']).map(row => [row.name, row.value]))
    await writeFile(join(pending, 'report.md'), makeReport({
      source: input.m2.source_digest, stats, runtime, input, alpha, lfc,
    }))
    const outputs = await Promise.all(artifacts.map(async name => {
      const path = join(pending, name)
      return { path: relative(workspace, join(published, name)).replaceAll('\\','/'),
        bytes: (await stat(path)).size, sha256: await sha(path) }
    }))
    const manifest = { schema: 1, status: 'complete', implementation: impl, id,
      created_at: new Date().toISOString(), source_digest: input.m2.source_digest,
      m2_id: input.m2.id, m3_id: input.m3.id, script_digest: scriptHash, fingerprint,
      parameters: { method: 'DESeq2', design: '~group', comparison: 'high-vs-low',
        alpha, min_abs_log2fc: lfc, min_count: 10, min_replicates: Math.min(...Object.values(input.groups)) },
      groups: input.groups, runtime, summary: stats, outputs }
    await writeFile(join(pending, 'run-manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
    await rename(pending, published)
    const tmp = pointer + '.tmp-' + randomUUID().slice(0, 8)
    await writeFile(tmp, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' })
    await rename(tmp, pointer)
    return { status: 'analyzed', manifest }
  } catch (error) {
    await rm(pending, { recursive: true, force: true })
    throw error
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const pos = args.indexOf('--workspace')
  if (pos >= 0 && !args[pos + 1]) throw Error('Missing --workspace path')
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--rerun') continue
    if (args[i] === '--workspace') { i++; continue }
    throw Error('Unknown argument: ' + args[i])
  }
  const workspace = pos < 0 ? process.cwd() : resolve(args[pos + 1])
  analyzeDeg(workspace, { rerun: args.includes('--rerun') })
    .then(result => console.log(JSON.stringify(result, null, 2)))
    .catch(error => { console.error(error.message); process.exitCode = 1 })
}
