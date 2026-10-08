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
  assert.throws(() => parseArgs(['deploy', 'unknown']), /Unknown deploy mode/)
})

test('dry-run Web creates a web-based profile and pins DSH', () => {
  const run = spawnSync(process.execPath, [cli, 'web', '--dry-run', '--workspace', '/tmp/research'], { encoding: 'utf8' })
  assert.equal(run.status, 0, run.stderr)
  assert.match(run.stderr, /--from-default-profile.*web/)
  assert.match(run.stderr, /@deepseek-ai\/dsh@0\.2\.0-rc\.2/)
  assert.match(run.stderr, /research-web/)
  assert.doesNotMatch(run.stderr, /research-headless/)
})

test('dry-run prepare neither starts a model session nor downloads', () => {
  const run = spawnSync(process.execPath, [cli, 'prepare', '--dry-run', '--refresh'], { encoding: 'utf8' })
  assert.equal(run.status, 0, run.stderr)
  assert.match(run.stderr, /explicit refresh/)
  assert.doesNotMatch(run.stderr, /npx/)
})

test('ACP dry-run has a dedicated profile, not the Web entrypoint', () => {
  const run = spawnSync(process.execPath, [cli, 'acp', '--dry-run'], { encoding: 'utf8' })
  assert.equal(run.status, 0, run.stderr)
  assert.match(run.stderr, /research-acp/)
  assert.doesNotMatch(run.stderr, /research-web/)
})
