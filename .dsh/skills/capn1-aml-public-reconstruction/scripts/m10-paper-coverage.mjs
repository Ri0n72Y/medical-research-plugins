import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile, mkdir, writeFile, rename, rm, stat } from 'node:fs/promises'
import { join, dirname, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const exec = promisify(execFile)
const impl = 'capn1-paper-coverage-v1'
const outputNames = {
  clinical:['clinical-paired.tsv','clinical-associations.tsv','clinical-associations.svg','statistics.json','report.md'],
  pancan:['pancan-samples.tsv','pancan-summary.tsv','pancan-expression.svg','statistics.json','report.md'],
  composition:['immune-contributions.tsv','immune-summary.tsv','immune-composition.svg','statistics.json','report.md'],
}
async function hash(path) {
  const h = createHash('sha256')
  for await(const chunk of createReadStream(path)) h.update(chunk)
  return h.digest('hex')
}
async function json(path) {return JSON.parse(await readFile(path,'utf8'))}
async function art(workspace,manifest,name) {
  const entry=manifest.outputs?.find(x=>x.path.split('/').at(-1)===name)
  if(!entry)throw Error('Missing '+name+' from completed study')
  const path=resolve(workspace,entry.path)
  const root=resolve(workspace)
  if(!path.startsWith(root+'/') && !path.startsWith(root+'\\'))
    throw Error('Artifact outside workspace')
  return path
}
async function prerequisites(workspace,kind,externalResult) {
  if(kind==='pancan')return {files:[],inputs:[]}
  const m2=await json(join(workspace,'study/processed.json'))
  const m3=await json(join(workspace,'study/survival.json'))
  if(m2.status!=='complete'||m3.status!=='complete'||m3.m2_id!==m2.id)
    throw Error('Paper study slices require completed matching M2 and M3')
  const input=[m2.id,m3.id]
  const cohort=await art(workspace,m3,'cohort.tsv')
  const files=[cohort]
  if(kind==='clinical') {
    files.push(await art(workspace,m2,'clinical-cases.tsv'))
    files.push(await art(workspace,m2,'clinical-diagnoses.tsv'))
  }
  if(kind==='composition'&&!externalResult) {
    const m7=await json(join(workspace,'study/immune.json'))
    if(m7.status!=='complete'||m7.m2_id!==m2.id||m7.m3_id!==m3.id||
       !m7.signature_reference?.file?.path) throw Error('Requires matching M7 public marker snapshot')
    input.push(m7.id,m7.signature_reference.file.sha256)
    files.push(await art(workspace,m2,'tpm-unstranded.tsv'))
    files.push(await art(workspace,m2,'gene-annotation.tsv'))
    files.push(resolve(workspace,m7.signature_reference.file.path))
  }
  return {files,inputs:input}
}
export async function runPaperSlice(workspace,kind,{rerun=false,pancanInput=null,cibersortResult=null}={}) {
  if(!(kind in outputNames)) throw Error('Unknown paper slice '+kind)
  if(pancanInput&&kind!=='pancan')throw Error('--pancan-input requires paper:pancan')
  if(cibersortResult&&kind!=='composition')throw Error('--cibersort-result requires paper:composition')
  const external=cibersortResult?resolve(cibersortResult):null
  const input=await prerequisites(workspace,kind,external)
  const file=pancanInput?resolve(pancanInput):external
  if(file)input.files.push(file)
  const script=join(root,'m10-'+(kind==='composition'?'immune-composition':kind)+'.py')
  const fingerprint=createHash('sha256').update(JSON.stringify({
    impl,kind,code:await hash(script),upstream:input.inputs,
    files:await Promise.all(input.files.map(hash)),
    liveProvider:kind==='pancan'&&!file?'ucsc-xena-pancanatlas':null
  })).digest('hex')
  const pointer=join(workspace,'study/paper-'+kind+'.json')
  let prev=null
  try {prev=await json(pointer)}catch(e){if(e.code!=='ENOENT')throw e}
  if(prev&&!rerun&&prev.fingerprint===fingerprint) {
    const present=await Promise.all(prev.outputs.map(x=>stat(resolve(workspace,x.path)).then(()=>true).catch(()=>false)))
    if(present.every(Boolean))return {status:'cache-hit',manifest:prev}
  }
  const id='paper-'+kind+'-'+Date.now()+'-'+randomUUID().slice(0,8)
  const folder=join(workspace,'runs/paper-'+kind),tmp=join(folder,'.pending-'+id),final=join(folder,id)
  await mkdir(tmp,{recursive:true})
  try {
    const args=kind==='pancan'?[tmp,...(pancanInput?['--input',file]:[])]:
      kind==='clinical'?[...input.files,tmp]:
      [input.files[0],tmp,...(external?['--imported',external]:
        ['--tpm',input.files[1],'--annotations',input.files[2],'--gmt',input.files[3]])]
    const python=process.env.PYTHON_BINARY||(process.platform==='win32'?'python':'python3')
    await exec(python,[script,...args],{timeout:300000,maxBuffer:1024*1024})
    const outputs=await Promise.all(outputNames[kind].map(async name=>{
      const path=join(tmp,name)
      return {path:relative(workspace,join(final,name)).replaceAll('\\','/'),
        bytes:(await stat(path)).size,sha256:await hash(path)}
    }))
    const manifest={schema:1,status:'complete',implementation:impl,kind,id,
      fingerprint,created_at:new Date().toISOString(),inputs:input.inputs,
      source:kind==='pancan'?(file?'local-export':'ucsc-xena-pancanatlas'):
        external?'user-supplied-external-cibersort':'local-public-markers-nnls',outputs}
    await writeFile(join(tmp,'run-manifest.json'),JSON.stringify(manifest,null,2)+'\n')
    await rename(tmp,final)
    const pending=pointer+'.tmp-'+randomUUID()
    await writeFile(pending,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'})
    await rename(pending,pointer)
    return {status:'analyzed',manifest}
  } catch(e){await rm(tmp,{recursive:true,force:true});throw e}
}
