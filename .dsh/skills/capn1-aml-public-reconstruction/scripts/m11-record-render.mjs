const field = x => String(x ?? '').replaceAll('\t',' ').replaceAll('\r',' ').replaceAll('\n',' ')
const table = (headers,rows) => [headers.join('\t'),...rows.map(r=>r.map(field).join('\t'))].join('\n')+'\n'
const literal = x => String.fromCharCode(96)+String(x)+String.fromCharCode(96)
const link = path => '['+path+'](../../../'+encodeURI(path)+')'
const heading = step => step.step+' — '+step.paper

export function renderRecord(flow,states,decisionText,sessionText) {
  const stageRows=[],artifactRows=[]
  const lines=[
    '# CAPN1/AML — Paper-to-Workspace Research Record','',
    '**Paper:** '+flow.publication.title+' (PMID '+flow.publication.pmid+')','',
    '**Scope:** '+flow.publication.basis+'. This index observes current workspace pointers; it does not re-run statistics or independently verify input data.','',
    '## Research structure','',
    'This case has two research objects: the CAPN1/AML procedure and the DSH Harness workflow used to unfold that procedure.',
    'Researchers choose the question, methods, material settings, angles and interpretation. The Harness is tasked with translating the chosen route into tool calls, durable outputs and resumable steps.',
    'A CLI output alone is **not** evidence that an Agent made the call; runtime participation needs separate observation.','',
    '## Paper-to-execution map','',
    '| Step | Paper procedure | Workspace result | Researcher decision | Runnable route |',
    '|---|---|---|---|---|'
  ]
  for(const step of flow.steps) {
    const state=states.get(step.key)
    lines.push('| '+step.step+' | '+step.paper.replaceAll('|','/')+' | **'+state.status+'** | '+
      (step.decision||'—')+' | '+literal(step.command)+' |')
    stageRows.push([step.step,step.key,step.paper,state.status,step.pointer,
      state.manifest?.id??state.manifest?.snapshot??'',step.command,step.decision,step.method])
    for(const file of state.manifest?.outputs??[])
      artifactRows.push([step.step,file.path,file.sha256,file.bytes])
    if(step.key==='source' && state.manifest) {
      for(const path of [state.manifest.manifest,state.manifest.clinical].filter(Boolean))
        artifactRows.push([step.step,path,'',''])
    }
  }
  lines.push('','## Reconstructed stages and observed artifacts','')
  for(const step of flow.steps) {
    const state=states.get(step.key),m=state.manifest
    lines.push('### '+heading(step),'',
      '- Paper method: '+step.paper,
      '- Route: '+literal(step.command),
      '- Tool ownership: '+step.tool,
      '- Method note: '+step.method,
      '- Researcher gates: '+(step.decision||'none specified for this step'),
      '- Active pointer: '+literal(step.pointer),
      '- Execution evidence: **'+state.status+'**')
    if(!m){lines.push('- Next action: execute the route under researcher-chosen settings.','');continue}
    lines.push('- Recorded run: '+literal(m.id??m.snapshot??'not named'),
      '- Recorded implementation: '+literal(m.implementation??'public source'),
      '- Recorded source: '+literal(m.source??m.snapshot??'not specified'))
    if(step.key==='source') {
      if(m.digest) lines.push('- GDC source identity digest: '+literal(m.digest))
      if(m.manifest) lines.push('- GDC source manifest: '+link(m.manifest))
      if(m.clinical) lines.push('- Clinical data snapshot: '+link(m.clinical))
      lines.push('- Cases: '+(m.cases??'not recorded')+
        '; expression files: '+(m.files?.length??'not recorded'))
    }
    if(m.report_status) lines.push('- M8 synthesis status: **'+m.report_status+'**')
    if(m.parameters) lines.push('- Recorded parameters: '+literal(JSON.stringify(m.parameters)))
    if(!m.outputs?.length && step.key!=='source')
      lines.push('- Output catalog: not provided by this active pointer.')
    for(const item of m.outputs??[])lines.push('- Output: '+link(item.path))
    lines.push('')
  }
  const fence=String.fromCharCode(96).repeat(3)
  lines.push('## Researcher decisions (workspace source)','',
    'These are the stored decisions/proposals, **not** proof that the researcher approved every value. Per-run parameters above are the actual recorded run settings.','',
    'Source: '+literal('study/decisions.yaml'),'')
  if(decisionText)lines.push(fence+'yaml',decisionText.trimEnd(),fence)
  else lines.push('**MISSING**: no decisions file in this workspace.')
  lines.push('','## Harness as the second research object','',
    'The scientific question is how researcher-directed procedures become reproducible, inspectable work—not whether the Agent independently judges CAPN1 biology.','',
    '| Harness claim to demonstrate | Existing evidence | Missing observation |',
    '|---|---|---|',
    '| Method-to-tool translation | Paper map and CLI routes above | A real Agent selecting the right route |',
    '| Repeated computation delegated | Run pointers and table/figure outputs | Attribution of tool calls to a DSH session |',
    '| Durable state outside chat | Workspace pointers and immutable run paths | Re-enter DSH and open the same record |',
    '| Human control of forks | D1–D5 file and per-run settings | Captured question/answer and researcher intervention |',
    '| Auditable handoff | Listed artifacts and method substitutions | Actual researcher review of the resulting outputs |','')
  lines.push('### DSH runtime observation','',
    sessionText?.trim() ?
      'An operator-supplied DSH observation note is present: '+link('study/harness-session.md')+'. Its contents are not independently authenticated.' :
      '**UNOBSERVED:** no nonempty '+literal('study/harness-session.md')+' is present. Do not claim the Agent launched these computations.',
    'Capture session, chosen route, human decision, concrete tool calls, cache reuse, session restart and failures in that note. Do not fabricate screenshots, calls or timings.','',
    '## Completion boundary','',
    '- Recorded steps: '+flow.steps.filter(s=>states.get(s.key).status==='recorded').length+'/'+flow.steps.length+'. Missing and draft steps remain visible.',
    '- M8 summarizes **M1–M7**, whereas this record also indexes pan-cancer, clinical and composition supplements.',
    '- The NNLS marker counterpart is not an authentic CIBERSORT estimate; public GO/KEGG is not original DAVID.',
    '- This is a process-reconstruction and Harness case study, not a clinical conclusion or a verified figure-by-figure copy of the paper.','')
  const harness=lines.slice(lines.indexOf('## Harness as the second research object'))
  return {markdown:lines.join('\n'),workflow:table(
    ['step','key','paper_procedure','status','pointer','run_id','command','decisions','method_note'],stageRows),
    artifacts:table(['step','path','sha256','bytes'],artifactRows),
    harness:harness.join('\n')}
}
