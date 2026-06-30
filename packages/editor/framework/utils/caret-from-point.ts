interface ICaretCapableDocument {
  caretRangeFromPoint?(x: number, y: number): Range | null
  caretPositionFromPoint?(
    x: number,
    y: number,
  ): { offsetNode: Node; offset: number } | null
}

/**
 * Get a collapsed Range at the specified viewport coordinates.
 *
 * Cross-browser note (see ~/.claude/rules/typescript/browser-compat.md):
 * - Chrome / Safari expose `document.caretRangeFromPoint(x, y)` (returns a Range).
 * - Firefox exposes `document.caretPositionFromPoint(x, y)` (returns a CaretPosition);
 *   we adapt it into a collapsed Range.
 * Returns `null` when neither API is available or no valid caret can be resolved.
 */
export function caretRangeFromPoint(x: number, y: number): Range | null {
  const doc = document as Document & ICaretCapableDocument

  // Chrome, Safari
  if (typeof doc.caretRangeFromPoint === 'function') {
    try {
      return doc.caretRangeFromPoint(x, y)
    } catch {
      return null
    }
  }

  // Firefox fallback
  if (typeof doc.caretPositionFromPoint === 'function') {
    try {
      const pos = doc.caretPositionFromPoint(x, y)
      if (!pos || !pos.offsetNode) return null
      const range = document.createRange()
      range.setStart(pos.offsetNode, pos.offset)
      range.collapse(true)
      return range
    } catch {
      return null
    }
  }

  return null
}
