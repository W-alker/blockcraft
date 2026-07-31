import {OverlayRef} from '@angular/cdk/overlay'
import {fromEvent, merge, Subject, Subscription, takeUntil} from 'rxjs'
import {
  BindHotKey,
  closetBlockId,
  DocPlugin,
  getPositionWithOffset,
  UIEventStateContext,
} from '../../framework'
import {getShapeDefinition} from '../../blocks/shape-block'
import {isSelectionAlive} from '../../framework/modules/selection/liveness'
import {
  deleteAbsolutePlacementObject,
} from '../../framework/services/block-placement/delete-command'
import {
  ShapeToolbarComponent,
  type ShapeToolbarAction,
} from './shape-toolbar.component'

export * from './shape-toolbar.component'

const SHAPE_ROTATION_HANDLE_CLEARANCE = 52

export class ShapeToolbarPlugin extends DocPlugin {
  override name = 'shape-toolbar'

  private readonly _subscription = new Subscription()
  private readonly _closeToolbar$ = new Subject<void>()
  private _toolbarRef?: OverlayRef
  private _pendingShapeClickCleanup?: () => void

  init(): void {
    this._subscription.add(
      this.doc.subscribeReadonlyChange(readonly => {
        if (readonly) this.closeToolbar()
      }),
    )

    this._subscription.add(
      fromEvent<PointerEvent>(document, 'pointerdown', {capture: true})
        .pipe(takeUntil(this.doc.onDestroy$))
        .subscribe(event => this._onShapePointerDown(event)),
    )

    this._subscription.add(
      this.doc.selection.selectionChange$.subscribe(selection => {
        if (
          this.doc.isReadonly ||
          !selection ||
          !isSelectionAlive(selection as any, this.doc) ||
          !selection.isInSameBlock ||
          selection.firstBlock.flavour !== 'shape' ||
          selection.anchor.type !== 'selected' ||
          selection.head.type !== 'selected'
        ) {
          this.closeToolbar()
          return
        }
        const block = selection.firstBlock as
          BlockCraft.IBlockComponents['shape']
        if (this.doc.readonlyManager.isReadonly(block)) {
          this.closeToolbar()
          return
        }
        this._openToolbar(block)
      }),
    )
  }

  destroy(): void {
    this.closeToolbar()
    this._pendingShapeClickCleanup?.()
    this._subscription.unsubscribe()
    this._closeToolbar$.complete()
  }

  closeToolbar = (): void => {
    this._closeToolbar$.next()
    this._toolbarRef?.dispose()
    this._toolbarRef = undefined
  }

  @BindHotKey({key: 'Escape'}, {flavour: 'shape-text'})
  onShapeTextEscape(ctx: UIEventStateContext): true | void {
    const selection = ctx.get('keyboardState').selection
    if (!selection.isInSameBlock) return
    const textBlock = selection.firstBlock
    const shapeBlock = textBlock.parentBlock
    if (shapeBlock?.flavour !== 'shape' || !shapeBlock.hostElement.isConnected) {
      return
    }
    ctx.preventDefault()
    this.doc.selection.selectBlock(shapeBlock)
    return true
  }

  private _openToolbar(
    block: BlockCraft.IBlockComponents['shape'],
  ): void {
    if (this._toolbarRef || !block.hostElement.isConnected) return
    const shell = block.hostElement.querySelector<HTMLElement>(
      '.shape-block__shell',
    )
    if (!shell) return

    const {overlayRef, componentRef} =
      this.doc.overlayService.createConnectedOverlay<ShapeToolbarComponent>(
        {
          target: shell,
          component: ShapeToolbarComponent,
          positions: [
            getPositionWithOffset(
              'top-center',
              0,
              SHAPE_ROTATION_HANDLE_CLEARANCE,
            ),
            getPositionWithOffset('bottom-center', 0, 8),
          ],
          clampTo: this.doc.scrollContainer ?? undefined,
        },
        this._closeToolbar$,
        this.closeToolbar,
      )

    this._toolbarRef = overlayRef
    componentRef.setInput('shapeBlock', block)
    componentRef.instance.action
      .pipe(takeUntil(this._closeToolbar$))
      .subscribe(action => this._handleAction(block, action))
    block.onPropsChange
      .pipe(takeUntil(this._closeToolbar$))
      .subscribe(() => {
        componentRef.instance.cdr.markForCheck()
        overlayRef.updatePosition()
      })
  }

  private _handleAction(
    block: BlockCraft.IBlockComponents['shape'],
    action: ShapeToolbarAction,
  ): void {
    if (
      !block.hostElement.isConnected ||
      this.doc.readonlyManager.isReadonly(block)
    ) {
      this.closeToolbar()
      return
    }
    if (action.name === 'delete') {
      if (!deleteAbsolutePlacementObject(this.doc, block, 'menu')) {
        void this.doc.chain().deleteById(block.id).run()
      }
      this.closeToolbar()
      return
    }
    if (action.name === 'object-layout') {
      this.doc.placement.setObjectLayout(block, action.value)
      this.closeToolbar()
      return
    }
    if (action.name === 'move-forward') {
      this.doc.placement.moveForward(block)
      return
    }
    if (action.name === 'move-backward') {
      this.doc.placement.moveBackward(block)
      return
    }

    const propByAction = {
      'shape-type': 'shapeType',
      'fill-color': 'fillColor',
      'fill-opacity': 'fillOpacity',
      'stroke-color': 'strokeColor',
      'stroke-width': 'strokeWidth',
      'stroke-style': 'strokeStyle',
      'text-color': 'textColor',
      'text-align': 'shapeTextAlign',
      'vertical-align': 'verticalAlign',
    } as const
    const prop = propByAction[action.name]
    block.updateProps({[prop]: action.value})
  }

  private _onShapePointerDown(event: PointerEvent): void {
    if (event.button !== 0) return
    const target = event.target
    if (!(target instanceof Element)) return
    if (!this.doc.root.hostElement.contains(target)) return
    if (target.closest('shape-resizer')) return
    if (target.closest('.shape-text-block')) return

    const shell = target.closest<HTMLElement>('.shape-block__shell')
    if (!shell) return
    const blockId = closetBlockId(shell)
    if (!blockId) return

    let block: BlockCraft.BlockComponent
    try {
      block = this.doc.getBlockById(blockId)
    } catch {
      return
    }
    if (block.flavour !== 'shape' || !block.hostElement.isConnected) return
    const shapeBlock = block as BlockCraft.IBlockComponents['shape']
    this.doc.selection.selectBlock(shapeBlock)
    if (!this._toolbarRef) this._openToolbar(shapeBlock)
    this._confirmShapeClickSelection(event, shapeBlock)
    if (this.doc.readonlyManager.isReadonly(shapeBlock)) return

    if (this.doc.placement.getState(shapeBlock).mode === 'absolute') {
      this.doc.placement.startDrag(event, shapeBlock)
      return
    }
    if (this.doc.dragController.state !== 'idle') return
    const definition = getShapeDefinition(
      shapeBlock.shapeProps.shapeType,
    )
    this.doc.dragController.startDrag(
      event,
      {kind: 'origin-block', blockId},
      {ghostLabel: definition.label},
    )
  }

  private _confirmShapeClickSelection(
    startEvent: PointerEvent,
    block: BlockCraft.IBlockComponents['shape'],
  ): void {
    this._pendingShapeClickCleanup?.()

    let didDrag =
      this.doc.dragController.isDragging ||
      this.doc.placement.isDragging
    const stateSub = merge(
      this.doc.dragController.state$,
      this.doc.placement.state$,
    )
      .pipe(takeUntil(this.doc.onDestroy$))
      .subscribe(state => {
        if (state === 'dragging' || state === 'dropping') {
          didDrag = true
        }
      })

    let cleaned = false
    const cleanup = () => {
      if (cleaned) return
      cleaned = true
      window.removeEventListener('pointerup', onPointerEnd, true)
      window.removeEventListener('pointercancel', onPointerCancel, true)
      window.removeEventListener('blur', onPointerCancel, true)
      stateSub.unsubscribe()
      if (this._pendingShapeClickCleanup === cleanup) {
        this._pendingShapeClickCleanup = undefined
      }
    }
    const onPointerEnd = (event: PointerEvent) => {
      if (event.pointerId !== startEvent.pointerId) return
      const shouldConfirm = !didDrag
      cleanup()
      if (!shouldConfirm || !block.hostElement.isConnected) return
      try {
        if (this.doc.getBlockById(block.id) === block) {
          this.doc.selection.selectBlock(block)
        }
      } catch {}
    }
    const onPointerCancel = () => cleanup()

    window.addEventListener('pointerup', onPointerEnd, true)
    window.addEventListener('pointercancel', onPointerCancel, true)
    window.addEventListener('blur', onPointerCancel, true)
    this._pendingShapeClickCleanup = cleanup
  }
}
