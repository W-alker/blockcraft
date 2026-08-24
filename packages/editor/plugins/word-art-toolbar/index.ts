import {
  FlexibleConnectedPositionStrategy,
  OverlayRef,
} from '@angular/cdk/overlay'
import {fromEvent, Subject, Subscription, takeUntil} from 'rxjs'
import {
  closetBlockId,
  DocPlugin,
  getPositionWithOffset,
} from '../../framework'
import {BlockSelection} from '../../framework/modules/selection/blockSelection'
import {isSelectionAlive} from '../../framework/modules/selection/liveness'
import {deleteAbsolutePlacementObject} from '../../framework/services/block-placement/delete-command'
import {
  WordArtToolbarComponent,
  type WordArtToolbarAction,
} from './word-art-toolbar.component'
import {
  InlineObjectInteractionController,
} from '../object-layout/inline-object-interaction'
import {
  isObjectToolbarOwnedTarget,
} from '../object-layout/object-toolbar-interaction'

export * from './word-art-toolbar.component'
export * from './word-art-transform-overlay.component'

const TOOLBAR_GAP = 10

export class WordArtToolbarPlugin extends DocPlugin {
  override name = 'word-art-toolbar'

  private readonly _subscription = new Subscription()
  private readonly _closeOverlays$ = new Subject<void>()
  private _toolbarRef?: OverlayRef
  private _activeBlockId?: string
  private _activeBlockHost?: HTMLElement
  private _toolbarPointerActive = false
  private _toolbarPointerGraceUntil = 0
  private _toolbarPositionFrame: number | null = null
  private _closing = false
  private _inlineObject?: InlineObjectInteractionController

  init(): void {
    this._inlineObject = new InlineObjectInteractionController(
      this.doc,
      'word-art',
      this.closeOverlays,
    )
    this._inlineObject.init()
    this._subscription.add(
      this.doc.subscribeReadonlyChange((readonly) => {
        if (!readonly) return
        this.closeOverlays()
      }),
    )
    this._subscription.add(
      fromEvent<PointerEvent>(document, 'pointerdown', {capture: true})
        .pipe(takeUntil(this.doc.onDestroy$))
        .subscribe((event) => this._onPointerDown(event)),
    )
    this._subscription.add(
      fromEvent<PointerEvent>(document, 'pointerup', {capture: true})
        .pipe(takeUntil(this.doc.onDestroy$))
        .subscribe(() => this._endToolbarPointerInteraction()),
    )
    this._subscription.add(
      fromEvent<PointerEvent>(document, 'pointercancel', {capture: true})
        .pipe(takeUntil(this.doc.onDestroy$))
        .subscribe(() => this._endToolbarPointerInteraction()),
    )
    this._subscription.add(
      fromEvent<FocusEvent>(document, 'focusin', {capture: true})
        .pipe(takeUntil(this.doc.onDestroy$))
        .subscribe((event) => this._onFocusIn(event)),
    )
    this._subscription.add(
      this.doc.selection.selectionChange$.subscribe((selection) =>
        this._onSelectionChange(selection),
      ),
    )
  }

  destroy(): void {
    this._inlineObject?.destroy()
    this._inlineObject = undefined
    this.closeOverlays()
    this._subscription.unsubscribe()
    this._closeOverlays$.complete()
  }

  closeOverlays = (): void => {
    if (this._closing) return
    this._closing = true
    this._closeOverlays$.next()
    this._toolbarRef?.dispose()
    if (this._toolbarPositionFrame !== null) {
      cancelAnimationFrame(this._toolbarPositionFrame)
      this._toolbarPositionFrame = null
    }
    this._toolbarRef = undefined
    this._activeBlockHost?.classList.remove('word-art-block--object-selected')
    this._activeBlockId = undefined
    this._activeBlockHost = undefined
    this._toolbarPointerActive = false
    this._toolbarPointerGraceUntil = 0
    this._closing = false
  }

  private _openOverlays(block: BlockCraft.IBlockComponents['word-art']): void {
    if (this._activeBlockId === block.id && this._toolbarRef) {
      return
    }
    this.closeOverlays()
    if (!block.hostElement.isConnected) return
    this._activeBlockId = block.id
    this._activeBlockHost = block.hostElement
    this._activeBlockHost.classList.add('word-art-block--object-selected')

    const toolbar =
      this.doc.overlayService.createConnectedOverlay<WordArtToolbarComponent>(
        {
          target: block,
          component: WordArtToolbarComponent,
          positions: [
            getPositionWithOffset('right-center', TOOLBAR_GAP, 0),
            getPositionWithOffset('left-center', TOOLBAR_GAP, 0),
            getPositionWithOffset('right-top', TOOLBAR_GAP, 0),
            getPositionWithOffset('left-top', TOOLBAR_GAP, 0),
          ],
          clampTo: this.doc.scrollContainer ?? undefined,
        },
        this._closeOverlays$,
        this.closeOverlays,
      )
    this._toolbarRef = toolbar.overlayRef
    toolbar.componentRef.setInput('wordArtBlock', block)
    toolbar.componentRef.instance.action
      .pipe(takeUntil(this._closeOverlays$))
      .subscribe((action) => this._handleAction(block, action))
    toolbar.componentRef.instance.panelChange
      .pipe(takeUntil(this._closeOverlays$))
      .subscribe(() => this._scheduleToolbarPositionUpdate())
    const positionStrategy = toolbar.overlayRef.getConfig().positionStrategy
    if (positionStrategy instanceof FlexibleConnectedPositionStrategy) {
      positionStrategy.positionChanges
        .pipe(takeUntil(this._closeOverlays$))
        .subscribe((change) => {
          const side = change.connectionPair.originX === 'start'
            ? 'left'
            : 'right'
          toolbar.componentRef.setInput('side', side)
        })
    }

    block.onPropsChange.pipe(takeUntil(this._closeOverlays$)).subscribe(() => {
      toolbar.componentRef.instance.cdr.markForCheck()
      toolbar.overlayRef.updatePosition()
    })
    block.onDestroy$
      .pipe(takeUntil(this._closeOverlays$))
      .subscribe(() => this.closeOverlays())
  }

  private _handleAction(
    block: BlockCraft.IBlockComponents['word-art'],
    action: WordArtToolbarAction,
  ): void {
    if (
      !block.hostElement.isConnected ||
      this.doc.readonlyManager.isReadonly(block)
    ) {
      this.closeOverlays()
      return
    }
    if (action.name === 'delete') {
      if (!deleteAbsolutePlacementObject(this.doc, block, 'menu')) {
        void this.doc.chain().deleteById(block.id).run()
      }
      this.closeOverlays()
      return
    }
    if (action.name === 'object-layout') {
      if (action.value === 'wrap') {
        this._inlineObject?.convertBlockToInline(block, true)
        return
      }
      this.doc.placement.setObjectLayout(block, action.value)
      this.closeOverlays()
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
    block.updateProps(action.value)
  }

  private _onPointerDown(event: PointerEvent): void {
    if (event.button !== 0) return
    const target =
      event.target instanceof Element
        ? event.target
        : event.target instanceof Node
          ? event.target.parentElement
          : null

    if (this._isToolbarTarget(target)) {
      this._toolbarPointerActive = true
      this._toolbarPointerGraceUntil = 0
      return
    }

    if (this._toolbarRef && !this._activeBlockHost?.contains(target)) {
      const isInEditor =
        !!target && !!this.doc.root?.hostElement.contains(target)
      this.closeOverlays()
      if (!isInEditor) return
    }

    const moveEdge = target?.closest('.shape-resizer__move-edge')
    const objectHandle = target?.closest('.word-art-block__object-handle')
    if (target?.closest('shape-resizer') && !moveEdge) return

    const block = this._resolvePointerBlock(target)
    if (!block) return
    const readonly = this.doc.readonlyManager.isReadonly(block)

    if (moveEdge || objectHandle) {
      event.preventDefault()
      event.stopPropagation()
      this.doc.selection.selectBlock(block)
      if (readonly) return
      this._openOverlays(block)
      this._startBorderDrag(event, block)
      return
    }

    if (readonly) {
      event.preventDefault()
      event.stopPropagation()
      this.doc.selection.selectBlock(block)
      return
    }
    const editorTarget = !!target?.closest('.word-art-block__editor')
    // A pointer inside the real WordArt surface is an explicit return to text
    // editing. Close object chrome before the browser projects its native
    // Range, even if a toolbar button still temporarily owns focus.
    if (this._toolbarRef) this.closeOverlays()
    if (editorTarget && this._isEditingBlock(block)) return
    if (!editorTarget) {
      event.preventDefault()
      event.stopPropagation()
    }
    block.enterEditing()
  }

  private _onSelectionChange(selection: BlockSelection | null): void {
    if (this.doc.isReadonly) {
      this.closeOverlays()
      return
    }
    if (!selection) {
      if (this._toolbarRef && this._toolbarOwnsInteraction()) return
      this.closeOverlays()
      return
    }
    if (
      !isSelectionAlive(selection as any, this.doc) ||
      !selection.isInSameBlock ||
      selection.firstBlock.flavour !== 'word-art'
    ) {
      this.closeOverlays()
      return
    }
    if (
      selection.anchor.type !== 'selected' ||
      selection.head.type !== 'selected'
    ) {
      // Clicking a control in the object toolbar can transiently make the
      // browser report the editable WordArt Range again. The toolbar's own
      // pointer/focus ownership wins over that intermediate DOM projection;
      // a real return to the WordArt editor still closes object chrome.
      if (this._toolbarRef && this._toolbarOwnsInteraction()) return
      this.closeOverlays()
      return
    }
    const block =
      selection.firstBlock as BlockCraft.IBlockComponents['word-art']
    if (this.doc.readonlyManager.isReadonly(block)) {
      this.closeOverlays()
      return
    }
    this._openOverlays(block)
  }

  private _onFocusIn(event: FocusEvent): void {
    if (!this._toolbarRef) return
    const target =
      event.target instanceof Element
        ? event.target
        : event.target instanceof Node
          ? event.target.parentElement
          : null
    if (
      this._isToolbarTarget(target) ||
      this._activeBlockHost?.contains(target)
    ) {
      return
    }
    this.closeOverlays()
  }

  private _endToolbarPointerInteraction(): void {
    this._toolbarPointerActive = false
    // Browser selection/focus projection may settle just after pointerup.
    // Keep a short ownership grace without scheduling a timer or retaining DOM.
    this._toolbarPointerGraceUntil = Date.now() + 100
  }

  private _scheduleToolbarPositionUpdate(): void {
    if (this._toolbarPositionFrame !== null) {
      cancelAnimationFrame(this._toolbarPositionFrame)
    }
    this._toolbarPositionFrame = requestAnimationFrame(() => {
      this._toolbarPositionFrame = null
      this._toolbarRef?.updatePosition()
    })
  }

  private _toolbarOwnsInteraction(): boolean {
    if (this._toolbarPointerActive) return true
    if (Date.now() < this._toolbarPointerGraceUntil) return true
    const ownerDocument =
      this._toolbarRef?.overlayElement.ownerDocument ?? document
    const activeElement = ownerDocument.activeElement
    return (
      activeElement instanceof Element &&
      this._isToolbarTarget(activeElement)
    )
  }

  private _isToolbarTarget(target: Element | null): boolean {
    return isObjectToolbarOwnedTarget(
      this._toolbarRef?.overlayElement,
      target,
    )
  }

  private _startBorderDrag(
    event: PointerEvent,
    block: BlockCraft.IBlockComponents['word-art'],
  ): void {
    if (this.doc.placement.getState(block).mode === 'absolute') {
      this.doc.placement.startDrag(event, block)
      return
    }
    if (this.doc.dragController.state !== 'idle') return
    this.doc.dragController.startDrag(
      event,
      {kind: 'origin-block', blockId: block.id},
      {ghostLabel: '艺术字'},
    )
  }

  private _resolvePointerBlock(
    target: EventTarget | null,
  ): BlockCraft.IBlockComponents['word-art'] | null {
    if (!(target instanceof Element)) return null
    if (!this.doc.root.hostElement.contains(target)) return null
    const surface = target.closest<HTMLElement>('.word-art-block__surface')
    if (!surface) return null
    const blockId = closetBlockId(surface)
    if (!blockId) return null
    try {
      const block = this.doc.getBlockById(blockId)
      return block.flavour === 'word-art' && block.hostElement.isConnected
        ? (block as BlockCraft.IBlockComponents['word-art'])
        : null
    } catch {
      return null
    }
  }

  private _isEditingBlock(
    block: BlockCraft.IBlockComponents['word-art'],
  ): boolean {
    const selection = this.doc.selection.value
    return (
      !!selection &&
      selection.isInSameBlock &&
      selection.firstBlock.id === block.id &&
      selection.anchor.type === 'text' &&
      selection.head.type === 'text'
    )
  }
}
