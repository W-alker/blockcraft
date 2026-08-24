import type {DocumentAgentResult} from './agent.types'

export function validateDocumentAgentResult(
  result: DocumentAgentResult,
): string[] {
  const errors: string[] = []

  if (!result || typeof result.summary !== 'string') {
    errors.push('Agent result must contain a summary.')
  }

  if (!Array.isArray(result?.operations)) {
    errors.push('Agent result must contain an operations array.')
    return errors
  }

  result.operations.forEach((operation, index) => {
    if (operation.kind === 'replace-text') {
      if (!operation.blockId) errors.push(`Operation ${index} is missing blockId.`)
      if (!Number.isInteger(operation.from) || !Number.isInteger(operation.to)) {
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
      if (!operation.blockId) errors.push(`Operation ${index} is missing blockId.`)
      if (!isPlainRecord(operation.props)) {
        errors.push(`Operation ${index} must contain a props object.`)
      } else if (Object.keys(operation.props).some(key => !key.trim())) {
        errors.push(`Operation ${index} contains an empty prop key.`)
      }
      return
    }

    if (operation.kind === 'insert-blocks') {
      if (!operation.parentId) errors.push(`Operation ${index} is missing parentId.`)
      if (!Number.isInteger(operation.index) || operation.index < 0) {
        errors.push(`Operation ${index} has an invalid insertion index.`)
      }
      if (!Array.isArray(operation.snapshots)) {
        errors.push(`Operation ${index} must contain snapshots.`)
      }
      return
    }

    if (operation.kind === 'create-blocks') {
      if (!operation.parentId) errors.push(`Operation ${index} is missing parentId.`)
      if (!operation.flavour) errors.push(`Operation ${index} is missing flavour.`)
      if (!Number.isInteger(operation.index) || operation.index < 0) {
        errors.push(`Operation ${index} has an invalid insertion index.`)
      }
      if (!Array.isArray(operation.params) || !operation.params.every(isJsonValue)) {
        errors.push(`Operation ${index} must contain JSON create parameters.`)
      }
      return
    }

    if (operation.kind === 'apply-text-delta') {
      if (!operation.blockId) errors.push(`Operation ${index} is missing blockId.`)
      if (!Array.isArray(operation.delta) || !operation.delta.every(isTextDeltaOperation)) {
        errors.push(`Operation ${index} must contain a valid text delta.`)
      }
      return
    }

    if (operation.kind === 'delete-blocks') {
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
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return true
  }
  if (Array.isArray(value)) return value.every(isJsonValue)
  if (!value || typeof value !== 'object') return false
  return Object.values(value).every(isJsonValue)
}

function isTextDeltaOperation(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const operation = value as Record<string, unknown>
  const keys = Object.keys(operation).filter(key => key !== 'attributes')
  if (keys.length !== 1 || !['insert', 'delete', 'retain'].includes(keys[0])) return false
  const payload = operation[keys[0]]
  if (keys[0] === 'insert') {
    if (typeof payload !== 'string' && !isJsonValue(payload)) return false
  } else if (!Number.isInteger(payload) || (payload as number) < 1) {
    return false
  }
  return operation['attributes'] === undefined ||
    (isPlainRecord(operation['attributes']) &&
      Object.values(operation['attributes']).every(isJsonValue))
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}
