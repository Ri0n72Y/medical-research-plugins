import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile, rename, rm, stat } from 'node:fs/promises'
import { resolve, join, relative, sep, dirname } from 'node:path'

const urls = {
  links: 'https://rest.kegg.jp/link/pathway/hsa',
  titles: 'https://rest.kegg.jp/list/pathway/hsa',
}
const hash = value => createHash('sha256').update(value).digest('hex')
function inside(workspace, subpath) {
  if (typeof subpath !== 'string' || !subpath || subpath.includes('\\')) throw Error('Invalid reference path')
  const path = resolve(workspace, subpath)
  if (!path.startsWith(resolve(workspace) + sep)) throw Error('Reference path escapes workspace')
  return path
}
async function integrity(workspace, meta) {
  if (!meta || meta.status !== 'complete' || !meta.id || !meta.files) return false
  for (const key of ['links','titles']) {
    const item = meta.files[key]
    if (!item?.path || !item.sha256 || !Number.isInteger(item.bytes)) return false
    try {
      const path = inside(workspace, item.path)
      if ((await stat(path)).size !== item.bytes ||
          hash(await readFile(path, 'utf8')) !== item.sha256) return false
    } catch { return false }
  }
  return true
}
export async function acquireKegg(workspace, { refresh = false, download = async url => {
  const response = await fetch(url, { signal: AbortSignal.timeout(45000) })
  if (!response.ok) throw Error('KEGG REST returned HTTP ' + response.status)
  return response.text()
} } = {}) {
  const pointer = join(workspace, 'study/kegg-reference.json')
  let active
  try { active = JSON.parse(await readFile(pointer, 'utf8')) }
  catch (error) { if (error.code !== 'ENOENT') throw error }
  // Refuse a corrupt existing annotation snapshot: silently refetching would hide provenance drift.
  if (active && !refresh && !await integrity(workspace, active)) throw Error('Corrupted KEGG reference cache; investigate or request --refresh-kegg')
  if (active && !refresh) return { status: 'cache-hit', manifest: active }
  const texts = await Promise.all(['links','titles'].map(key => download(urls[key])))
  const [links, titles] = texts
  if (typeof links !== 'string' || typeof titles !== 'string' ||
      links.split('\n').filter(Boolean).length < 10 ||
      titles.split('\n').filter(Boolean).length < 10 ||
      !links.includes('\t') || !titles.includes('\t')) {
    throw Error('Incomplete public KEGG reference response')
  }
  const id = 'kegg-hsa-' + hash(JSON.stringify(texts)).slice(0, 16)
  const base = join(workspace, 'data/references/kegg-hsa')
  const published = join(base, id)
  const files = Object.fromEntries([['links','links.tsv',links], ['titles','titles.tsv',titles]].map(
    ([key, name, content]) => [key, {
      path: relative(workspace, join(published, name)).replaceAll('\\','/'),
      bytes: Buffer.byteLength(content), sha256: hash(content),
    }]
  ))
  const pending = join(base, '.pending-' + randomUUID())
  await mkdir(pending, { recursive: true })
  try {
    await writeFile(join(pending, 'links.tsv'), links, { flag: 'wx' })
    await writeFile(join(pending, 'titles.tsv'), titles, { flag: 'wx' })
    await mkdir(base, { recursive: true })
    try { await rename(pending, published) }
    catch (error) {
      // An identical prior immutable snapshot may exist on explicit refresh.
      if (error.code !== 'EEXIST' && error.code !== 'ENOTEMPTY') throw error
      await rm(pending, { recursive: true, force: true })
      const prior = { status: 'complete', id, files }
      if (!await integrity(workspace, prior)) throw Error('Existing KEGG snapshot differs from requested content')
    }
    const next = { schema: 1, status: 'complete', id, created_at: new Date().toISOString(),
      source: 'KEGG REST, Homo sapiens', urls, files }
    const tmp = pointer + '.tmp-' + randomUUID()
    await mkdir(dirname(pointer), { recursive: true })
    await writeFile(tmp, JSON.stringify(next, null, 2) + '\n', { flag: 'wx' })
    await rename(tmp, pointer)
    return { status: 'downloaded', manifest: next }
  } catch (error) {
    await rm(pending, { recursive: true, force: true })
    throw error
  }
}
export async function verifyKegg(workspace, manifest) {
  if (!await integrity(workspace, manifest)) throw Error('KEGG reference integrity check failed')
  return {
    links: inside(workspace, manifest.files.links.path),
    titles: inside(workspace, manifest.files.titles.path),
  }
}
