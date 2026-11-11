const MAX_SESSION_TURNS = 6
const MAX_SESSION_MEMORY_CHARS = 8_000
const MAX_OPERATION_COUNT = 8
const MAX_OPERATION_MEMORY_CHARS = 3_000
const MAX_OPERATION_PAYLOAD_CHARS = 1_200

function truncateText(value, maxChars) {
  if (typeof value !== 'string') return ''
  return value.length <= maxChars ? value : value.slice(0, maxChars) + '…'
}

function serializedLength(value) {
  try {
    return JSON.stringify(value).length
  } catch {
    return Infinity
  }
}

function compactJsonValue(value, maxChars = MAX_OPERATION_PAYLOAD_CHARS) {
  if (serializedLength(value) <= maxChars) return {value, truncated: false}

  if (typeof value === 'string') {
    return {value: truncateText(value, Math.max(0, maxChars - 2)), truncated: true}
  }
  if (Array.isArray(value)) {
    const items = []
    let nestedTruncated = false
    for (const item of value) {
      const compacted = compactJsonValue(item, Math.max(160, Math.floor(maxChars / 2)))
      const candidate = [...items, compacted.value]
      if (serializedLength(candidate) > maxChars - 80) break
      items.push(compacted.value)
      nestedTruncated = nestedTruncated || compacted.truncated
    }
    return {
      value: items,
      truncated: nestedTruncated || items.length < value.length,
    }
  }
  if (value && typeof value === 'object') {
    const result = {}
    const entries = Object.entries(value)
    let nestedTruncated = false
    for (const [key, item] of entries) {
      const compacted = compactJsonValue(item, Math.max(160, Math.floor(maxChars / 2)))
      const candidate = {...result, [key]: compacted.value}
      if (serializedLength(candidate) > maxChars - 80) break
      result[key] = compacted.value
      nestedTruncated = nestedTruncated || compacted.truncated
    }
    return {
      value: result,
      truncated: nestedTruncated || Object.keys(result).length < entries.length,
    }
  }
  return {value: null, truncated: true}
}

function compactOperation(operation) {
  if (!operation || typeof operation !== 'object') return {kind: 'unknown'}

  const compact = {kind: operation.kind}
  for (const field of [
    'blockId',
    'parentId',
    'index',
    'count',
    'flavour',
    'targetId',
    'targetIndex',
    'from',
    'to',
    'clientRef',
  ]) {
    if (operation[field] !== undefined) compact[field] = operation[field]
  }

  let payload
  let payloadKey
  if (operation.kind === 'replace-text') {
    payloadKey = 'replacement'
    payload = operation.replacement
  } else if (operation.kind === 'update-block-props') {
    payloadKey = 'props'
    payload = operation.props
  } else if (operation.kind === 'apply-text-delta') {
    payloadKey = 'delta'
    payload = operation.delta
  } else if (operation.kind === 'create-blocks' || operation.kind === 'replace-block') {
    payloadKey = 'params'
    payload = operation.params
  }

  if (payloadKey) {
    const compacted = compactJsonValue(payload)
    compact[payloadKey] = compacted.value
    if (compacted.truncated) compact.payloadTruncated = true
  }
  return compact
}

function compactOperations(operations) {
  const result = []
  const source = Array.isArray(operations) ? operations.slice(0, MAX_OPERATION_COUNT) : []
  for (const operation of source) {
    const compact = compactOperation(operation)
    if (serializedLength([...result, compact]) > MAX_OPERATION_MEMORY_CHARS) break
    result.push(compact)
  }
  return {
    operations: result,
    operationCount: Array.isArray(operations) ? operations.length : 0,
    operationsTruncated: result.length < (Array.isArray(operations) ? operations.length : 0),
  }
}

export function getSessionMemory(session) {
  if (!session?.turns.length) return null

  const turns = session.turns.slice(-MAX_SESSION_TURNS)
  while (turns.length > 1 && serializedLength(turns) > MAX_SESSION_MEMORY_CHARS) {
    turns.shift()
  }
  return {
    turnCount: session.turns.length,
    previousTurns: turns,
  }
}

export function rememberSessionTurn(session, request, result) {
  if (!session || !result || typeof result !== 'object') return
  const operationMemory = compactOperations(result.operations)
  session.turns = [
    ...session.turns,
    {
      instruction: truncateText(request.instruction, 1_200),
      assistantSummary: truncateText(result.summary, 1_200),
      draft: truncateText(result.draft, 800) || undefined,
      ...operationMemory,
    },
  ].slice(-MAX_SESSION_TURNS)
  session.lastUsedAt = Date.now()
}

export function rememberMarkdownSessionTurn(session, request, markdown) {
  if (!session || typeof markdown !== 'string') return
  session.turns = [
    ...session.turns,
    {
      instruction: truncateText(request.instruction, 1_200),
      assistantMarkdown: truncateText(markdown, 3_600),
      operations: [],
      operationCount: 0,
      operationsTruncated: false,
    },
  ].slice(-MAX_SESSION_TURNS)
  session.lastUsedAt = Date.now()
}
