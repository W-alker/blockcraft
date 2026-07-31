import {BehaviorSubject, Observable, Subscription} from 'rxjs'
import type {BlockPositionState} from '../../block-std/types'
import {BlockReadonlyError} from '../../doc/block-readonly.types'
import {deleteAbsolutePlacementObject} from './delete-command'
import {resolvePlacementBox} from './geometry'
import {BlockPlacementRuntime} from './runtime'
import {finitePlacementNumber} from './state'
import {
  BLOCK_PLACEMENT_LAYOUT_FLAVOUR,
  type BlockPlacementDragState,
} from './types'

const DEFAULT_MOUSE_THRESHOLD = 4
const DEFAULT_TOUCH_THRESHOLD = 8

/**
 * Owns Placement pointer/keyboard interaction and all view-bound resources.
 */
export class BlockPlacementInteractionController {
  private readonly stateSubject =
    new BehaviorSubject<BlockPlacementDragState>('idle')
  private readonly subscriptions = new Subscription()
  private readonly registeredBlocks = new Map<string, {
    block: BlockCraft.BlockComponent
    subscription: Subscription
  }>()
  private readonly underBlocks = new Set<BlockCraft.BlockComponent>()
  private cleanupDrag: (() => void) | null = null
  private rootHost: HTMLElement | null = null

  constructor(
    private readonly doc: BlockCraft.Doc,
    private readonly runtime: BlockPlacementRuntime,
  ) {
    this.bindDeleteHotkeys()
    this.subscriptions.add(this.doc.readonlySwitch$.subscribe(readonly => {
      if (readonly) this.cancelDrag()
    }))
    this.doc.afterInit?.(root => {
      if (this.stateSubject.closed || this.rootHost) return
      this.rootHost = root.hostElement
      this.doc.ngZone.runOutsideAngular(() => {
        this.rootHost?.addEventListener(
          'pointerdown',
          this.onRootPointerDown,
          true,
        )
      })
    })
  }

  get state$(): Observable<BlockPlacementDragState> {
    return this.stateSubject.asObservable()
  }

  get state(): BlockPlacementDragState {
    return this.stateSubject.value
  }

  get isDragging(): boolean {
    return this.stateSubject.value === 'dragging'
  }

  /**
   * Register a materialized placement-capable block for cold-path underlay
   * picking. BaseBlockComponent owns the returned lifecycle disposer.
   */
  registerBlockView(block: BlockCraft.BlockComponent): () => void {
    if (!this.runtime.supports(block, 'absolute')) return () => {}
    this.unregisterBlockView(block.id)

    const subscription = new Subscription()
    const sync = () => {
      const placement = this.runtime.getState(block)
      if (
        this.runtime.resolveBlock(block.id) === block &&
        placement.mode === 'absolute' &&
        placement.layer === 'under'
      ) {
        this.underBlocks.add(block)
      } else {
        this.underBlocks.delete(block)
      }
    }
    subscription.add(block.onPropsChange.subscribe(changes => {
      if ((changes as ReadonlyMap<PropertyKey, unknown>).has('placement')) {
        sync()
      }
    }))
    subscription.add(block.onReattach$.subscribe(sync))
    subscription.add(block.onDetach$.subscribe(() => {
      this.underBlocks.delete(block)
    }))
    this.registeredBlocks.set(block.id, {block, subscription})
    sync()

    let released = false
    return () => {
      if (released) return
      released = true
      const registered = this.registeredBlocks.get(block.id)
      if (registered?.block === block) this.unregisterBlockView(block.id)
    }
  }

  updateAbsolute(
    blockOrId: string | BlockCraft.BlockComponent,
    patch: {x?: number; y?: number},
  ): boolean {
    const block = this.runtime.resolveBlock(blockOrId)
    if (
      !block ||
      !this.runtime.supports(block, 'absolute') ||
      this.runtime.isReadonly(block)
    ) {
      return false
    }
    const current = this.runtime.getState(block)
    if (current.mode !== 'absolute') return false
    const next: BlockPositionState = {
      mode: 'absolute',
      x: finitePlacementNumber(patch.x, current.x),
      y: finitePlacementNumber(patch.y, current.y),
      ...(current.layer === 'over' ? {} : {layer: current.layer}),
    }
    block.updateProps({placement: next})
    block.changeDetectorRef.markForCheck()
    return true
  }

  startDrag(
    event: PointerEvent,
    blockOrId: string | BlockCraft.BlockComponent,
    options: {movementThreshold?: number} = {},
  ): boolean {
    const block = this.runtime.resolveBlock(blockOrId)
    if (
      !block ||
      event.button !== 0 ||
      this.stateSubject.value !== 'idle' ||
      this.doc.dragController.state !== 'idle' ||
      this.runtime.getState(block).mode !== 'absolute' ||
      !this.runtime.supports(block, 'absolute') ||
      this.runtime.isReadonly(block)
    ) {
      return false
    }

    const host = block.hostElement
    const box = resolvePlacementBox(host)
    if (!box) return false

    const pointerId = event.pointerId
    const startX = event.clientX
    const startY = event.clientY
    const start = this.runtime.getState(block)
    const threshold = options.movementThreshold ??
      (
        (event.pointerType || 'mouse') === 'touch'
          ? DEFAULT_TOUCH_THRESHOLD
          : DEFAULT_MOUSE_THRESHOLD
      )
    const originalTransform = host.style.transform
    const releaseLease =
      this.doc.virtualization.acquireBlockViewLease([block.id])
    let moved = false
    let dx = 0
    let dy = 0
    let cleaned = false

    const isLiveWritable = () => {
      const live = this.runtime.resolveBlock(block.id)
      return live === block && !this.runtime.isReadonly(block)
    }
    const restorePreview = () => {
      if (host.isConnected) host.style.transform = originalTransform
    }
    const cleanup = () => {
      if (cleaned) return
      cleaned = true
      window.removeEventListener('pointermove', onPointerMove, true)
      window.removeEventListener('pointerup', onPointerUp, true)
      window.removeEventListener('pointercancel', onPointerCancel, true)
      window.removeEventListener('keydown', onKeydown, true)
      window.removeEventListener('blur', onWindowBlur)
      document.removeEventListener('selectstart', onSelectStart, true)
      restorePreview()
      try {
        releaseLease()
      } finally {
        try {
          this.doc.selection.setSuppressRecalculate(false)
        } catch {}
        this.cleanupDrag = null
        this.stateSubject.next('idle')
      }
    }
    const onPointerMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return
      if (!isLiveWritable()) {
        cleanup()
        return
      }
      dx = moveEvent.clientX - startX
      dy = moveEvent.clientY - startY
      if (!moved && dx * dx + dy * dy < threshold * threshold) return
      if (!moved) {
        moved = true
        this.stateSubject.next('dragging')
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur()
        }
        try {
          this.doc.selection.blur()
        } catch {}
      }
      moveEvent.preventDefault()
      host.style.transform =
        `translate3d(${dx}px, ${dy}px, 0)` +
        `${originalTransform ? ` ${originalTransform}` : ''}`
    }
    const onPointerUp = (upEvent: PointerEvent) => {
      if (upEvent.pointerId !== pointerId) return
      const shouldCommit = moved && isLiveWritable()
      cleanup()
      if (!shouldCommit) return
      this.updateAbsolute(block, {
        x: start.x + (dx / box.width) * 100,
        y: start.y + dy,
      })
    }
    const onPointerCancel = (cancelEvent: PointerEvent) => {
      if (cancelEvent.pointerId === pointerId) cleanup()
    }
    const onKeydown = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key === 'Escape') cleanup()
    }
    const onWindowBlur = () => cleanup()
    const onSelectStart = (selectEvent: Event) => {
      if (this.stateSubject.value === 'idle') return
      selectEvent.preventDefault()
      selectEvent.stopImmediatePropagation()
    }

    // pointerdown 后浏览器仍会继续派发 mousedown / selectionchange。绝对定位块
    // 的内容落点不一定能被 normalizeRange 映射回块选区，因此 armed 阶段必须
    // 保护调用方刚写入的 BlockSelection；真正超过阈值后再主动 blur。
    this.doc.selection.setSuppressRecalculate(true)
    this.doc.ngZone.runOutsideAngular(() => {
      window.addEventListener('pointermove', onPointerMove, true)
      window.addEventListener('pointerup', onPointerUp, true)
      window.addEventListener('pointercancel', onPointerCancel, true)
      window.addEventListener('keydown', onKeydown, true)
      window.addEventListener('blur', onWindowBlur)
      document.addEventListener('selectstart', onSelectStart, true)
    })
    this.cleanupDrag = cleanup
    this.stateSubject.next('armed')
    return true
  }

  cancelDrag(): void {
    this.cleanupDrag?.()
  }

  destroy(): void {
    this.cancelDrag()
    if (this.rootHost) {
      this.rootHost.removeEventListener(
        'pointerdown',
        this.onRootPointerDown,
        true,
      )
      this.rootHost = null
    }
    for (const id of [...this.registeredBlocks.keys()]) {
      this.unregisterBlockView(id)
    }
    this.subscriptions.unsubscribe()
    if (!this.stateSubject.closed) this.stateSubject.complete()
  }

  /**
   * Absolute object selections bubble through their placement-layout before
   * global input handlers. Consume deletion here so DocCRUD never applies the
   * render-unit paragraph fallback to an empty layout.
   */
  private bindDeleteHotkeys(): void {
    const bindHotkey = this.doc.event?.bindHotkey
    if (typeof bindHotkey !== 'function') return

    const handleDelete: BlockCraft.EventHandler = context => {
      const selection = context.get('keyboardState').selection
      if (!this.runtime.isAbsoluteObjectSelection(selection)) return

      try {
        if (
          !deleteAbsolutePlacementObject(
            this.doc,
            selection.anchor.blockId,
            'input',
          )
        ) {
          return
        }
      } catch (error) {
        if (!(error instanceof BlockReadonlyError)) throw error
      }

      context.preventDefault()
      return true
    }
    const options = {flavour: BLOCK_PLACEMENT_LAYOUT_FLAVOUR}
    this.subscriptions.add(bindHotkey(
      {
        key: 'Backspace',
        shiftKey: null,
        shortKey: null,
        metaKey: false,
      },
      handleDelete,
      options,
    ))
    this.subscriptions.add(bindHotkey(
      {
        key: 'Delete',
        shiftKey: null,
        shortKey: null,
        metaKey: false,
      },
      handleDelete,
      options,
    ))
  }

  private readonly onRootPointerDown = (event: PointerEvent): void => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      !this.rootHost ||
      !this.underBlocks.size
    ) {
      return
    }
    const target = event.target
    if (
      target instanceof Element &&
      target.closest('block-resizer, [data-bc-placement-pick-ignore]')
    ) {
      return
    }

    const band = (event.pointerType || 'mouse') === 'touch' ? 10 : 6
    let candidate: BlockCraft.BlockComponent | null = null
    for (const block of this.underBlocks) {
      if (
        this.runtime.resolveBlock(block.id) !== block ||
        !block.hostElement.isConnected ||
        !this.rootHost.contains(block.hostElement)
      ) {
        continue
      }
      const rect = block.hostElement.getBoundingClientRect()
      if (
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom
      ) {
        continue
      }
      const bx = Math.min(band, rect.width / 3)
      const by = Math.min(band, rect.height / 3)
      const inBand =
        event.clientX - rect.left <= bx ||
        rect.right - event.clientX <= bx ||
        event.clientY - rect.top <= by ||
        rect.bottom - event.clientY <= by
      if (!inBand) continue

      if (
        !candidate ||
        !!(
          candidate.hostElement.compareDocumentPosition(block.hostElement) &
          Node.DOCUMENT_POSITION_FOLLOWING
        )
      ) {
        candidate = block
      }
    }
    if (!candidate) return

    event.preventDefault()
    event.stopPropagation()
    const current = this.doc.selection.value
    if (
      current?.isInSameBlock &&
      current.firstBlockId === candidate.id &&
      current.anchor.type === 'selected' &&
      current.head.type === 'selected'
    ) {
      // Re-activate object-specific toolbars even when the underlay object was
      // already selected and selection equality suppresses another emission.
      this.doc.selection.blur()
    }
    this.doc.selection.selectBlock(candidate)
  }

  private unregisterBlockView(id: string): void {
    const registered = this.registeredBlocks.get(id)
    if (!registered) return
    registered.subscription.unsubscribe()
    this.underBlocks.delete(registered.block)
    this.registeredBlocks.delete(id)
  }
}
