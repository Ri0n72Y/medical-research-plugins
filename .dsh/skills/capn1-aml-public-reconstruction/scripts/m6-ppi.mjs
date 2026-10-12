#!/usr/bin/env node
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const exec = promisify(execFile)
const root = dirname(fileURLToPath(import.meta.url))
const implementation = 'capn1-m6-string-python-networkx-v1'
const outputNames = [
  'input-genes.tsv', 'string-id-mapping-raw.tsv', 'string-id-mapping.tsv',
  'string-network-raw.tsv', 'string-requests.json', 'statistics.json',
  'ppi-nodes.tsv', 'ppi-edges.tsv', 'ppi-metrics.tsv', 'ppi-network.svg',
  'runtime.tsv', 'report.md',
]
const sum = value => createHash('sha256').update(value).digest('hex')
async function fileHash(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}
function safe(workspace, name) {
  if (typeof name !== 'string' || !name || name.includes('\\')) throw Error('Invalid artifact path')
  const full = resolve(workspace, name)
  if (!full.startsWith(resolve(workspace) + sep)) throw Error('Artifact escapes workspace')
  return full
}
async function json(path) { return JSON.parse(await readFile(path, 'utf8')) }
async function checked(workspace, manifest, required) {
  if (manifest?.status !== 'complete' || !Array.isArray(manifest.outputs)) throw Error('Incomplete input run')
  const found = new Map()
  for (const entry of manifest.outputs) {
    const location = safe(workspace, entry.path)
    if (found.has(entry.path.split('/').at(-1))) throw Error('Duplicate output name')
    if ((await stat(location)).size !== entry.bytes || await fileHash(location) !== entry.sha256) {
      throw Error('Input artifact checksum mismatch: ' + entry.path)
    }
    found.set(entry.path.split('/').at(-1), location)
  }
  for (const name of required) if (!found.has(name)) throw Error('Missing prerequisite: ' + name)
  return found
}
async function upstream(workspace) {
  const [source, m2, m3, m4] = await Promise.all(
    ['source', 'processed', 'survival', 'deg'].map(name => json(join(workspace, 'study', name + '.json'))))
  if (source.status !== 'complete' || m2.source_digest !== source.digest ||
      m3.source_digest !== source.digest || m4.source_digest !== source.digest ||
      m3.m2_id !== m2.id || m4.m2_id !== m2.id || m4.m3_id !== m3.id ||
      !String(m4.implementation).startsWith('capn1-m4-pydeseq2-')) {
    throw Error('M6 requires compatible active Python M2/M3/M4 lineage')
  }
  const files = await checked(workspace, m4, ['deg-significant.tsv'])
  return { m2, m3, m4, files }
}
async function codeHash() {
  const parts = await Promise.all(['m6-ppi.mjs', 'm6-string.py'].map(async x =>
    [x, await readFile(join(root, x), 'utf8')]))
  return sum(JSON.stringify(parts))
}
function readSelectedD4(text) {
  // D4 is a fixed, scalar-valued project decision; do not parse arbitrary YAML here.
  const block = text.match(/^  D4:\r?\n((?:    [^\r\n]*\r?\n)*)/m)?.[1] ?? ''
  const match = block.match(/^    selected:\s*(\d+)\s*$/m)
  return match ? Number(match[1]) : null
}
async function d4Selection(workspace, requiredScore) {
  let selected = null
  try { selected = readSelectedD4(await readFile(join(workspace, 'study/decisions.yaml'), 'utf8')) }
  catch (error) { if (error.code !== 'ENOENT') throw error }
  if (requiredScore === null || requiredScore === undefined) {
    if (selected === null) throw Error('D4 unresolved: supply an explicit --required-score 0..1000')
    requiredScore = selected
  }
  if (!Number.isInteger(requiredScore) || requiredScore < 0 || requiredScore > 1000) {
    throw Error('STRING required_score must be an integer 0..1000')
  }
  if (selected !== null && selected !== requiredScore) {
    throw Error('Requested STRING score conflicts with active D4 selection')
  }
  return { requiredScore, selection: selected === null ? 'explicit-run-parameter' : 'study-D4' }
}
async function cacheHit(workspace, current, fingerprint, digest) {
  if (current?.status !== 'complete' || current.fingerprint !== fingerprint ||
      current.script_digest !== digest || current.outputs?.length !== outputNames.length) return false
  try { await checked(workspace, current, outputNames); return true } catch { return false }
}
function report(input, statistics, config, mode) {
  const { metrics } = statistics
  return [
    '# CAPN1 / TCGA-LAML — M6 STRING Functional Association', '',
    'Exploratory public workflow reconstruction; STRING associations do not prove physical binding or causation.', '',
    '## Provenance',
    '- M4 DEG run: ' + input.m4.id,
    '- Source M3 cohort run: ' + input.m3.id,
    '- STRING: version-12-5.string-db.org, human species 9606.',
    '- Retrieval: ' + mode,
    '- D4 confidence: ' + config.requiredScore + '/1000 (' + config.selection + ').',
    '- Network type: functional; no external neighbor expansion (add_nodes=0).', '',
    '## Results',
    '- Significant genes submitted: ' + statistics.submitted_genes,
    '- Protein-coding unique symbols submitted: ' + statistics.eligible_symbols,
    '- Unambiguously mapped STRING proteins: ' + metrics.mapped_proteins,
    '- STRING association edges: ' + metrics.edges,
    '- Disconnected proteins: ' + metrics.isolated_proteins,
    '- Components: ' + metrics.connected_components,
    '- Largest component: ' + metrics.largest_component, '',
    '## Method and limitations',
    '- Protein-coding M4 significant DEG symbols; ambiguous identifiers excluded.',
    '- STRING IDs are resolved explicitly before querying input-only network associations.',
    '- Edge threshold is expressed 0–1000; API score is 0–1 and is converted explicitly.',
    '- NetworkX computes undirected degree and connected components; all mapped isolates retained.',
    '- SVG is a deterministic overview of up to 60 nodes ranked by degree, not a complete graph.',
    '- No adjusted clinical effect, mechanistic validation, or direct physical binding is inferred.', '',
    'See input-genes.tsv, string-id-mapping.tsv, ppi-nodes.tsv, ppi-edges.tsv, ppi-metrics.tsv.',
    ''
  ].join('\n')
}
export async function analyzePpi(workspace, { requiredScore = null, refreshString = false,
  fixtures } = {}) {
  const input = await upstream(workspace)
  const config = await d4Selection(workspace, requiredScore)
  if (fixtures && (!fixtures.mapping || !fixtures.network)) throw Error('Need both offline fixtures')
  const scriptDigest = await codeHash()
  const fixtureDigest = fixtures
    ? [await fileHash(fixtures.mapping), await fileHash(fixtures.network)] : null
  const fingerprint = sum(JSON.stringify({ implementation, scriptDigest,
    m4: input.m4.id, outputs: input.m4.outputs.map(x => [x.path, x.sha256]),
    provider: 'https://version-12-5.string-db.org/api', species: 9606,
    network: 'functional', addNodes: 0, ...config, fixtureDigest }))
  const pointer = join(workspace, 'study/ppi.json')
  let active
  try { active = await json(pointer) }
  catch (error) { if (error.code !== 'ENOENT') throw error }
  if (!refreshString && await cacheHit(workspace, active, fingerprint, scriptDigest)) {
    return { status: 'cache-hit', manifest: active }
  }
  const base = join(workspace, 'runs/m6-ppi')
  const id = 'm6-' + Date.now() + '-' + randomUUID().slice(0, 8)
  const stage = join(base, '.pending-' + id)
  const published = join(base, id)
  await mkdir(stage, { recursive: true })
  try {
    const python = process.env.PYTHON_BINARY || (process.platform === 'win32' ? 'python' : 'python3')
    const args = [join(root, 'm6-string.py'), input.files.get('deg-significant.tsv'),
      stage, '--required-score', String(config.requiredScore),
      '--m4-fdr', String(input.m4.parameters?.alpha)]
    if (fixtures) args.push('--mapping-fixture', fixtures.mapping, '--network-fixture', fixtures.network)
    await exec(python, args, { timeout: 180000, maxBuffer: 2 * 1024 * 1024 })
    const stats = await json(join(stage, 'statistics.json'))
    const requests = await json(join(stage, 'string-requests.json'))
    if (Boolean(fixtures) !== (requests.source_mode === 'offline-fixture')) {
      throw Error('M6 STRING request mode does not match provenance')
    }
    await writeFile(join(stage, 'report.md'), report(input, stats, config, requests.source_mode))
    const outputs = await Promise.all(outputNames.map(async name => {
      const location = join(stage, name)
      return { path: relative(workspace, join(published, name)).replaceAll('\\', '/'),
        bytes: (await stat(location)).size, sha256: await fileHash(location) }
    }))
    const manifest = { schema: 1, status: 'complete', implementation, id,
      created_at: new Date().toISOString(), source_digest: input.m4.source_digest,
      m2_id: input.m2.id, m3_id: input.m3.id, m4_id: input.m4.id,
      fingerprint, script_digest: scriptDigest, parameters: { ...config,
        network_type: 'functional', species: 9606, provider: requests.provider,
        mode: requests.source_mode }, summary: stats, outputs }
    await writeFile(join(stage, 'run-manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
    await rename(stage, published)
    const temp = pointer + '.tmp-' + randomUUID()
    await writeFile(temp, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' })
    await rename(temp, pointer)
    return { status: 'analyzed', manifest }
  } catch (error) {
    await rm(stage, { recursive: true, force: true })
    throw error
  }
}
