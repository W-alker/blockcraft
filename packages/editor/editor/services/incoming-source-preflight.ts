import {textBytesLowerBound} from '../../framework/doc/incoming-content-preflight'

// Recognize only literal prose. Any Markdown syntax, HTML, entity, directive or
// reference is deliberately left to the actual adapter and final content check.
const literalProse = /^[\p{L}\p{N}\p{M}\p{So}\s，。！？、；：“”‘’（）《》…]*$/u

export function exceedsLiteralMarkdownBudget(source: string, limit: number): boolean {
  if (source.length * 3 <= limit || !literalProse.test(source)) return false
  return textBytesLowerBound(source, limit, true) > limit
}

export function exceedsSimpleHtmlBudget(source: string, limit: number): boolean {
  if (source.length * 3 <= limit) return false
  // No attributes/nested tags/entities: none of these paragraphs can be hidden,
  // interpreted as a snapshot marker, or replaced by an embed matcher.
  const paragraphs = /\s*<(p|h[1-6])>([^<&]*)<\/\1>\s*/giy
  let bytes = 0
  let end = 0
  let match: RegExpExecArray | null
  while ((match = paragraphs.exec(source))) {
    end = paragraphs.lastIndex
    // Validate the entire source even after reaching the budget: a trailing
    // comment/raw-text context must not be mistaken for this safe subset.
    if (bytes <= limit) bytes += textBytesLowerBound(match[2], limit - bytes, true)
  }
  return end === source.length && bytes > limit
}
