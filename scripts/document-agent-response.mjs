function parseJsonField(value, fieldName) {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    throw new Error('Agent 返回的 ' + fieldName + ' 不是有效 JSON')
  }
}

export function normalizeAgentResult(result) {
  if (!result || !Array.isArray(result.operations)) return result
  const normalized = {
    ...result,
    operations: result.operations.map(operation => {
      if (!operation || typeof operation !== 'object') return operation
      if (operation.kind === 'update-block-props') {
        return {...operation, props: parseJsonField(operation.props, 'props')}
      }
      if (operation.kind === 'apply-text-delta') {
        return {...operation, delta: parseJsonField(operation.delta, 'delta')}
      }
      if (operation.kind === 'create-blocks') {
        const normalizedOperation = {
          ...operation,
          params: parseJsonField(operation.params, 'params'),
        }
        if (normalizedOperation.clientRef === null) delete normalizedOperation.clientRef
        return normalizedOperation
      }
      if (operation.kind === 'replace-block') {
        const normalizedOperation = {
          ...operation,
          params: parseJsonField(operation.params, 'params'),
        }
        if (normalizedOperation.clientRef === null) delete normalizedOperation.clientRef
        return normalizedOperation
      }
      return operation
    }),
  }
  if (normalized.draft === null) delete normalized.draft
  return normalized
}

/**
 * Structured Outputs guarantees the fields but cannot express the semantic
 * one-of between a final result and tool calls on every supported provider.
 * Prefer tool calls whenever they are present so evidence is collected before
 * accepting a simultaneously emitted candidate result.
 */
export function normalizeAgentTurn(turn) {
  const calls = Array.isArray(turn?.calls) ? turn.calls : []
  if (calls.length) {
    return {
      kind: 'tool-calls',
      calls: calls.map(call => ({
        ...call,
        arguments: parseJsonField(call.arguments, `tool ${call.name || 'unknown'} arguments`),
      })),
    }
  }
  if (turn?.result && typeof turn.result === 'object') {
    return {kind: 'result', result: normalizeAgentResult(turn.result)}
  }

  const kind = typeof turn?.kind === 'string' ? turn.kind : 'missing'
  throw new Error(
    `Agent 返回的 Master 回合无可执行内容（kind=${kind}, calls=${calls.length}, result=${turn?.result ? 'present' : 'empty'}）`,
  )
}

export function normalizeSubAgentResult(result, delegation) {
  if (!result || result.specialist !== delegation.specialist) {
    throw new Error('Agent 返回的 specialist 与委派请求不一致')
  }
  const normalized = normalizeAgentResult(result)
  const {review: _transportReview, ...normalizedWithoutReview} = normalized
  const normalizedReview = result.review && typeof result.review === 'object'
    ? {
      ...result.review,
      issues: Array.isArray(result.review.issues)
        ? result.review.issues.map(issue => {
          if (!issue || typeof issue !== 'object' || issue.recommendation !== null) return issue
          const normalizedIssue = {...issue}
          delete normalizedIssue.recommendation
          return normalizedIssue
        })
        : result.review.issues,
    }
    : undefined
  return {
    ...normalizedWithoutReview,
    specialist: result.specialist,
    findings: result.findings,
    recommendations: result.recommendations,
    ...(normalizedReview ? {review: normalizedReview} : {}),
  }
}
