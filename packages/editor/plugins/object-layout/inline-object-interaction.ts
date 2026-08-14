import {OverlayRef} from '@angular/cdk/overlay'
import {NgZone} from '@angular/core'
import {fromEvent, Subject, Subscription, takeUntil} from 'rxjs'
import type {InlineObjectKind, InlineObjectWrapSide} from '../../blocks'
import {
  DEFAULT_INLINE_IMAGE_WRAP_GAP,
  EditableBlockComponent,
  getPositionWithOffset,
  measureObjectPlacement,
  type BlockObjectLayout,
  type DeltaInsert,
  type IInlineNodeAttrs,
} from '../../framework'
import {
  disableInlineImageWrap,
  enableInlineImageWrap,
  planInlineImageAnchorMove,
  resolveInlineImageDragPreview,
} from '../img-toolbar/inline-image-interaction'
import {
  InlineImageDragProxy,
  resolveInlineImageDropTarget,
} from '../img-toolbar/inline-image-drag'
import {
  INLINE_FLOAT_PREVIEW_ATTRIBUTE,
} from '../../framework/block-std/inline/runtime/inline-float-layout'
import {
  inlineObjectSnapshotToBlockSnapshots,
  objectBlockSnapshotToInlineParagraph,
  resolveInlineObjectDeltaAtOffset,
} from './inline-object-conversion'
import {InlineObjectToolbarComponent} from './inline-object-toolbar.component'

interface ActiveInlineObjectContext {
  block: EditableBlockComponent
  blockId: string
  offset: number
  shell: HTMLElement
  frame: HTMLElement
}

export class InlineObjectInteractionController {
  private readonly _subscriptions = new Subscription()
  private readonly _close$ = new Subject<void>()
  private _toolbarRef?: OverlayRef
  private _context?: ActiveInlineObjectContext
  private _inlineWrapDragCancel?: () => void

  constructor(
    private readonly _doc: BlockCraft.Doc,
    readonly kind: InlineObjectKind,
    private readonly _closeBlockToolbar: () => void,
  ) {}

  init(): void {
    this._subscriptions.add(
      this._doc.placement.registerObjectLayoutAdapter(this.kind, {
        toInline: ({block}) => this.convertBlockToInline(block, false),
      }),
    )
    this._subscriptions.add(
      fromEvent<PointerEvent>(document, 'pointerdown', {
        capture: true,
      })
        .pipe(takeUntil(this._doc.onDestroy$))
        .subscribe(event => this._onPointerDown(event)),
    )
    this._subscriptions.add(
      this._doc.subscribeReadonlyChange(readonly => {
        if (readonly) this.close()
      }),
    )
  }

  destroy(): void {
    this.close()
    this._subscriptions.unsubscribe()
    this._close$.complete()
  }

  close = (): void => {
    this._inlineWrapDragCancel?.()
    this._close$.next()
    this._toolbarRef?.dispose()
    this._toolbarRef = undefined
    this._context?.shell.classList.remove('bc-inline-object-shell--selected')
    this._context = undefined
  }

  convertBlockToInline(
    block: BlockCraft.BlockComponent,
    wrap: boolean,
  ): boolean {
    if (
      block.flavour !== this.kind ||
      this._doc.isReadonly ||
      this._doc.readonlyManager.isReadonly(block) ||
      !this._isLiveBlock(block)
    ) {
      return false
    }
    if (!this._hasConverter()) {
      this._doc.messageService.warn(
        `${this.kind === 'shape' ? '形状' : '艺术字'}行内渲染器未注册`,
      )
      return false
    }
    const snapshot = this._doc.model.toSnapshot(block.id)
    if (!snapshot) return false
    const placement = this._doc.placement.getState(block)
    const placementWidth = block.hostElement.parentElement?.clientWidth ?? 0
    const normalizedPlacementX =
      placement.x / Math.max(1, placementWidth)
    const paragraph = objectBlockSnapshotToInlineParagraph(
      snapshot,
      wrap
        ? {
            wrap: true,
            side: 'auto',
            x: Math.max(0, Math.min(1, normalizedPlacementX)),
            gap: DEFAULT_INLINE_IMAGE_WRAP_GAP,
          }
        : undefined,
    )
    if (!paragraph) return false

    const needsReanchor = placement.mode === 'absolute'
    const flowAnchor = needsReanchor
      ? this._doc.placement.resolveFlowAnchor(block)
      : null
    let converted = false
    this._closeBlockToolbar()
    this._doc.crud.transact(() => {
      if (
        needsReanchor &&
        !this._doc.placement.reanchorToFlow(block, flowAnchor)
      ) {
        return
      }
      this._doc.crud.replaceWithSnapshots(block.id, [paragraph])
      converted = true
    })
    if (!converted) {
      this._doc.messageService.warn('对象无法回到正文位置，未转换布局')
      return false
    }
    void this._doc.chain()
      .nextTick()
      .setSelection({
        blockId: paragraph.id,
        type: 'text',
        index: 1,
        length: 0,
      })
      .run()
    return true
  }

  private _onPointerDown(event: PointerEvent): void {
    if (event.button !== 0 || event.isPrimary === false) return
    const target = event.target
    if (!(target instanceof Element)) return
    const shell = target.closest<HTMLElement>(
      `.bc-inline-object-shell[data-bc-inline-object="${this.kind}"]`,
    )
    if (!shell || !this._doc.root.hostElement.contains(shell)) {
      if (this._context && !this._toolbarRef?.overlayElement.contains(target)) {
        this.close()
      }
      return
    }
    const blockHost = shell.closest<HTMLElement>('[data-block-id]')
    const blockId = blockHost?.dataset['blockId']
    if (!blockId) return
    const block = this._getLiveBlock(blockId)
    if (!block || !this._doc.isEditable(block)) return
    const editable = block as EditableBlockComponent
    let offset: number
    try {
      offset = editable.runtime.domPointToModel(shell, 0)
    } catch {
      return
    }
    const resolved = resolveInlineObjectDeltaAtOffset(
      editable.textDeltas(),
      offset,
      this.kind,
    )
    const frame = shell.querySelector<HTMLElement>(
      '.bc-inline-object-frame[data-bc-inline-float-frame]',
    )
    if (!resolved || !frame) return

    event.preventDefault()
    event.stopPropagation()
    editable.setInlineRange(offset, 1)
    if (
      this._doc.isReadonly ||
      this._doc.readonlyManager.isReadonly(block)
    ) {
      this.close()
      return
    }
    const context: ActiveInlineObjectContext = {
      block: editable,
      blockId,
      offset,
      shell,
      frame,
    }
    if (this._context?.shell !== shell || !this._toolbarRef) {
      this._openInlineToolbar(context, resolved.delta)
    }
    this._startInlineObjectDrag(context, event)
  }

  private _openInlineToolbar(
    context: ActiveInlineObjectContext,
    delta: DeltaInsert,
  ): void {
    this._closeBlockToolbar()
    this.close()
    this._context = context
    context.shell.classList.add('bc-inline-object-shell--selected')
    const wrap = delta.attributes?.['wrap'] === true
    const side = delta.attributes?.['side']
    const {overlayRef, componentRef} =
      this._doc.overlayService.createConnectedOverlay<
        InlineObjectToolbarComponent
      >({
        target: context.frame,
        positions: [
          getPositionWithOffset('top-center', 0, 8),
          getPositionWithOffset('bottom-center', 0, 8),
        ],
        component: InlineObjectToolbarComponent,
      }, this._close$, this.close)
    this._toolbarRef = overlayRef
    componentRef.setInput('label', this.kind === 'shape' ? '形状' : '艺术字')
    componentRef.setInput('layout', wrap ? 'wrap' : 'inline')
    componentRef.setInput(
      'side',
      side === 'left' || side === 'right' ? side : 'auto',
    )
    componentRef.instance.onItemClicked
      .pipe(takeUntil(this._close$))
      .subscribe(item => this._handleInlineAction(
        context,
        item.name,
        item.value,
      ))
  }

  private _startInlineObjectDrag(
    context: ActiveInlineObjectContext,
    event: PointerEvent,
  ): void {
    if (
      this._doc.isReadonly ||
      this._doc.event.status.isComposing ||
      !context.frame.isConnected ||
      !context.block.containerElement.isConnected
    ) return
    const current = this._resolveLiveContext(context)
    if (!current) return
    const frameRect = context.frame.getBoundingClientRect()
    if (frameRect.width <= 0 || frameRect.height <= 0) return

    event.preventDefault()
    event.stopPropagation()
    this._inlineWrapDragCancel?.()
    context.shell.setAttribute(INLINE_FLOAT_PREVIEW_ATTRIBUTE, '')
    const releaseLayoutFreeze =
      context.block.runtime.acquireFloatLayoutFreeze?.() ?? (() => undefined)
    let releaseViewLease: () => void = () => undefined
    try {
      releaseViewLease = this._doc.virtualization.acquireBlockViewLease([
        context.blockId,
      ])
    } catch {
      context.shell.removeAttribute(INLINE_FLOAT_PREVIEW_ATTRIBUTE)
      releaseLayoutFreeze()
      return
    }

    let proxy: InlineImageDragProxy
    try {
      proxy = new InlineImageDragProxy(
        context.frame,
        frameRect,
        event.clientX,
        event.clientY,
        {
          className: 'bc-inline-object-drag-proxy',
          attribute: 'data-bc-inline-object-drag-proxy',
          preserveTransform: true,
        },
      )
    } catch {
      context.shell.removeAttribute(INLINE_FLOAT_PREVIEW_ATTRIBUTE)
      releaseViewLease()
      releaseLayoutFreeze()
      return
    }

    const pointerId = event.pointerId
    const startClientX = event.clientX
    const startClientY = event.clientY
    let moved = false
    let cleaned = false
    let released = false
    const zone = this._doc.injector.get(NgZone)
    const cleanup = () => {
      if (cleaned) return
      cleaned = true
      window.removeEventListener('pointermove', onPointerMove, true)
      window.removeEventListener('pointerup', onPointerUp, true)
      window.removeEventListener('pointercancel', onPointerCancel, true)
      window.removeEventListener('blur', onBlur, true)
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('selectstart', onSelectStart, true)
      context.shell.removeAttribute(INLINE_FLOAT_PREVIEW_ATTRIBUTE)
      proxy.destroy()
      try {
        if (context.frame.hasPointerCapture(pointerId)) {
          context.frame.releasePointerCapture(pointerId)
        }
      } catch {}
      if (this._inlineWrapDragCancel === cancel) {
        this._inlineWrapDragCancel = undefined
      }
    }
    const releaseDragResources = () => {
      if (released) return
      released = true
      try {
        releaseViewLease()
      } catch (error) {
        this._doc.logger.warn('inlineObjectDragViewLeaseReleaseError: ', error)
      }
      try {
        releaseLayoutFreeze()
      } catch (error) {
        this._doc.logger.warn('inlineObjectDragLayoutFreezeReleaseError: ', error)
      }
    }
    const cancel = () => {
      cleanup()
      releaseDragResources()
    }
    const onPointerMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return
      moveEvent.preventDefault()
      moved = moved || Math.hypot(
        moveEvent.clientX - startClientX,
        moveEvent.clientY - startClientY,
      ) >= 2
      proxy.move(moveEvent.clientX, moveEvent.clientY)
    }
    const onPointerUp = (upEvent: PointerEvent) => {
      if (upEvent.pointerId !== pointerId) return
      moved = moved || Math.hypot(
        upEvent.clientX - startClientX,
        upEvent.clientY - startClientY,
      ) >= 2
      proxy.move(upEvent.clientX, upEvent.clientY)
      const proxyPosition = proxy.position()
      cleanup()
      if (!moved) {
        releaseDragResources()
        return
      }
      const live = this._resolveLiveContext(context)
      const source = resolveInlineObjectDeltaAtOffset(
        context.block.textDeltas(),
        context.offset,
        this.kind,
      )
      let target = resolveInlineImageDropTarget(
        this._doc,
        upEvent.clientX,
        upEvent.clientY,
      )
      if (!live || !source || !target) {
        releaseDragResources()
        return
      }
      const targetRect = target.block.containerElement.getBoundingClientRect()
      const targetWidth = target.block.containerElement.clientWidth ||
        targetRect.width
      if (targetWidth <= 0) {
        releaseDragResources()
        return
      }
      const isWrapped = live.delta.attributes?.['wrap'] === true
      if (
        isWrapped &&
        target.block === context.block &&
        Math.abs(proxyPosition.top - frameRect.top) < 1
      ) {
        target = {...target, offset: context.offset}
      }
      const attributes = live.delta.attributes ?? {}
      const normalizedX = isWrapped
        ? resolveInlineImageDragPreview({
            containerWidth: targetWidth,
            imageWidth: typeof attributes['width'] === 'number'
              ? attributes['width']
              : frameRect.width,
            imageHeight: typeof attributes['height'] === 'number'
              ? attributes['height']
              : frameRect.height,
            imageX: proxyPosition.left - targetRect.left,
            side: attributes['side'] as InlineObjectWrapSide | undefined,
            gap: typeof attributes['gap'] === 'number'
              ? attributes['gap']
              : undefined,
          }).attributes.x
        : undefined
      const plan = planInlineImageAnchorMove({
        sourceBlockId: context.blockId,
        sourceOffset: context.offset,
        sourceLength: context.block.textLength,
        targetBlockId: target.block.id,
        targetOffset: target.offset,
        targetLength: target.block.textLength,
        delta: source.delta,
        normalizedX,
      })
      this.close()
      try {
        if (plan.kind !== 'noop') {
          this._doc.crud.transact(() => {
            this._doc.crud.applyTextDelta(
              context.blockId,
              plan.sourceOperations,
            )
            if (plan.kind === 'cross-block') {
              this._doc.crud.applyTextDelta(
                target.block.id,
                plan.targetOperations,
              )
            }
          })
        }
      } finally {
        releaseDragResources()
      }
    }
    const onPointerCancel = (cancelEvent?: PointerEvent) => {
      if (cancelEvent && cancelEvent.pointerId !== pointerId) return
      cancel()
    }
    const onBlur = () => cancel()
    const onKeyDown = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key !== 'Escape') return
      keyEvent.preventDefault()
      cancel()
    }
    const onSelectStart = (selectEvent: Event) => selectEvent.preventDefault()

    this._inlineWrapDragCancel = cancel
    zone.runOutsideAngular(() => {
      window.addEventListener('pointermove', onPointerMove, {
        capture: true,
        passive: false,
      })
      window.addEventListener('pointerup', onPointerUp, true)
      window.addEventListener('pointercancel', onPointerCancel, true)
      window.addEventListener('blur', onBlur, true)
      document.addEventListener('keydown', onKeyDown, true)
      document.addEventListener('selectstart', onSelectStart, true)
      try { context.frame.setPointerCapture(pointerId) } catch {}
    })
  }

  private _handleInlineAction(
    context: ActiveInlineObjectContext,
    name: string,
    value: unknown,
  ): void {
    if (name === 'inline-wrap-side') {
      if (value === 'auto' || value === 'left' || value === 'right') {
        this._setWrapSide(context, value)
      }
      return
    }
    if (name !== 'object-layout') return
    if (value === 'wrap') {
      this._setWrap(context, true)
      return
    }
    if (value === 'inline') {
      this._setWrap(context, false)
      return
    }
    if (value === 'top-bottom' || value === 'under' || value === 'over') {
      this._convertInlineToBlock(context, value)
    }
  }

  private _setWrap(
    context: ActiveInlineObjectContext,
    enabled: boolean,
  ): void {
    const resolved = this._resolveLiveContext(context)
    if (!resolved) return
    const ownerRect = context.block.containerElement.getBoundingClientRect()
    const frameRect = context.frame.getBoundingClientRect()
    const ownerWidth = context.block.containerElement.clientWidth ||
      ownerRect.width
    const current = resolved.delta.attributes ?? {}
    const attrs = enabled
      ? enableInlineImageWrap({
          wrap: current['wrap'] === true ? true : undefined,
          side: current['side'] as InlineObjectWrapSide | undefined,
          x: typeof current['x'] === 'number' ? current['x'] : undefined,
          gap: typeof current['gap'] === 'number' ? current['gap'] : undefined,
        }, {
          side: 'auto',
          x: ownerWidth > 0
            ? (frameRect.left - ownerRect.left) / ownerWidth
            : 0,
          gap: DEFAULT_INLINE_IMAGE_WRAP_GAP,
        })
      : disableInlineImageWrap()
    this.close()
    context.block.formatText(
      context.offset,
      1,
      attrs as unknown as IInlineNodeAttrs,
    )
  }

  private _setWrapSide(
    context: ActiveInlineObjectContext,
    side: InlineObjectWrapSide,
  ): void {
    const resolved = this._resolveLiveContext(context)
    if (!resolved?.delta.attributes?.['wrap']) return
    this.close()
    context.block.formatText(context.offset, 1, {side})
  }

  private _convertInlineToBlock(
    context: ActiveInlineObjectContext,
    layout: Exclude<BlockObjectLayout, 'inline'>,
  ): void {
    if (!this._resolveLiveContext(context)) return
    const parentId = this._doc.model.getParentId(context.blockId)
    if (!parentId || !this._doc.canInsertChild(parentId, this.kind)) {
      this._doc.messageService.warn('当前位置不支持该对象块')
      return
    }
    const snapshot = this._doc.model.toSnapshot(context.blockId)
    if (!snapshot) return
    const result = inlineObjectSnapshotToBlockSnapshots(
      snapshot,
      context.offset,
      this.kind,
    )
    if (!result) return

    if (layout === 'under' || layout === 'over') {
      let container = context.block.hostElement.parentElement
      try {
        const parent = this._doc.getBlockById(parentId)
        container = parent.childrenRenderRef?.containerElement ?? container
      } catch {}
      if (!container) return
      const measured = measureObjectPlacement(context.frame, container, layout)
      result.object.props = {
        ...result.object.props,
        position: {x: measured.x, y: measured.y},
        ...(layout === 'under' ? {placementLayer: 'under'} : {}),
      }
    }
    this.close()
    void this._doc.chain()
      .replaceWithSnapshots(context.blockId, result.snapshots)
      .selectOrSetCursorAtBlock(result.object.id, true)
      .run()
  }

  private _resolveLiveContext(context: ActiveInlineObjectContext) {
    const block = this._getLiveBlock(context.blockId)
    if (
      this._doc.isReadonly ||
      block !== context.block ||
      !this._doc.isEditable(block) ||
      this._doc.readonlyManager.isReadonly(block)
    ) {
      this.close()
      return null
    }
    const resolved = resolveInlineObjectDeltaAtOffset(
      context.block.textDeltas(),
      context.offset,
      this.kind,
    )
    if (!resolved) this.close()
    return resolved
  }

  private _hasConverter(): boolean {
    return this._doc.config.embeds?.some(([name]) => name === this.kind) ?? false
  }

  private _getLiveBlock(id: string): BlockCraft.BlockComponent | null {
    try {
      const block = this._doc.getBlockById(id)
      return this._isLiveBlock(block) ? block : null
    } catch {
      return null
    }
  }

  private _isLiveBlock(block: BlockCraft.BlockComponent): boolean {
    try {
      return this._doc.getBlockById(block.id) === block
    } catch {
      return false
    }
  }
}
