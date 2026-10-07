import {storeBlockPosition} from './state'
import {BehaviorSubject, Observable, Subscription} from 'rxjs'
import type {IBlockProps} from '../../../block-std/types'
import {BlockReadonlyError} from '../../../doc/block-readonly.types'
import {deleteAbsolutePlacementObjects} from './delete-command'
import {duplicateAbsolutePlacementSelection} from './duplicate-command'
import {resolvePlacementBox} from './geometry'
import {resolvePlacementObjectGeometry, resolvePlacementObjectVisualBounds} from './object-geometry'
import {BlockPlacementRuntime} from './runtime'
import {finitePlacementNumber} from './state'
import {UnderlayObjectChrome} from './underlay-chrome'
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
  private cleanupFlowSelectionPassthrough: (() => void) | null = null
  private rootHost: HTMLElement | null = null
  private chromeFrame = 0
  private readonly underlayChrome = new Map<string, () => void>()

  constructor(
    private readonly doc: BlockCraft.Doc,
    private readonly runtime: BlockPlacementRuntime,
    private readonly commitObjectGeometry: (
      block: BlockCraft.BlockComponent,
      patch: Partial<IBlockProps>,
    ) => boolean,
    private readonly commitObjectPositions: (
      updates: readonly {block: BlockCraft.BlockComponent; position: {x: number; y: number}}[],
    ) => boolean,
  ) {
    this.bindObjectHotkeys()
    this.subscriptions.add(this.doc.readonlySwitch$.subscribe(readonly => {
      if (readonly) this.cancelDrag()
      this.scheduleUnderlayChrome()
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
      if (this.doc.selection?.selectionChange$) {
        this.subscriptions.add(this.doc.selection.selectionChange$
          .subscribe(() => this.scheduleUnderlayChrome()))
      }
      if (this.doc.readonlyManager?.stateChange$) {
        this.subscriptions.add(this.doc.readonlyManager.stateChange$
          .subscribe(() => this.scheduleUnderlayChrome()))
      }
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
      this.scheduleUnderlayChrome()
    }
    subscription.add(block.onPropsChange.subscribe(changes => {
      if ((changes as ReadonlyMap<PropertyKey, unknown>).has('placementLayer') ||
        (changes as ReadonlyMap<PropertyKey, unknown>).has('position')) {
        sync()
      } else if (this.underBlocks.has(block)) {
        this.scheduleUnderlayChrome()
      }
    }))
    if (block.onViewInit$) subscription.add(block.onViewInit$.subscribe(sync))
    subscription.add(block.onReattach$.subscribe(sync))
    subscription.add(block.onDetach$.subscribe(() => {
      this.clearUnderlayChrome(block)
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
    const next = {
      x: finitePlacementNumber(patch.x, current.x),
      y: finitePlacementNumber(patch.y, current.y),
    }
    if (!this.commitObjectGeometry(block, {position: storeBlockPosition(next)})) return false
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

    const selection = this.doc.selection.value
    const selectedIds = this.runtime.getAbsoluteObjectSelectionIds(selection)
    const blockIds = selectedIds?.includes(block.id) ? selectedIds : [block.id]
    const releaseLease = this.doc.virtualization.acquireBlockViewLease(blockIds)
    const blocks = blockIds.map(id => this.runtime.resolveBlock(id))
    if (blocks.some(candidate => !candidate || !candidate.hostElement.isConnected ||
      candidate.parentId !== block.parentId || !this.runtime.supports(candidate, 'absolute') ||
      this.runtime.getState(candidate).mode !== 'absolute' || this.runtime.isReadonly(candidate))) {
      releaseLease()
      return false
    }
    const targets = (blocks as BlockCraft.BlockComponent[]).map(candidate => ({
      block: candidate,
      host: candidate.hostElement,
      parentId: candidate.parentId,
      start: this.runtime.getState(candidate),
      originalTransform: candidate.hostElement.style.transform,
    }))
    const isMultiSelection = targets.length > 1
    if (isMultiSelection) event.preventDefault()
    const host = block.hostElement
    const box = resolvePlacementBox(host)
    if (!box) {
      releaseLease()
      return false
    }

    const pointerId = event.pointerId
    const ownerDocument = host.ownerDocument
    const ownerWindow = ownerDocument.defaultView ?? window
    const recoveredFromOutside = event.target instanceof Node && !host.contains(event.target)
    // Selection blur can hide transient resize edges / object handles while a
    // drag is active. Capture on the stable block host so that removing the
    // initiating chrome cannot turn a valid drag into lostpointercapture.
    const pointerCaptureTarget = host
    const pointerStartX = event.clientX
    const pointerStartY = event.clientY
    const start = this.runtime.getState(block)
    const placementStartX = start.x
    const placementStartY = start.y
    let previewBottom: number | null = null
    if (!this.runtime.isInObjectGroup(block) && this.doc.objectSizing) {
      for (const candidate of targets) {
        const object = resolvePlacementObjectGeometry(this.doc, candidate.block.id, {includeContent: true})
        if (!object) continue
        const bounds = resolvePlacementObjectVisualBounds({...object,
          width: this.doc.placement?.surface?.measuredWidth(object.id) ?? object.width,
          height: this.doc.placement?.surface?.measuredHeight(object.id) ?? object.height,
        })
        previewBottom = Math.max(previewBottom ?? bounds.bottom, bounds.bottom)
      }
    }
    let target = {x: placementStartX, y: placementStartY}
    const threshold = options.movementThreshold ??
      (
        (event.pointerType || 'mouse') === 'touch'
          ? DEFAULT_TOUCH_THRESHOLD
          : DEFAULT_MOUSE_THRESHOLD
      )
    let moved = false
    let dx = 0
    let dy = 0
    let cleaned = false
    let previewFrame: number | null = null

    const isLiveWritable = () => {
      return targets.every(candidate => {
        const live = this.runtime.resolveBlock(candidate.block.id)
        const current = this.runtime.getState(candidate.block)
        return live === candidate.block && candidate.host.isConnected &&
          candidate.block.parentId === candidate.parentId && current.mode === 'absolute' &&
          !this.runtime.isReadonly(candidate.block) && (!isMultiSelection ||
            (current.x === candidate.start.x && current.y === candidate.start.y && current.layer === candidate.start.layer))
      })
    }
    const restorePreview = () => {
      targets.forEach(candidate => {
        candidate.host.style.transform = candidate.originalTransform
      })
    }
    const cleanup = () => {
      if (cleaned) return
      cleaned = true
      if (previewFrame !== null) ownerWindow.cancelAnimationFrame(previewFrame)
      previewFrame = null
      ownerWindow.removeEventListener('pointermove', onPointerMove, true)
      ownerWindow.removeEventListener('pointerup', onPointerUp, true)
      ownerWindow.removeEventListener('pointercancel', onPointerCancel, true)
      ownerWindow.removeEventListener('keydown', onKeydown, true)
      ownerWindow.removeEventListener('blur', onWindowBlur)
      pointerCaptureTarget?.removeEventListener(
        'lostpointercapture',
        onLostPointerCapture,
      )
      ownerDocument.removeEventListener('selectstart', onSelectStart, true)
      ownerWindow.removeEventListener('mousedown', onCompatibilityMouseDown, true)
      try {
        if (pointerCaptureTarget?.hasPointerCapture(pointerId)) {
          pointerCaptureTarget.releasePointerCapture(pointerId)
        }
      } catch {}
      restorePreview()
      this.doc.placement?.surface?.preview(0)
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
    const applyPreview = () => {
      previewFrame = null
      const layoutDx = target.x - placementStartX
      const layoutDy = target.y - placementStartY
      if (previewBottom !== null) this.doc.placement?.surface?.preview(previewBottom + layoutDy)
      targets.forEach(candidate => {
        candidate.host.style.transform =
          `translate3d(${layoutDx}px, ${layoutDy}px, 0)` +
          `${candidate.originalTransform ? ` ${candidate.originalTransform}` : ''}`
      })
    }
    const onPointerMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return
      if (!isLiveWritable()) {
        cleanup()
        return
      }
      dx = moveEvent.clientX - pointerStartX
      dy = moveEvent.clientY - pointerStartY
      if (!moved && dx * dx + dy * dy < threshold * threshold) return
      if (!moved) {
        moved = true
        this.stateSubject.next('dragging')
        if (!isMultiSelection) {
          ;(ownerDocument.activeElement as HTMLElement | null)?.blur?.()
          try {
            this.doc.selection.blur()
          } catch {}
        }
      }
      moveEvent.preventDefault()
      // Pointer events expose visual viewport pixels.  Use the containing
      // placement plane's measured scale instead of the configured view scale:
      // browser zoom and host transforms can make the latter differ from the
      // geometry that actually produced the pointer coordinates.
      target = {x: placementStartX + dx / box.visualScale, y: placementStartY + dy / box.visualScale}
      if (isMultiSelection) {
        if (previewFrame === null) previewFrame = ownerWindow.requestAnimationFrame(applyPreview)
      } else applyPreview()
    }
    const onPointerUp = (upEvent: PointerEvent) => {
      if (upEvent.pointerId !== pointerId) return
      const shouldCommit = moved && isLiveWritable()
      const shouldReassertMultiSelection = isMultiSelection &&
        this.doc.selection.value === selection && isLiveWritable()
      const shouldReassertSelection = !isMultiSelection && !moved &&
        isLiveWritable() &&
        this.runtime.isAbsoluteObjectSelection(this.doc.selection.value) &&
        this.doc.selection.value?.anchor.blockId === block.id
      if (shouldCommit) {
        if (previewFrame !== null) {
          ownerWindow.cancelAnimationFrame(previewFrame)
          applyPreview()
        }
        if (isMultiSelection) this.doc.crud.undoManager?.stopCapturing()
        try {
          // 用户拖拽及组合内部的派生边界重算共用同一个 Undo 事务。
          let committed = false
          if (isMultiSelection) {
            // The batch owns its transaction and keeps reflow observers muted
            // until Yjs dispatch completes; an extra outer transaction would
            // dispatch after that guard was released and queue another fit.
            committed = this.commitObjectPositions(targets.map(candidate => ({
              block: candidate.block,
              position: {x: candidate.start.x + dx / box.visualScale, y: candidate.start.y + dy / box.visualScale},
            })))
          } else {
            this.doc.crud.transact(() => {
              committed = this.updateAbsolute(block, target)
            })
          }
          if (committed) {
            // Keep the transform preview in place until the committed left/top
            // bindings have reached the DOM. Otherwise pointerup briefly paints
            // the object's old position and looks like a rejected drop.
            try {
              if (this.runtime.isInObjectGroup(block)) {
                this.runtime.resolveBlock(block.parentId!)?.changeDetectorRef.detectChanges()
              }
              targets.forEach(candidate => candidate.block.changeDetectorRef.detectChanges())
            } catch {}
          }
        } finally {
          if (isMultiSelection) this.doc.crud.undoManager?.stopCapturing()
          cleanup()
        }
        if (shouldReassertMultiSelection) this.doc.selection.replay(selection!.toJSON())
        return
      }

      cleanup()
      // `armed` suppresses native selectionchange while compatibility mouse
      // events finish. Reproject the still-current object selection only after
      // that guard is released, so a click cannot leave an older document Range
      // painted behind the selected absolute object.
      if (shouldReassertSelection) this.doc.selection.selectBlock(block)
      if (shouldReassertMultiSelection) this.doc.selection.replay(selection!.toJSON())
    }
    const onPointerCancel = (cancelEvent: PointerEvent) => {
      if (cancelEvent.pointerId === pointerId) cleanup()
    }
    const onLostPointerCapture = (lostEvent: Event) => {
      if ((lostEvent as PointerEvent).pointerId !== pointerId || moved) return
      cleanup()
    }
    const onKeydown = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key !== 'Escape') return
      if (isMultiSelection) {
        keyEvent.preventDefault()
        keyEvent.stopImmediatePropagation()
      }
      cleanup()
    }
    const onWindowBlur = () => cleanup()
    const onSelectStart = (selectEvent: Event) => {
      if (this.stateSubject.value === 'idle') return
      selectEvent.preventDefault()
      selectEvent.stopImmediatePropagation()
    }
    const onCompatibilityMouseDown = (mouseEvent: MouseEvent) => {
      if (mouseEvent.button !== 0) return
      // WebKit may still dispatch mousedown at the covering prose after the
      // recovery pointerdown. It belongs to this object gesture, so it must not
      // clear Selection's projection guard or start a native text selection.
      mouseEvent.preventDefault()
      mouseEvent.stopPropagation()
    }

    // pointerdown 后浏览器仍会继续派发 mousedown / selectionchange。绝对定位块
    // 的内容落点不一定能被 normalizeRange 映射回块选区，因此 armed 阶段必须
    // 保护调用方刚写入的 BlockSelection；真正超过阈值后再主动 blur。
    this.doc.selection.setSuppressRecalculate(true)
    this.doc.ngZone.runOutsideAngular(() => {
      ownerWindow.addEventListener('pointermove', onPointerMove, true)
      ownerWindow.addEventListener('pointerup', onPointerUp, true)
      ownerWindow.addEventListener('pointercancel', onPointerCancel, true)
      ownerWindow.addEventListener('keydown', onKeydown, true)
      ownerWindow.addEventListener('blur', onWindowBlur)
      pointerCaptureTarget?.addEventListener(
        'lostpointercapture',
        onLostPointerCapture,
      )
      ownerDocument.addEventListener('selectstart', onSelectStart, true)
      if (recoveredFromOutside) ownerWindow.addEventListener('mousedown', onCompatibilityMouseDown, true)
      try {
        pointerCaptureTarget?.setPointerCapture(pointerId)
      } catch {}
    })
    this.cleanupDrag = cleanup
    this.stateSubject.next('armed')
    return true
  }

  cancelDrag(): void {
    this.cleanupDrag?.()
  }

  destroy(): void {
    this.clearUnderlayChrome()
    if (this.chromeFrame) this.rootHost?.ownerDocument.defaultView?.cancelAnimationFrame(this.chromeFrame)
    this.chromeFrame = 0
    this.cancelDrag()
    this.cleanupFlowSelectionPassthrough?.()
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
  private bindObjectHotkeys(): void {
    const bindHotkey = this.doc.event?.bindHotkey
    if (typeof bindHotkey !== 'function') return

    const handleDelete: BlockCraft.EventHandler = context => {
      const selection = context.get('keyboardState').selection
      const blockIds = this.runtime.getAbsoluteObjectSelectionIds(selection)
      if (!blockIds) return

      try {
        if (
          !deleteAbsolutePlacementObjects(
            this.doc,
            blockIds,
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
    this.subscriptions.add(bindHotkey(
      {
        key: 'd',
        shortKey: true,
      },
      context => {
        const selection = context.get('keyboardState').selection
        if (!this.runtime.isAbsoluteObjectSelection(selection)) return
        try {
          duplicateAbsolutePlacementSelection(this.doc, selection, 'input')
        } catch (error) {
          if (!(error instanceof BlockReadonlyError)) throw error
        }
        context.preventDefault()
        return true
      },
      options,
    ))
  }

  private readonly onRootPointerDown = (event: PointerEvent): void => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      !this.rootHost ||
      this.state !== 'idle' ||
      this.doc.dragController.state !== 'idle' ||
      !this.underBlocks.size
    ) {
      this.armFlowSelectionPassthrough(event)
      return
    }
    const target = event.target
    if (
      target instanceof Element &&
      target.closest('block-resizer, [data-bc-placement-pick-ignore], [data-bc-nodrag], [data-block-zero-space="true"]')
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
      if (!this.isUnderlayEdge(block, event, band)) continue

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
    if (!candidate) {
      this.armFlowSelectionPassthrough(event)
      return
    }

    event.preventDefault()
    event.stopPropagation()
    const current = this.doc.selection.value
    const selectedIds = this.runtime.getAbsoluteObjectSelectionIds(current)
    const keepsMultiSelection = !!selectedIds && selectedIds.length > 1 && selectedIds.includes(candidate.id)
    if (!keepsMultiSelection &&
      current?.isInSameBlock &&
      current.firstBlockId === candidate.id &&
      current.anchor.type === 'selected' &&
      current.head.type === 'selected'
    ) {
      // Re-activate object-specific toolbars even when the underlay object was
      // already selected and selection equality suppresses another emission.
      this.doc.selection.blur()
    }
    if (!keepsMultiSelection) this.doc.selection.selectBlock(candidate)
    this.startDrag(event, candidate)
  }

  private isUnderlayEdge(block: BlockCraft.BlockComponent, event: PointerEvent, band: number): boolean {
    const host = block.hostElement
    const surface = host.querySelector<HTMLElement>(
      '[data-bc-object-surface], [data-bc-print-visual-surface], [data-bc-object-drag-surface]',
    )
    const target = surface?.closest('[data-block-id]') === host ? surface : host
    const rect = target.getBoundingClientRect()
    let x = event.clientX - rect.left
    let y = event.clientY - rect.top
    let width = rect.width
    let height = rect.height
    if (target !== host && target.offsetWidth && target.offsetHeight) {
      const ownerWindow = host.ownerDocument.defaultView!
      const transform = ownerWindow.getComputedStyle(target).transform
      const matrix = new ownerWindow.DOMMatrixReadOnly(transform === 'none' ? undefined : transform)
      const scale = resolvePlacementBox(host)?.visualScale ?? 1
      const point = new ownerWindow.DOMMatrixReadOnly([matrix.a, matrix.b, matrix.c, matrix.d, 0, 0])
        .inverse().transformPoint({x: (x - rect.width / 2) / scale, y: (y - rect.height / 2) / scale})
      width = target.offsetWidth
      height = target.offsetHeight
      x = point.x + width / 2
      y = point.y + height / 2
      band /= scale
    }
    // The visible edge, including its outer half, is recoverable. The interior
    // remains prose territory even while the object is selected.
    return x >= -band && x <= width + band && y >= -band && y <= height + band &&
      (Math.min(Math.abs(x), Math.abs(width - x)) <= Math.min(band, width / 3) ||
        Math.min(Math.abs(y), Math.abs(height - y)) <= Math.min(band, height / 3))
  }

  private scheduleUnderlayChrome(): void {
    const ownerWindow = this.rootHost?.ownerDocument.defaultView
    if (!ownerWindow || this.chromeFrame || (!this.underBlocks.size && !this.underlayChrome.size)) return
    this.doc.ngZone.runOutsideAngular(() => {
      this.chromeFrame = ownerWindow.requestAnimationFrame(() => {
        this.chromeFrame = 0
        const ids = this.runtime.getAbsoluteObjectSelectionIds(this.doc.selection.value) ?? []
        const selected = new Set(ids.filter(id => {
          const block = this.runtime.resolveBlock(id)
          if (!block || !block.hostElement.isConnected || this.runtime.isReadonly(block)) return false
          for (let current: BlockCraft.BlockComponent | null = block; current;) {
            if (this.underBlocks.has(current)) return true
            current = current.parentId ? this.runtime.resolveBlock(current.parentId) : null
          }
          return false
        }))
        for (const [id, dispose] of this.underlayChrome) {
          if (selected.has(id)) continue
          this.underlayChrome.delete(id)
          dispose()
        }
        for (const id of selected) {
          if (this.underlayChrome.has(id)) continue
          const block = this.runtime.resolveBlock(id)!
          const dispose = UnderlayObjectChrome.mount(this.doc, block, event => this.startDrag(event, block))
          if (dispose) this.underlayChrome.set(id, dispose)
        }
      })
    })
  }

  private clearUnderlayChrome(owner?: BlockCraft.BlockComponent): void {
    for (const [id, dispose] of this.underlayChrome) {
      const block = this.runtime.resolveBlock(id)
      if (owner && block && !owner.hostElement.contains(block.hostElement)) continue
      this.underlayChrome.delete(id)
      dispose()
    }
  }

  /**
   * Native drag selection uses pointer hit-testing to place its moving DOM
   * endpoint. An overlaid absolute object can otherwise steal that endpoint
   * even though it lives outside the ordinary flow selection in the model.
   * Keep object-originated gestures interactive, but let a mouse/pen gesture
   * that starts in flow content continue to hit the content below overlays.
   */
  private armFlowSelectionPassthrough(event: PointerEvent): void {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.pointerType === 'touch' ||
      !this.rootHost
    ) {
      return
    }
    const target = event.target instanceof Element
      ? event.target
      : event.target instanceof Node
        ? event.target.parentElement
        : null
    if (target?.closest(
      '[data-block-id][data-bc-placement="absolute"], ' +
      '[data-bc-placement-pick-ignore]',
    )) {
      return
    }

    this.cleanupFlowSelectionPassthrough?.()
    const rootHost = this.rootHost
    const ownerWindow = rootHost.ownerDocument.defaultView
    if (!ownerWindow) return
    const pointerId = event.pointerId
    let cleaned = false
    const cleanup = () => {
      if (cleaned) return
      cleaned = true
      ownerWindow.removeEventListener('pointerup', onPointerEnd, true)
      ownerWindow.removeEventListener('pointercancel', onPointerEnd, true)
      ownerWindow.removeEventListener('blur', cleanup)
      rootHost.removeAttribute('data-bc-flow-selection-passthrough')
      if (this.cleanupFlowSelectionPassthrough === cleanup) {
        this.cleanupFlowSelectionPassthrough = null
      }
    }
    const onPointerEnd = (endEvent: PointerEvent) => {
      if (endEvent.pointerId === pointerId) cleanup()
    }

    rootHost.setAttribute('data-bc-flow-selection-passthrough', '')
    ownerWindow.addEventListener('pointerup', onPointerEnd, true)
    ownerWindow.addEventListener('pointercancel', onPointerEnd, true)
    ownerWindow.addEventListener('blur', cleanup)
    this.cleanupFlowSelectionPassthrough = cleanup
  }

  private unregisterBlockView(id: string): void {
    const registered = this.registeredBlocks.get(id)
    if (!registered) return
    this.clearUnderlayChrome(registered.block)
    registered.subscription.unsubscribe()
    this.underBlocks.delete(registered.block)
    this.registeredBlocks.delete(id)
    this.scheduleUnderlayChrome()
  }
}
