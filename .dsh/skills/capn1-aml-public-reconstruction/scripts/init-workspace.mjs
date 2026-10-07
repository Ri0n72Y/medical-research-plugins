#!/usr/bin/env node
import { copyFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fileExists } from './lib/io.mjs'

export function parseArgs(argv) {
  const result = { workspace: process.cwd() }
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--workspace') result.workspace = argv[++i]
    else throw new Error(`unknown argument: ${argv[i]}`)
  }
  return result
}

export async function initializeWorkspace(workspace) {
  const skillRoot = dirname(dirname(fileURLToPath(import.meta.url)))
  const directories = [
    'study', 'references/searches', 'references/papers', 'references/notes',
    'data/manifests/gdc', 'data/raw/gdc', 'data/processed', 'runs',
    'artifacts/tables', 'artifacts/figures', 'artifacts/reports',
    'exploration/searches', 'exploration/analyses', 'exploration/notes',
  ]
  await Promise.all(directories.map(path => mkdir(join(workspace, path), { recursive: true })))

  const templates = [
    ['templates/reconstruction.yaml', 'study/reconstruction.yaml'],
    ['templates/decisions.yaml', 'study/decisions.yaml'],
    ['templates/brief.md', 'study/brief.md'],
    ['templates/status.md', 'study/status.md'],
  ]
  const created = []
  const reused = []
  for (const [source, target] of templates) {
    const destination = join(workspace, target)
    if (await fileExists(destination)) {
      reused.push(target)
      continue
    }
    await copyFile(join(skillRoot, source), destination)
    created.push(target)
  }
  return { status: created.length ? 'initialized' : 'existing', created, reused }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2))
    console.log(JSON.stringify(await initializeWorkspace(args.workspace), null, 2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
