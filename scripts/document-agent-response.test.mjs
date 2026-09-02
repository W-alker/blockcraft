import assert from 'node:assert/strict'
import test from 'node:test'
import {normalizeAgentTurn} from './document-agent-response.mjs'

const result = {
  summary: '优化整篇文档',
  draft: null,
  operations: [],
}

test('normalizes a canonical final Master turn', () => {
  assert.deepEqual(normalizeAgentTurn({kind: 'result', result, calls: []}), {
    kind: 'result',
    result: {summary: result.summary, operations: []},
  })
})

test('normalizes a canonical tool-call Master turn', () => {
  assert.deepEqual(normalizeAgentTurn({
    kind: 'tool-calls',
    result: null,
    calls: [{id: 'call-1', name: 'blockcraft.search_document', arguments: '{"query":"掘金"}'}],
  }), {
    kind: 'tool-calls',
    calls: [{id: 'call-1', name: 'blockcraft.search_document', arguments: {query: '掘金'}}],
  })
})

test('prefers emitted tool calls over a premature candidate result', () => {
  const normalized = normalizeAgentTurn({
    kind: 'result',
    result,
    calls: [{id: 'call-1', name: 'blockcraft.get_block', arguments: '{"blockId":"juejin-1"}'}],
  })
  assert.equal(normalized.kind, 'tool-calls')
  assert.equal(normalized.calls[0].name, 'blockcraft.get_block')
})

test('infers an unambiguous result when the redundant kind is mismatched', () => {
  assert.equal(normalizeAgentTurn({kind: 'tool-calls', result, calls: []}).kind, 'result')
})

test('reports bounded Master turn diagnostics when no payload exists', () => {
  assert.throws(
    () => normalizeAgentTurn({kind: 'tool-calls', result: null, calls: []}),
    /kind=tool-calls, calls=0, result=empty/,
  )
})
