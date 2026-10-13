import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { acquireSignatures, checkSignatures } from './m7-signatures.mjs'

const exec = promisify(execFile)
const root = dirname(fileURLToPath(import.meta.url))
const implementation = 'capn1-m7-gseapy-ssgsea-marker-demo-v1'
const names = ['gene-mapping.tsv', 'signature-coverage.tsv', 'immune-scores.tsv',
  'group-comparison.tsv', 'immune-signatures.svg', 'statistics.json', 'runtime.tsv', 'report.md']
const sum = x => createHash('sha256').update(x).digest('hex')
async function checksum(path) {
  const h = createHash('sha256')
  for await (const block of createReadStream(path)) h.update(block)
  return h.digest('hex')
}
function location(workspace, path) {
  if (typeof path !== 'string' || !path || path.includes('\\')) throw Error('Invalid artifact path')
  const resolved = resolve(workspace, path)
  if (!resolved.startsWith(resolve(workspace) + sep)) throw Error('Artifact escapes workspace')
  return resolved
}
async function json(path) { return JSON.parse(await readFile(path, 'utf8')) }
async function checked(workspace, manifest, required) {
  if (manifest?.status !== 'complete' || !Array.isArray(manifest.outputs)) throw Error('M7 prerequisite incomplete')
  const files = new Map()
  for (const item of manifest.outputs) {
    const name = item.path?.split('/').at(-1)
    if (files.has(name)) throw Error('Duplicate upstream artifact')
    const path = location(workspace, item.path)
    if (!Number.isInteger(item.bytes) || !item.sha256 ||
        (await stat(path)).size !== item.bytes || await checksum(path) !== item.sha256) {
      throw Error('Upstream input checksum mismatch: ' + item.path)
    }
    files.set(name, path)
  }
  for (const name of required) if (!files.has(name)) throw Error('Missing M7 prerequisite ' + name)
  return files
}
async function upstream(workspace) {
  const [source, m2, m3] = await Promise.all(
    ['source','processed','survival'].map(n => json(join(workspace, 'study', n + '.json'))))
  if (source.status !== 'complete' || m2.source_digest !== source.digest ||
      m3.source_digest !== source.digest || m3.m2_id !== m2.id ||
      !String(m3.implementation).startsWith('capn1-m3-python-lifelines-')) {
    throw Error('M7 requires matching public M2 + Python M3 lineage')
  }
  const m2files = await checked(workspace, m2, ['tpm-unstranded.tsv', 'gene-annotation.tsv'])
  const m3files = await checked(workspace, m3, ['cohort.tsv'])
  return { m2, m3, m2files, m3files }
}
function readD5(text) {
  const part = text.match(/^  D5:\r?\n((?:    [^\r\n]*\r?\n)*)/m)?.[1] ?? ''
  const state = part.match(/^    status:\s*([\w-]+)\s*$/m)?.[1] ?? null
  const selected = part.match(/^    selected:\s*([\w-]+)\s*$/m)?.[1] ?? null
  if (selected && selected !== 'null' && !['selected', 'approved'].includes(state)) {
    throw Error('D5 selected mode requires selected/approved decision status')
  }
  if (['selected', 'approved'].includes(state) && (!selected || selected === 'null')) {
    throw Error('D5 selected status has no mode')
  }
  return selected === 'null' ? null : selected
}
async function selectedMode(workspace, requested) {
  let selected = null
  try { selected = readD5(await readFile(join(workspace, 'study/decisions.yaml'), 'utf8')) }
  catch (e) { if (e.code !== 'ENOENT') throw e }
  const mode = requested ?? selected
  if (!mode) throw Error('D5 unresolved: specify --immune-mode ssgsea-only explicitly')
  if (selected && selected !== mode) throw Error('Requested M7 mode conflicts with D5')
  if (mode !== 'ssgsea-only') throw Error('Only Python ssGSEA-only is implemented; no CIBERSORT/deconvolution fallback')
  return { mode, selection: selected ? 'study-D5' : 'explicit-run-parameter' }
}
async function scriptsHash() {
  const sources = await Promise.all(['m7-immune.mjs','m7-immune.py','m7-signatures.mjs']
    .map(async n => [n, await readFile(join(root, n), 'utf8')]))
  return sum(JSON.stringify(sources))
}
function report(input, choice, reference, stats) {
  return ['# M7 — Exploratory ssGSEA immune-marker scores', '',
    'Public-data harness demonstration; NOT CIBERSORT or immune cell deconvolution.', '',
    '## Sources',
    '- M2 expression run: ' + input.m2.id,
    '- M3 paired cohort: ' + input.m3.id,
    '- D5 path: ' + choice.mode + ' (' + choice.selection + ')',
    '- Marker reference: ' + reference.source_library + ' (' + reference.id + ')',
    '- Marker reference SHA-256: ' + reference.file.sha256, '',
    '## Result coverage',
    '- M3 paired cases: ' + stats.cases + ' (high ' + stats.high + ', low ' + stats.low + ')',
    '- Unique protein-coding symbols: ' + stats.expression_gene_symbols,
    '- Immune-labeled marker sets scored: ' + stats.immune_marker_sets_scored +
      ' of ' + stats.immune_marker_sets_considered,
    '- Sample/signature scores: ' + stats.score_rows,
    '- Exploratory FDR < 0.05 terms: ' + stats.signatures_bh_fdr_below_005, '',
    '## Method',
    '- Input: M2 GDC TPM, not counts or M4 DEG; M3 paired case/file cohort.',
    '- Exclude invalid and duplicate gene symbols, preserve mapping audit.',
    '- Marker resource: public Enrichr PanglaoDB_Augmented_2021 snapshot; filter immune-labeled terms by a declared deterministic name rule.',
    '- GSEApy single-sample GSEA; within-sample rank normalization, weight 0.25, no permutation, seed 42, one worker.',
    '- High/low comparisons: exploratory Mann-Whitney two-sided, BH adjusted across scored marker sets.', '',
    '## Interpretation limits',
    '- These are marker-gene signature enrichment scores; they are NOT inferred immune-cell counts or fractions.',
    '- PanglaoDB includes heterogeneous reference biology; term names and signatures are a documented public substitute for unknown original inputs.',
    '- Differential enrichment does not prove infiltration, immune function, causal mechanism or clinical usefulness.', '',
    'See immune-scores.tsv, group-comparison.tsv, signature-coverage.tsv, gene-mapping.tsv, and runtime.tsv.', ''
  ].join('\n')
}
async function verifiedActive(workspace, current, fingerprint, digest) {
  if (current?.status !== 'complete' || current.fingerprint !== fingerprint ||
      current.script_digest !== digest || current.outputs?.length !== names.length) return false
  try { await checked(workspace, current, names); return true } catch { return false }
}
export async function analyzeImmune(workspace, { mode = null, refreshSignatures = false,
  downloadSignatures } = {}) {
  const input = await upstream(workspace)
  const choice = await selectedMode(workspace, mode)
  const digest = await scriptsHash()
  const pointer = join(workspace, 'study/immune.json')
  let active
  try { active = await json(pointer) } catch (e) { if (e.code !== 'ENOENT') throw e }
  if (active && !refreshSignatures) {
    // No network requests before determining whether the active result is reusable.
    const currentRef = await json(join(workspace, 'study/immune-signature-reference.json'))
    await checkSignatures(workspace, currentRef)
    const fingerprint = sum(JSON.stringify({implementation, digest, m2: input.m2.id,
      m3: input.m3.id, m2_outputs: input.m2.outputs.map(x => [x.path,x.sha256]),
      m3_outputs: input.m3.outputs.map(x => [x.path,x.sha256]),
      reference: currentRef.file.sha256, choice }))
    if (await verifiedActive(workspace, active, fingerprint, digest)) {
      return { status: 'cache-hit', manifest: active }
    }
    throw Error('Existing M7 cache incompatible/damaged; explicit --refresh-signatures required')
  }
  const ref = await acquireSignatures(workspace, {
    refresh: refreshSignatures, ...(downloadSignatures ? {download: downloadSignatures} : {}) })
  const signaturePath = await checkSignatures(workspace, ref.manifest)
  const fingerprint = sum(JSON.stringify({implementation, digest, m2: input.m2.id,
    m3: input.m3.id, m2_outputs: input.m2.outputs.map(x => [x.path,x.sha256]),
    m3_outputs: input.m3.outputs.map(x => [x.path,x.sha256]),
    reference: ref.manifest.file.sha256, choice }))
  const id = 'm7-' + Date.now() + '-' + randomUUID().slice(0, 8)
  const base = join(workspace, 'runs/m7-immune')
  const stage = join(base, '.pending-' + id), finished = join(base,id)
  await mkdir(stage, { recursive: true })
  try {
    const python = process.env.PYTHON_BINARY || (process.platform === 'win32' ? 'python' : 'python3')
    await exec(python, [join(root,'m7-immune.py'),
      input.m2files.get('tpm-unstranded.tsv'), input.m2files.get('gene-annotation.tsv'),
      input.m3files.get('cohort.tsv'), signaturePath, stage],
      { timeout: 300000, maxBuffer: 2 * 1024 * 1024 })
    const stats = await json(join(stage, 'statistics.json'))
    await writeFile(join(stage, 'report.md'), report(input, choice, ref.manifest, stats))
    const outputs = await Promise.all(names.map(async name => {
      const path = join(stage, name)
      return { path: relative(workspace, join(finished, name)).replaceAll('\\','/'),
        bytes:(await stat(path)).size, sha256:await checksum(path) }
    }))
    const manifest = {schema:1,status:'complete',implementation,id,
      created_at:new Date().toISOString(),source_digest:input.m2.source_digest,
      m2_id:input.m2.id,m3_id:input.m3.id,script_digest:digest,fingerprint,
      parameters:choice,signature_reference:ref.manifest,
      summary:stats,outputs}
    await writeFile(join(stage,'run-manifest.json'),JSON.stringify(manifest,null,2)+'\n')
    await rename(stage,finished)
    const temp=pointer+'.tmp-'+randomUUID()
    await writeFile(temp,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'})
    await rename(temp,pointer)
    return {status:'analyzed',manifest}
  } catch(e) {await rm(stage,{recursive:true,force:true});throw e}
}
