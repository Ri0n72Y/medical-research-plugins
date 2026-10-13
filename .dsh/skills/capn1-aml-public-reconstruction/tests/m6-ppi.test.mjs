import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { analyzePpi } from '../scripts/m6-ppi.mjs'
import { asTsv, parseTsv } from '../scripts/m3-cohort.mjs'

const hash = data => createHash('sha256').update(data).digest('hex')
const genes = [
  ['ENSG1', 'TP53', 'protein_coding', 'up', '0.002'],
  ['ENSG2', 'EGFR', 'protein_coding', 'down', '0.003'],
  ['ENSG3', 'MYC', 'protein_coding', 'up', '0.004'],
  ['ENSG4', 'CDK1', 'protein_coding', 'down', '0.005'],
  ['ENSG5', 'UNKNOWNX', 'protein_coding', 'up', '0.006'],
  ['ENSG6', 'LNC1', 'lncRNA', 'up', '0.008'],
]
const ids = ['9606.ENSP000001', '9606.ENSP000002', '9606.ENSP000003', '9606.ENSP000004']
const columns = ['gene_id', 'gene_name', 'gene_type', 'direction', 'padj']
async function fixture() {
  const ws = await mkdtemp(join(tmpdir(), 'capn1-m6-'))
  await mkdir(join(ws, 'study'), { recursive: true })
  await mkdir(join(ws, 'runs/m4-deg/m4-fixture'), { recursive: true })
  const text = asTsv(columns, genes.map(r => Object.fromEntries(columns.map((c, i) => [c, r[i]]))))
  const path = 'runs/m4-deg/m4-fixture/deg-significant.tsv'
  await writeFile(join(ws, path), text)
  const source = { status: 'complete', digest: 'source-demo' }
  const m2 = { status: 'complete', id: 'm2-1', source_digest: source.digest }
  const m3 = { status: 'complete', id: 'm3-1', m2_id: m2.id, source_digest: source.digest }
  const m4 = { status: 'complete', id: 'm4-1', m2_id: m2.id, m3_id: m3.id,
    implementation: 'capn1-m4-pydeseq2-demo-v1',
    source_digest: source.digest, parameters: { alpha: 0.05 },
    outputs: [{ path, bytes: Buffer.byteLength(text), sha256: hash(text) }] }
  await Promise.all([['source', source], ['processed', m2], ['survival', m3], ['deg', m4]]
    .map(([name, value]) => writeFile(join(ws, 'study', name + '.json'), JSON.stringify(value))))
  const mapping = join(ws, 'mapped.tsv')
  const network = join(ws, 'network.tsv')
  const body = asTsv(['queryIndex','queryItem','stringId','preferredName'],
    ['TP53','EGFR','MYC','CDK1'].map((name, i) =>
      ({ queryIndex: i, queryItem: name, stringId: ids[i], preferredName: name })))
  const edges = asTsv(['stringId_A','stringId_B','score','ncbiTaxonId','nscore'],
    [[0,1,0.89], [0,2,0.55], [1,2,0.2]].map(([a,b,score]) =>
      ({stringId_A: ids[a], stringId_B: ids[b], score, ncbiTaxonId: 9606, nscore: 0.2})))
  await writeFile(mapping, body)
  await writeFile(network, edges)
  return {ws, path, mapping, network}
}
const opts = f => ({ requiredScore: 400,
  fixtures: { mapping: f.mapping, network: f.network } })
const get = async (f, manifest, suffix) => readFile(join(f.ws,
  manifest.outputs.find(x => x.path.endsWith('/' + suffix)).path), 'utf8')

test('M6 requires explicit D4 score, a valid upstream lineage and intact M4 files', async () => {
  const f = await fixture()
  await assert.rejects(analyzePpi(f.ws), /D4 unresolved/)
  await assert.rejects(analyzePpi(f.ws, {...opts(f), requiredScore: -1}), /integer 0..1000/)
  const m4path = join(f.ws, 'study/deg.json')
  const m4 = JSON.parse(await readFile(m4path, 'utf8'))
  m4.m3_id = 'different'
  await writeFile(m4path, JSON.stringify(m4))
  await assert.rejects(analyzePpi(f.ws, opts(f)), /M2\/M3\/M4 lineage/)
  m4.m3_id = 'm3-1'
  await writeFile(m4path, JSON.stringify(m4))
  await writeFile(join(f.ws, f.path), 'corrupt')
  await assert.rejects(analyzePpi(f.ws, opts(f)), /checksum mismatch/)
})

test('M6 derives Python NetworkX metrics from offline STRING, retains isolates, caches and preserves last-good', async () => {
  const f = await fixture()
  const first = await analyzePpi(f.ws, opts(f))
  assert.equal(first.status, 'analyzed')
  assert.equal(first.manifest.parameters.requiredScore, 400)
  assert.equal(first.manifest.summary.metrics.mapped_proteins, 4)
  assert.equal(first.manifest.summary.metrics.edges, 2)
  assert.equal(first.manifest.summary.metrics.isolated_proteins, 1)
  const nodes = parseTsv(await get(f, first.manifest, 'ppi-nodes.tsv'), ['string_id', 'degree', 'isolated'])
  assert.equal(nodes.length, 4)
  assert.equal(nodes.find(x => x.string_id === ids[3]).isolated, '1')
  const edges = parseTsv(await get(f, first.manifest, 'ppi-edges.tsv'),
    ['string_id_a','string_id_b','score','score_1000'])
  assert.equal(edges.length, 2)
  assert.ok(edges.every(x => Number(x.score_1000) >= 400))
  assert.match(await get(f, first.manifest, 'ppi-network.svg'), /<svg/)
  assert.match(await get(f, first.manifest, 'input-genes.tsv'), /not_protein_coding/)
  assert.match(await get(f, first.manifest, 'string-id-mapping.tsv'), /unmapped/)
  assert.equal((await analyzePpi(f.ws, opts(f))).status, 'cache-hit')
  await writeFile(f.network, 'INVALID')
  await assert.rejects(analyzePpi(f.ws, { ...opts(f), refreshString: true }), /STRING network headers/)
  const pointer = JSON.parse(await readFile(join(f.ws, 'study/ppi.json'), 'utf8'))
  assert.equal(pointer.id, first.manifest.id)
})

test('M6 accepts a valid zero-edge STRING network but no invented neighbors', async () => {
  const f = await fixture()
  await writeFile(f.network, 'stringId_A\tstringId_B\tscore\n')
  const result = await analyzePpi(f.ws, opts(f))
  assert.equal(result.manifest.summary.metrics.edges, 0)
  assert.equal(result.manifest.summary.metrics.isolated_proteins, 4)
  assert.match(await get(f, result.manifest, 'ppi-edges.tsv'), /score_1000/)
  await writeFile(f.network, 'stringId_A\tstringId_B\tscore\n' +
    ids[0] + '\t9606.ENSP999999\t0.90\n')
  await assert.rejects(analyzePpi(f.ws, {...opts(f), refreshString: true}), /expanded input nodes/)
})

test('M6 checks researcher D4 selection in workspace and refuses conflicts', async () => {
  const f = await fixture()
  await writeFile(join(f.ws, 'study/decisions.yaml'),
    'decisions:\n  D4:\n    status: selected\n    selected: 700\n')
  await assert.rejects(analyzePpi(f.ws, opts(f)), /conflicts with active D4/)
  const outcome = await analyzePpi(f.ws, { ...opts(f), requiredScore: 700 })
  assert.equal(outcome.manifest.parameters.selection, 'study-D4')
  assert.equal(outcome.manifest.summary.metrics.edges, 1)
})


test('M6 singleton mapping never expands to external STRING neighbors', async () => {
  const f = await fixture()
  const mapping = asTsv(['queryIndex','queryItem','stringId','preferredName'],
    [{queryIndex: 0, queryItem: 'TP53', stringId: ids[0], preferredName: 'TP53'}])
  await writeFile(f.mapping, mapping)
  // A network response with provider-expanded neighbors must NOT be requested
  // for a single resolved identifier.
  await writeFile(f.network, 'THIS NETWORK RESPONSE MUST NOT BE USED')
  const result = await analyzePpi(f.ws, opts(f))
  assert.equal(result.manifest.summary.metrics.mapped_proteins, 1)
  assert.equal(result.manifest.summary.metrics.edges, 0)
  assert.equal(result.manifest.summary.metrics.isolated_proteins, 1)
  const nodeRows = parseTsv(await get(f, result.manifest, 'ppi-nodes.tsv'),
    ['string_id', 'query_gene', 'isolated'])
  assert.deepEqual(nodeRows.map(x => x.query_gene), ['TP53'])
  const reqs = JSON.parse(await get(f, result.manifest, 'string-requests.json'))
  assert.equal(reqs.network_mode, 'singleton-input-only')
  assert.equal(reqs.mapping.limit, undefined)
  assert.match(reqs.mapping_method, /one best match/)
  assert.match(await get(f, result.manifest, 'string-id-mapping.tsv'), /string_best_match/)
})


test('M6 fails closed on damaged or incompatible active cache until explicit STRING refresh', async () => {
  const f = await fixture()
  const initial = await analyzePpi(f.ws, opts(f))
  const pointerFile = join(f.ws, 'study/ppi.json')
  const prior = await readFile(pointerFile, 'utf8')
  // Keep both offline provider fixtures valid: absent a fail-closed guard,
  // an unrequested second analysis would succeed and replace the pointer.
  const metrics = initial.manifest.outputs.find(item => item.path.endsWith('/ppi-metrics.tsv'))
  await writeFile(join(f.ws, metrics.path), 'corrupt')
  await assert.rejects(analyzePpi(f.ws, opts(f)), /cache is incompatible or damaged.*--refresh-string/)
  assert.equal(await readFile(pointerFile, 'utf8'), prior)
  // A different chosen confidence also requires an explicit new provider request.
  await assert.rejects(analyzePpi(f.ws, { ...opts(f), requiredScore: 700 }),
    /cache is incompatible or damaged.*--refresh-string/)
  assert.equal(await readFile(pointerFile, 'utf8'), prior)
  // The existing pointer is preserved until a full refresh completes.
  const refreshed = await analyzePpi(f.ws, { ...opts(f), refreshString: true })
  assert.equal(refreshed.status, 'analyzed')
  assert.notEqual(refreshed.manifest.id, initial.manifest.id)
  assert.equal((await analyzePpi(f.ws, opts(f))).status, 'cache-hit')
})

test('M6 requires selected D4 status and rejects unresolved numeric selections', async () => {
  const f = await fixture()
  const file = join(f.ws, 'study/decisions.yaml')
  await writeFile(file, 'decisions:\n  D4:\n    status: unresolved\n    selected: 400\n')
  await assert.rejects(analyzePpi(f.ws), /requires status: selected or approved/)
  await assert.rejects(analyzePpi(f.ws, opts(f)), /requires status: selected or approved/)
  await writeFile(file, 'decisions:\n  D4:\n    status: demo-default\n    selected: 400\n')
  await assert.rejects(analyzePpi(f.ws, opts(f)), /requires status: selected or approved/)
  await writeFile(file, 'decisions:\n  D4:\n    status: selected\n    selected: null\n')
  await assert.rejects(analyzePpi(f.ws, opts(f)), /marked selected but has no numeric selected/)
  // The proposed default is not chosen; an explicit CLI run is permitted.
  await writeFile(file, 'decisions:\n  D4:\n    status: unresolved\n    proposed_default: 400\n    selected: null\n')
  const result = await analyzePpi(f.ws, opts(f))
  assert.equal(result.manifest.parameters.selection, 'explicit-run-parameter')
})

test('M6 identifies STRING provider best matches without asserting unique biological identity', async () => {
  const f = await fixture()
  const result = await analyzePpi(f.ws, opts(f))
  const rows = parseTsv(await get(f, result.manifest, 'string-id-mapping.tsv'),
    ['queryItem', 'stringId', 'preferredName', 'status', 'reason'])
  const tp53 = rows.find(row => row.queryItem === 'TP53')
  assert.equal(tp53.status, 'string_best_match')
  assert.equal(tp53.reason, '')
  const report = await get(f, result.manifest, 'report.md')
  assert.match(report, /best match per query/)
  assert.doesNotMatch(report, /Unambiguously mapped STRING proteins/)
  const params = JSON.parse(await get(f, result.manifest, 'string-requests.json'))
  assert.equal(params.mapping.limit, undefined)
  assert.match(params.mapping_method, /no independent uniqueness verification/)
  // Even if a future server returns multiple IDs for one symbol, exclude it.
  const base = await readFile(f.mapping, 'utf8')
  await writeFile(f.mapping, base + '0\tTP53\t9606.ENSP000099999\tTP53\n')
  await writeFile(f.network, 'stringId_A\tstringId_B\tscore\n')
  const revised = await analyzePpi(f.ws, { ...opts(f), refreshString: true })
  const candidates = parseTsv(await get(f, revised.manifest, 'string-id-mapping.tsv'),
    ['queryItem', 'stringId', 'status', 'reason'])
  const rejected = candidates.find(x => x.queryItem === 'TP53')
  assert.equal(rejected.status, 'excluded')
  assert.equal(rejected.reason, 'ambiguous_string_id')
  assert.equal(revised.manifest.summary.metrics.mapped_proteins, 3)
})
