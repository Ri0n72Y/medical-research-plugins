import assert from 'node:assert/strict'
import test from 'node:test'
import { constructCohort } from '../scripts/m3-cohort.mjs'

function fixtures() {
  const cases = { data: { hits: [
    { case_id:'A',demographic:{vital_status:'Dead',days_to_death:100} },
    { case_id:'B',demographic:{vital_status:'Alive'},diagnoses:[{days_to_last_follow_up:120}],
      follow_ups:[{days_to_follow_up:170},{days_to_follow_up:135}] },
    { case_id:'C',demographic:{vital_status:'Dead'},follow_ups:[{days_to_follow_up:200}] },
    { case_id:'D',demographic:{vital_status:'Alive'},follow_ups:[{days_to_follow_up:155}] },
    { case_id:'E',demographic:{vital_status:'Unknown'} },
    { case_id:'F',demographic:{vital_status:'Alive'},diagnoses:[] },
  ] } }
  const files = [
    ['id-a','A'],['id-b','B'],['id-c','C'],['id-d-1','D'],['id-d-2','D'],
    ['id-e','E'],['id-f','F'],
  ].map(([file_id,case_id]) => ({ file_id,cases:[{case_id}] }))
  const expression = files.map((f,i)=>({file_id:f.file_id,tpm_unstranded:String(2+i)}))
  return {source:{status:'complete',digest:'sha',files},
    processed:{status:'complete',source_digest:'sha'},
    cases, expression}
}

test('candidate cohort only includes one-file cases with valid survival time',()=>{
  const {source,processed,cases,expression}=fixtures()
  const r=constructCohort(source,processed,cases,expression)
  assert.deepEqual(r.eligible.map(x=>x.case_id), ['A','B'])
  assert.equal(r.eligible[0].event,1)
  assert.equal(r.eligible[0].os_days,100)
  assert.equal(r.eligible[1].event,0)
  assert.equal(r.eligible[1].os_days,170)
  assert.equal(r.clinicalCases,6)
  assert.equal(r.files,7)
  assert.match(r.audit.find(x=>x.case_id==='C').exclusion_reasons,/NO_DEATH_TIME/)
  assert.match(r.audit.find(x=>x.case_id==='D').exclusion_reasons,/MULTIPLE_EXPRESSION_FILES/)
  assert.match(r.audit.find(x=>x.case_id==='E').exclusion_reasons,/UNRESOLVED_VITAL_STATUS/)
  assert.match(r.audit.find(x=>x.case_id==='F').exclusion_reasons,/NO_CENSOR_TIME/)
})

test('data version mismatch is rejected',()=>{
  const f=fixtures();f.processed.source_digest='changed'
  assert.throws(()=>constructCohort(f.source,f.processed,f.cases,f.expression),/source mismatch/)
})

test('duplicate expression file IDs are rejected',()=>{
  const f=fixtures();f.expression.push(f.expression[0])
  assert.throws(()=>constructCohort(f.source,f.processed,f.cases,f.expression),/Duplicate/)
})

test('invalid CAPN1 TPM is rejected',()=>{
  const f=fixtures();f.expression[0].tpm_unstranded='NaN'
  assert.throws(()=>constructCohort(f.source,f.processed,f.cases,f.expression),/Invalid CAPN1 TPM/)
})

test('death without recorded death time is never censored at last followup',()=>{
  const f=fixtures()
  const r=constructCohort(f.source,f.processed,f.cases,f.expression)
  const row=r.audit.find(x=>x.case_id==='C')
  assert.equal(row.os_days,undefined)
  assert.match(row.exclusion_reasons,/NO_DEATH_TIME/)
})
