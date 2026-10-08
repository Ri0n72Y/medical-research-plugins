#!/usr/bin/env node
import { access, mkdir, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawn, spawnSync } from 'node:child_process'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const skill = join(root, '.dsh/skills/capn1-aml-public-reconstruction')
const dshVersion = '0.2.0-rc.2'
const dshPackage = `@deepseek-ai/dsh@${dshVersion}`
const profiles = { web: 'research-web', headless: 'research-headless', acp: 'research-acp' }

export function parseArgs(argv) {
  const command = argv[0] ?? 'help'
  let mode = command === 'deploy' ? argv[1] ?? 'web' : command
  let index = command === 'deploy' && argv[1] && !argv[1].startsWith('--') ? 2 : 1
  if (command === 'deploy' && argv[1]?.startsWith('--')) { mode = 'web'; index = 1 }
  if (command === 'deploy' && !profiles[mode]) throw Error(`Unknown deploy mode: ${mode}`)
  const options = {
    command, mode, workspace: join(root, 'research-workspace'),
    dryRun: false, refresh: false, rerun: false,
  }
  for (let i = index; i < argv.length; i += 1) {
    if (argv[i] === '--workspace') {
      if (!argv[i + 1]) throw Error('Missing --workspace value')
      options.workspace = resolve(argv[++i])
    } else if (argv[i] === '--dry-run') options.dryRun = true
    else if (argv[i] === '--refresh') options.refresh = true
    else if (argv[i] === '--rerun') options.rerun = true
    else throw Error(`Unknown option: ${argv[i]}`)
  }
  if (command !== 'prepare' && (options.refresh || options.rerun)) {
    throw Error('--refresh and --rerun are only for prepare')
  }
  return options
}

function commandVersion(name) {
  const bin = process.platform === 'win32' ? `${name}.cmd` : name
  const result = spawnSync(bin, ['--version'], {
    encoding: 'utf8', shell: process.platform === 'win32',
  })
  return result.status === 0 ? result.stdout.trim() : null
}

export function prerequisiteReport() {
  return {
    node: process.version, npm: commandVersion('npm'),
    npx: commandVersion('npx'), pnpm: commandVersion('pnpm'),
  }
}

function requireTools(dryRun) {
  if (Number(process.versions.node.split('.')[0]) < 22) {
    throw Error('Node.js >=22 required; install Node LTS first.')
  }
  if (dryRun) return
  const report = prerequisiteReport()
  if (!report.npx) throw Error('npx missing; install Node.js with npm.')
  if (!report.pnpm) throw Error('pnpm missing; run: npm install -g pnpm@9.15.0')
}
const argsForDsh = args => ['--yes', dshPackage, ...args]
async function launch(args, { cwd, dryRun = false } = {}) {
  if (dryRun) {
    console.error(`$ (cd ${JSON.stringify(cwd)} && npx ${argsForDsh(args).map(JSON.stringify).join(' ')})`)
    return
  }
  const bin = process.platform === 'win32' ? 'npx.cmd' : 'npx'
  const env = {
    ...process.env, DSH_MED_RESEARCH_SKILL_ROOT: join(root, '.dsh/skills'),
  }
  const child = spawn(bin, argsForDsh(args), {
    cwd, env, stdio: 'inherit', shell: process.platform === 'win32',
  })
  const code = await new Promise((ok, fail) => {
    child.on('error', fail)
    child.on('close', ok)
  })
  if (code !== 0) throw Error(`DSH exited with code ${code}`)
}

function profilePath(name) {
  return join(resolve(process.env.DSH_HOME || join(homedir(), '.dsh')), 'profiles', name, 'package.json')
}
async function readProfile(name) {
  try { return JSON.parse(await readFile(profilePath(name), 'utf8')) }
  catch (error) { if (error.code === 'ENOENT') return undefined; throw error }
}
async function profileExists(name, template) {
  const config = await readProfile(name)
  if (!config) return false
  const suffix = template === 'web' ? 'web-app' : template === 'acp' ? 'acp-app' : 'headless'
  if (!JSON.stringify(config.dsh?.profile?.bundles ?? []).includes(`@deepseek-ai/dsh-${suffix}`)) {
    throw Error(`Existing ${name} was not created from ${template}; use a fresh DSH_HOME.`)
  }
  return true
}
async function bundleInstalled(name) {
  const config = await readProfile(name)
  return JSON.stringify(config?.dsh?.profile?.bundles ?? [])
    .includes('dsh-medical-research-skill-pack')
}

async function deploy(mode, options, { force = true } = {}) {
  requireTools(options.dryRun)
  const name = profiles[mode]
  if (!name) throw Error(`Unsupported mode: ${mode}`)
  if (options.dryRun || !await profileExists(name, mode)) {
    await launch(['--profile', name, '--from-default-profile', mode, '--dump-config'], {
      cwd: root, dryRun: options.dryRun,
    })
  }
  if (force || options.dryRun || !await bundleInstalled(name)) {
    await launch(['plugin', '--profile', name, 'add', root], {
      cwd: root, dryRun: options.dryRun,
    })
  }
  console.error(`Profile ${name}: deployment ${options.dryRun ? 'planned' : 'ready'}.`)
}
async function ensureWorkspace(workspace, dryRun) {
  if (dryRun) { console.error(`Workspace: ${workspace}`); return }
  await mkdir(workspace, { recursive: true })
  await access(skill)
}

async function prepareData(options) {
  await ensureWorkspace(options.workspace, options.dryRun)
  if (options.dryRun) {
    console.error(`Planned: init → GDC (${options.refresh ? 'explicit refresh' : 'cached'}) → M2 (${options.rerun ? 'explicit rerun' : 'cached'})`)
    return
  }
  const { initializeWorkspace } = await import(pathToFileURL(join(skill, 'scripts/init-workspace.mjs')).href)
  const { acquireSource } = await import(pathToFileURL(join(skill, 'scripts/gdc-source.mjs')).href)
  const { prepare } = await import(pathToFileURL(join(skill, 'scripts/m2-prepare.mjs')).href)
  const initialized = await initializeWorkspace(options.workspace)
  console.error(`Workspace: ${initialized.status}`)
  const source = await acquireSource({
    workspace: options.workspace, refresh: options.refresh,
    onProgress: event => {
      if (event.phase !== 'download' || event.completed % 25 === 0 || event.completed === event.total) {
        console.error(`[GDC] ${JSON.stringify(event)}`)
      }
    },
  })
  console.error(`[GDC] ${source.status} — ${source.snapshot}; ${source.files} files`)
  if (source.status === 'cache-hit') console.error('[CACHE] Reusing local GDC source; no external request.')
  const processed = await prepare(options.workspace, { rerun: options.rerun })
  console.error(`[M2] ${processed.status} — ${processed.manifest.id}`)
  if (processed.status === 'cache-hit') console.error('[CACHE] Reusing verified local M2 outputs; no reanalysis.')
  console.log(`QC report: ${processed.manifest.outputs.find(x => x.path.endsWith('/qc.md'))?.path}`)
  console.log('Researcher QC review required. No cohort, OS endpoint or final paper report is approved.')
}
function help() {
  console.log(`CAPN1 / AML Research — DSH ${dshVersion}

npm run doctor            Check Node/npm/npx/pnpm
npm run web               Deploy research-web as needed and launch DSH Web
npm run prepare           Download/cache public GDC data and write M2 QC
npm run headless:qc       Generate an AI-assisted summary from cached QC
npm run deploy:acp        Deploy the separate ACP profile
node scripts/cli.mjs acp  Serve ACP JSON-RPC (stdout reserved)

Options: --workspace <path>, --dry-run; prepare also: --refresh, --rerun`)
}
export async function main(argv = process.argv.slice(2)) {
  const opt = parseArgs(argv)
  if (opt.command === 'help') return help()
  if (opt.command === 'doctor') {
    console.log(JSON.stringify(prerequisiteReport(), null, 2))
    requireTools(opt.dryRun)
    return
  }
  if (opt.command === 'prepare') return prepareData(opt)
  if (opt.command === 'deploy') return deploy(opt.mode, opt)
  if (opt.command === 'web' || opt.command === 'headless') {
    await deploy(opt.command, opt, { force: false })
    await ensureWorkspace(opt.workspace, opt.dryRun)
    console.error(`[DSH] ${opt.command}, workspace: ${opt.workspace}`)
    const task = 'Use /capn1-aml-public-reconstruction. Inspect local workspace M1/M2 artifacts and QC. Explain cached observations only, no refetch or reanalysis. Save a concise QC summary under artifacts/reports/. Do not approve cohort or survival endpoints; if cache is missing, report the missing artifacts.'
    return launch(['--profile', profiles[opt.command], ...(opt.command === 'headless' ? [task] : [])], {
      cwd: opt.workspace, dryRun: opt.dryRun,
    })
  }
  if (opt.command === 'acp') {
    requireTools(opt.dryRun)
    if (!opt.dryRun && !await profileExists(profiles.acp, 'acp')) {
      throw Error('ACP profile missing; run npm run deploy:acp first.')
    }
    await ensureWorkspace(opt.workspace, opt.dryRun)
    return launch(['--profile', profiles.acp], { cwd: opt.workspace, dryRun: opt.dryRun })
  }
  throw Error(`Unknown command: ${opt.command}`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1 })
}
