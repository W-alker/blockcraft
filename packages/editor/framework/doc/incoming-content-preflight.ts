import {BlockNodeType, type DeltaInsert} from '../model'
import type {IncomingContent} from './incoming-content'
import type {IBlockSnapshot} from '../block-std/types/block.type'

// Two freshly generated 18-byte IDs plus six v1 field names (34 bytes).
const MIN_BLOCK_BYTES = 70

/** Matches plain paste's trailing CR/LF trimming and one paragraph per internal LF. */
export function exceedsTextLineBudget(text: string, remaining: number): boolean {
  let end = text.length
  while (end > 0 && (text.charCodeAt(end - 1) === 10 || text.charCodeAt(end - 1) === 13)) end--
  let bytes = 0
  let offset = 0
  while ((offset = text.indexOf('\n', offset)) >= 0 && offset < end) {
    bytes += MIN_BLOCK_BYTES
    if (bytes > remaining) return true
    offset++
  }
  return false
}

/** A lower bound, never an estimate used to accept content. No UTF-8 buffer allocation. */
export function textBytesLowerBound(text: string, stopAfter: number, ignoreWhitespace = false): number {
  if (!ignoreWhitespace && !/[\r\n]/.test(text)) {
    // Common small values and long ASCII runs need no JS character walk.
    if (text.length * 3 <= stopAfter || text.length > stopAfter || /^[\x00-\x7f]*$/.test(text)) return text.length
  }
  let bytes = 0
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    // Paste can split/trim CR/LF; adapters can collapse other whitespace.
    if (code === 10 || code === 13 || (ignoreWhitespace && /\s/u.test(text[i]))) continue
    // Count surrogate code units conservatively, including pairs split across Delta inserts.
    bytes += code < 0x80 || (code >= 0xd800 && code <= 0xdfff) ? 1 : code < 0x800 ? 2 : 3
    if (bytes > stopAfter) break
  }
  return bytes
}

/** Only counts values known to survive native2YBlock; format runs are left to Yjs. */
export function exceedsContentBudget(content: IncomingContent, limit: number): boolean {
  let bytes = 0
  const text = (value: string) => {
    bytes += textBytesLowerBound(value, limit - bytes)
    return bytes > limit
  }
  const value = (item: unknown): boolean => {
    if (typeof item === 'string') return text(item)
    if (Array.isArray(item)) {
      for (const child of item) if (value(child)) return true
    } else if (item && typeof item === 'object' && Object.getPrototypeOf(item) === Object.prototype) {
      for (const key in item) if (Object.hasOwn(item, key) && value((item as Record<string, unknown>)[key])) return true
    }
    return false
  }
  const deltas = (items: readonly DeltaInsert[]): boolean => {
    for (const delta of items) if (value(delta.insert)) return true
    return false
  }
  const snapshots = (items: readonly IBlockSnapshot[]): boolean => {
    for (const block of items) {
      // v1 always writes two fresh 18-byte IDs and the six field names (34 bytes).
      // Ignore all remaining CRDT headers/values, so this bound stays conservative.
      bytes += MIN_BLOCK_BYTES
      if (bytes > limit) return true
      if (value(block.props) || value(block.meta)) return true
      if (block.nodeType === BlockNodeType.editable ? deltas(block.children) : snapshots(block.children)) return true
    }
    return false
  }
  return !!((content.inline && deltas(content.inline)) || (content.snapshots && snapshots(content.snapshots)))
}
