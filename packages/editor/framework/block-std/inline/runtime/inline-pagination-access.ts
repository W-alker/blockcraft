import {InlinePaginationGap} from './inline-pagination-projection'

export interface InlinePaginationLineStart {
  /** 下一视觉行首字符的 Y.Text UTF-16 offset。 */
  offset: number
  /** 下一视觉行顶相对 edit-container 顶边的自然 y。 */
  top: number
  /** 保留一整个视觉行所需的高度（与 BCR 相同的 visual px）。 */
  visualGuardHeight: number
}

interface InlinePaginationAccess {
  apply(gaps: readonly InlinePaginationGap[]): boolean
  clear(): void
  measureLineStarts(limit?: number): InlinePaginationLineStart[]
  projectionWritable?(): boolean
  whenProjectionWritable?(listener: () => void): () => void
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

export function isInlinePaginationProjectionWritable(
  runtime: object,
): boolean {
  return accessByRuntime.get(runtime)?.projectionWritable?.() ?? true
}

export function whenInlinePaginationProjectionWritable(
  runtime: object,
  listener: () => void,
): () => void {
  const access = accessByRuntime.get(runtime)
  if (!access?.whenProjectionWritable) {
    let active = true
    queueMicrotask(() => {
      if (active) listener()
    })
    return () => { active = false }
  }
  return access.whenProjectionWritable(listener)
}
