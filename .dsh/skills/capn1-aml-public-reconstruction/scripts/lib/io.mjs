import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { access, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`)
    return `{${entries.join(',')}}`
  }
  return JSON.stringify(value)
}

export function sha256Text(value) {
  return createHash('sha256').update(value).digest('hex')
}

export async function fileExists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

export async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

export async function readJsonIfExists(path) {
  if (!(await fileExists(path))) return undefined
  return readJson(path)
}

export async function writeTextAtomic(path, content) {
  await mkdir(dirname(path), { recursive: true })
  const tmp = `${path}.tmp-${process.pid}`
  await writeFile(tmp, content, 'utf8')
  await rename(tmp, path)
}

export async function writeJsonAtomic(path, value) {
  return writeTextAtomic(path, `${JSON.stringify(value, null, 2)}\n`)
}

export async function md5File(path) {
  const hash = createHash('md5')
  await new Promise((resolve, reject) => {
    const stream = createReadStream(path)
    stream.on('data', chunk => hash.update(chunk))
    stream.on('end', resolve)
    stream.on('error', reject)
  })
  return hash.digest('hex')
}

export async function fastFileMatches(path, expectedBytes) {
  try {
    const info = await stat(path)
    return info.isFile() && Number(info.size) === Number(expectedBytes)
  } catch {
    return false
  }
}
