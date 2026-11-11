const MAX_ENCODED_PROPS_LENGTH = 48 * 1024
const MAX_DEPTH = 8
const MAX_ARRAY_LENGTH = 256
const MAX_OBJECT_KEYS = 128
const MAX_STRING_LENGTH = 8 * 1024

const ACTIVE_CONTENT = /(?:javascript|vbscript)\s*:|data\s*:\s*text\/html/i
const URL_LIKE_KEY = /(?:url|src|href|background|bgi|poster)$/i

function sanitizeValue(
  value: unknown,
  depth: number,
  key = '',
): unknown | undefined {
  if (depth > MAX_DEPTH) return undefined
  if (value === null || typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value === 'string') {
    if (value.length > MAX_STRING_LENGTH) return undefined
    if (URL_LIKE_KEY.test(key) && ACTIVE_CONTENT.test(value)) return undefined
    return value
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY_LENGTH) return undefined
    return value
      .map(item => sanitizeValue(item, depth + 1, key))
      .filter(item => item !== undefined)
  }
  if (!value || typeof value !== 'object') return undefined
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) return undefined
  const entries = Object.entries(value)
  if (entries.length > MAX_OBJECT_KEYS) return undefined
  const result: Record<string, unknown> = Object.create(null)
  for (const [childKey, childValue] of entries) {
    if (childKey === '__proto__' || childKey === 'constructor' || childKey === 'prototype') {
      continue
    }
    const sanitized = sanitizeValue(childValue, depth + 1, childKey)
    if (sanitized !== undefined) result[childKey] = sanitized
  }
  return result
}

export function sanitizeAdapterProps(value: unknown): Record<string, unknown> {
  const sanitized = sanitizeValue(value, 0)
  return sanitized && typeof sanitized === 'object' && !Array.isArray(sanitized)
    ? sanitized as Record<string, unknown>
    : Object.create(null)
}

export function encodeAdapterProps(value: unknown): string | undefined {
  const sanitized = sanitizeAdapterProps(value)
  if (Object.keys(sanitized).length === 0) return undefined
  const encoded = encodeURIComponent(JSON.stringify(sanitized))
  return encoded.length <= MAX_ENCODED_PROPS_LENGTH ? encoded : undefined
}

export function decodeAdapterProps(value: unknown): Record<string, unknown> {
  if (typeof value !== 'string' || value.length > MAX_ENCODED_PROPS_LENGTH) {
    return Object.create(null)
  }
  try {
    return sanitizeAdapterProps(JSON.parse(decodeURIComponent(value)))
  } catch {
    return Object.create(null)
  }
}
