import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile, rename, rm, stat } from 'node:fs/promises'
import { resolve, join, relative, sep, dirname } from 'node:path'

const libraries = {
  go_bp: 'GO_Biological_Process_2025',
  go_mf: 'GO_Molecular_Function_2025',
  go_cc: 'GO_Cellular_Component_2025',
  kegg: 'KEGG_2021_Human',
}
const urls = Object.fromEntries(Object.entries(libraries)
  .map(([key, value]) => [key, 'https://maayanlab.cloud/Enrichr/geneSetLibrary?mode=text&libraryName=' + value]))
const sha = text => createHash('sha256').update(text).digest('hex')
function within(workspace, ref) {
  if (typeof ref !== 'string' || !ref || ref.includes('\\')) throw Error('Invalid annotation path')
  const path = resolve(workspace, ref)
  if (!path.startsWith(resolve(workspace) + sep)) throw Error('Annotation path escapes study')
  return path
}
async function valid(workspace, reference) {
  if (reference?.status !== 'complete' || !reference.files) return false
  for (const name of Object.keys(libraries)) {
    const file = reference.files[name]
    if (!file || !Number.isInteger(file.bytes) || !file.sha256) return false
    try {
      const abs = within(workspace, file.path)
      if ((await stat(abs)).size !== file.bytes ||
          sha(await readFile(abs, 'utf8')) !== file.sha256) return false
    } catch { return false }
  }
  return true
}
export async function acquireLibraries(workspace, { refresh = false, download = async url => {
  const response = await fetch(url, { signal: AbortSignal.timeout(120000) })
  if (!response.ok) throw Error('Enrichr library HTTP ' + response.status)
  return response.text()
} } = {}) {
  const pointer = join(workspace, 'study/gene-set-reference.json')
  let current
  try { current = JSON.parse(await readFile(pointer, 'utf8')) }
  catch (e) { if (e.code !== 'ENOENT') throw e }
  if (current && !refresh) {
    if (!await valid(workspace, current)) throw Error('Corrupted gene-set reference cache; use --refresh-kegg explicitly')
    return { status: 'cache-hit', manifest: current }
  }
  const names = Object.keys(libraries)
  const texts = await Promise.all(names.map(name => download(urls[name])))
  for (let i = 0; i < texts.length; i++) {
    if (typeof texts[i] !== 'string' || texts[i].split('\n').filter(line => line.split('\t').length >= 4).length < 2) {
      throw Error('Invalid public GO/KEGG GMT response: ' + names[i])
    }
  }
  const id = 'human-gmt-' + sha(JSON.stringify(texts)).slice(0, 16)
  const base = join(workspace, 'data/references/enrichr-human')
  const published = join(base, id)
  const stage = join(base, '.pending-' + randomUUID())
  const files = Object.fromEntries(names.map((name, i) => [name, {
    path: relative(workspace, join(published, name + '.gmt')).replaceAll('\\', '/'),
    bytes: Buffer.byteLength(texts[i]), sha256: sha(texts[i]),
  }]))
  await mkdir(stage, { recursive: true })
  try {
    await Promise.all(names.map((name, i) => writeFile(join(stage, name + '.gmt'), texts[i], { flag: 'wx' })))
    try { await rename(stage, published) }
    catch (e) {
      if (!['EEXIST', 'ENOTEMPTY'].includes(e.code)) throw e
      await rm(stage, { recursive: true, force: true })
      if (!await valid(workspace, { status: 'complete', files })) {
        throw Error('Existing immutable annotation snapshot conflicts')
      }
    }
    const manifest = { schema: 2, status: 'complete', id, created_at: new Date().toISOString(),
      source: 'Enrichr static human GO/KEGG GMT libraries', libraries, urls, files }
    const temp = pointer + '.tmp-' + randomUUID()
    await mkdir(dirname(pointer), { recursive: true })
    await writeFile(temp, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' })
    await rename(temp, pointer)
    return { status: 'downloaded', manifest }
  } catch (e) {
    await rm(stage, { recursive: true, force: true })
    throw e
  }
}
export async function verifyLibraries(workspace, reference) {
  if (!await valid(workspace, reference)) throw Error('Gene-set library checksum mismatch')
  return dirname(within(workspace, reference.files.go_bp.path))
}
