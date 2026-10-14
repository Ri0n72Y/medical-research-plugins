import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { generateReconstruction } from '../scripts/m8-reconstruction.mjs'
import { parseTsv } from '../scripts/m3-cohort.mjs'

const sha = text => createHash('sha256').update(text).digest('hex')
async function study(stages=['processed','survival','deg','enrichment']) {
  const ws=await mkdtemp(join(tmpdir(),'capn1-m8-'))
  await mkdir(join(ws,'study'),{recursive:true})
  const source={status:'complete',digest:'test-source',snapshot:'gdc-fixture'}
  await writeFile(join(ws,'study/source.json'),JSON.stringify(source))
  const byStage={
    processed:{id:'m2-1',source_digest:source.digest},
    survival:{id:'m3-1',source_digest:source.digest,m2_id:'m2-1'},
    deg:{id:'m4-1',source_digest:source.digest,m2_id:'m2-1',m3_id:'m3-1'},
    enrichment:{id:'m5-1',source_digest:source.digest,m2_id:'m2-1',m3_id:'m3-1',m4_id:'m4-1'},
    ppi:{id:'m6-1',source_digest:source.digest,m2_id:'m2-1',m3_id:'m3-1',m4_id:'m4-1',
      parameters:{mode:'live',requiredScore:400}},
    immune:{id:'m7-1',source_digest:source.digest,m2_id:'m2-1',m3_id:'m3-1',
      parameters:{mode:'ssgsea-only'},signature_reference:{source_mode:'public-live-fetch',
        file:{sha256:'a'.repeat(64)}}}
  }
  if(stages.includes('immune')) {
    await mkdir(join(ws,'data/references/immune'),{recursive:true})
    const refText='cell-marker-reference-data\n'
    const refPath='data/references/immune/ref.gmt'
    await writeFile(join(ws,refPath),refText)
    byStage.immune.signature_reference.file={
      path:refPath,bytes:Buffer.byteLength(refText),sha256:sha(refText)}
  }
  if(stages.includes('enrichment')) {
    await mkdir(join(ws,'data/references/go'),{recursive:true})
    const text='GO-REFERENCE\n',path='data/references/go/go.gmt'
    await writeFile(join(ws,path),text)
    byStage.enrichment.gene_set_reference={
      files:{go_bp:{path,bytes:Buffer.byteLength(text),sha256:sha(text)}}}
  }
  for(const name of stages) {
    const dir=join(ws,'runs',name)
    await mkdir(dir,{recursive:true})
    const artifact=name==='processed'?'qc.md':'report.md'
    const data='# '+name+'\n\n## Results\n- Verified sample result for '+name+'\n'
    const p='runs/'+name+'/'+artifact
    await writeFile(join(ws,p),data)
    const m={...byStage[name],status:'complete',implementation:'capn1-'+name+'-fixture',
      outputs:[{path:p,bytes:Buffer.byteLength(data),sha256:sha(data)}]}
    await writeFile(join(ws,'study',name+'.json'),JSON.stringify(m))
  }
  return ws
}
const artifact=async(ws,manifest,name)=>readFile(join(ws,
  manifest.outputs.find(x=>x.path.endsWith('/'+name)).path),'utf8')

test('M8 composes a truthful incomplete draft from verified active M1-M5 only',async()=>{
  const ws=await study()
  const first=await generateReconstruction(ws)
  assert.equal(first.status,'generated')
  assert.equal(first.manifest.report_status,'incomplete_draft')
  assert.equal(first.manifest.summary.verified_stages,5)
  const report=await artifact(ws,first.manifest,'report.md')
  assert.match(report,/M6 — PUBLIC-FIXED/)
  assert.match(report,/MISSING/)
  assert.match(report,/Python GO\/KEGG, not original DAVID/)
  assert.match(report,/UNASSESSED/)
  assert.match(report,/Verified sample result for deg/)
  assert.doesNotMatch(report,/M6 run m6/)
  const ledger=parseTsv(await artifact(ws,first.manifest,'evidence-register.tsv'),
    ['stage','artifact','sha256','path'])
  assert.equal(ledger.length,4)
  assert.ok(ledger.every(row=>/^[0-9a-f]{64}$/.test(row.sha256)))
  const gaps=parseTsv(await artifact(ws,first.manifest,'gaps.tsv'),['stage','status'])
  assert.ok(gaps.some(x=>x.stage==='M6'&&x.status==='missing'))
  assert.equal((await generateReconstruction(ws)).status,'cache-hit')
  await assert.rejects(generateReconstruction(ws,{requireComplete:true}),/evidence incomplete/)
  assert.equal((await generateReconstruction(ws,{rerun:true})).status,'generated')
})

test('M8 rejects tampered artifacts and retains last-good published synthesis',async()=>{
  const ws=await study()
  const first=await generateReconstruction(ws)
  const before=await readFile(join(ws,'study/reconstruction-report.json'),'utf8')
  await writeFile(join(ws,'runs/deg/report.md'),'corrupt')
  await assert.rejects(generateReconstruction(ws),/M4 output checksum mismatch/)
  assert.equal(await readFile(join(ws,'study/reconstruction-report.json'),'utf8'),before)
  // A modified M8 output must not be treated as a valid cache.
  await writeFile(join(ws,first.manifest.outputs[0].path),'corrupt')
  await writeFile(join(ws,'runs/deg/report.md'),'# deg\n\n## Results\n- Verified sample result for deg\n')
  await assert.rejects(generateReconstruction(ws),/Existing M8 report damaged/)
})

test('M8 refuses incompatible active stage lineage, not silently missing data',async()=>{
  const ws=await study()
  const file=join(ws,'study/survival.json')
  const m=JSON.parse(await readFile(file,'utf8'))
  m.m2_id='outdated'
  await writeFile(file,JSON.stringify(m))
  await assert.rejects(generateReconstruction(ws),/M3 M2 lineage mismatch/)
})

test('M8 complete local run is only ready for researcher review, not scientific approval',async()=>{
  const ws=await study(['processed','survival','deg','enrichment','ppi','immune'])
  const x=await generateReconstruction(ws,{requireComplete:true})
  assert.equal(x.manifest.report_status,'ready_for_researcher_review')
  const report=await artifact(ws,x.manifest,'report.md')
  assert.match(report,/not CIBERSORT or immune cell fractions/)
  assert.match(report,/STRING functional associations/)
  assert.match(report,/researcher must review and explicitly approve/i)
  const provenance=JSON.parse(await artifact(ws,x.manifest,'provenance.json'))
  assert.equal(provenance.scientific_signoff,'required')
  assert.equal(provenance.stages.filter(s=>s.status==='verified').length,7)
  assert.equal(x.manifest.summary.scientific_approval,false)
  const ppiPath=join(ws,'study/ppi.json'),ppi=JSON.parse(await readFile(ppiPath,'utf8'))
  ppi.parameters.mode='offline-fixture'
  await writeFile(ppiPath,JSON.stringify(ppi))
  const draft=await generateReconstruction(ws)
  assert.equal(draft.manifest.report_status,'incomplete_draft')
})


test('M8 rejects tampering in reference snapshots, not only registered run outputs',async()=>{
  const ws=await study(['processed','survival','deg','enrichment','ppi','immune'])
  await writeFile(join(ws,'data/references/immune/ref.gmt'),'tampered')
  await assert.rejects(generateReconstruction(ws),/M7 reference checksum mismatch/)
  await writeFile(join(ws,'data/references/immune/ref.gmt'),'cell-marker-reference-data\n')
  await writeFile(join(ws,'data/references/go/go.gmt'),'broken')
  await assert.rejects(generateReconstruction(ws),/M5 reference checksum mismatch/)
})
