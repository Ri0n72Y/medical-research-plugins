import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptPath = fileURLToPath(import.meta.url)
const implementation = 'capn1-m8-evidence-synthesis-v1'
const stages = [
  ['source','M1','PUBLIC-FIXED'], ['processed','M2','PUBLIC-FIXED'],
  ['survival','M3','RECONSTRUCTED'], ['deg','M4','RECONSTRUCTED'],
  ['enrichment','M5','RECONSTRUCTED'], ['ppi','M6','PUBLIC-FIXED / D4'],
  ['immune','M7','RECONSTRUCTED / D5'],
]
const names = ['report.md','evidence-register.tsv','gaps.tsv','provenance.json']
const digest = x => createHash('sha256').update(x).digest('hex')
async function sha(path) {
  const h = createHash('sha256')
  for await (const chunk of createReadStream(path)) h.update(chunk)
  return h.digest('hex')
}
function contained(workspace, name) {
  if (typeof name !== 'string' || !name || name.includes('\\')) throw Error('Invalid artifact path')
  const path = resolve(workspace,name)
  if (!path.startsWith(resolve(workspace)+sep)) throw Error('Artifact escapes workspace')
  return path
}
async function optional(path) {
  try {return JSON.parse(await readFile(path,'utf8'))}
  catch(e) {if(e.code==='ENOENT') return null; throw e}
}
async function verify(workspace, stage, manifest) {
  if (manifest.status !== 'complete') throw Error(stage+' run is incomplete')
  if (stage==='M1') {
    if (!manifest.digest || !manifest.snapshot) throw Error('M1 missing source identity')
    return {manifest,outputs:new Map()}
  }
  if (!manifest.id || !Array.isArray(manifest.outputs) || !manifest.outputs.length)
    throw Error(stage+' manifest missing outputs')
  const outputs = new Map()
  for (const item of manifest.outputs) {
    const name = item.path?.split('/').at(-1)
    if (!name || outputs.has(name) || !Number.isInteger(item.bytes) ||
      !/^[0-9a-f]{64}$/.test(item.sha256)) throw Error(stage+' malformed manifest')
    const path=contained(workspace,item.path)
    if ((await stat(path)).size !== item.bytes || await sha(path) !== item.sha256)
      throw Error(stage+' output checksum mismatch: '+item.path)
    outputs.set(name,item)
  }
  // Reference snapshots are not regular run outputs but are part of the
  // reproducibility boundary for GO/KEGG and ssGSEA interpretation.
  const refFiles=stage==='M5' ? Object.values(manifest.gene_set_reference?.files??{}) :
    stage==='M7' ? [manifest.signature_reference?.file] : []
  if(stage==='M7'&&!manifest.signature_reference?.file) throw Error('M7 missing signature snapshot')
  for(const item of refFiles) {
    if(!item || !Number.isInteger(item.bytes) || !/^[0-9a-f]{64}$/.test(item.sha256))
      throw Error(stage+' invalid reference manifest')
    const path=contained(workspace,item.path)
    if((await stat(path)).size!==item.bytes || await sha(path)!==item.sha256)
      throw Error(stage+' reference checksum mismatch: '+item.path)
  }
  return {manifest,outputs}
}
function checkLineage(items) {
  const m=k=>items.get(k)?.manifest
  const source=m('source'),m2=m('processed'),m3=m('survival')
  const m4=m('deg'),m5=m('enrichment'),m6=m('ppi'),m7=m('immune')
  for (const [key,value] of [['M2',m2],['M3',m3],['M4',m4],['M5',m5],['M6',m6],['M7',m7]]) {
    if(value && (!source || value.source_digest !== source.digest))
      throw Error(key+' source lineage mismatch')
  }
  for (const [key,value,prev] of [['M3',m3,m2],['M4',m4,m3],['M5',m5,m4],
    ['M6',m6,m4],['M7',m7,m3]]) {
    if(!value) continue
    if(!prev) throw Error(key+' upstream stage absent')
    if (value.m2_id && value.m2_id !== m2?.id) throw Error(key+' M2 lineage mismatch')
    if (value.m3_id && value.m3_id !== m3?.id) throw Error(key+' M3 lineage mismatch')
    if (value.m4_id && value.m4_id !== m4?.id) throw Error(key+' M4 lineage mismatch')
  }
}
const table=(headers,rows)=>[headers.join('\t'),...rows.map(r=>r.map(x=>
  String(x??'').replaceAll('\t',' ').replaceAll('\n',' ')).join('\t'))].join('\n')+'\n'
function gaps(items) {
  const rows=stages.filter(s=>!items.has(s[0])).map(s=>
    [s[1],'missing','No verified active stage result; findings not inferred'])
  const m6=items.get('ppi')?.manifest, m7=items.get('immune')?.manifest
  if(!m6) rows.push(['D4','not_verified','No active M6 run with selected confidence'])
  if(!m7) rows.push(['D5','not_verified','No active M7 run with selected immune pathway'])
  if(m6 && m6.parameters?.mode!=='live')
    rows.push(['M6','offline_only','Active STRING result has no live API provenance'])
  if(m7 && m7.signature_reference?.source_mode!=='public-live-fetch')
    rows.push(['M7','offline_only','Active signature snapshot has no live retrieval provenance'])
  rows.push(['Original paper','not_assessed','Comparable published numeric effect sizes not registered'])
  rows.push(['Scientific review','pending','Researcher approval and external experiments not substituted'])
  return rows
}
function render(items,issues,excerpts,status) {
  const lines=[
    '# CAPN1 / TCGA-LAML — Public Reconstruction Evidence Report','',
    '**Status: '+status.toUpperCase().replaceAll('_',' ')+'**','',
    'This report assembles verified workspace results; it is not numerical replication or patient guidance.','',
    '## Public study claim (method-level only)','',
    'Houcai Wang et al., CAPN1 is a novel biomaker of patients with AML based on comprehensive analysis (PMID 37114994).',
    'The canonical paper reference describes TCGA, CAPN1 clinical/prognostic association, differential expression, GO/KEGG, DAVID, STRING, CIBERSORT and ssGSEA.',
    'No original numerical comparisons or unreported parameters are invented.','',
    '## Local reconstruction evidence',''
  ]
  for(const [key,label,kind] of stages) {
    lines.push('### '+label+' — '+kind)
    const item=items.get(key)
    if(!item) {lines.push('**MISSING**: no active verified result.','');continue}
    const m=item.manifest
    lines.push('- Verified pointer: study/'+key+'.json',
      '- Run identity: '+(m.id??m.snapshot)+
      ' / implementation: '+(m.implementation??'source acquisition'))
    if(label==='M1') lines.push('- Public source digest: '+m.digest)
    if(label==='M5') lines.push('- Method substitution: Python GO/KEGG, not original DAVID.')
    if(label==='M6') lines.push('- STRING functional associations, not confirmed physical binding.')
    if(label==='M7') lines.push('- ssGSEA marker scores, not CIBERSORT or immune cell fractions.')
    const bullets=excerpts.get(key)??[]
    if(bullets.length)lines.push('- Excerpts from checksum-verified stage report:',
      ...bullets.map(v=>'  '+v))
    lines.push('')
  }
  lines.push('## Directional agreement with the original paper','',
    '**UNASSESSED**. There is no verified comparable numeric reference for these cohort and method versions. Agreement is not inferred.','',
    '## Missing evidence and decision gates','',
    '| Stage | Status | Explanation |','|---|---|---|',
    ...issues.map(r=>'| '+r.map(x=>x.replaceAll('|','/')).join(' | ')+' |'),'',
    '## Interpretation and audit limits','',
    'The local results listed here come from completed manifests with SHA-256 checked registered outputs.',
    'The detailed output identities and digests are in evidence-register.tsv and provenance.json.',
    'M8 does not rehash the complete original GDC raw archive, rerun earlier scientific stages or use conversational memory as data.',
    'Observed associations do not establish biological mechanism, clinical prognosis or therapeutic effect.',
    'A researcher must review and explicitly approve scientific conclusions; READY FOR RESEARCHER REVIEW is not approval.','')
  return lines.join('\n')
}
export async function generateReconstruction(workspace,{rerun=false,requireComplete=false}={}) {
  const items=new Map()
  for(const [key,label] of stages){
    const m=await optional(join(workspace,'study',key+'.json'))
    if(m)items.set(key,await verify(workspace,label,m))
  }
  checkLineage(items)
  const issues=gaps(items)
  const ppi=items.get('ppi')?.manifest,immune=items.get('immune')?.manifest
  const ready=stages.every(s=>items.has(s[0])) && ppi.parameters?.mode==='live' &&
    immune.signature_reference?.source_mode==='public-live-fetch'
  const reportStatus=ready?'ready_for_researcher_review':'incomplete_draft'
  if(requireComplete&&!ready)throw Error('M8 evidence incomplete; complete report refused')
  const scriptDigest=await sha(scriptPath)
  const inputs=stages.map(([key])=>{
    const m=items.get(key)?.manifest
    return [key,m?.id??m?.digest??null,
      m?.outputs?.map(v=>[v.path,v.sha256])??null,
      m?.signature_reference?.file?.sha256??null,
      m?.gene_set_reference?.files ? Object.values(m.gene_set_reference.files)
        .map(v=>[v.path,v.sha256]) : null]
  })
  const fingerprint=digest(JSON.stringify({implementation,scriptDigest,inputs,reportStatus}))
  const pointer=join(workspace,'study/reconstruction-report.json')
  const current=await optional(pointer)
  if(current&&!rerun&&current.fingerprint===fingerprint){
    try {await verify(workspace,'M8',current)}
    catch {throw Error('Existing M8 report damaged; explicit --rerun required')}
    return {status:'cache-hit',manifest:current}
  }
  const evidence=[], excerpts=new Map()
  for(const [key,label] of stages){
    const entry=items.get(key)
    if(!entry)continue
    for(const [name,v] of entry.outputs)evidence.push([label,name,v.path,v.sha256,v.bytes])
    const artifact=entry.outputs.get(key==='processed'?'qc.md':'report.md')
    if(artifact){
      const data=await readFile(contained(workspace,artifact.path),'utf8')
      excerpts.set(key,data.split(/\r?\n/).filter(l=>l.startsWith('- ')).slice(0,14))
    }
  }
  const id='m8-'+Date.now()+'-'+randomUUID().slice(0,8)
  const folder=join(workspace,'runs/m8-reconstruction')
  const stage=join(folder,'.pending-'+id),completed=join(folder,id)
  await mkdir(stage,{recursive:true})
  try {
    await writeFile(join(stage,'report.md'),render(items,issues,excerpts,reportStatus))
    await writeFile(join(stage,'evidence-register.tsv'),
      table(['stage','artifact','path','sha256','bytes'],evidence))
    await writeFile(join(stage,'gaps.tsv'),table(['stage','status','explanation'],issues))
    const provenance={schema:1,implementation,created_at:new Date().toISOString(),
      report_status:reportStatus,paper:{pmid:'37114994',directional_agreement:'unassessed'},
      stages:stages.map(([key,label,kind])=>({stage:label,classification:kind,
        pointer:'study/'+key+'.json',status:items.has(key)?'verified':'missing',
        run_id:items.get(key)?.manifest.id??null})),
      original_gdc_raw_rehash:'not_performed',scientific_signoff:'required',gaps:issues}
    await writeFile(join(stage,'provenance.json'),JSON.stringify(provenance,null,2)+'\n')
    const outputs=await Promise.all(names.map(async name=>{
      const path=join(stage,name)
      return {path:relative(workspace,join(completed,name)).replaceAll('\\','/'),
        bytes:(await stat(path)).size,sha256:await sha(path)}
    }))
    const manifest={schema:1,status:'complete',report_status:reportStatus,implementation,
      id,created_at:new Date().toISOString(),script_digest:scriptDigest,fingerprint,
      inputs,summary:{verified_stages:items.size,total_stages:stages.length,
        scientific_approval:false},outputs}
    await writeFile(join(stage,'run-manifest.json'),JSON.stringify(manifest,null,2)+'\n')
    await rename(stage,completed)
    const temp=pointer+'.tmp-'+randomUUID()
    await writeFile(temp,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'})
    await rename(temp,pointer)
    return {status:'generated',manifest}
  }catch(e){await rm(stage,{recursive:true,force:true});throw e}
}
