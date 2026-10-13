import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { analyzeImmune } from '../scripts/m7-immune.mjs'
import { acquireSignatures } from '../scripts/m7-signatures.mjs'
import { asTsv, parseTsv } from '../scripts/m3-cohort.mjs'

const hash = x => createHash('sha256').update(x).digest('hex')
const genes = Array.from({length:80},(_,i)=>'G'+(i+1))
const cases = Array.from({length:8},(_,i)=>({case_id:'CASE'+i,file_id:'FILE'+i,
  group:i<4?'high':'low'}))
const markers = [
  ['T cells', 'PanglaoDB', ...genes.slice(0,16)],
  ['B cells', 'PanglaoDB', ...genes.slice(16,32)],
  ['Macrophages', 'PanglaoDB', ...genes.slice(32,48)],
  ['Liver cells', 'PanglaoDB', ...genes.slice(48,64)],
].map(row=>row.join('\t')).join('\n')+'\n'
async function setup() {
  const ws=await mkdtemp(join(tmpdir(),'capn1-m7-'))
  await mkdir(join(ws,'study'),{recursive:true})
  await mkdir(join(ws,'data/processed/m2-fixture'),{recursive:true})
  await mkdir(join(ws,'runs/m3-survival/m3-fixture'),{recursive:true})
  const data = {
    'tpm-unstranded.tsv': asTsv(['gene_id',...cases.map(c=>c.file_id)],
      genes.map((gene,i)=>Object.fromEntries([['gene_id','ENSG'+(i+1)],
        ...cases.map((c,j)=>[c.file_id, String((i+3)*(j+2)%39 + (j<4&&i<16?23:2))])]))),
    'gene-annotation.tsv': asTsv(['gene_id','gene_name','gene_type'],
      genes.map((gene,i)=>({gene_id:'ENSG'+(i+1),gene_name:gene,gene_type:'protein_coding'}))),
    'cohort.tsv': asTsv(['case_id','file_id','group'],cases)
  }
  async function store(dir,name) {
    const content=data[name],path=dir+'/'+name
    await writeFile(join(ws,path),content)
    return {path,bytes:Buffer.byteLength(content),sha256:hash(content)}
  }
  const m2dir='data/processed/m2-fixture',m3dir='runs/m3-survival/m3-fixture'
  const source={status:'complete',digest:'gdc-fixture'}
  const m2={status:'complete',id:'m2-fixture',source_digest:source.digest,outputs:[
    await store(m2dir,'tpm-unstranded.tsv'),await store(m2dir,'gene-annotation.tsv')]}
  const m3={status:'complete',id:'m3-fixture',source_digest:source.digest,
    m2_id:m2.id,implementation:'capn1-m3-python-lifelines-demo-v1',
    outputs:[await store(m3dir,'cohort.tsv')]}
  await Promise.all([['source',source],['processed',m2],['survival',m3]]
    .map(([n,x])=>writeFile(join(ws,'study',n+'.json'),JSON.stringify(x))))
  const options={mode:'ssgsea-only',downloadSignatures:async()=>markers}
  return {ws,options}
}
const output=async(f,m,n)=>readFile(join(f.ws,m.outputs.find(x=>x.path.endsWith('/'+n)).path),'utf8')

test('M7 public Panglao marker source snapshot is immutable and cache-first',async()=>{
  const {ws}=await setup()
  let requests=0
  const first=await acquireSignatures(ws,{download:async()=>{requests++;return markers}})
  assert.equal(first.status,'downloaded')
  const second=await acquireSignatures(ws,{download:async()=>{requests++;throw Error('unexpected network')}})
  assert.equal(second.status,'cache-hit')
  assert.equal(requests,1)
  await writeFile(join(ws,first.manifest.file.path),'modified')
  await assert.rejects(acquireSignatures(ws,{download:async()=>{requests++;throw Error('unexpected')}}),
    /signature checksum mismatch/)
  assert.equal(requests,1)
})

test('M7 GSEApy ssGSEA produces paired case scores and group summaries; cache-hit avoids refetch',async()=>{
  const f=await setup()
  const x=await analyzeImmune(f.ws,f.options)
  assert.equal(x.status,'analyzed')
  assert.equal(x.manifest.summary.cases,8)
  assert.equal(x.manifest.summary.high,4)
  assert.equal(x.manifest.summary.low,4)
  assert.equal(x.manifest.summary.immune_marker_sets_scored,3)
  assert.equal(x.manifest.summary.score_rows,24)
  const scores=parseTsv(await output(f,x.manifest,'immune-scores.tsv'),
    ['case_id','file_id','group','term','es','nes'])
  assert.equal(scores.length,24)
  assert.equal(new Set(scores.map(s=>s.file_id)).size,8)
  assert.ok(scores.every(s=>Number.isFinite(Number(s.nes))))
  const contrast=parseTsv(await output(f,x.manifest,'group-comparison.tsv'),
    ['term','high_n','low_n','bh_fdr'])
  assert.equal(contrast.length,3)
  assert.ok(contrast.every(s=>Number(s.high_n)===4 && Number(s.low_n)===4))
  assert.match(await output(f,x.manifest,'report.md'),/NOT CIBERSORT/)
  assert.equal((await analyzeImmune(f.ws,f.options)).status,'cache-hit')
})

test('M7 requires explicit D5 and rejects incompatible decision state or modes',async()=>{
  const f=await setup()
  await assert.rejects(analyzeImmune(f.ws),/D5 unresolved/)
  await assert.rejects(analyzeImmune(f.ws,{mode:'user-supplied-cibersort'}),/Only Python ssGSEA-only/)
  const d5=join(f.ws,'study/decisions.yaml')
  await writeFile(d5,'decisions:\n  D5:\n    status: unresolved\n    selected: ssgsea-only\n')
  await assert.rejects(analyzeImmune(f.ws,f.options),/requires selected\/approved/)
  // Real D5 template keeps selected *after* a nested allowed list.
  await writeFile(d5,'decisions:\n  D5:\n    status: selected\n    proposed_default: ssgsea-only\n    allowed:\n      - ssgsea-only\n      - public-substitute\n      - user-supplied-cibersort\n    selected: ssgsea-only\n    source: researcher\n')
  const ok=await analyzeImmune(f.ws,{downloadSignatures:async()=>markers})
  assert.equal(ok.manifest.parameters.selection,'study-D5')
})

test('M7 rejects lineage corruption and active-cache damage without replacing pointer',async()=>{
  const f=await setup()
  const pointer=join(f.ws,'study/immune.json')
  const first=await analyzeImmune(f.ws,f.options)
  const before=await readFile(pointer,'utf8')
  const target=first.manifest.outputs.find(x=>x.path.endsWith('/immune-scores.tsv'))
  await writeFile(join(f.ws,target.path),'tampered')
  await assert.rejects(analyzeImmune(f.ws,{mode:'ssgsea-only',
    downloadSignatures:async()=>{throw Error('unexpected GET')}}),/cache incompatible\/damaged/)
  assert.equal(await readFile(pointer,'utf8'),before)
  // A forced failed refresh cannot erase the completed result.
  await assert.rejects(analyzeImmune(f.ws,{mode:'ssgsea-only',refreshSignatures:true,
    downloadSignatures:async()=>{throw Error('fetch failed')}}),/fetch failed/)
  assert.equal(await readFile(pointer,'utf8'),before)
  const restored=await analyzeImmune(f.ws,{...f.options,refreshSignatures:true})
  assert.equal(restored.status,'analyzed')
  assert.notEqual(restored.manifest.id,first.manifest.id)
  const m3path=join(f.ws,'study/survival.json')
  const m3=JSON.parse(await readFile(m3path,'utf8'))
  m3.m2_id='invalid'
  await writeFile(m3path,JSON.stringify(m3))
  await assert.rejects(analyzeImmune(f.ws,f.options),/matching public M2/)
})


test('M7 parses original D5 allowed-list structure and rejects contradictory mode',async()=>{
  const f=await setup()
  const d5=join(f.ws,'study/decisions.yaml')
  await writeFile(d5,'decisions:\n  D5:\n    status: selected\n' +
    '    allowed:\n      - ssgsea-only\n      - public-substitute\n' +
    '    selected: public-substitute\n    source: researcher\n')
  await assert.rejects(analyzeImmune(f.ws,f.options),/conflicts with D5/)
  await assert.rejects(analyzeImmune(f.ws,{mode:'public-substitute'}),/Only Python ssGSEA-only/)
})


test('M7 keeps last-good result reusable after a refreshed marker snapshot causes analysis failure',async()=>{
  const f=await setup()
  const first=await analyzeImmune(f.ws,f.options)
  const pointer=join(f.ws,'study/immune.json')
  const old=await readFile(pointer,'utf8')
  const refFile=join(f.ws,'study/immune-signature-reference.json')
  const priorRef=JSON.parse(await readFile(refFile,'utf8'))
  // A well-formed, distinct public snapshot without any immune-labeled
  // signatures passes download validation but must fail Python analysis.
  const nonimmune = [
    ['Hepatocytes','PanglaoDB',...genes.slice(0,12)],
    ['Fibroblasts','PanglaoDB',...genes.slice(12,24)],
  ].map(row=>row.join('\t')).join('\n')+'\n'
  await assert.rejects(analyzeImmune(f.ws,{
    ...f.options,refreshSignatures:true,
    downloadSignatures:async()=>nonimmune
  }),/No immune-labeled marker signatures/)
  assert.equal(await readFile(pointer,'utf8'),old)
  const newerRef=JSON.parse(await readFile(refFile,'utf8'))
  assert.notEqual(newerRef.file.sha256,priorRef.file.sha256)
  const again=await analyzeImmune(f.ws,{...f.options,
    downloadSignatures:async()=>{throw Error('Unexpected external signature download')}})
  assert.equal(again.status,'cache-hit')
  assert.equal(again.manifest.id,first.manifest.id)
  // A completed run remains bound to its exact original signature source.
  assert.equal(again.manifest.signature_reference.file.sha256,priorRef.file.sha256)
})
