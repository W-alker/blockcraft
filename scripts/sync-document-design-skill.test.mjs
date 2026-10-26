import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync, mkdirSync, cpSync, readFileSync, appendFileSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {resolve, dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import {spawnSync} from 'node:child_process'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
function sandbox(run) {
  const dir = mkdtempSync(resolve(tmpdir(), 'blockcraft-design-skill-'))
  try {
    mkdirSync(resolve(dir, 'scripts'))
    mkdirSync(resolve(dir, 'packages/blockcraft-agent/src/core'), {recursive: true})
    cpSync(resolve(root, 'scripts/sync-document-design-skill.mjs'), resolve(dir, 'scripts/sync-document-design-skill.mjs'))
    cpSync(resolve(root, 'packages/editor/ai-skills/document-design'), resolve(dir, 'packages/editor/ai-skills/document-design'), {recursive: true})
    const execute = (...args) => spawnSync(process.execPath, [resolve(dir, 'scripts/sync-document-design-skill.mjs'), ...args], {encoding: 'utf8'})
    run(dir, execute)
  } finally { rmSync(dir, {recursive: true, force: true}) }
}

test('运行时使用可读取的技能引用，同源输出可重复生成', () => sandbox((dir, run) => {
  assert.equal(run().status, 0)
  assert.equal(run('--check').status, 0)
  const target = resolve(dir, 'packages/blockcraft-agent/src/core/document-design-skills.generated.ts')
  const first = readFileSync(target, 'utf8')
  const skills = JSON.parse(first.slice(first.indexOf(' = ') + 3))
  assert.equal(skills.length, 5)
  for (const id of skills[0].capabilityIds) {
    assert.ok(skills.some(skill => skill.id === id))
    assert.ok(skills[0].instructions.includes(id))
  }
  assert.ok(!skills[0].instructions.includes('](references/'))
  assert.equal(run().status, 0)
  assert.equal(readFileSync(target, 'utf8'), first)
}))

test('Markdown 变化后检查失败，重新生成恢复一致', () => sandbox((dir, run) => {
  assert.equal(run().status, 0)
  appendFileSync(resolve(dir, 'packages/editor/ai-skills/document-design/references/text-and-paragraphs.md'), '\n追加一个已验证的规则。\n')
  assert.notEqual(run('--check').status, 0)
  assert.equal(run().status, 0)
  assert.equal(run('--check').status, 0)
}))

test('未映射的渐进式引用失败，不向运行时交付断链', () => sandbox((dir, run) => {
  appendFileSync(resolve(dir, 'packages/editor/ai-skills/document-design/SKILL.md'), '\n[missing](references/missing.md)\n')
  assert.notEqual(run().status, 0)
}))
