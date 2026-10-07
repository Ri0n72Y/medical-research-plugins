import assert from 'node:assert/strict'
import { mkdtemp, readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { initializeWorkspace } from '../scripts/init-workspace.mjs'
import { acquireSource } from '../scripts/gdc-source.mjs'
import { casesUrl, clinicalDigest, fileFilters, filesUrl, sourceDigest } from '../scripts/lib/gdc.mjs'

function jsonResponse(value) {
  return new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } })
}

function fixture() {
  const body = Buffer.from('gene\tcount\nCAPN1\t10\n')
  return {
    body,
    files: {
      data: { hits: [{
        file_id: 'file-1', file_name: 'sample.tsv', file_size: body.length,
        md5sum: 'd3894bb530e8effd8dd99eb9817c61dc', data_format: 'TSV', access: 'open',
        analysis: { workflow_type: 'STAR - Counts' },
        cases: [{ case_id: 'case-1', submitter_id: 'TCGA-AB-0001' }],
      }] },
    },
    cases: { data: { hits: [{ case_id: 'case-1', submitter_id: 'TCGA-AB-0001' }] } },
  }
}

function mockFetch(fx, calls) {
  return async url => {
    calls.push(String(url))
    if (String(url).includes('/files?')) return jsonResponse(fx.files)
    if (String(url).includes('/cases?')) return jsonResponse(fx.cases)
    if (String(url).endsWith('/data/file-1')) return new Response(fx.body, { status: 200 })
    throw new Error(`unexpected URL ${url}`)
  }
}

test('GDC query is narrowly scoped to public TCGA-LAML STAR Counts', () => {
  const filters = fileFilters()
  assert.equal(filters.op, 'and')
  assert.match(filesUrl(), /api\.gdc\.cancer\.gov\/files/)
  assert.match(casesUrl(), /api\.gdc\.cancer\.gov\/cases/)
  assert.ok(JSON.stringify(filters).includes('TCGA-LAML'))
  assert.ok(JSON.stringify(filters).includes('STAR - Counts'))
  assert.ok(JSON.stringify(filters).includes('open'))
})

test('source digest includes clinical content and remains stable for the same source', () => {
  const files = [{ file_id: 'a' }, { file_id: 'b' }]
  const clinicalA = clinicalDigest({ data: { hits: [{ case_id: '1', demographic: { gender: 'female' } }] } })
  const clinicalB = clinicalDigest({ data: { hits: [{ case_id: '1', demographic: { gender: 'male' } }] } })
  assert.equal(sourceDigest(files, clinicalA), sourceDigest(files, clinicalA))
  assert.notEqual(sourceDigest(files, clinicalA), sourceDigest(files, clinicalB))
})

test('workspace initialization is non-destructive', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'capn1-init-'))
  const first = await initializeWorkspace(workspace)
  const second = await initializeWorkspace(workspace)
  assert.equal(first.status, 'initialized')
  assert.equal(second.status, 'existing')
  assert.ok(second.reused.includes('study/reconstruction.yaml'))
})

test('first acquisition downloads and second acquisition hits local cache without network', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'capn1-source-'))
  await initializeWorkspace(workspace)
  const fx = fixture()
  const calls = []
  const first = await acquireSource({ workspace, fetchImpl: mockFetch(fx, calls), concurrency: 2 })
  assert.equal(first.status, 'downloaded')
  assert.equal(first.downloaded, 1)
  assert.equal(calls.length, 3)

  const secondCalls = []
  const second = await acquireSource({ workspace, fetchImpl: async url => {
    secondCalls.push(url)
    throw new Error('network should not be used')
  } })
  assert.equal(second.status, 'cache-hit')
  assert.equal(secondCalls.length, 0)
  assert.equal((await stat(join(workspace, second.source.files[0].path))).size, fx.body.length)
})

test('explicit refresh re-queries but does not redownload an unchanged snapshot', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'capn1-refresh-'))
  await initializeWorkspace(workspace)
  const fx = fixture()
  await acquireSource({ workspace, fetchImpl: mockFetch(fx, []) })

  const calls = []
  const refreshed = await acquireSource({ workspace, refresh: true, fetchImpl: mockFetch(fx, calls) })
  assert.equal(refreshed.status, 'refresh-unchanged')
  assert.equal(calls.length, 2)
  assert.ok(calls.every(url => !url.includes('/data/file-1')))

  const source = JSON.parse(await readFile(join(workspace, 'study/source.json'), 'utf8'))
  assert.equal(source.status, 'complete')
  const status = await readFile(join(workspace, 'study/status.md'), 'utf8')
  assert.match(status, /re-queried/)
})

test('partial acquisition resumes from the saved manifest without re-querying GDC', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'capn1-resume-'))
  await initializeWorkspace(workspace)
  const fx = fixture()
  const secondBody = Buffer.from('gene\tcount\nCAPN1\t20\n')
  fx.files.data.hits.push({
    file_id: 'file-2', file_name: 'sample-2.tsv', file_size: secondBody.length,
    md5sum: 'ef27b2f064cdd391033492a689c310eb', data_format: 'TSV', access: 'open',
    analysis: { workflow_type: 'STAR - Counts' },
    cases: [{ case_id: 'case-1', submitter_id: 'TCGA-AB-0001' }],
  })

  await assert.rejects(acquireSource({
    workspace, concurrency: 1, fetchImpl: async url => {
      if (String(url).includes('/files?')) return jsonResponse(fx.files)
      if (String(url).includes('/cases?')) return jsonResponse(fx.cases)
      if (String(url).endsWith('/data/file-1')) return new Response(fx.body, { status: 200 })
      throw new Error('simulated interrupted download')
    },
  }))
  const partial = JSON.parse(await readFile(join(workspace, 'study/source-pending.json'), 'utf8'))
  assert.equal(partial.status, 'partial')

  const calls = []
  const resumed = await acquireSource({
    workspace, concurrency: 1, fetchImpl: async url => {
      calls.push(String(url))
      if (String(url).endsWith('/data/file-2')) return new Response(secondBody, { status: 200 })
      if (String(url).endsWith('/data/file-1')) return new Response(fx.body, { status: 200 })
      throw new Error(`resume must not re-query GDC: ${url}`)
    },
  })
  assert.equal(resumed.status, 'resumed-complete')
  assert.ok(calls.every(url => url.includes('/data/')))
})

test('failed refresh preserves the previous complete active source', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'capn1-refresh-fail-'))
  await initializeWorkspace(workspace)
  const fx = fixture()
  const first = await acquireSource({ workspace, fetchImpl: mockFetch(fx, []) })
  const activeBefore = JSON.parse(await readFile(join(workspace, 'study/source.json'), 'utf8'))

  const changedBody = Buffer.from('gene\tcount\nCAPN1\t30\n')
  const changed = fixture()
  changed.files.data.hits[0] = {
    ...changed.files.data.hits[0],
    file_id: 'file-changed',
    file_name: 'changed.tsv',
    file_size: changedBody.length,
    md5sum: 'ac59ea3ab9664e5387c280790224b1ee',
  }
  await assert.rejects(acquireSource({
    workspace, refresh: true, fetchImpl: async url => {
      if (String(url).includes('/files?')) return jsonResponse(changed.files)
      if (String(url).includes('/cases?')) return jsonResponse(changed.cases)
      throw new Error('simulated changed-source download failure')
    },
  }))

  const activeAfter = JSON.parse(await readFile(join(workspace, 'study/source.json'), 'utf8'))
  assert.equal(activeAfter.snapshot, activeBefore.snapshot)
  assert.equal(activeAfter.snapshot, first.snapshot)
  const pending = JSON.parse(await readFile(join(workspace, 'study/source-pending.json'), 'utf8'))
  assert.equal(pending.status, 'partial')
  assert.notEqual(pending.snapshot, activeAfter.snapshot)
})
