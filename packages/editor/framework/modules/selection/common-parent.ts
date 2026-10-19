import {BaseBlockComponent} from '../../block-std'
import {ISelectionPoint} from './types'
import {
  resolveCommonSelectionScope,
  resolveSelectionContainerId,
  SelectionScope,
} from './scope'

export function resolveSelectionCommonParent(
  anchor: ISelectionPoint,
  head: ISelectionPoint,
  getBlockById: (id: string) => BaseBlockComponent<any>,
  resolvedScope?: SelectionScope | null,
): string | null {
  if (
    anchor.type === 'table-cell' &&
    head.type === 'table-cell' &&
    anchor.tableId === head.tableId
  ) {
    return anchor.tableId
  }
  if (anchor.blockId === head.blockId) return anchor.blockId

  const anchorParent = resolveSelectionContainerId(anchor)
  const headParent = resolveSelectionContainerId(head)
  if (anchorParent === headParent) return anchorParent

  const scope = resolvedScope === undefined
    ? resolveCommonSelectionScope(anchor, head, getBlockById)
    : resolvedScope
  return scope?.blockId ?? null
}
