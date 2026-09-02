#!/usr/bin/env node

import {spawnSync} from 'node:child_process'
import {mkdtempSync, readFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join, resolve} from 'node:path'

const root = resolve(import.meta.dirname, '..')
const dist = join(root, 'dist/blockcraft-agent')
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const timeout = 60_000

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
    timeout,
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed${result.stderr ? `: ${result.stderr.trim()}` : ''}`)
  }
  return result.stdout?.trim() ?? ''
}

run(pnpm, ['build:agent'])
const manifest = JSON.parse(readFileSync(join(dist, 'package.json'), 'utf8'))
if (manifest.name !== 'blockcraft-agent' || manifest.version !== '0.1.0') {
  throw new Error(`Refusing to publish unexpected package ${manifest.name}@${manifest.version}`)
}

const registry = run(npm, ['config', 'get', 'registry'], {capture: true})
const packDir = mkdtempSync(join(tmpdir(), 'blockcraft-agent-pack-'))
const pack = JSON.parse(run(npm, ['pack', dist, '--json', '--pack-destination', packDir], {capture: true}))[0]
const packageId = `${manifest.name}@${manifest.version}`

let published = null
const view = spawnSync(npm, ['view', packageId, 'dist.integrity', '--json', '--registry', registry], {
  cwd: root,
  encoding: 'utf8',
  stdio: 'pipe',
  timeout,
})
if (view.error && view.error.code === 'ETIMEDOUT') throw new Error(`Registry query timed out: ${registry}`)
if (view.status === 0 && view.stdout.trim()) published = JSON.parse(view.stdout)
else if (!/E404|404 Not Found|is not in this registry/i.test(view.stderr ?? '')) {
  throw new Error(`Unable to verify ${packageId}: ${(view.stderr || view.stdout).trim()}`)
}

if (published) {
  if (published !== pack.integrity) {
    throw new Error(`${packageId} already exists with different content; refusing to overwrite or bump version`)
  }
  console.log(`${packageId} is already published with matching integrity ${published}`)
  process.exit(0)
}

run(npm, ['publish', dist, '--tag', 'latest', '--registry', registry])
console.log(`Published ${packageId} to ${registry}`)
