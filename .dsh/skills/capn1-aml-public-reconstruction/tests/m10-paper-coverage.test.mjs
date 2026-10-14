import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runPaperSlice } from '../scripts/m10-paper-coverage.mjs'

const sha=x=>createHash('sha256').update(x).digest('hex')
async function fixture(){
  const ws=await mkdtemp(join(tmpdir(),'capn1-paper-'))
  await mkdir(join(ws,'study'),{recursive:true})
  await mkdir(join(ws,'data'),{recursive:true})
  const rows=[
    ['case_id','file_id','group'],
    ['c1','f1','high'],['c2','f2','high'],['c3','f3','low'],['c4','f4','low']]
  const cohort=rows.map(r=>r.join('\t')).join('\n')+'\n'
  const cases='case_id\tage_at_index\tsex_at_birth\nc1\t50\tmale\nc2\t40\tfemale\nc3\t70\tmale\nc4\t60\tfemale\n'
  const diagnoses='case_id\teln_risk_classification\nc1\tFavorable\nc2\tAdverse\nc3\tAdverse\nc4\tFavorable\n'
  const annotation='gene_id\tgene_name\tgene_type\n'+
    Array.from({length:12},(_,i)=>'g'+i+'\tMARKER'+i+'\tprotein_coding').join('\n')+'\n'
  const tpm='gene_id\tf1\tf2\tf3\tf4\n'+Array.from({length:12},(_,i)=>
    'g'+i+'\t'+(i<6?9:2)+'\t'+(i<6?8:3)+'\t'+(i<6?2:9)+'\t'+(i<6?3:8)).join('\n')+'\n'
  const gmt='T cells\tPanglaoDB\t'+Array.from({length:6},(_,i)=>'MARKER'+i).join('\t')+
    '\nB cells\tPanglaoDB\t'+Array.from({length:6},(_,i)=>'MARKER'+(i+6)).join('\t')+'\n'
  const files={'cohort.tsv':cohort,'clinical-cases.tsv':cases,
    'clinical-diagnoses.tsv':diagnoses,'gene-annotation.tsv':annotation,
    'tpm-unstranded.tsv':tpm}
  for (const [name,contents] of Object.entries(files))await writeFile(join(ws,'data',name),contents)
  const m2out=['clinical-cases.tsv','clinical-diagnoses.tsv','gene-annotation.tsv','tpm-unstranded.tsv']
    .map(n=>({path:'data/'+n,sha256:sha(files[n]),bytes:Buffer.byteLength(files[n])}))
  await writeFile(join(ws,'study/processed.json'),JSON.stringify(
    {status:'complete',id:'m2',outputs:m2out}))
  await writeFile(join(ws,'study/survival.json'),JSON.stringify(
    {status:'complete',id:'m3',m2_id:'m2',outputs:[{
      path:'data/cohort.tsv',sha256:sha(cohort),bytes:Buffer.byteLength(cohort)}]}))
  await writeFile(join(ws,'data/markers.gmt'),gmt)
  await writeFile(join(ws,'study/immune.json'),JSON.stringify(
    {status:'complete',id:'m7',m2_id:'m2',m3_id:'m3',
      signature_reference:{file:{path:'data/markers.gmt',sha256:sha(gmt)}}}))
  return ws
}
async function readOutput(ws,manifest,name){
  return readFile(join(ws,manifest.outputs.find(x=>x.path.endsWith('/'+name)).path),'utf8')
}
test('Paper clinical association uses paired M2/M3 and yields table SVG and report',async()=>{
  const ws=await fixture()
  const first=await runPaperSlice(ws,'clinical')
  assert.equal(first.status,'analyzed')
  assert.match(await readOutput(ws,first.manifest,'clinical-associations.tsv'),/age_at_index/)
  assert.match(await readOutput(ws,first.manifest,'clinical-associations.tsv'),/eln_risk_classification/)
  assert.match(await readOutput(ws,first.manifest,'clinical-associations.svg'),/<svg/)
  assert.equal((await runPaperSlice(ws,'clinical')).status,'cache-hit')
})
test('Pan-cancer CAPN1 public-export option excludes TCGA normal and summarizes types',async()=>{
  const ws=await fixture()
  const source=join(ws,'pancan-fixture.tsv')
  await writeFile(source,'sample_id\tcancer_type\tcapn1_expression\n'+
    'TCGA-AA-0001-01\tBRCA\t2\nTCGA-AA-0002-01\tBRCA\t3\n'+
    'TCGA-BB-0003-03\tLAML\t8\nTCGA-BB-0004-01\tLAML\t9\n'+
    'TCGA-AA-0005-11\tBRCA\t100\n')
  const result=await runPaperSlice(ws,'pancan',{pancanInput:source})
  assert.equal(result.status,'analyzed')
  const stats=JSON.parse(await readOutput(ws,result.manifest,'statistics.json'))
  assert.equal(stats.samples,5)
  assert.equal(stats.tumor_samples,4)
  assert.equal(stats.normal_samples,1)
  assert.equal(stats.cancer_types,2)
  assert.match(await readOutput(ws,result.manifest,'pancan-summary.tsv'),/tumor_vs_normal_p/)
  assert.match(await readOutput(ws,result.manifest,'pancan-summary.tsv'),/BRCA\t2\t1/)
  assert.match(await readOutput(ws,result.manifest,'pancan-expression.svg'),/BRCA/)
  assert.equal((await runPaperSlice(ws,'pancan',{pancanInput:source})).status,'cache-hit')
})
test('Immune public marker NNLS generates relative proxy and can import external results',async()=>{
  const ws=await fixture()
  const result=await runPaperSlice(ws,'composition')
  assert.equal(result.status,'analyzed')
  assert.match(await readOutput(ws,result.manifest,'report.md'),/NOT.*CIBERSORT/)
  assert.match(await readOutput(ws,result.manifest,'immune-contributions.tsv'),/T cells/)
  const external=join(ws,'licensed-result.tsv')
  await writeFile(external,'Mixture\tB cells naive\tT cells CD8\tP-value\tCorrelation\tRMSE\n'+
    ['f1','f2','f3','f4'].map(f=>f+'\t0.2\t0.8\t0.01\t0.9\t0.1').join('\n')+'\n')
  const imported=await runPaperSlice(ws,'composition',{cibersortResult:external})
  assert.equal(imported.manifest.source,'user-supplied-external-cibersort')
  assert.match(await readOutput(ws,imported.manifest,'immune-summary.tsv'),/B cells naive/)
  assert.notEqual(result.manifest.id,imported.manifest.id)
})
