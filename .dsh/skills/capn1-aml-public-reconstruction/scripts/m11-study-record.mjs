import { createHash, randomUUID } from 'node:crypto'
import { readFile, writeFile, mkdir, rename, rm, stat } from 'node:fs/promises'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderRecord } from './m11-record-render.mjs'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const flowPath = join(root,'references/paper-workflow.json')
const implementation = 'capn1-m11-workspace-record-v1'
const names = ['study-record.md','workflow.tsv','artifacts.tsv','harness-observations.md']
const digest = value => createHash('sha256').update(value).digest('hex')

async function optional(path) {
  try {return await readFile(path,'utf8')}
  catch(error) {if(error.code==='ENOENT')return null;throw error}
}
function stateOf(manifest) {
  if(!manifest)return 'missing'
  if(manifest.status!=='complete')return 'incomplete'
  if(manifest.report_status==='incomplete_draft')return 'draft'
  return 'recorded'
}
export async function generateStudyRecord(workspace,{rerun=false}={}) {
  const flowText=await readFile(flowPath,'utf8')
  const flow=JSON.parse(flowText)
  const decisionText=await optional(join(workspace,'study/decisions.yaml'))
  const sessionText=await optional(join(workspace,'study/harness-session.md'))
  const states=new Map(),sources=[]
  for(const step of flow.steps){
    const raw=await optional(join(workspace,step.pointer))
    const manifest=raw?JSON.parse(raw):null
    states.set(step.key,{status:stateOf(manifest),manifest})
    sources.push([step.key,raw?digest(raw):null])
  }
  const fingerprint=digest(JSON.stringify({
    implementation,flow:flowText,decisions:decisionText,session:sessionText,sources
  }))
  const pointer=join(workspace,'study/research-record.json')
  const existing=await optional(pointer)
  if(existing&&!rerun){
    const cached=JSON.parse(existing)
    if(cached.fingerprint===fingerprint && cached.outputs?.length===names.length){
      const present=await Promise.all(cached.outputs.map(x=>
        stat(join(workspace,x.path)).then(()=>true).catch(()=>false)))
      if(present.every(Boolean))return {status:'cache-hit',manifest:cached}
    }
  }
  const result=renderRecord(flow,states,decisionText,sessionText)
  const id='m11-'+Date.now()+'-'+randomUUID().slice(0,8)
  const folder=join(workspace,'runs/m11-record'),pending=join(folder,'.pending-'+id)
  const final=join(folder,id)
  await mkdir(pending,{recursive:true})
  try {
    const contents={
      'study-record.md':result.markdown,'workflow.tsv':result.workflow,
      'artifacts.tsv':result.artifacts,'harness-observations.md':result.harness
    }
    const outputs=[]
    for(const name of names){
      const body=contents[name]
      await writeFile(join(pending,name),body)
      outputs.push({path:relative(workspace,join(final,name)).replaceAll('\\','/'),
        bytes:Buffer.byteLength(body),sha256:digest(body)})
    }
    const count=flow.steps.filter(x=>states.get(x.key).status==='recorded').length
    const manifest={schema:1,status:'complete',implementation,id,
      created_at:new Date().toISOString(),fingerprint,
      summary:{recorded:count,total:flow.steps.length,
        observed_dsh_session:Boolean(sessionText?.trim()),
        completeness:count===flow.steps.length?'all_stages_recorded':'partial_record'},
      source_map:'references/paper-workflow.json',
      inputs:sources,outputs}
    await writeFile(join(pending,'run-manifest.json'),JSON.stringify(manifest,null,2)+'\n')
    await rename(pending,final)
    const temp=pointer+'.tmp-'+randomUUID()
    await writeFile(temp,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'})
    await rename(temp,pointer)
    return {status:'generated',manifest}
  }catch(error){await rm(pending,{recursive:true,force:true});throw error}
}
