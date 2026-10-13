import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { parseArgs } from './cli.mjs'

const cli = resolve(dirname(fileURLToPath(import.meta.url)), 'cli.mjs')

test('deploy modes and refresh intent are distinct', () => {
  assert.equal(parseArgs(['deploy', 'acp']).mode, 'acp')
  assert.equal(parseArgs(['deploy', '--dry-run']).mode, 'web')
  assert.equal(parseArgs(['headless']).mode, 'headless')
  assert.equal(parseArgs(['prepare', '--refresh', '--rerun']).refresh, true)
  assert.throws(() => parseArgs(['web', '--refresh']), /only for prepare/)
  assert.throws(() => parseArgs(['deg', '--refresh-kegg']), /only for enrichment/)
  assert.equal(parseArgs(['enrichment', '--refresh-kegg', '--rerun']).refreshKegg, true)
  assert.throws(() => parseArgs(['deploy', 'unknown']), /Unknown deploy mode/)
})

test('dry-run Web creates a web-based profile and pins DSH', () => {
  const run = spawnSync(process.execPath, [cli, 'web', '--dry-run', '--workspace', '/tmp/research'], { encoding: 'utf8' })
  assert.equal(run.status, 0, run.stderr)
  assert.match(run.stderr, /--from-default-profile.*web/)
  assert.match(run.stderr, /@deepseek-ai\/dsh@0\.2\.0-rc\.2/)
  assert.match(run.stderr, /pnpm/)
  assert.match(run.stderr, /dlx/)
  assert.match(run.stderr, /research-web/)
  assert.doesNotMatch(run.stderr, /research-headless/)
})

test('dry-run prepare neither starts a model session nor downloads', () => {
  const run = spawnSync(process.execPath, [cli, 'prepare', '--dry-run', '--refresh'], { encoding: 'utf8' })
  assert.equal(run.status, 0, run.stderr)
  assert.match(run.stderr, /explicit refresh/)
  assert.doesNotMatch(run.stderr, /(?:\\bnpx\\b|\\bnpm\\b)/)
})

test('ACP dry-run has a dedicated profile, not the Web entrypoint', () => {
  const run = spawnSync(process.execPath, [cli, 'acp', '--dry-run'], { encoding: 'utf8' })
  assert.equal(run.status, 0, run.stderr)
  assert.match(run.stderr, /research-acp/)
  assert.doesNotMatch(run.stderr, /research-web/)
})

test('package lifecycle cannot invoke a public GDC download during install or tests', async () => {
  const { readFile } = await import('node:fs/promises')
  const pkg = JSON.parse(await readFile(resolve(dirname(fileURLToPath(import.meta.url)), '../package.json'), 'utf8'))
  assert.equal(pkg.scripts.prepare, undefined)
  assert.equal(pkg.scripts.preinstall, undefined)
  assert.equal(pkg.scripts.postinstall, undefined)
  assert.ok(pkg.scripts['data:prepare'].includes('scripts/cli.mjs prepare'))
})

test('M6 CLI confidence and refresh controls are isolated from earlier stages', () => {
  assert.equal(parseArgs(['ppi', '--required-score', '400']).requiredScore, 400)
  assert.equal(parseArgs(['ppi', '--required-score', '0']).requiredScore, 0)
  assert.equal(parseArgs(['ppi', '--refresh-string']).refreshString, true)
  assert.throws(() => parseArgs(['ppi', '--required-score', '1001']), /0..1000/)
  assert.throws(() => parseArgs(['ppi', '--required-score', '-1']), /invalid/)
  assert.throws(() => parseArgs(['deg', '--required-score', '400']), /only for ppi/)
  assert.throws(() => parseArgs(['deg', '--refresh-string']), /only for ppi/)
  const run = spawnSync(process.execPath, [cli, 'ppi', '--dry-run', '--required-score', '400'],
    { encoding: 'utf8' })
  assert.equal(run.status, 0, run.stderr)
  assert.match(run.stderr, /Python NetworkX/)
  assert.doesNotMatch(run.stderr, /GDC download/)
})

test('M7 CLI requires explicit supported D5 path and isolated signature refresh', () => {
  assert.equal(parseArgs(['immune','--immune-mode','ssgsea-only']).immuneMode,'ssgsea-only')
  assert.equal(parseArgs(['immune','--refresh-signatures']).refreshSignatures,true)
  assert.throws(()=>parseArgs(['deg','--immune-mode','ssgsea-only']),/only for immune/)
  assert.throws(()=>parseArgs(['ppi','--refresh-signatures']),/only for immune/)
  const run=spawnSync(process.execPath,[cli,'immune','--dry-run','--immune-mode','ssgsea-only'],
    {encoding:'utf8'})
  assert.equal(run.status,0,run.stderr)
  assert.match(run.stderr,/GSEApy ssGSEA/)
  assert.doesNotMatch(run.stderr,/download GDC/)
})

test('M8 CLI report flags cannot leak to scientific or acquisition stages',()=>{
  assert.equal(parseArgs(['report','--require-complete']).requireComplete,true)
  assert.equal(parseArgs(['report','--rerun']).rerun,true)
  assert.throws(()=>parseArgs(['immune','--require-complete']),/only for report/)
  assert.throws(()=>parseArgs(['deg','--require-complete']),/only for report/)
  const run=spawnSync(process.execPath,[cli,'report','--dry-run'],{encoding:'utf8'})
  assert.equal(run.status,0,run.stderr)
  assert.match(run.stderr,/read-only verified M1/)
  assert.doesNotMatch(run.stderr,/Downloading|refetch/)
})
