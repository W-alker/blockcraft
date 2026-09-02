import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getSessionMemory,
  rememberSessionTurn,
} from './document-agent-session-memory.mjs'
import {
  createDocumentAgentSystemPrompt,
  DOCUMENT_AGENT_PROMPT_VERSION,
} from './document-agent-prompt.mjs'

test('keeps semantic text-delta details for a referential follow-up', () => {
  const session = {lastUsedAt: 0, turns: []}
  const delta = [
    {retain: 12},
    {insert: {date: '2026-08-31T12:30'}, attributes: {format: 'YYYY-MM-DD HH:mm'}},
  ]

  rememberSessionTurn(session, {instruction: '帮我在第二段插入今天12:30'}, {
    summary: '在第二段末尾插入日期时间',
    operations: [{kind: 'apply-text-delta', blockId: 'paragraph-2', delta}],
  })

  const memory = getSessionMemory(session)
  assert.deepEqual(memory.previousTurns[0].operations[0], {
    kind: 'apply-text-delta',
    blockId: 'paragraph-2',
    delta,
  })
  assert.equal(memory.previousTurns[0].operationCount, 1)
  assert.equal(memory.previousTurns[0].operationsTruncated, false)
})

test('bounds oversized operation payloads without dropping the operation target', () => {
  const session = {lastUsedAt: 0, turns: []}
  rememberSessionTurn(session, {instruction: '写入很长的内容'}, {
    summary: '已准备修改',
    operations: [{
      kind: 'replace-text',
      blockId: 'paragraph-1',
      from: 0,
      to: 0,
      replacement: 'x'.repeat(10_000),
    }],
  })

  const operation = getSessionMemory(session).previousTurns[0].operations[0]
  assert.equal(operation.blockId, 'paragraph-1')
  assert.equal(operation.payloadTruncated, true)
  assert.ok(operation.replacement.length < 1_300)
})

test('prompt requires resolving short follow-ups from recent turns', () => {
  const prompt = createDocumentAgentSystemPrompt('rewrite')
  assert.equal(DOCUMENT_AGENT_PROMPT_VERSION, 'blockcraft-agent-v16')
  assert.match(prompt, /Resolve\s+ellipsis, pronouns and short follow-up commands/)
  assert.match(prompt, /放到最前面/)
  assert.match(prompt, /Do not ask the user to repeat a target or content/)
})
