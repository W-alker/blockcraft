import {OverlayRef} from '@angular/cdk/overlay'
import {fromEvent, Subject, Subscription, takeUntil} from 'rxjs'
import {
  BindHotKey,
  closetBlockId,
  DocPlugin,
  getPositionWithOffset,
  UIEventStateContext,
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

export * from './word-art-toolbar.component'
export * from './word-art-transform-overlay.component'

const ROTATION_HANDLE_CLEARANCE = 52

export class WordArtToolbarPlugin extends DocPlugin {
  override name = 'word-art-toolbar'

  private readonly _subscription = new Subscription()
  private readonly _closeOverlays$ = new Subject<void>()
  private _toolbarRef?: OverlayRef
  private _activeBlockId?: string
  private _activeBlockHost?: HTMLElement
  private _activeResizer?: HTMLElement
  private _toolbarPointerActive = false
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
    this._toolbarRef = undefined
    this._activeResizer?.style.removeProperty('display')
    this._activeResizer = undefined
    this._activeBlockId = undefined
    this._activeBlockHost = undefined
    this._toolbarPointerActive = false
    this._closing = false
  }

  @BindHotKey({key: 'Enter'}, {flavour: 'word-art'})
  onEnterEditing(ctx: UIEventStateContext): true | void {
    const selection = ctx.get('keyboardState').selection
    if (
      !selection.isInSameBlock ||
      selection.anchor.type !== 'selected' ||
      selection.head.type !== 'selected'
    ) {
      return
    }
    const block = selection.firstBlock
    if (block.flavour !== 'word-art') return
    ctx.preventDefault()
    ;(block as BlockCraft.IBlockComponents['word-art']).enterEditing()
    return true
  }

  @BindHotKey({key: 'Escape'}, {flavour: 'word-art'})
  onEscapeEditing(ctx: UIEventStateContext): true | void {
    const selection = ctx.get('keyboardState').selection
    if (
      !selection.isInSameBlock ||
      selection.anchor.type !== 'text' ||
      selection.head.type !== 'text'
    ) {
      return
    }
    const block = selection.firstBlock
    if (block.flavour !== 'word-art') return
    ctx.preventDefault()
    this.doc.selection.selectBlock(block)
    return true
  }

  private _openOverlays(block: BlockCraft.IBlockComponents['word-art']): void {
    if (this._activeBlockId === block.id && this._toolbarRef) {
      return
    }
    this.closeOverlays()
    if (!block.hostElement.isConnected) return
    this._activeBlockId = block.id
    this._activeBlockHost = block.hostElement
    this._activeResizer =
      block.hostElement.querySelector<HTMLElement>('shape-resizer') ??
      undefined
    this._activeResizer?.style.setProperty('display', 'block')

    const toolbar =
      this.doc.overlayService.createConnectedOverlay<WordArtToolbarComponent>(
        {
          target: block,
          component: WordArtToolbarComponent,
          positions: [
            getPositionWithOffset('top-center', 0, ROTATION_HANDLE_CLEARANCE),
            getPositionWithOffset('bottom-center', 0, 8),
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
      return
    }

    if (this._toolbarRef && !this._activeBlockHost?.contains(target)) {
      const isInEditor =
        !!target && !!this.doc.root?.hostElement.contains(target)
      this.closeOverlays()
      if (!isInEditor) return
    }

    const moveEdge = target?.closest('.shape-resizer__move-edge')
    if (target?.closest('shape-resizer') && !moveEdge) return

    const block = this._resolvePointerBlock(target)
    if (!block) return
    const readonly = this.doc.readonlyManager.isReadonly(block)

    if (moveEdge) {
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
    if (editorTarget && this._isEditingBlock(block)) return
    if (!editorTarget) {
      event.preventDefault()
      event.stopPropagation()
    }
    block.enterEditing()
    this._openOverlays(block)
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
  }

  private _toolbarOwnsInteraction(): boolean {
    if (this._toolbarPointerActive) return true
    const ownerDocument =
      this._toolbarRef?.overlayElement.ownerDocument ?? document
    const activeElement = ownerDocument.activeElement
    return (
      activeElement instanceof Element &&
      this._isToolbarTarget(activeElement)
    )
  }

  private _isToolbarTarget(target: Element | null): boolean {
    const toolbarElement = this._toolbarRef?.overlayElement
    if (!target || !toolbarElement) return false
    if (toolbarElement.contains(target)) return true

    const binding = target.closest<HTMLElement>(
      '[data-float-binding][data-float-id]',
    )
    const bindingId = binding?.getAttribute('data-float-id')
    if (!bindingId) return false
    return Array.from(
      toolbarElement.querySelectorAll<HTMLElement>(
        '[data-float-binding][data-float-id]',
      ),
    ).some(
      (candidate) => candidate.getAttribute('data-float-id') === bindingId,
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
