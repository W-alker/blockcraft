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

    errors.push(`Operation ${index} has an unsupported kind.`)
  })

  return errors
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}
