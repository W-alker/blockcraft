import {isYArray} from '../../utils/yAbstractType'
import {BlockReadonlyError, BlockReadonlyOperation} from '../../doc/block-readonly.types'
import {BlockMutationPolicyError} from '../../doc/block-mutation-policy'

type ColumnChange = {parentId: string | null; ids: string[]; widths: number[]}

/** 仅收尾本次 CRUD 修改过的分栏；在外层事务结束前运行，不订阅视图或 Undo。 */
export class ColumnStructureNormalizer {
  selection: ReturnType<BlockCraft.Selection['toJSON']> | null = null
  private capturedSelection = false
  private readonly pending = new Map<string, ColumnChange>()
  private readonly movedParents = new Map<string, string>()

  constructor(private readonly doc: BlockCraft.Doc) {}

  track(parentId: string) {
    if (this.pending.has(parentId)) return
    const block = this.doc.crud.getYBlock(parentId)
    const children = block?.get('children')
    if (!block || block.get('flavour') !== 'columns' || !children || !isYArray(children)) return
    if (!this.capturedSelection) {
      this.selection = this.doc.selection?.value?.toJSON() ?? null
      this.capturedSelection = true
    }
    this.doc.crud.undoManager?.captureSelectionBeforeChange()
    this.pending.set(parentId, {
      parentId: this.doc.model.getParentId(parentId),
      ids: children.toArray(),
      widths: Array.isArray(block.get('props')?.get('columnWidths')) ? [...block.get('props').get('columnWidths') as number[]] : [],
    })
  }

  moved(ids: readonly string[], parentId: string) {
    for (const id of ids) {
      if (this.doc.crud.getYBlock(id)?.get('flavour') === 'columns') this.movedParents.set(id, parentId)
    }
  }

  clear() {
    this.pending.clear()
    this.movedParents.clear()
    this.selection = null
    this.capturedSelection = false
  }

  flush(): string | undefined {
    let landing: string | undefined
    // 收尾产生的子操作也可能触及容器；每个候选仅消费一次。
    const changes = [...this.pending]
    this.pending.clear()
    for (const [id, before] of changes) {
      const block = this.doc.crud.getYBlock(id)
      const children = block?.get('children')
      if (!block || !children || !isYArray(children)) continue
      const ids = children.toArray()
      if (ids.length === before.ids.length && ids.every((value, index) => value === before.ids[index])) continue
      const parentId = this.movedParents.get(id) ?? before.parentId
      if (ids.length === 1 && before.ids.length > 1 && parentId) {
        const parent = this.doc.crud.getYBlock(parentId)
        const parentChildren = parent?.get('children')
        const columnChildren = this.doc.crud.getYBlock(ids[0])?.get('children')
        const index = parentChildren && isYArray(parentChildren) ? parentChildren.toArray().indexOf(id) : -1
        if (parent && index >= 0 && columnChildren && isYArray(columnChildren)) {
          const content = columnChildren.toArray()
          const allowed = content.every(child => {
            const flavour = this.doc.crud.getYBlock(child)?.get('flavour')
            return flavour && this.doc.schemas.isValidChildrenForInstance(flavour, parent.get('flavour'), parent.get('meta')?.toJSON() ?? {})
          })
          if (allowed) {
            try {
              this.doc.readonlyManager.assertRemovable([id], BlockReadonlyOperation.Move)
              this.doc.readonlyManager.assertMovable(content, parentId, BlockReadonlyOperation.Move)
              this.doc.mutationPolicy?.assert({operation: 'move', blockIds: content, parentId: ids[0], targetId: parentId})
              this.doc.mutationPolicy?.assert({operation: 'delete', blockIds: [id], parentId})
              this.doc.crud.moveBlocks(ids[0], 0, content.length, parentId, index)
              this.doc.crud.deleteBlocks(parentId, index + content.length, 1)
              landing ??= content[0]
              continue
            } catch (error) {
              if (!(error instanceof BlockReadonlyError) && !(error instanceof BlockMutationPolicyError)) throw error
            }
          }
        }
      }
      // 重排时宽度跟随子栏身份；增减栏时沿用等分策略，并让宽度与结构一起进入历史。
      if (ids.length && this.doc.model.exists(id)) {
        const sameMembers = ids.length === before.ids.length && ids.every(child => before.ids.includes(child))
        const widths = sameMembers && before.widths.length === ids.length
          ? ids.map(child => before.widths[before.ids.indexOf(child)])
          : ids.map(() => Number((100 / ids.length).toFixed(2)))
        this.doc.crud.updateBlockProps(id, {columnCount: ids.length, columnWidths: widths})
      }
    }
    this.pending.clear()
    this.movedParents.clear()
    return landing
  }
}
