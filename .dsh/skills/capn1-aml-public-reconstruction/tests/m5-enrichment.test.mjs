import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { acquireLibraries } from '../scripts/m5-kegg.mjs'
import { enrich } from '../scripts/m5-enrich.mjs'
import { asTsv } from '../scripts/m3-cohort.mjs'

const hash = text => createHash('sha256').update(text).digest('hex')
const py = process.env.PYTHON_BINARY || (process.platform === 'win32' ? 'python' : 'python3')
const available = spawnSync(py, ['-c', 'import scipy, pandas, statsmodels'], { encoding: 'utf8' }).status === 0
const names = Array.from({ length: 90 }, (_, i) => 'GENE' + (i + 1))
const gmt = Array.from({ length: 15 }, (_, i) => {
  const genes = names.slice(i * 3, i * 3 + 15)
  return ['GO/KEGG pathway ' + i, 'offline-fixture', ...genes].join('\t')
}).join('\n') + '\n'
const download = async () => gmt
async function base() {
  const workspace = await mkdtemp(join(tmpdir(), 'capn1-m5-python-'))
  await mkdir(join(workspace, 'study'), { recursive: true })
  return workspace
}
test('M5 GO/KEGG references are immutable and corruption blocks reuse', async () => {
  const workspace = await base()
  let calls = 0
  const fake = async url => { calls++; return download(url) }
  const first = await acquireLibraries(workspace, { download: fake })
  assert.equal(first.status, 'downloaded')
  assert.equal(calls, 4)
  const reused = await acquireLibraries(workspace, { download: fake })
  assert.equal(reused.status, 'cache-hit')
  assert.equal(calls, 4)
  const again = await acquireLibraries(workspace, { refresh: true, download: fake })
  assert.equal(again.manifest.id, first.manifest.id)
  assert.equal(calls, 8)
  await writeFile(join(workspace, first.manifest.files.go_bp.path), 'tampered')
  await assert.rejects(acquireLibraries(workspace, { download: fake }), /Corrupted gene-set/)
})
test('M5 rejects missing M4 before downloading annotation libraries', async () => {
  const workspace = await base()
  let calls = 0
  await assert.rejects(enrich(workspace, { download: async () => { calls++ } }), /ENOENT/)
  assert.equal(calls, 0)
})
async function fixture() {
  const workspace = await base()
  const rows = names.map((name, i) => ({
    gene_id: 'ENSG' + String(i + 1).padStart(11, '0') + '.1',
    gene_name: name, test_status: i < 4 ? 'low_counts' : 'tested',
    direction: i >= 4 && i < 25 ? 'up' : 'not_significant',
    padj: i < 4 ? 'NA' : i < 25 ? '0.001' : '0.75',
  }))
  const foreground = rows.filter(x => x.direction === 'up')
  const folder = 'runs/m4-deg/m4-python-fixture'
  await mkdir(join(workspace, folder), { recursive: true })
  async function output(name, content) {
    const path = folder + '/' + name
    await writeFile(join(workspace, path), content)
    return { path, bytes: Buffer.byteLength(content), sha256: hash(content) }
  }
  const columns = ['gene_id', 'gene_name', 'test_status', 'direction', 'padj']
  const a = await output('deg-all.tsv', asTsv(columns, rows))
  const b = await output('deg-significant.tsv', asTsv(columns, foreground))
  const source = { status: 'complete', digest: 'synthetic' }
  const m2 = { status: 'complete', id: 'm2-demo', source_digest: source.digest }
  const m3 = { status: 'complete', id: 'm3-demo', source_digest: source.digest, m2_id: m2.id }
  const m4 = { status: 'complete', id: 'm4-demo', implementation: 'capn1-m4-pydeseq2-demo-v1',
    source_digest: source.digest, m2_id: m2.id, m3_id: m3.id, outputs: [a, b] }
  await Promise.all([['source', source], ['processed', m2], ['survival', m3], ['deg', m4]]
    .map(([name, value]) => writeFile(join(workspace, 'study', name + '.json'), JSON.stringify(value))))
  return { workspace, folder }
}
test('M5 executes real Python ORA, creates all outputs, retains provenance and cache safety', {
  skip: !available && 'Python SciPy dependencies are required by CI',
}, async () => {
  const { workspace, folder } = await fixture()
  const first = await enrich(workspace, { download })
  assert.equal(first.status, 'analyzed')
  assert.ok(first.manifest.outputs.some(x => x.path.endsWith('/enrichment-top.svg')))
  const mapping = await readFile(join(workspace, first.manifest.outputs.find(x =>
    x.path.endsWith('/gene-id-mapping.tsv')).path), 'utf8')
  assert.match(mapping, /GENE5/)
  const stats = Object.fromEntries((await readFile(join(workspace, first.manifest.outputs.find(x =>
    x.path.endsWith('/statistics.tsv')).path), 'utf8')).trim().split('\n').slice(1).map(s => s.split('\t')))
  assert.equal(Number(stats.tested_gene_rows), 86)
  assert.ok(Number(stats.mapped_significant_symbols) >= 20)
  const svg = await readFile(join(workspace, first.manifest.outputs.find(x =>
    x.path.endsWith('/enrichment-top.svg')).path), 'utf8')
  assert.match(svg, /<svg/)
  assert.equal((await enrich(workspace, { download: async () => { throw Error('Unexpected refetch') } })).status,
    'cache-hit')
  const again = await enrich(workspace, { rerun: true, download })
  assert.notEqual(again.manifest.id, first.manifest.id)
  await writeFile(join(workspace, folder, 'deg-all.tsv'), 'tampered')
  await assert.rejects(enrich(workspace, { download }), /checksum mismatch/)
  const pointer = JSON.parse(await readFile(join(workspace, 'study/enrichment.json'), 'utf8'))
  assert.equal(pointer.id, again.manifest.id)
})
