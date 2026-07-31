import { BehaviorSubject } from "rxjs"
import {
  DocEventRegister,
  EventListen,
  IBlockProps,
  IBlockSnapshot,
  UIEventStateContext,
} from "../block-std"
import { closetBlockId } from "../utils"
import { BLOCK_POSITION } from "../doc"
import { BlockReadonlyError, BlockReadonlyOperation } from "../doc/block-readonly.types"
import { DOC_FILE_SERVICE_TOKEN } from "./file.service"
import { BLOCK_CREATOR_SERVICE_TOKEN } from "./block-creator.service"
import { calcDragLineRect, calcPositionByRect, type DragLineRect, type DragPosition } from "./_dnd-geometry"

export enum DocDndDataTypes {
  /** @deprecated 内部 block 拖拽改走 DocInternalDragController + InternalDragData，本枚举值不再使用。 */
  originBlock = 'origin-block',
  /** @deprecated 同上。新 block 拖入请用 dragController.startDrag(evt, { kind: 'new-block', flavour, initProps? })。 */
  newBlock = 'new-block',
  /** @deprecated 配套 newBlock 使用，已废弃。 */
  newBlockProps = 'new-block-props',
  // 外部 OS 文件 —— HTML5 drop 路径仍在用
  file = 'Files',
}

export type DocDndDataType = `${DocDndDataTypes}` | string

export enum DocDndStatus {
  start = 'start',
  moving = 'moving',
  end = 'end',
}

/**
 * DocDndService 的职责（自 PointerEvents 重构后）：
 * - 提供 commit 类方法：onSortBlock / onSetColumn / onInsertFiles / onInsertNewBlock。
 *   这些方法被 DocInternalDragController（内部块拖拽）和外部文件 drop 路径共同调用。
 * - 维护外部 OS 文件拖入的 HTML5 路径（dragEnter + 临时 dragover/drop/dragleave 监听）。
 * - 暴露 dragStatus$，dragController 与本服务都会反向写入。
 *
 * 不再负责：
 * - 内部块拖拽的事件分发 / 状态机 / dropLine / ghost / auto-scroll —— 全部迁移到
 *   DocInternalDragController。
 */
@DocEventRegister
export class DocDndService {
  constructor(
    private readonly doc: BlockCraft.Doc
  ) {
  }

  // 内部 dragController 和外部文件路径都会反向写这个状态，向后兼容订阅者。
  dragStatus$ = new BehaviorSubject(DocDndStatus.end)

  // 外部文件 drop 当前指向的 block + 位置。dragenter 启动这条路径，drop / dragleave 收尾。
  private _fileDropTarget: BlockCraft.BlockComponent | null = null
  private _fileDropPosition: DragPosition = 'none'
  private _fileDragCleanup: (() => void) | null = null

  // 外部文件路径专属的 dropLine（内部块拖拽的 dropLine 由 dragController 管，
  // 两条路径不会同时活跃，所以分开持有 DOM 元素也不会冲突）。
  private _fileDropLine: HTMLElement | null = null
  private _lastFileDropLineRect: DragLineRect | null = null
  private _cachedFileRootRect: { top: number, left: number } | null = null
  // drag-over chain：祖先 block 接收 .drag-over class 用于 SCSS 高亮反馈。
  // 跟 dragController 内部那份逻辑一致，外部文件路径独立维护。
  private _fileDragOverChain: HTMLElement[] = []

  // 外部文件 拖拽响应
  @EventListen('dragEnter')
  onRootDragEnter(ctx: UIEventStateContext) {
    if (this.dragStatus$.value !== DocDndStatus.end) return
    const evt: DragEvent = ctx.getDefaultEvent()
    if (!evt.dataTransfer?.types.includes(DocDndDataTypes.file)) return false

    this.dragStatus$.next(DocDndStatus.moving)
    this._fileDropTarget = null
    this._fileDropPosition = 'none'
    this._createFileDropLine()

    // 临时挂在 document 上的监听，用 cleanup 闭包统一卸载。
    const onDragOver = (e: DragEvent) => {
      e.preventDefault()
      this._updateFileDropTarget(e)
    }
    const onDragLeave = (e: DragEvent) => {
      const out = e.clientX <= 0 || e.clientY <= 0 || e.clientX >= window.innerWidth || e.clientY >= window.innerHeight
      if (out) cleanup()
    }
    const onDrop = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.dataTransfer?.files?.length && this._fileDropTarget) {
        this.onInsertFiles(e.dataTransfer.files, this._fileDropTarget, this._fileDropPosition)
      }
      cleanup()
    }
    const onDragEnd = () => cleanup()
    const onScrollOrResize = () => {
      this._cachedFileRootRect = null
      if (this._fileDropTarget?.hostElement?.isConnected) {
        this._moveFileDropLine(this._fileDropTarget.hostElement, this._fileDropPosition)
      }
    }

    const cleanup = () => {
      if (this._fileDragCleanup) {
        this._fileDragCleanup()
        this._fileDragCleanup = null
      }
    }

    document.addEventListener('dragover', onDragOver)
    document.addEventListener('dragleave', onDragLeave)
    document.addEventListener('drop', onDrop, true)
    document.addEventListener('dragend', onDragEnd)
    window.addEventListener('scroll', onScrollOrResize, { passive: true, capture: true })
    window.addEventListener('resize', onScrollOrResize, { passive: true })

    this._fileDragCleanup = () => {
      document.removeEventListener('dragover', onDragOver)
      document.removeEventListener('dragleave', onDragLeave)
      document.removeEventListener('drop', onDrop, true)
      document.removeEventListener('dragend', onDragEnd)
      window.removeEventListener('scroll', onScrollOrResize, { capture: true } as any)
      window.removeEventListener('resize', onScrollOrResize)
      this._removeFileDropLine()
      this._updateFileDragOverChain(null)
      this._fileDropTarget = null
      this._fileDropPosition = 'none'
      this.dragStatus$.next(DocDndStatus.end)
    }

    return true
  }

  private _updateFileDropTarget(evt: DragEvent): void {
    const el = document.elementFromPoint(evt.clientX, evt.clientY)
    if (!el || el === this.doc.root.hostElement) return
    const blockId = closetBlockId(el as Node)
    if (!blockId) return
    // doc.getBlockById 会在 id 未注册时抛错（不是返回 null）。
    // 拖拽期间远端协同删除会让 closetBlockId 仍返回 DOM 上的 id 但 vm 里已经没了，
    // 需要 try-catch 兜底。
    let block: BlockCraft.BlockComponent | null = null
    try {
      block = this.doc.getBlockById(blockId)
    } catch {
      return
    }
    if (!block || block.flavour === 'root') return
    this._fileDropTarget = block
    const rect = block.hostElement.getBoundingClientRect()
    this._fileDropPosition = calcPositionByRect(evt, rect)
    this._moveFileDropLine(block.hostElement, this._fileDropPosition, rect)
    this._updateFileDragOverChain(block)
  }

  private _updateFileDragOverChain(target: BlockCraft.BlockComponent | null): void {
    const next: HTMLElement[] = []
    let cursor: BlockCraft.BlockComponent | null = target
    while (cursor && cursor.flavour !== 'root') {
      next.push(cursor.hostElement)
      cursor = cursor.parentBlock ?? null
    }

    const prev = this._fileDragOverChain
    if (prev.length === next.length && prev.every((el, i) => el === next[i])) return

    const nextSet = new Set(next)
    for (const el of prev) {
      if (!nextSet.has(el)) el.classList.remove('drag-over')
    }
    const prevSet = new Set(prev)
    for (const el of next) {
      if (!prevSet.has(el)) el.classList.add('drag-over')
    }
    this._fileDragOverChain = next
  }

  private _createFileDropLine(): void {
    if (this._fileDropLine) return
    const el = document.createElement('div')
    el.style.cssText = [
      'z-index: 10',
      'position: absolute',
      'top: 0',
      'left: 0',
      'height: 2px',
      'background-color: #3a53d9',
      'pointer-events: none',
      'will-change: transform, width, height',
      'box-shadow: 0 0 2px var(--bc-active-color-light)',
    ].join(';')
    this.doc.root.hostElement.appendChild(el)
    this._fileDropLine = el
    this._lastFileDropLineRect = null
    this._cachedFileRootRect = null
  }

  private _removeFileDropLine(): void {
    if (!this._fileDropLine) return
    this._fileDropLine.remove()
    this._fileDropLine = null
    this._lastFileDropLineRect = null
    this._cachedFileRootRect = null
  }

  private _moveFileDropLine(host: HTMLElement, position: DragPosition, hostRect = host.getBoundingClientRect()): void {
    if (!this._fileDropLine) return
    if (position === 'none') return
    const rootRect = this._cachedFileRootRect ?? this._refreshFileRootRect()
    const rect = calcDragLineRect(rootRect, hostRect, position)
    const prev = this._lastFileDropLineRect
    if (!prev || prev.left !== rect.left || prev.top !== rect.top) {
      this._fileDropLine.style.transform = `translate3d(${rect.left}px, ${rect.top}px, 0)`
    }
    if (!prev || prev.width !== rect.width) {
      this._fileDropLine.style.width = rect.width + 'px'
    }
    if (!prev || prev.height !== rect.height) {
      this._fileDropLine.style.height = rect.height + 'px'
    }
    this._lastFileDropLineRect = rect
  }

  private _refreshFileRootRect(): { top: number, left: number } {
    const r = this.doc.root.hostElement.getBoundingClientRect()
    this._cachedFileRootRect = { top: r.top, left: r.left }
    return this._cachedFileRootRect
  }

  // --- Commit 类方法：被 DocInternalDragController 和外部文件路径共同调用 ---

  private _tryReadonlyCheck(check: () => void): boolean {
    try {
      check()
      return true
    } catch (error) {
      if (error instanceof BlockReadonlyError) return false
      throw error
    }
  }

  private _tryAssertPropsWritable(blockId: string): boolean {
    return this._tryReadonlyCheck(() => this.doc.readonlyManager.assertPropsWritable(
      blockId,
      BlockReadonlyOperation.Move,
      'drag',
    ))
  }

  private _tryAssertInsertable(parentId: string, operation = BlockReadonlyOperation.Move): boolean {
    return this._tryReadonlyCheck(() => this.doc.readonlyManager.assertInsertable(
      parentId,
      operation,
      'drag',
    ))
  }

  private _tryAssertMovable(blockIds: readonly string[], targetParentId: string): boolean {
    return this._tryReadonlyCheck(() => this.doc.readonlyManager.assertMovable(
      blockIds,
      targetParentId,
      BlockReadonlyOperation.Move,
      'drag',
    ))
  }

  private _handleSourceParentAfterMove(blockId: string) {
    const sourceParent = this.doc.getBlockById(blockId)
    if (sourceParent?.childrenLength === 0) {
      const schema = this.doc.schemas.get(sourceParent.flavour)!
      if (schema.metadata.renderUnit) {
        this.doc.crud.insertBlocks(sourceParent.id, 0, [this.doc.schemas.createSnapshot('paragraph', [])])
      } else {
        this.doc.crud.deleteBlockById(sourceParent.id)
      }
    }
  }

  onSetColumn(block: BlockCraft.BlockComponent, targetBlock: BlockCraft.BlockComponent, position: DragPosition) {
    const parent = targetBlock.parentBlock
    const columnSchema = this.doc.schemas.get('column')
    if (!parent || !columnSchema) return
    if (parent.flavour === 'column') {
      const columnsBlock = parent.parentBlock
      if (!columnsBlock || columnsBlock.childrenLength >= 8) {
        this.doc.messageService.warn(`分栏最多支持8列`)
        return
      }

      if (!this._tryAssertMovable([block.id], columnsBlock.id)) return

      const newColumn = this.doc.schemas.createSnapshot('column', [[]])
      const _insertIdx = parent.getIndexOfParent() + (position === 'left' ? 0 : 1)

      const sourceParentId = block.parentId!
      this.doc.crud.insertBlocks(parent.parentId!, _insertIdx, [newColumn])
      this.doc.crud.moveBlocks(block.parentId!, block.getIndexOfParent(), 1, newColumn.id, 0)
      this._handleSourceParentAfterMove(sourceParentId)
      return
    }
    if (!this.doc.schemas.isValidChildren(block.flavour, columnSchema) || !this.doc.schemas.isValidChildren(targetBlock.flavour, columnSchema)) {
      this.doc.messageService.warn(`不允许的分栏内容`)
      return
    }
    if (!this.doc.canInsertChild(parent.id, 'columns')) {
      this.doc.messageService.warn(`当前位置不允许添加分栏`)
      return
    }
    if (!targetBlock.parentId || !this._tryAssertMovable([block.id, targetBlock.id], targetBlock.parentId)) return
    const columns = this.doc.schemas.createSnapshot('columns', [2])
    const column1 = columns.children[0] as IBlockSnapshot
    const column2 = columns.children[1] as IBlockSnapshot
    column1.children = []
    column2.children = []
    this.doc.crud.transact(() => {
      this.doc.crud.insertBlocks(targetBlock.parentId!, targetBlock.getIndexOfParent(), [columns])
    })
    this.doc.crud.transact(() => {
      const sourceParentId = block.parentId!
      this.doc.crud.moveBlocks(block.parentId!, block.getIndexOfParent(), 1, position === 'left' ? column1.id : column2.id, 0)
      this.doc.crud.moveBlocks(targetBlock.parentId!, targetBlock.getIndexOfParent(), 1, position === 'left' ? column2.id : column1.id, 0)
      this._handleSourceParentAfterMove(sourceParentId)
    })
  }

  onSortBlock(block: BlockCraft.BlockComponent, targetBlock: BlockCraft.BlockComponent, position: DragPosition) {
    if (!block || position === 'none' || targetBlock === block) return
    const isDepthEqual = block.props['depth'] === targetBlock.props['depth']
    if (position === 'left' || position === 'right') {
      this.onSetColumn(block, targetBlock, position)
      return
    }

    if (block.hostElement.nextElementSibling === targetBlock.hostElement && position === 'before') {
      if (!isDepthEqual && this._tryAssertPropsWritable(block.id)) {
        block.updateProps({ depth: targetBlock.props.depth })
      }
      return
    }

    if (block.hostElement.previousElementSibling === targetBlock.hostElement && position === 'after') {
      if (!isDepthEqual && this._tryAssertPropsWritable(block.id)) {
        block.updateProps({ depth: targetBlock.props.depth })
      }
      return
    }

    const targetParent = targetBlock.parentBlock
    if (!targetParent) return
    if (!this.doc.canInsertChild(targetParent.id, block.flavour)) {
      this.doc.messageService.warn(`不允许的移动`)
      return
    }

    let targetIdx = targetBlock.getIndexOfParent()
    const posRelationship = this.doc.compareBlockPosition(block, targetBlock)
    if (position === 'before' && posRelationship === BLOCK_POSITION.AFTER) {
      targetIdx = Math.max(0, targetIdx - 1)
    }
    if (position === 'after' && (targetBlock.parentId !== block.parentId || posRelationship === BLOCK_POSITION.BEFORE)) {
      targetIdx += 1
    }
    if (!this._tryAssertMovable([block.id], targetParent.id)) return

    this.doc.crud.transact(() => {
      if (!isDepthEqual) {
        block.updateProps({ depth: targetBlock.props['depth'] })
      }

      const sourceParentId = block.parentId!
      this.doc.crud.moveBlocks(sourceParentId, block.getIndexOfParent(), 1,
        targetParent.id, targetIdx)

      this._handleSourceParentAfterMove(sourceParentId)
    })
  }

  /**
   * Multi-block sibling reorder. Sources must be same-parent contiguous siblings;
   * caller is responsible for that invariant (block-controller computes via
   * doc.queryBlocksBetween). Service performs defensive checks and silently
   * returns on violation.
   */
  onSortBlocks(
    sources: BlockCraft.BlockComponent[],
    target: BlockCraft.BlockComponent,
    position: DragPosition
  ): void {
    if (!sources.length || position === 'none') return
    if (sources.includes(target)) return
    if (sources.some(s => s.hostElement.contains(target.hostElement))) return

    if (sources.length === 1) {
      this.onSortBlock(sources[0], target, position)
      return
    }

    const sourceParent = sources[0].parentBlock
    if (!sourceParent || sources.some(s => s.parentId !== sourceParent.id)) return
    const targetParent = target.parentBlock
    if (!targetParent) return

    if (position === 'left' || position === 'right') {
      this._onSetColumnBatch(sources, target, position)
      return
    }

    for (const s of sources) {
      if (!this.doc.canInsertChild(targetParent.id, s.flavour)) {
        this.doc.messageService.warn(`不允许的移动`)
        return
      }
    }

    // Source positions are read fresh here, but the block ids were captured at
    // pointerdown. A concurrent remote edit during the drag may have reordered
    // them, so don't trust the captured array order: derive the range from the
    // min/max of current indices, then confirm the contiguous run is EXACTLY the
    // source set before moving. Otherwise a remote swap that preserves the span
    // could drag a foreign block and strand a source one.
    const indices = sources.map(s => s.getIndexOfParent())
    if (indices.some(i => i < 0)) return                       // a source left this parent
    const firstIdx = Math.min(...indices)
    const lastIdx = Math.max(...indices)
    const count = lastIdx - firstIdx + 1
    if (count !== sources.length) return                       // gap → not contiguous
    const sourceIds = new Set(sources.map(s => s.id))
    if (sourceParent.childrenIds.slice(firstIdx, firstIdx + count).some(id => !sourceIds.has(id))) return

    if (sourceParent === targetParent) {
      const targetIdx = target.getIndexOfParent()
      if (targetIdx === firstIdx - 1 && position === 'after') return
      if (targetIdx === lastIdx + 1 && position === 'before') return
    }

    // Compute insert index. Use count-aware adjustment instead of the ±1 that
    // single-block onSortBlock uses (see table-block row reorder for the same
    // pattern). For same-parent reorder where sources lie before target in the
    // children array, the delete inside crud.moveBlocks shifts target's index
    // down by `count`; account for that before applying the +1 for 'after'.
    let targetIdx = target.getIndexOfParent()
    if (sourceParent === targetParent && firstIdx < targetIdx) {
      targetIdx -= count
    }
    if (position === 'after') {
      targetIdx += 1
    }
    if (!this._tryAssertMovable(sources.map(source => source.id), targetParent.id)) return

    const targetDepth = target.props['depth']
    this.doc.crud.transact(() => {
      for (const s of sources) {
        if (s.props['depth'] !== targetDepth) s.updateProps({ depth: targetDepth })
      }
      this.doc.crud.moveBlocks(sourceParent.id, firstIdx, count, targetParent.id, targetIdx)
      this._handleSourceParentAfterMove(sourceParent.id)
    })
  }

  private _onSetColumnBatch(
    sources: BlockCraft.BlockComponent[],
    target: BlockCraft.BlockComponent,
    position: 'left' | 'right'
  ): void {
    const parent = target.parentBlock
    const columnSchema = this.doc.schemas.get('column')
    if (!parent || !columnSchema) return

    const sourceParent = sources[0].parentBlock
    if (!sourceParent) return

    // Case A: target is already inside an existing `column` — add a new sibling column.
    if (parent.flavour === 'column') {
      const columnsBlock = parent.parentBlock
      if (!columnsBlock || columnsBlock.childrenLength >= 8) {
        this.doc.messageService.warn(`分栏最多支持8列`)
        return
      }
      if (!this._tryAssertMovable(sources.map(source => source.id), columnsBlock.id)) return
      const newColumn = this.doc.schemas.createSnapshot('column', [[]])
      const insertIdx = parent.getIndexOfParent() + (position === 'left' ? 0 : 1)

      const sourceParentId = sourceParent.id
      const firstIdx = sources[0].getIndexOfParent()
      const count = sources.length

      this.doc.crud.transact(() => {
        this.doc.crud.insertBlocks(columnsBlock.id, insertIdx, [newColumn])
        this.doc.crud.moveBlocks(sourceParentId, firstIdx, count, newColumn.id, 0)
        this._handleSourceParentAfterMove(sourceParentId)
      })
      return
    }

    // Case B: target is a regular block — create a new `columns` wrapper around it.
    for (const s of sources) {
      if (!this.doc.schemas.isValidChildren(s.flavour, columnSchema)) {
        this.doc.messageService.warn(`不允许的分栏内容`)
        return
      }
    }
    if (!this.doc.schemas.isValidChildren(target.flavour, columnSchema)) {
      this.doc.messageService.warn(`不允许的分栏内容`)
      return
    }
    if (
      !target.parentId ||
      !this.doc.canInsertChild(target.parentId, 'columns')
    ) {
      this.doc.messageService.warn(`当前位置不允许添加分栏`)
      return
    }
    if (!target.parentId || !this._tryAssertMovable(
      [...sources.map(source => source.id), target.id],
      target.parentId,
    )) return

    const columns = this.doc.schemas.createSnapshot('columns', [2])
    const column1 = columns.children[0] as IBlockSnapshot
    const column2 = columns.children[1] as IBlockSnapshot
    column1.children = []
    column2.children = []

    this.doc.crud.transact(() => {
      this.doc.crud.insertBlocks(target.parentId!, target.getIndexOfParent(), [columns])
    })
    this.doc.crud.transact(() => {
      const sourceParentId = sourceParent.id
      const firstIdx = sources[0].getIndexOfParent()
      const count = sources.length
      this.doc.crud.moveBlocks(sourceParentId, firstIdx, count, position === 'left' ? column1.id : column2.id, 0)
      this.doc.crud.moveBlocks(target.parentId!, target.getIndexOfParent(), 1, position === 'left' ? column2.id : column1.id, 0)
      this._handleSourceParentAfterMove(sourceParentId)
    })
  }

  // TODO 文件处理应该交由插件
  onInsertFiles(files: FileList, targetBlock: BlockCraft.BlockComponent, position: DragPosition) {
    if (!files?.length || position === 'none') return
    const targetParent = targetBlock.parentBlock
    if (!targetParent) return
    if (!files.length) return
    if (files.length === 1 && files[0].type.startsWith('image/')) {
      if (!this.doc.canInsertChild(targetParent.id, 'image')) {
        this.doc.messageService.warn('此处不能添加图片')
        return
      }
      if (!this._tryAssertInsertable(
        targetParent.id,
        BlockReadonlyOperation.Insert,
      )) {
        return
      }
      this._insertImageFile(files[0], targetBlock, position)
      return
    }

    if (files.length === 1 && files[0].type.startsWith('video/')) {
      if (this.doc.schemas.get('video') && this.doc.canInsertChild(targetParent.id, 'video')) {
        if (!this._tryAssertInsertable(targetParent.id, BlockReadonlyOperation.Insert)) return
        const fileService = this.doc.injector.get(DOC_FILE_SERVICE_TOKEN)
        const url = fileService.createObjectURL(files[0])
        const snapshot = this.doc.schemas.createSnapshot('video', [{
          url,
          name: files[0].name,
          size: files[0].size,
          type: files[0].type,
          sourceType: 'local' as const,
        }])
        snapshot.props.depth = targetBlock.props['depth']
        this.doc.crud.insertBlocks(targetBlock.parentId!, targetBlock.getIndexOfParent() + (position === 'after' ? 1 : 0), [snapshot])
        return
      }
    }

    if (files.length === 1 && files[0].type.startsWith('audio/')) {
      if (this.doc.schemas.get('audio') && this.doc.canInsertChild(targetParent.id, 'audio')) {
        if (!this._tryAssertInsertable(targetParent.id, BlockReadonlyOperation.Insert)) return
        const fileService = this.doc.injector.get(DOC_FILE_SERVICE_TOKEN)
        const url = fileService.createObjectURL(files[0])
        const snapshot = this.doc.schemas.createSnapshot('audio', [{
          url,
          name: files[0].name,
          size: files[0].size,
          type: files[0].type,
          sourceType: 'local' as const,
        }])
        snapshot.props.depth = targetBlock.props['depth']
        this.doc.crud.insertBlocks(targetBlock.parentId!, targetBlock.getIndexOfParent() + (position === 'after' ? 1 : 0), [snapshot])
        return
      }
    }

    if (!this.doc.canInsertChild(targetParent.id, 'attachment')) {
      this.doc.messageService.warn(`此处不能添加文件`)
      return
    }

    const _files = Array.from(files).filter(v => !v.type.startsWith('image/'))
    if (!_files.length) return
    if (!this._tryAssertInsertable(targetParent.id, BlockReadonlyOperation.Insert)) return
    const fileService = this.doc.injector.get(DOC_FILE_SERVICE_TOKEN)
    const _blocks: IBlockSnapshot[] = _files.map(f => {
      const url = fileService.createObjectURL(f)
      return this.doc.schemas.createSnapshot('attachment', [{
        name: f.name,
        size: f.size,
        type: f.type,
        url,
      }])
    })

    if (!_blocks.length) return
    // TAG: Depth
    _blocks.forEach(b => b.props.depth = targetBlock.props['depth'])
    this.doc.crud.insertBlocks(targetBlock.parentId!, targetBlock.getIndexOfParent() + (position === 'after' ? 1 : 0), _blocks)
  }

  private _insertImageFile(
    file: File,
    targetBlock: BlockCraft.BlockComponent,
    position: DragPosition,
  ): void {
    const fileService = this.doc.injector.get(DOC_FILE_SERVICE_TOKEN)
    if (fileService.isOverMaxSize(file.size)) {
      this.doc.messageService.warn('图片过大')
      return
    }

    const url = fileService.createObjectURL(file)
    const snapshot = this.doc.schemas.createSnapshot('image', [{
      src: url,
    }])
    const depth = targetBlock.props['depth']
    if (typeof depth === 'number') {
      snapshot.props.depth = depth
    }
    try {
      this.doc.crud.insertBlocks(
        targetBlock.parentId!,
        targetBlock.getIndexOfParent() + (position === 'after' ? 1 : 0),
        [snapshot],
      )
    } catch {
      fileService.removeObjectURL(url)
      this.doc.messageService.warn('图片插入失败')
    }
  }

  onInsertNewBlock(flavour: BlockCraft.BlockFlavour, initProps: IBlockProps, targetBlock: BlockCraft.BlockComponent, position: DragPosition) {
    if (position === 'none') return
    const targetParent = targetBlock.parentBlock
    if (!targetParent) return
    if (!this.doc.canInsertChild(targetParent.id, flavour)) {
      const newSchema = this.doc.schemas.get(flavour)
      this.doc.messageService.warn(`此处不能添加${newSchema?.metadata.label}`)
      return
    }

    if (!this.doc.schemas.has(flavour)) return
    if (!this._tryAssertInsertable(targetParent.id, BlockReadonlyOperation.Insert)) return
    const blockCreator = this.doc.injector.get(BLOCK_CREATOR_SERVICE_TOKEN)
    blockCreator.getParamsByScheme(this.doc.schemas.get(flavour)!).then(params => {
      if (!params) return
      const currentParent = targetBlock.parentBlock
      if (!currentParent) return
      if (!this.doc.canInsertChild(currentParent.id, flavour)) return
      if (!this._tryAssertInsertable(currentParent.id, BlockReadonlyOperation.Insert)) return
      const snapshot = this.doc.schemas.createSnapshot(flavour, <any>params)
      initProps && Object.assign(snapshot.props, initProps)
      void this.doc.chain()
        .insertSnapshots(currentParent.id, targetBlock.getIndexOfParent() + (position === 'after' ? 1 : 0), [snapshot])
        .setCursorAtBlock(snapshot.id, true)
        .run()
        .catch(error => {
          if (!(error instanceof BlockReadonlyError)) throw error
        })
    })
  }
}
