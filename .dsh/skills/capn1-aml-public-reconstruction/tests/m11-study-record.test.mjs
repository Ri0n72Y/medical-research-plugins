import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { generateStudyRecord } from '../scripts/m11-study-record.mjs'

async function workspace() {
  const ws=await mkdtemp(join(tmpdir(),'capn1-m11-'))
  await mkdir(join(ws,'study'),{recursive:true})
  await writeFile(join(ws,'study/decisions.yaml'),
    'decisions:\n  D4:\n    status: unresolved\n    selected: null\n')
  return ws
}
async function put(ws, pointer, values) {
  await writeFile(join(ws,'study',pointer+'.json'),JSON.stringify(values))
}
async function output(ws, run, name) {
  const relative=run.outputs.find(x=>x.path.endsWith('/'+name)).path
  return readFile(join(ws,relative),'utf8')
}
test('Empty workspace unfolds paper-derived workflow without inventing results',async()=>{
  const ws=await workspace()
  const first=await generateStudyRecord(ws)
  assert.equal(first.status,'generated')
  assert.equal(first.manifest.summary.total,11)
  assert.equal(first.manifest.summary.recorded,0)
  const md=await output(ws,first.manifest,'study-record.md')
  assert.match(md,/Pan-cancer CAPN1 expression/)
  assert.match(md,/Immune cell composition \/ CIBERSORT step/)
  assert.match(md,/D4:\n    status: unresolved/)
  assert.match(md,/UNOBSERVED/)
  assert.match(md,/M8 summarizes \*\*M1–M7\*\*/)
  assert.equal((await generateStudyRecord(ws)).status,'cache-hit')
})
test('Partial workspace indexes exact recorded outputs and flags incomplete M8',async()=>{
  const ws=await workspace()
  await put(ws,'source',{status:'complete',snapshot:'demo-gdc',digest:'source-id',
    manifest:'data/manifests/gdc/demo-gdc/source-manifest.json',
    clinical:'data/raw/gdc/demo-gdc/clinical/cases.json',
    cases:4, files:[{file_id:'f1'},{file_id:'f2'}]})
  await mkdir(join(ws,'runs/paper-pancan/p1'),{recursive:true})
  await writeFile(join(ws,'runs/paper-pancan/p1/report.md'),'# Pan-cancer recorded result\n')
  await put(ws,'paper-pancan',{status:'complete',id:'p1',
    source:'local-export',outputs:[{path:'runs/paper-pancan/p1/report.md'}]})
  await put(ws,'ppi',{status:'complete',id:'m6-run',parameters:{requiredScore:400},
    outputs:[{path:'runs/m6/network.svg'}]})
  await put(ws,'reconstruction-report',{status:'complete',id:'m8-draft',
    report_status:'incomplete_draft',outputs:[{path:'runs/m8/report.md'}]})
  const first=await generateStudyRecord(ws)
  assert.equal(first.manifest.summary.recorded,3)
  const md=await output(ws,first.manifest,'study-record.md')
  assert.match(md,/demo-gdc/)
  assert.match(md,/GDC source identity digest: .source-id./)
  assert.match(md,/data\/manifests\/gdc\/demo-gdc\/source-manifest.json/)
  assert.match(md,/Cases: 4; expression files: 2/)
  assert.doesNotMatch(md,/Output catalog: not provided by this active pointer/)
  assert.match(md,/Recorded source: .local-export./)
  assert.match(md,/M8 synthesis status: \*\*incomplete_draft\*\*/)
  assert.match(md,/requiredScore.*400/)
  assert.match(md,/runs\/paper-pancan\/p1\/report.md/)
  const tsv=await output(ws,first.manifest,'workflow.tsv')
  assert.match(tsv,/paper-composition\t.*\tmissing\t/)
  const artifacts=await output(ws,first.manifest,'artifacts.tsv')
  assert.match(artifacts,/runs\/paper-pancan\/p1\/report.md/)
  assert.match(artifacts,/M1\tdata\/manifests\/gdc\/demo-gdc\/source-manifest.json\t\t/)
  assert.match(artifacts,/M1\tdata\/raw\/gdc\/demo-gdc\/clinical\/cases.json\t\t/)
  assert.equal((await generateStudyRecord(ws)).status,'cache-hit')
  await put(ws,'paper-clinical',{status:'complete',id:'clin-1',
    outputs:[{path:'runs/clinical/report.md'}]})
  const next=await generateStudyRecord(ws)
  assert.equal(next.manifest.summary.recorded,4)
  assert.notEqual(next.manifest.id,first.manifest.id)
  assert.match(await output(ws,first.manifest,'study-record.md'),/Recorded steps: 3\/11/)
})
test('Harness notes are optional observations, not inferred from completed scripts',async()=>{
  const ws=await workspace()
  const first=await generateStudyRecord(ws)
  assert.equal(first.manifest.summary.observed_dsh_session,false)
  await writeFile(join(ws,'study/harness-session.md'),
    '# Actual DSH session observations\nObserved tool call, manually recorded.\n')
  const second=await generateStudyRecord(ws)
  assert.equal(second.manifest.summary.observed_dsh_session,true)
  assert.match(await output(ws,second.manifest,'harness-observations.md'),/operator-supplied/)
  assert.match(await output(ws,second.manifest,'study-record.md'),/not independently authenticated/)
  assert.equal((await generateStudyRecord(ws)).status,'cache-hit')
  assert.notEqual((await generateStudyRecord(ws,{rerun:true})).manifest.id,second.manifest.id)
})
