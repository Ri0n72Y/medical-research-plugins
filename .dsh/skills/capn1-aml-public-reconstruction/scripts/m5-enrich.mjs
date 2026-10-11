#!/usr/bin/env node
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readFile, mkdir, writeFile, rename, rm, stat } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { dirname, join, resolve, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { acquireKegg, verifyKegg } from './m5-kegg.mjs'
import { parseTsv } from './m3-cohort.mjs'

const exec = promisify(execFile)
const root = dirname(fileURLToPath(import.meta.url))
const implementation = 'capn1-m5-clusterprofiler-ora-v1'
const names = ['gene-id-mapping.tsv','go-bp.tsv','go-mf.tsv','go-cc.tsv','kegg.tsv',
  'statistics.tsv','runtime.tsv','enrichment-top.svg','report.md']
const sum = value => createHash('sha256').update(value).digest('hex')
async function fileHash(path) {
  const hash = createHash('sha256')
  for await (const part of createReadStream(path)) hash.update(part)
  return hash.digest('hex')
}
function safe(workspace, input) {
  if (typeof input !== 'string' || !input || input.includes('\\')) throw Error('Invalid artifact path')
  const absolute = resolve(workspace, input)
  if (!absolute.startsWith(resolve(workspace) + sep)) throw Error('Artifact outside study workspace')
  return absolute
}
async function json(path) { return JSON.parse(await readFile(path, 'utf8')) }
async function checkOutputs(workspace, manifest, required = []) {
  if (manifest?.status !== 'complete' || !Array.isArray(manifest.outputs)) throw Error('Input analysis is not complete')
  const index = new Map()
  for (const entry of manifest.outputs) {
    const path = safe(workspace, entry.path)
    if (!Number.isInteger(entry.bytes) || !entry.sha256 ||
      (await stat(path)).size !== entry.bytes || await fileHash(path) !== entry.sha256) {
      throw Error('Input artifact checksum mismatch: ' + entry.path)
    }
    const name = entry.path.split('/').at(-1)
    if (index.has(name)) throw Error('Duplicate manifest output: ' + name)
    index.set(name, path)
  }
  for (const name of required) if (!index.has(name)) throw Error('Missing prerequisite artifact: ' + name)
  return index
}
async function readInputs(workspace) {
  const [source, m2, m3, m4] = await Promise.all([
    json(join(workspace, 'study/source.json')),
    json(join(workspace, 'study/processed.json')),
    json(join(workspace, 'study/survival.json')),
    json(join(workspace, 'study/deg.json')),
  ])
  if (source.status !== 'complete' || m2.source_digest !== source.digest ||
      m3.source_digest !== source.digest || m4.source_digest !== source.digest ||
      m3.m2_id !== m2.id || m4.m2_id !== m2.id || m4.m3_id !== m3.id) {
    throw Error('M5 requires compatible active M2/M3/M4 lineage')
  }
  if (!String(m4.implementation).startsWith('capn1-m4-deseq2-')) {
    throw Error('M5 requires completed DESeq2 M4, not another results schema')
  }
  const paths = await checkOutputs(workspace, m4, ['deg-all.tsv','deg-significant.tsv'])
  return { m2, m3, m4, paths }
}
async function digestScripts() {
  const contents = await Promise.all(['m5-enrich.R','m5-enrich.mjs','m5-kegg.mjs']
    .map(async name => [name, await readFile(join(root, name), 'utf8')]))
  return sum(JSON.stringify(contents))
}
const fmt = number => String(Number(number))
function report(source, summary, runtime, ref, fdr) {
  return [
    '# CAPN1 / AML — M5 GO / KEGG functional enrichment', '',
    'This is a transparent AI Harness public research workflow demonstration, not replication of Wang et al. DAVID output.', '',
    '## Input lineage',
    '- M2: ' + source.m2.id,
    '- M3: ' + source.m3.id,
    '- M4: ' + source.m4.id,
    '- KEGG mapping: ' + ref.id + ' (' + ref.created_at + ')', '',
    '## Evidence summary',
    '- M4 tested gene rows: ' + fmt(summary.tested_gene_rows),
    '- M4 significant gene rows: ' + fmt(summary.significant_gene_rows),
    '- Background mapped Entrez IDs: ' + fmt(summary.mapped_tested_entrez),
    '- Significant mapped Entrez IDs: ' + fmt(summary.mapped_significant_entrez),
    '- GO BP / MF / CC significant terms: ' +
      ['go_bp_fdr_significant','go_mf_fdr_significant','go_cc_fdr_significant'].map(x => fmt(summary[x])).join(' / '),
    '- KEGG significant pathways: ' + fmt(summary.kegg_fdr_significant), '',
    '## Declared methods',
    '- GO ORA: Bioconductor clusterProfiler::enrichGO, BP/MF/CC separately, org.Hs.eg.db.',
    '- KEGG ORA: clusterProfiler::enricher using immutable KEGG REST pathway-to-Entrez mapping.',
    '- Gene mapping: strip Ensembl version, use org.Hs.eg.db unique Ensembl→Entrez IDs; ambiguous IDs excluded.',
    '- Background: tested M4 genes with non-NA adjusted p value, mapped to unique Entrez IDs.',
    '- Hypergeometric ORA with BH correction; retain all returned term tests; significant FDR < ' + fdr + '.',
    '- Gene-set size after background intersection: 5–500.',
    '- R ' + runtime.r_version + ', clusterProfiler ' + runtime.clusterProfiler +
      ', org.Hs.eg.db ' + runtime['org.Hs.eg.db'] + '.', '',
    '## Limits',
    '- Annotation databases and KEGG mapping snapshots evolve; filenames and checksums are retained.',
    '- KEGG names and links are public reference substitutions for the original paper’s DAVID database.',
    '- Analysis does not establish biological causation or validate an experimental hypothesis.',
    '- GO/KEGG can return no significant pathways; an empty result is a valid finding.',
    '- M4 uses an M3 survival-eligible cohort, which can introduce selection bias.',
    '- CAPN1 itself defined the upstream grouping; it is not independent biomarker validation.', '',
    'See gene-id-mapping.tsv, go-bp/mf/cc.tsv, kegg.tsv, enrichment-top.svg and statistics.tsv.', ''
  ].join('\n')
}
export async function enrich(workspace, { rerun = false, refreshKegg = false, fdr = 0.05,
  download } = {}) {
  if (!(Number.isFinite(fdr) && fdr > 0 && fdr < 1)) throw Error('Invalid M5 FDR threshold')
  const source = await readInputs(workspace)
  const kegg = await acquireKegg(workspace, { refresh: refreshKegg, ...(download && { download }) })
  const referencePaths = await verifyKegg(workspace, kegg.manifest)
  const scriptDigest = await digestScripts()
  const fingerprint = sum(JSON.stringify({
    implementation, m4: source.m4.id, m4_outputs: source.m4.outputs.map(x => [x.path, x.sha256]),
    kegg: kegg.manifest.id, kegg_files: kegg.manifest.files, fdr, scriptDigest,
  }))
  const pointer = join(workspace, 'study/enrichment.json')
  let current
  try { current = await json(pointer) }
  catch (error) { if (error.code !== 'ENOENT') throw error }
  if (!rerun && !refreshKegg && current?.fingerprint === fingerprint &&
      current.script_digest === scriptDigest && current.outputs?.length === names.length) {
    try {
      await checkOutputs(workspace, current, names)
      return { status: 'cache-hit', manifest: current }
    } catch { /* damaged M5 outputs require a new run */ }
  }
  const base = join(workspace, 'runs/m5-enrichment')
  const id = 'm5-' + Date.now() + '-' + randomUUID().slice(0, 8)
  const stage = join(base, '.pending-' + id)
  const published = join(base, id)
  await mkdir(stage, { recursive: true })
  try {
    await exec(process.env.RSCRIPT_BINARY || 'Rscript', [
      '--vanilla', join(root, 'm5-enrich.R'),
      source.paths.get('deg-all.tsv'), source.paths.get('deg-significant.tsv'),
      referencePaths.links, referencePaths.titles, stage, String(fdr),
    ], { maxBuffer: 2 * 1024 * 1024 })
    const summary = Object.fromEntries(parseTsv(await readFile(join(stage, 'statistics.tsv'), 'utf8'),
      ['metric','value']).map(row => [row.metric, row.value]))
    const runtime = Object.fromEntries(parseTsv(await readFile(join(stage, 'runtime.tsv'), 'utf8'),
      ['name','value']).map(row => [row.name, row.value]))
    await writeFile(join(stage, 'report.md'), report(source, summary, runtime, kegg.manifest, fdr))
    const outputs = await Promise.all(names.map(async name => {
      const path = join(stage, name)
      return { path: relative(workspace, join(published, name)).replaceAll('\\','/'),
        bytes: (await stat(path)).size, sha256: await fileHash(path) }
    }))
    const manifest = { schema: 1, status: 'complete', implementation, id,
      created_at: new Date().toISOString(), source_digest: source.m4.source_digest,
      m2_id: source.m2.id, m3_id: source.m3.id, m4_id: source.m4.id,
      kegg_reference: kegg.manifest, script_digest: scriptDigest, fingerprint,
      parameters: { method: 'clusterProfiler GO/KEGG ORA', fdr, background: 'M4 tested genes',
        keytype: 'ENTREZID', minGSSize: 5, maxGSSize: 500, correction: 'BH' },
      summary, runtime, outputs }
    await writeFile(join(stage, 'run-manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
    await rename(stage, published)
    const tmp = pointer + '.tmp-' + randomUUID().slice(0, 8)
    await writeFile(tmp, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' })
    await rename(tmp, pointer)
    return { status: 'analyzed', manifest }
  } catch (error) {
    await rm(stage, { recursive: true, force: true })
    throw error
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const pos = args.indexOf('--workspace')
  if (pos >= 0 && !args[pos + 1]) throw Error('Missing --workspace value')
  for (let i = 0; i < args.length; i++) {
    if (['--rerun', '--refresh-kegg'].includes(args[i])) continue
    if (args[i] === '--workspace') { i++; continue }
    throw Error('Unknown M5 argument: ' + args[i])
  }
  const workspace = pos < 0 ? process.cwd() : resolve(args[pos + 1])
  enrich(workspace, { rerun: args.includes('--rerun'), refreshKegg: args.includes('--refresh-kegg') })
    .then(result => console.log(JSON.stringify(result, null, 2)))
    .catch(error => { console.error(error.message); process.exitCode = 1 })
}
