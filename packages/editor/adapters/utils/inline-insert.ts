import type {DeltaInsert} from '../../framework'

/**
 * Readable, non-throwing fallback for an Inline Embed whose domain adapter is
 * unavailable. Registered matchers replace this text with their real AST.
 */
export function inlineInsertPlainText(insert: DeltaInsert['insert']): string {
  if (typeof insert === 'string') return insert
  if (!insert || typeof insert !== 'object' || Array.isArray(insert)) return ''

  const keys = Object.keys(insert)
  if (keys.length !== 1) return '[unsupported-inline-embed]'
  const key = keys[0]
  const value = insert[key]
  if (
    typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
  ) {
    const text = String(value).trim()
    if (text) return text
  }
  return `[${key}]`
}
