#!/usr/bin/env node
// Explicit exploratory analysis only. Never run as an installation hook.
import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCohort } from './m3-cohort.mjs'

const skillScripts = dirname(fileURLToPath(import.meta.url))
const digest = value => createHash('sha256').update(value).digest('hex')
async function fileDigest(path) { return digest(await readFile(path)) }
async function readJson(path) {
  try { return JSON.parse(await readFile(path, 'utf8')) }
  catch (error) { if (error.code === 'ENOENT') return undefined; throw error }
}
function argumentsFrom(argv) {
  const args = { workspace: process.cwd(), rerun: false }
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--workspace' && argv[i + 1]) args.workspace = resolve(argv[++i])
    else if (argv[i] === '--rerun') args.rerun = true
    else throw Error('Usage: pnpm run data:survival:explore [--workspace <path>] [--rerun]')
  }
  return args
}
async function runR(dir) {
  const binary = process.platform === 'win32' ? 'Rscript.exe' : 'Rscript'
  const cmd = join(skillScripts, 'm3-survival.R')
  const child = spawn(binary, [cmd, dir], { stdio: 'inherit' })
  const code = await new Promise((ok, fail) => {
    child.on('error', fail)
    child.on('close', ok)
  })
  if (code !== 0) throw Error(`R survival analysis failed (exit ${code})`)
}
async function outputsValid(run) {
  if (!run?.directory || !run?.outputs) return false
  try {
    for (const [name, hash] of Object.entries(run.outputs)) {
      if (await fileDigest(join(run.directory, name)) !== hash) return false
    }
    return Object.keys(run.outputs).length === 3
  } catch { return false }
}
export async function explore(workspace, { rerun = false } = {}) {
  const source = await readJson(join(workspace, 'study/source.json'))
  const processed = await readJson(join(workspace, 'study/processed.json'))
  if (!source || !processed || processed.source_digest !== source.digest) {
    throw Error('M1/M2 source and processed outputs required; run pnpm run data:prepare first')
  }
  const inputEntry = processed.outputs.find(x => x.path.endsWith('/capn1-expression.tsv'))
  if (!inputEntry) throw Error('CAPN1 expression is missing in M2 output')
  const inputSha = await fileDigest(join(workspace, inputEntry.path))
  if (inputSha !== inputEntry.sha256) throw Error('M2 CAPN1 file checksum mismatch')
  const methodSha = digest([
    await readFile(join(skillScripts, 'm3-cohort.mjs')),
    await readFile(join(skillScripts, 'm3-survival.R')),
  ].map(x => x.toString('utf8')).join('\n'))
  const cachePath = join(workspace, 'exploration/capn1-os/latest.json')
  const prior = await readJson(cachePath)
  if (!rerun && prior && prior.sourceDigest === source.digest &&
      prior.processedRun === processed.id && prior.inputSha === inputSha &&
      prior.methodSha === methodSha && await outputsValid(prior)) {
    console.log(`[CACHE] Reusing exploratory survival report: ${prior.directory}`)
    return { status: 'cache-hit', ...prior }
  }
  const run = await buildCohort(workspace)
  await runR(run.directory)
  const outputs = {}
  for (const name of ['provisional-report.md', 'provisional-results.tsv', 'provisional-kaplan-meier.png']) {
    outputs[name] = await fileDigest(join(run.directory, name))
  }
  const active = { directory: run.directory, sourceDigest: source.digest,
    processedRun: processed.id, inputSha, methodSha, outputs,
    status: 'exploratory-not-canonical' }
  await mkdir(dirname(cachePath), { recursive: true })
  const temp = `${cachePath}.tmp-${randomUUID()}`
  await writeFile(temp, JSON.stringify(active, null, 2) + '\n')
  await rename(temp, cachePath)
  return { status: 'completed', ...active }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { workspace, rerun } = argumentsFrom(process.argv.slice(2))
  explore(workspace, { rerun }).then(result => console.log(JSON.stringify(result, null, 2)))
    .catch(error => { console.error(error); process.exitCode = 1 })
}
