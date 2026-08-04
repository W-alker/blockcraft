import {InlinePaginationGap} from './inline-pagination-projection'

export interface InlinePaginationLineStart {
  /** 下一视觉行首字符的 Y.Text UTF-16 offset。 */
  offset: number
  /** 下一视觉行顶相对 edit-container 顶边的自然 y。 */
  top: number
}

interface InlinePaginationAccess {
  apply(gaps: readonly InlinePaginationGap[]): boolean
  clear(): void
  measureLineStarts(limit?: number): InlinePaginationLineStart[]
}

const accessByRuntime = new WeakMap<object, InlinePaginationAccess>()

export function registerInlinePaginationAccess(
  runtime: object,
  access: InlinePaginationAccess,
): () => void {
  accessByRuntime.set(runtime, access)
  return () => accessByRuntime.delete(runtime)
}

export function applyInlinePaginationGaps(
  runtime: object,
  gaps: readonly InlinePaginationGap[],
): boolean {
  return accessByRuntime.get(runtime)?.apply(gaps) ?? false
}

export function clearInlinePaginationGaps(runtime: object): void {
  accessByRuntime.get(runtime)?.clear()
}

export function measureInlinePaginationLineStarts(
  runtime: object,
  limit?: number,
): InlinePaginationLineStart[] {
  return accessByRuntime.get(runtime)?.measureLineStarts(limit) ?? []
}
