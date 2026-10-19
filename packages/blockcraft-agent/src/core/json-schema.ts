export type DocumentAgentJsonSchema = Readonly<Record<string, unknown>>

/**
 * Small deterministic JSON-Schema subset used at the Agent boundary.
 *
 * Capability declarations intentionally stay data-only. Supporting the subset
 * here avoids executing host callbacks or accepting values merely because they
 * are JSON serializable. Unsupported schema keywords are ignored; supported
 * constraints always fail closed.
 */
export function validateDocumentAgentJsonSchema(
  schema: DocumentAgentJsonSchema,
  value: unknown,
  path = '$',
): string[] {
  const errors: string[] = []

  const anyOf = readSchemaArray(schema['anyOf'])
  if (anyOf?.length) {
    if (!anyOf.some(candidate => validateDocumentAgentJsonSchema(candidate, value, path).length === 0)) {
      errors.push(`${path} does not match any allowed shape.`)
    }
    return errors
  }

  const oneOf = readSchemaArray(schema['oneOf'])
  if (oneOf?.length) {
    const matches = oneOf.filter(candidate =>
      validateDocumentAgentJsonSchema(candidate, value, path).length === 0,
    ).length
    if (matches !== 1) errors.push(`${path} must match exactly one allowed shape.`)
    return errors
  }

  if (Array.isArray(schema['enum']) && !schema['enum'].some(candidate => jsonEquals(candidate, value))) {
    errors.push(`${path} is not an allowed value.`)
    return errors
  }
  if ('const' in schema && !jsonEquals(schema['const'], value)) {
    errors.push(`${path} must equal the declared constant.`)
    return errors
  }

  const declaredTypes = Array.isArray(schema['type'])
    ? schema['type'].filter((type): type is string => typeof type === 'string')
    : typeof schema['type'] === 'string'
      ? [schema['type']]
      : []
  if (declaredTypes.length && !declaredTypes.some(type => matchesType(type, value))) {
    errors.push(`${path} must be ${declaredTypes.join(' or ')}.`)
    return errors
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) errors.push(`${path} must be finite.`)
    if (typeof schema['minimum'] === 'number' && value < schema['minimum']) {
      errors.push(`${path} must be at least ${schema['minimum']}.`)
    }
    if (typeof schema['maximum'] === 'number' && value > schema['maximum']) {
      errors.push(`${path} must be at most ${schema['maximum']}.`)
    }
  }

  if (typeof value === 'string') {
    if (typeof schema['minLength'] === 'number' && value.length < schema['minLength']) {
      errors.push(`${path} is too short.`)
    }
    if (typeof schema['maxLength'] === 'number' && value.length > schema['maxLength']) {
      errors.push(`${path} is too long.`)
    }
    if (typeof schema['pattern'] === 'string') {
      try {
        if (!new RegExp(schema['pattern']).test(value)) errors.push(`${path} has an invalid format.`)
      } catch {
        errors.push(`${path} uses an invalid capability pattern.`)
      }
    }
  }

  if (Array.isArray(value)) {
    if (typeof schema['minItems'] === 'number' && value.length < schema['minItems']) {
      errors.push(`${path} has too few items.`)
    }
    if (typeof schema['maxItems'] === 'number' && value.length > schema['maxItems']) {
      errors.push(`${path} has too many items.`)
    }
    const prefixItems = readSchemaArray(schema['prefixItems']) ?? []
    value.forEach((item, index) => {
      const itemSchema = prefixItems[index] ?? readSchema(schema['items'])
      if (itemSchema) errors.push(...validateDocumentAgentJsonSchema(itemSchema, item, `${path}[${index}]`))
    })
  }

  if (isPlainRecord(value)) {
    const properties = isPlainRecord(schema['properties'])
      ? schema['properties'] as Record<string, unknown>
      : {}
    const required = Array.isArray(schema['required'])
      ? schema['required'].filter((key): key is string => typeof key === 'string')
      : []
    for (const key of required) {
      if (!(key in value)) errors.push(`${path}.${key} is required.`)
    }
    for (const [key, propertyValue] of Object.entries(value)) {
      const propertySchema = readSchema(properties[key])
      if (propertySchema) {
        errors.push(...validateDocumentAgentJsonSchema(propertySchema, propertyValue, `${path}.${key}`))
        continue
      }
      if (schema['additionalProperties'] === false) {
        errors.push(`${path}.${key} is not writable.`)
      } else {
        const additionalSchema = readSchema(schema['additionalProperties'])
        if (additionalSchema) {
          errors.push(...validateDocumentAgentJsonSchema(additionalSchema, propertyValue, `${path}.${key}`))
        }
      }
    }
  }

  return errors
}

function matchesType(type: string, value: unknown): boolean {
  if (type === 'null') return value === null
  if (type === 'array') return Array.isArray(value)
  if (type === 'object') return isPlainRecord(value)
  if (type === 'integer') return Number.isInteger(value)
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value)
  return typeof value === type
}

function readSchema(value: unknown): DocumentAgentJsonSchema | null {
  return isPlainRecord(value) ? value : null
}

function readSchemaArray(value: unknown): DocumentAgentJsonSchema[] | null {
  if (!Array.isArray(value)) return null
  const schemas = value.map(readSchema)
  return schemas.every((schema): schema is DocumentAgentJsonSchema => schema !== null)
    ? schemas
    : null
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function jsonEquals(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  try {
    return JSON.stringify(a) === JSON.stringify(b)
  } catch {
    return false
  }
}
