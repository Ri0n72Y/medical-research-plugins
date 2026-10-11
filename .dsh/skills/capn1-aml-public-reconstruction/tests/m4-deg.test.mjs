import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { analyzeDeg } from '../scripts/m4-deg.mjs'
import { asTsv } from '../scripts/m3-cohort.mjs'

const hash = value => createHash('sha256').update(value).digest('hex')
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'capn1-m4-'))
  const m2Root = 'data/processed/gdc-fixture/m2-fixture'
  const m3Root = 'runs/m3-survival/m3-fixture'
  const cases = Array.from({ length: 10 }, (_, i) => ({
    case_id: 'case-' + i, file_id: 'file-' + i, group: i < 5 ? 'low' : 'high',
  }))
  const genes = Array.from({ length: 260 }, (_, i) => ({
    gene_id: 'ENSG' + String(i + 1).padStart(11, '0') + '.1',
    gene_name: i === 1 ? 'CAPN1' : 'G' + i,
    gene_type: 'protein_coding',
  }))
  const counts = genes.map((gene, i) => Object.fromEntries([
    ['gene_id', gene.gene_id],
    ...cases.map((sample, j) => {
      const base = i >= 245 ? 0 : 40 + (i % 39) * 5
      const groupFold = i < 40 && j >= 5 ? 2.5 : 1
      const sampleVariation = 0.35 + (((i + 1) * 29 + j * 19 + i * j * 7) % 100) / 60
      return [sample.file_id, Math.round(base * groupFold * sampleVariation)]
    }),
  ]))
  await mkdir(join(root, m2Root), { recursive: true })
  await mkdir(join(root, m3Root), { recursive: true })
  await mkdir(join(root, 'study'), { recursive: true })
  async function item(folder, name, content) {
    const path = folder + '/' + name
    await writeFile(join(root, path), content)
    return { path, bytes: Buffer.byteLength(content), sha256: hash(content) }
  }
  const a = await item(m2Root, 'counts-unstranded.tsv',
    asTsv(['gene_id', ...cases.map(s => s.file_id)], counts))
  const b = await item(m2Root, 'gene-annotation.tsv',
    asTsv(['gene_id','gene_name','gene_type'], genes))
  const c = await item(m3Root, 'cohort.tsv', asTsv(['case_id','file_id','group'], cases))
  const source = { status: 'complete', digest: 'demo-gdc' }
  const m2 = { status: 'complete', id: 'm2-fixture', source_digest: source.digest, outputs: [a,b] }
  const m3 = { status: 'complete', id: 'm3-fixture', implementation: 'capn1-m3-survival-demo-v1',
    m2_id: m2.id, source_digest: source.digest, outputs: [c] }
  await writeFile(join(root, 'study/source.json'), JSON.stringify(source))
  await writeFile(join(root, 'study/processed.json'), JSON.stringify(m2))
  await writeFile(join(root, 'study/survival.json'), JSON.stringify(m3))
  return { root, m2Root, m3Root }
}
test('M4 rejects invalid FDR and log2FC thresholds before touching a workspace', async () => {
  await assert.rejects(analyzeDeg('/does/not/exist', { alpha: 1 }), /Invalid DEG thresholds/)
  await assert.rejects(analyzeDeg('/does/not/exist', { lfc: -1 }), /Invalid DEG thresholds/)
})
test('M4 fails on incompatible M3 lineage or missing/corrupt M2 counts', async () => {
  const { root, m2Root } = await fixture()
  const pointer = join(root, 'study/survival.json')
  const m3 = JSON.parse(await readFile(pointer, 'utf8'))
  m3.m2_id = 'different'
  await writeFile(pointer, JSON.stringify(m3))
  await assert.rejects(analyzeDeg(root), /matching active M2\/M3 lineage/)
  m3.m2_id = 'm2-fixture'
  await writeFile(pointer, JSON.stringify(m3))
  await writeFile(join(root, m2Root, 'counts-unstranded.tsv'), 'tampered')
  await assert.rejects(analyzeDeg(root), /checksum mismatch/)
})
const haveR = spawnSync('Rscript', [
  '-e', 'quit(status=if (requireNamespace("DESeq2", quietly=TRUE)) 0 else 1)',
], { encoding: 'utf8' }).status === 0
test('M4 runs real DESeq2 on synthetic counts, caches results, preserves pointer on failure', {
  skip: !haveR && 'R/DESeq2 unavailable; CI must provision DESeq2',
}, async () => {
  const { root, m2Root } = await fixture()
  const initial = await analyzeDeg(root)
  assert.equal(initial.status, 'analyzed')
  assert.equal(initial.manifest.parameters.method, 'DESeq2')
  assert.ok(initial.manifest.runtime.dispersion_fit)
  assert.equal(initial.manifest.groups.high, 5)
  assert.equal(initial.manifest.groups.low, 5)
  assert.equal(Number(initial.manifest.summary.total_genes), 260)
  const names = initial.manifest.outputs.map(o => o.path.split('/').at(-1))
  for (const expected of ['deg-all.tsv','deg-significant.tsv','volcano.svg','report.md']) {
    assert.ok(names.includes(expected))
  }
  const results = await readFile(join(root,
    initial.manifest.outputs.find(o => o.path.endsWith('/deg-all.tsv')).path), 'utf8')
  assert.match(results, /log2FoldChange/)
  assert.match(results, /low_counts/)
  assert.equal((await analyzeDeg(root)).status, 'cache-hit')
  const later = await analyzeDeg(root, { rerun: true })
  assert.notEqual(initial.manifest.id, later.manifest.id)
  await writeFile(join(root, m2Root, 'counts-unstranded.tsv'), 'corruption')
  await assert.rejects(analyzeDeg(root), /checksum mismatch/)
  const active = JSON.parse(await readFile(join(root, 'study/deg.json'), 'utf8'))
  assert.equal(active.id, later.manifest.id)
})
