import type {DocumentAgentResult} from './agent.types'

/**
 * Structured-output providers use `null` for optional required schema fields.
 * Keep the public result contract canonical by removing that transport-only
 * sentinel before validation or exposing the result to consumers.
 */
export function normalizeDocumentAgentResult<T extends DocumentAgentResult>(
  result: T,
): T {
  const raw = result as T & {draft?: unknown}
  if (!raw || typeof raw !== 'object' || raw.draft !== null) return result
  const normalized = {...raw}
  delete normalized.draft
  return normalized as T
}

export function validateDocumentAgentResult(
  result: DocumentAgentResult,
): string[] {
  const errors: string[] = []

  if (result && typeof result === 'object') {
    const unexpected = Object.keys(result).filter(key => !['summary', 'draft', 'operations'].includes(key))
    if (unexpected.length) errors.push(`Agent result contains unsupported fields: ${unexpected.join(', ')}.`)
  }
  if (!result || typeof result.summary !== 'string') {
    errors.push('Agent result must contain a summary.')
  }
  if (result?.draft !== undefined && typeof result.draft !== 'string') {
    errors.push('Agent result draft must be a string.')
  }

  if (!Array.isArray(result?.operations)) {
    errors.push('Agent result must contain an operations array.')
    return errors
  }
  if (result.operations.length > 100) {
    errors.push('Agent result contains more than 100 operations.')
  }

  result.operations.forEach((operation, index) => {
    if (operation.kind === 'replace-text') {
      assertOnlyKeys(operation, ['kind', 'blockId', 'from', 'to', 'replacement'], index, errors)
      if (!operation.blockId) errors.push(`Operation ${index} is missing blockId.`)
      if (
        !Number.isInteger(operation.from) || operation.from < 0 ||
        !Number.isInteger(operation.to) || operation.to < 0
      ) {
        errors.push(`Operation ${index} has invalid text offsets.`)
      }
      if (typeof operation.replacement !== 'string') {
        errors.push(`Operation ${index} must contain string replacement text.`)
      }
      if (operation.from > operation.to) {
        errors.push(`Operation ${index} has reversed text offsets.`)
      }
      return
    }

    if (operation.kind === 'update-block-props') {
      assertOnlyKeys(operation, ['kind', 'blockId', 'props'], index, errors)
      if (!operation.blockId) errors.push(`Operation ${index} is missing blockId.`)
      if (!isPlainRecord(operation.props)) {
        errors.push(`Operation ${index} must contain a props object.`)
      } else if (Object.keys(operation.props).some(key => !key.trim())) {
        errors.push(`Operation ${index} contains an empty prop key.`)
      }
      return
    }

    if (operation.kind === 'create-blocks') {
      assertOnlyKeys(operation, ['kind', 'parentId', 'index', 'flavour', 'params', 'clientRef'], index, errors)
      if (!operation.parentId) errors.push(`Operation ${index} is missing parentId.`)
      if (!operation.flavour) errors.push(`Operation ${index} is missing flavour.`)
      if (!Number.isInteger(operation.index) || operation.index < 0) {
        errors.push(`Operation ${index} has an invalid insertion index.`)
      }
      if (!Array.isArray(operation.params) || !operation.params.every(isJsonValue)) {
        errors.push(`Operation ${index} must contain JSON create parameters.`)
      }
      if (operation.clientRef !== undefined && !isClientRef(operation.clientRef)) {
        errors.push(`Operation ${index} has an invalid clientRef.`)
      }
      return
    }

    if (operation.kind === 'replace-block') {
      assertOnlyKeys(operation, ['kind', 'blockId', 'flavour', 'params', 'clientRef'], index, errors)
      if (!operation.blockId) errors.push(`Operation ${index} is missing blockId.`)
      if (!operation.flavour) errors.push(`Operation ${index} is missing flavour.`)
      if (!Array.isArray(operation.params) || !operation.params.every(isJsonValue)) {
        errors.push(`Operation ${index} must contain JSON replacement parameters.`)
      }
      if (operation.clientRef !== undefined && !isClientRef(operation.clientRef)) {
        errors.push(`Operation ${index} has an invalid clientRef.`)
      }
      return
    }

    if (operation.kind === 'apply-text-delta') {
      assertOnlyKeys(operation, ['kind', 'blockId', 'delta'], index, errors)
      if (!operation.blockId) errors.push(`Operation ${index} is missing blockId.`)
      if (!Array.isArray(operation.delta) || !operation.delta.every(isTextDeltaOperation)) {
        errors.push(`Operation ${index} must contain a valid text delta.`)
      }
      return
    }

    if (operation.kind === 'delete-blocks') {
      assertOnlyKeys(operation, ['kind', 'parentId', 'index', 'count'], index, errors)
      if (!operation.parentId) errors.push(`Operation ${index} is missing parentId.`)
      if (!Number.isInteger(operation.index) || operation.index < 0) {
        errors.push(`Operation ${index} has an invalid deletion index.`)
      }
      if (!Number.isInteger(operation.count) || operation.count < 1) {
        errors.push(`Operation ${index} has an invalid deletion count.`)
      }
      return
    }

    if (operation.kind === 'move-blocks') {
      assertOnlyKeys(operation, ['kind', 'parentId', 'index', 'count', 'targetId', 'targetIndex'], index, errors)
      if (!operation.parentId || !operation.targetId) {
        errors.push(`Operation ${index} is missing a source or target parent.`)
      }
      if (!Number.isInteger(operation.index) || operation.index < 0 ||
          !Number.isInteger(operation.targetIndex) || operation.targetIndex < 0) {
        errors.push(`Operation ${index} has an invalid move index.`)
      }
      if (!Number.isInteger(operation.count) || operation.count < 1) {
        errors.push(`Operation ${index} has an invalid move count.`)
      }
      return
    }

    errors.push(`Operation ${index} has an unsupported kind.`)
  })

  return errors
}

function isJsonValue(value: unknown): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return true
  }
  if (typeof value === 'number') return Number.isFinite(value)
  if (Array.isArray(value)) return value.every(isJsonValue)
  if (!isPlainRecord(value)) return false
  return Object.values(value).every(isJsonValue)
}

function isTextDeltaOperation(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const operation = value as Record<string, unknown>
  const keys = Object.keys(operation).filter(key => key !== 'attributes')
  if (keys.length !== 1 || !['insert', 'delete', 'retain'].includes(keys[0])) return false
  const payload = operation[keys[0]]
  if (keys[0] === 'insert') {
    if (
      typeof payload !== 'string' &&
      !isSinglePrimitiveEmbed(payload)
    ) return false
  } else if (!Number.isInteger(payload) || (payload as number) < 1) {
    return false
  }
  if (keys[0] === 'delete' && operation['attributes'] !== undefined) return false
  return operation['attributes'] === undefined ||
    (isPlainRecord(operation['attributes']) &&
      Object.values(operation['attributes']).every(isPrimitiveJsonValue))
}

function isSinglePrimitiveEmbed(value: unknown): boolean {
  if (!isPlainRecord(value)) return false
  const entries = Object.entries(value)
  return entries.length === 1 &&
    !!entries[0][0].trim() &&
    isPrimitiveJsonValue(entries[0][1])
}

function isPrimitiveJsonValue(value: unknown): boolean {
  return value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function isClientRef(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z][A-Za-z0-9._-]{0,63}$/.test(value)
}

function assertOnlyKeys(
  operation: object,
  allowed: readonly string[],
  index: number,
  errors: string[],
): void {
  const allowedKeys = new Set(allowed)
  const unexpected = Object.keys(operation).filter(key => !allowedKeys.has(key))
  if (unexpected.length) {
    errors.push(`Operation ${index} contains unsupported fields: ${unexpected.join(', ')}.`)
  }
}
