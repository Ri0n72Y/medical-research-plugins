import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { acquireKegg } from '../scripts/m5-kegg.mjs'
import { enrich } from '../scripts/m5-enrich.mjs'
import { asTsv } from '../scripts/m3-cohort.mjs'

const hash = s => createHash('sha256').update(s).digest('hex')
const rows = Array.from({ length: 20 }, (_, i) => [String(100 + i), 'hsa' + String(1000 + (i % 11))])
const linkText = rows.map(([gene, path]) => 'hsa:' + gene + '\tpath:' + path).join('\n') + '\n'
const titleText = Array.from({ length: 11 }, (_, i) =>
  'path:hsa' + (1000 + i) + '\tIllustrative pathway ' + i).join('\n') + '\n'
const fakeDownload = async url => url.includes('/link/') ? linkText : titleText
const available = spawnSync('Rscript', ['-e',
  'stopifnot(requireNamespace("clusterProfiler",quietly=TRUE),requireNamespace("org.Hs.eg.db",quietly=TRUE))'],
{ encoding: 'utf8' }).status === 0
async function base() {
  const root = await mkdtemp(join(tmpdir(), 'capn1-m5-'))
  await mkdir(join(root, 'study'), { recursive: true })
  return root
}
test('KEGG mapping is an immutable cache; explicit refresh and corruption are handled', async () => {
  const workspace = await base()
  let called = 0
  const download = async url => { called++; return fakeDownload(url) }
  const first = await acquireKegg(workspace, { download })
  assert.equal(first.status, 'downloaded')
  assert.equal(called, 2)
  const next = await acquireKegg(workspace, { download })
  assert.equal(next.status, 'cache-hit')
  assert.equal(called, 2)
  const renewed = await acquireKegg(workspace, { refresh: true, download })
  assert.equal(renewed.status, 'downloaded')
  assert.equal(called, 4)
  assert.equal(renewed.manifest.id, first.manifest.id)
  await writeFile(join(workspace, first.manifest.files.links.path), 'tampered')
  await assert.rejects(acquireKegg(workspace, { download }), /Corrupted KEGG reference/)
})
test('M5 refuses missing prior analysis before fetching KEGG', async () => {
  const workspace = await base()
  let called = false
  await assert.rejects(enrich(workspace, { download: async () => { called = true } }), /ENOENT/)
  assert.equal(called, false)
})
async function fixture() {
  const workspace = await base()
  const p = spawnSync('Rscript', ['-e', [
    'suppressPackageStartupMessages({',
    'ids <- head(AnnotationDbi::keys(org.Hs.eg.db::org.Hs.eg.db, keytype="ENSEMBL"), 500)',
    'x <- AnnotationDbi::select(org.Hs.eg.db::org.Hs.eg.db, keys=ids,',
    'columns="ENTREZID", keytype="ENSEMBL")',
    'x <- x[!is.na(x$ENTREZID) & nzchar(x$ENTREZID), ]',
    'x <- x[!duplicated(x$ENSEMBL) & !duplicated(x$ENTREZID), ]',
    'write.table(head(x, 90), sep="\\t", quote=FALSE, row.names=FALSE, col.names=FALSE)',
    '})',
  ].join('\n')], { encoding: 'utf8' })
  assert.equal(p.status, 0, p.stderr)
  const genes = p.stdout.trim().split('\n').map(s => s.split('\t'))
    .filter(x => x.length === 2 && /^ENSG/.test(x[0]) && /^\d+$/.test(x[1]))
  assert.ok(genes.length >= 25, 'Fixture needs real Ensembl→Entrez IDs from OrgDb')
  const all = genes.map(([ens], i) => ({
    gene_id: ens + '.1', test_status: i < 4 ? 'low_counts' : 'tested',
    direction: i >= 4 && i < 18 ? 'up' : 'not_significant',
    padj: i < 4 ? 'NA' : (i < 18 ? '0.001' : '0.8'),
  }))
  const significant = all.filter(x => x.direction === 'up')
  const reference = {
    links: genes.slice(4).flatMap(([ens, ent], i) => [
      [ent, 1000 + Math.floor(i / 9)],
      [ent, 1020 + Math.floor(i / 8)],
    ]).map(([ent, term]) => 'hsa:' + ent + '\tpath:hsa' + term).join('\n') + '\n',
    titles: Array.from({ length: 35 }, (_, i) =>
      'path:hsa' + (1000 + i) + '\tPathway ' + i).join('\n') + '\n',
  }
  const download = async url => url.includes('/link/') ? reference.links : reference.titles
  const folder = 'runs/m4-deg/m4-fixture'
  await mkdir(join(workspace, folder), { recursive: true })
  async function create(name, content) {
    const path = folder + '/' + name
    await writeFile(join(workspace, path), content)
    return { path, bytes: Buffer.byteLength(content), sha256: hash(content) }
  }
  const a = await create('deg-all.tsv', asTsv(['gene_id','test_status','direction','padj'], all))
  const b = await create('deg-significant.tsv', asTsv(['gene_id','test_status','direction','padj'], significant))
  const source = { status: 'complete', digest: 'fixture-source' }
  const m2 = { status: 'complete', id: 'm2-fixture', source_digest: source.digest }
  const m3 = { status: 'complete', id: 'm3-fixture', source_digest: source.digest, m2_id: m2.id }
  const m4 = { status: 'complete', id: 'm4-fixture', implementation: 'capn1-m4-deseq2-demo-v1',
    source_digest: source.digest, m2_id: m2.id, m3_id: m3.id, outputs: [a,b] }
  await Promise.all([['source',source],['processed',m2],['survival',m3],['deg',m4]]
    .map(([key,value]) => writeFile(join(workspace, 'study', key + '.json'), JSON.stringify(value))))
  return { workspace, folder, download }
}
test('M5 clusterProfiler produces GO+offline KEGG outputs, reuses cache, preserves pointer on failure', {
  skip: !available && 'clusterProfiler/org.Hs.eg.db not installed',
}, async () => {
  const { workspace, folder, download } = await fixture()
  const first = await enrich(workspace, { download })
  assert.equal(first.status, 'analyzed')
  const files = first.manifest.outputs
  assert.ok(['go-bp.tsv','go-mf.tsv','go-cc.tsv','kegg.tsv','gene-id-mapping.tsv',
    'enrichment-top.svg'].every(name => files.some(x => x.path.endsWith('/' + name))))
  const count = Object.fromEntries((await readFile(join(workspace,
    files.find(x => x.path.endsWith('/statistics.tsv')).path), 'utf8')).trim().split('\n')
    .slice(1).map(row => row.split('\t')))
  assert.ok(Number(count.mapped_tested_entrez) >= 10)
  assert.ok(Number(count.mapped_significant_entrez) > 0)
  const second = await enrich(workspace, { download: async () => { throw Error('Unexpected KEGG refetch') } })
  assert.equal(second.status, 'cache-hit')
  const third = await enrich(workspace, { rerun: true, download })
  assert.notEqual(third.manifest.id, first.manifest.id)
  await writeFile(join(workspace, folder, 'deg-all.tsv'), 'corrupted')
  await assert.rejects(enrich(workspace, { download }), /checksum mismatch/)
  const pointer = JSON.parse(await readFile(join(workspace, 'study/enrichment.json'), 'utf8'))
  assert.equal(pointer.id, third.manifest.id)
})
