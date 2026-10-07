import {Subscription, fromEvent, merge, takeUntil} from 'rxjs'
import {DocPlugin, closetBlockId} from '../../framework'

/** 按 Schema 的拖拽职责和 placement 能力提供本体选择与移动。 */
export class ObjectDragPlugin extends DocPlugin {
  override name = 'ObjectDrag'
  private readonly subscriptions = new Subscription()
  private pendingClickCleanup?: () => void

  override init(): void {
    // 在 Selection 的根节点捕获处理之前拾取；专属对象与组合插件先注册。
    this.subscriptions.add(fromEvent<PointerEvent>(document, 'pointerdown', {capture: true})
      .pipe(takeUntil(this.doc.onDestroy$))
      .subscribe(event => this.onPointerDown(event)))
    this.subscriptions.add(this.doc.onDestroy$.subscribe(() => this.pendingClickCleanup?.()))
  }

  override destroy(): void {
    this.pendingClickCleanup?.()
    this.subscriptions.unsubscribe()
  }

  private onPointerDown(event: PointerEvent): void {
    if (event.defaultPrevented || event.button !== 0 || this.doc.isReadonly) return
    if (this.doc.dragController.state !== 'idle' || this.doc.placement.state !== 'idle') return
    const target = event.target
    if (!(target instanceof Element) || !this.doc.root.hostElement.contains(target)) return
    // gap 与显式禁用区域不能被移动接管。缩放器内部只有标记的移动边框可拾取。
    if (target.closest('[data-bc-nodrag], [data-block-zero-space="true"]')) return
    const interaction = target.closest('[data-bc-object-drag-handle], block-resizer, [data-bc-placement-pick-ignore]')
    const isHandle = interaction?.hasAttribute('data-bc-object-drag-handle') === true
    if (interaction && !isHandle) return
    const blockId = closetBlockId(target)
    if (!blockId) return
    let block: BlockCraft.BlockComponent | null
    try { block = this.doc.getBlockById(blockId) } catch { return }
    if (!block) return
    const metadata = this.doc.schemas.get(block.flavour, false)?.metadata
    if (!metadata) return
    if (metadata.objectDrag === 'custom') return
    const usesMarkedTarget = metadata.objectDrag === 'body' || metadata.objectDrag === 'handles'
    if (usesMarkedTarget) {
      const surface = isHandle ? interaction : target.closest('[data-bc-object-drag-surface]')
      // 内层文本块和嵌套对象不得借用外层对象的命中区。
      if (!surface || closetBlockId(surface) !== block.id) return
      if (metadata.objectDrag === 'handles' && !isHandle) return
    }
    const supportsAbsolute = this.doc.placement.supports(block, 'absolute')
    // 正文本体排序由 Schema 显式启用，仍受当前位置的 placement 能力约束。
    const supportsBodySort = usesMarkedTarget && this.doc.placement.supports(block, 'relative')
    if (!supportsAbsolute && !supportsBodySort) return

    // 原生选区会把自绘 void 块的点击落到旁边的 gap，必须显式选择本体。
    // 已选对象重新点击也要唤起对应工具条，保持原有宿主交互。
    const current = this.doc.selection.value
    const selectedIds = this.doc.placement.getAbsoluteObjectSelectionIds(current)
    const keepsMultiSelection = !!selectedIds && selectedIds.length > 1 && selectedIds.includes(block.id)
    if (!keepsMultiSelection && current?.firstBlockId === block.id &&
      current.anchor.type === 'selected' && current.head.type === 'selected') {
      this.doc.selection.blur()
    }
    if (isHandle || keepsMultiSelection) {
      event.preventDefault()
      event.stopPropagation()
    }
    if (!keepsMultiSelection) {
      this.doc.selection.selectBlock(block)
      if (usesMarkedTarget) this.confirmClickSelection(event, block)
    }
    if (this.doc.readonlyManager.isReadonly(block)) return
    if (this.doc.placement.getState(block).mode === 'absolute') {
      if (supportsAbsolute) this.doc.placement.startDrag(event, block)
    } else if (supportsBodySort) {
      this.doc.dragController.startDrag(
        event,
        {kind: 'origin-block', blockId: block.id},
        {ghostLabel: this.resolveDragLabel(target, block.id) ?? metadata.label},
      )
    }
  }

  private resolveDragLabel(target: Element, blockId: string): string | null {
    const labelled = target.closest('[data-bc-object-drag-label]')
    return labelled && closetBlockId(labelled) === blockId
      ? labelled.getAttribute('data-bc-object-drag-label')
      : null
  }

  /** 原生 mouse/selectionchange 不应覆盖对象点击；真正拖拽完成后不重置落点选区。 */
  private confirmClickSelection(startEvent: PointerEvent, block: BlockCraft.BlockComponent): void {
    this.pendingClickCleanup?.()
    let didDrag = false
    const stateSub = merge(this.doc.dragController.state$, this.doc.placement.state$)
      .subscribe(state => {
        if (state === 'dragging' || state === 'dropping') didDrag = true
      })
    const cleanup = () => {
      window.removeEventListener('pointerup', onPointerUp, true)
      window.removeEventListener('pointercancel', onPointerCancel, true)
      window.removeEventListener('blur', cleanup, true)
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('mousedown', onMouseDown, true)
      stateSub.unsubscribe()
      if (this.pendingClickCleanup === cleanup) this.pendingClickCleanup = undefined
    }
    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerId !== startEvent.pointerId) return
      cleanup()
      if (didDrag || this.doc.isReadonly || !block.hostElement.isConnected) return
      try {
        if (this.doc.getBlockById(block.id) === block) this.doc.selection.selectBlock(block)
      } catch { /* 对象可能在手势期间被协作者移除。 */ }
    }
    const onPointerCancel = (event: PointerEvent) => {
      if (event.pointerId === startEvent.pointerId) cleanup()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cleanup()
    }
    const onMouseDown = (event: MouseEvent) => {
      if (event.button === 0 && event.target instanceof Element &&
        block.hostElement.contains(event.target) &&
        closetBlockId(event.target) === block.id) event.preventDefault()
    }
    window.addEventListener('pointerup', onPointerUp, true)
    window.addEventListener('pointercancel', onPointerCancel, true)
    window.addEventListener('blur', cleanup, true)
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('mousedown', onMouseDown, true)
    this.pendingClickCleanup = cleanup
  }
}
