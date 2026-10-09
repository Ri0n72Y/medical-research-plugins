import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { prepare } from '../scripts/m2-prepare.mjs'
import { buildClinicalTables } from '../scripts/m2-clinical.mjs'
import { clinicalDigest } from '../scripts/lib/gdc.mjs'
const md5 = s => createHash('md5').update(s).digest('hex')
const expression = genes => ['# gene-model: GENCODE v36','gene_id\tgene_name\tgene_type\tunstranded\tstranded_first\tstranded_second\ttpm_unstranded',
  'N_unmapped\t\t\t5\t0\t0\t0',...genes.map(g=>g.join('\t'))].join('\n')+'\n'
const first = [ ['ENSG00000162909.18','CAPN1','protein_coding', '10','0','0','2.5'], ['ENSG00000111111.1','GENE2','protein_coding','20','0','0','7.1'] ]
const second = [ ['ENSG00000162909.18','CAPN1','protein_coding', '40','0','0','8.2'], ['ENSG00000111111.1','GENE2','protein_coding','60','0','0','9.4'] ]
async function fixture({ duplicateCase = false, conflict = false } = {}) {
  const workspace = await mkdtemp(join(tmpdir(), 'm2-test-'))
  const clinical = { data: { hits: [
    { case_id: 'case-a', submitter_id:'TCGA-01', demographic: { vital_status: 'Dead', days_to_death: 123, sex_at_birth:'female' }, diagnoses: [{ diagnosis_id: 'd1', age_at_diagnosis: 14400, days_to_last_follow_up: 100 }], follow_ups: [{ follow_up_id: 'f1', days_to_follow_up: 111 }] },
    { case_id: 'case-b', submitter_id:'TCGA-02', demographic: { vital_status:'Alive' }, diagnoses:[{diagnosis_id:'d2'},{diagnosis_id:'d3'}] },
  ] } }
  const raw = join(workspace,'data/raw/gdc/gdc-123456789abc')
  const manifestDir = join(workspace,'data/manifests/gdc/gdc-123456789abc')
  await mkdir(join(raw,'expression'),{recursive:true})
  await mkdir(join(raw,'clinical'),{recursive:true})
  await mkdir(manifestDir,{recursive:true})
  const fileList = []
  for(const [i,geneRows] of [first,conflict?[second[1],second[0]]:second].entries()) {
    const text = expression(geneRows), id = `file-${i}`
    const path = `data/raw/gdc/gdc-123456789abc/expression/${id}.tsv`
    await writeFile(join(workspace,path),text)
    fileList.push({ file_id:id, file_name:`${id}.tsv`, file_size:Buffer.byteLength(text), md5sum:md5(text), path, cases:[{case_id:duplicateCase?'case-a':i===0?'case-a':'case-b'}] })
  }
  const source={status:'complete', snapshot:'gdc-123456789abc', digest:'digest-v1', clinical_digest:clinicalDigest(clinical),
    clinical:'data/raw/gdc/gdc-123456789abc/clinical/cases.json',manifest:'data/manifests/gdc/gdc-123456789abc/source-manifest.json',files:fileList}
  await writeFile(join(workspace,source.clinical),JSON.stringify(clinical))
  await writeFile(join(workspace,source.manifest),JSON.stringify(source))
  await mkdir(join(workspace,'study'))
  await writeFile(join(workspace,'study/source.json'),JSON.stringify(source))
  return {workspace, source}
}
test('M2 creates file-indexed count/TPM, full clinical observations, and non-approved QC',async()=>{
 const {workspace}=await fixture({duplicateCase:true})
 const result=await prepare(workspace)
 assert.equal(result.status,'processed')
 assert.equal(result.manifest.qc_status,'requires-researcher-review')
 assert.deepEqual(result.manifest.runtime, { node: process.version, platform: process.platform, arch: process.arch })
 const base=join(workspace,'data/processed/gdc-123456789abc',result.manifest.id)
 const counts=await readFile(join(base,'counts-unstranded.tsv'),'utf8')
 const tpm=await readFile(join(base,'tpm-unstranded.tsv'),'utf8')
 assert.match(counts,/gene_id\tfile-0\tfile-1/)
 assert.match(counts,/ENSG00000162909\.18\t10\t40/)
 assert.match(tpm,/ENSG00000162909\.18\t2\.5\t8\.2/)
 const qc=JSON.parse(await readFile(join(base,'qc.json'),'utf8'))
 assert.equal(qc.cohort_approved,false)
 assert.equal(qc.survival_endpoint_defined,false)
 assert.ok(qc.issues.some(i=>i.code==='MULTIPLE_FILES_PER_CASE'))
 assert.match(await readFile(join(base,'clinical-diagnoses.tsv'),'utf8'),/days_to_last_follow_up/)
 assert.ok(result.manifest.outputs.some(entry => entry.path.endsWith('/capn1-expression.tsv')))
 assert.match(await readFile(join(base,'run-manifest.json'),'utf8'),/source_digest/)
})
test('compatible M2 cache hit avoids reprocessing; explicit rerun preserves previous', async()=>{
 const {workspace}=await fixture()
 const firstResult=await prepare(workspace)
 const again=await prepare(workspace)
 assert.equal(again.status,'cache-hit')
 assert.equal(again.manifest.id,firstResult.manifest.id)
 const rerun=await prepare(workspace,{rerun:true})
 assert.equal(rerun.status,'processed')
 assert.notEqual(rerun.manifest.id,firstResult.manifest.id)
 assert.ok((await readFile(join(workspace,'data/processed/gdc-123456789abc',firstResult.manifest.id,'qc.json'),'utf8')).length>10)
})
test('mismatched gene order fails without publishing processed pointer',async()=>{
 const {workspace}=await fixture({conflict:true})
 await assert.rejects(prepare(workspace),/Gene order or annotation mismatch/)
 await assert.rejects(readFile(join(workspace,'study/processed.json'),'utf8'),/ENOENT/)
})
test('tampered input fails integrity check',async()=>{
 const {workspace,source}=await fixture()
 await writeFile(join(workspace,source.files[0].path),'bad input')
 await assert.rejects(prepare(workspace),/GDC raw integrity check failed/)
})
test('changed source digest invalidates cached processed result',async()=>{
 const {workspace}=await fixture()
 const result=await prepare(workspace)
 const source=JSON.parse(await readFile(join(workspace,'study/source.json'),'utf8'))
 source.digest='digest-v2'
 await writeFile(join(workspace,'study/source.json'),JSON.stringify(source))
 await writeFile(join(workspace,source.manifest),JSON.stringify(source))
 const next=await prepare(workspace)
 assert.notEqual(next.manifest.id,result.manifest.id)
})

test('failed rerun never replaces completed processed pointer',async()=>{
 const {workspace,source}=await fixture()
 const good=await prepare(workspace)
 await writeFile(join(workspace,source.files[0].path),'tampered')
 await assert.rejects(prepare(workspace,{rerun:true}),/integrity check failed/)
 const active=JSON.parse(await readFile(join(workspace,'study/processed.json'),'utf8'))
 assert.equal(active.id, good.manifest.id)
})

test('cached M2 processing refuses same-length raw-source corruption', async () => {
  const { workspace, source } = await fixture()
  const firstResult = await prepare(workspace)
  assert.equal(firstResult.status, 'processed')
  const inputPath = join(workspace, source.files[0].path)
  const original = await readFile(inputPath, 'utf8')
  await writeFile(inputPath, original.replace('\t10\t0\t', '\t90\t0\t'))
  await assert.rejects(prepare(workspace), /GDC raw integrity check failed/)
  const active = JSON.parse(await readFile(join(workspace, 'study/processed.json'), 'utf8'))
  assert.equal(active.id, firstResult.manifest.id)
})

test('QC flags unknown vital status and missing censor follow-up without deciding OS', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'm2-vital-qc-'))
  const cases = { data: { hits: [
    { case_id: 'unknown', demographic: { vital_status: 'Not Reported' }, diagnoses: [] },
    { case_id: 'alive-missing', demographic: { vital_status: 'Alive' }, diagnoses: [{ diagnosis_id: 'd1' }] },
    { case_id: 'alive-valid', demographic: { vital_status: 'Alive' }, diagnoses: [{ days_to_last_follow_up: 20 }] },
  ] } }
  const qc = await buildClinicalTables(cases, [], directory)
  assert.ok(qc.issues.some(issue => issue.subject === 'unknown' && issue.code === 'UNRESOLVED_VITAL_STATUS'))
  assert.ok(qc.issues.some(issue => issue.subject === 'alive-missing' && issue.code === 'MISSING_CENSOR_FOLLOWUP'))
  assert.ok(!qc.issues.some(issue => issue.subject === 'alive-valid' && issue.code === 'MISSING_CENSOR_FOLLOWUP'))
  assert.equal(qc.endpoint_defined, false)
  assert.equal(qc.sample_selection_defined, false)
})
