import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'

const URL = 'https://maayanlab.cloud/Enrichr/geneSetLibrary?mode=text&libraryName=PanglaoDB_Augmented_2021'
const hash = text => createHash('sha256').update(text).digest('hex')
function pathIn(workspace, path) {
  if (typeof path !== 'string' || !path || path.includes('\\')) throw Error('Invalid GMT path')
  const location = resolve(workspace, path)
  if (!location.startsWith(resolve(workspace) + sep)) throw Error('GMT escapes workspace')
  return location
}
export async function checkSignatures(workspace, reference) {
  if (reference?.status !== 'complete' || reference.source_url !== URL ||
      !reference.file?.sha256 || !Number.isInteger(reference.file.bytes)) {
    throw Error('Invalid M7 signature snapshot')
  }
  const location = pathIn(workspace, reference.file.path)
  const data = await readFile(location, 'utf8')
  if (Buffer.byteLength(data) !== reference.file.bytes ||
      hash(data) !== reference.file.sha256) throw Error('Immune marker signature checksum mismatch')
  return location
}
export async function acquireSignatures(workspace, { refresh = false, download } = {}) {
  const pointer = join(workspace, 'study/immune-signature-reference.json')
  let previous
  try { previous = JSON.parse(await readFile(pointer, 'utf8')) }
  catch (e) { if (e.code !== 'ENOENT') throw e }
  if (previous && !refresh) {
    await checkSignatures(workspace, previous)
    return { status: 'cache-hit', manifest: previous }
  }
  const getter = download ?? (async url => {
    const response = await fetch(url, { signal: AbortSignal.timeout(120000) })
    if (!response.ok) throw Error('Immune GMT HTTP ' + response.status)
    return response.text()
  })
  const data = await getter(URL)
  if (typeof data !== 'string' || Buffer.byteLength(data) > 20000000 ||
      data.split(/\r?\n/).filter(line => line.split('\t').length >= 7).length < 2) {
    throw Error('Malformed PanglaoDB public marker GMT response')
  }
  const digest = hash(data)
  const id = 'panglao-2021-' + digest.slice(0, 16)
  const base = join(workspace, 'data/references/immune-panglao')
  const published = join(base, id)
  const pending = join(base, '.pending-' + randomUUID())
  const file = { path: relative(workspace, join(published, 'immune-markers.gmt')).replaceAll('\\', '/'),
    bytes: Buffer.byteLength(data), sha256: digest }
  await mkdir(pending, { recursive: true })
  try {
    await writeFile(join(pending, 'immune-markers.gmt'), data, { flag: 'wx' })
    try { await rename(pending, published) }
    catch (e) {
      if (!['EEXIST', 'ENOTEMPTY'].includes(e.code)) throw e
      await rm(pending, { recursive: true, force: true })
      await checkSignatures(workspace, { status: 'complete', source_url: URL, file })
    }
    const manifest = { schema: 1, id, status: 'complete',
      source_url: URL, source_library: 'PanglaoDB_Augmented_2021',
      created_at: new Date().toISOString(),
      source_mode: download ? 'offline-test-fixture' : 'public-live-fetch', file }
    await mkdir(dirname(pointer), { recursive: true })
    const temp = pointer + '.tmp-' + randomUUID()
    await writeFile(temp, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' })
    await rename(temp, pointer)
    return { status: 'downloaded', manifest }
  } catch (e) {
    await rm(pending, { recursive: true, force: true })
    throw e
  }
}
