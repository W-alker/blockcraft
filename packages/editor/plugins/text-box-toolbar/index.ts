import {
  FlexibleConnectedPositionStrategy,
  OverlayRef,
} from '@angular/cdk/overlay'
import {fromEvent, Subject, Subscription, takeUntil} from 'rxjs'
import {
  BindHotKey,
  BlockNodeType,
  closetBlockId,
  DocPlugin,
  getPositionWithOffset,
  UIEventStateContext,
} from '../../framework'
import {
  normalizeTextBoxProps,
  type TextBoxBlockProps,
} from '../../blocks/text-box-block'
import {isSelectionAlive} from '../../framework/modules/selection/liveness'
import {deleteAbsolutePlacementObject} from '../../framework/services/block-placement/delete-command'
import {
  TextBoxToolbarComponent,
  type TextBoxToolbarAction,
  type TextBoxToolbarPropsPatch,
} from './text-box-toolbar.component'

export * from './text-box-toolbar.component'

const TOOLBAR_GAP = 10
const TEXT_BOX_FLAVOUR = 'text-box'
const SURFACE_PROP_KEYS = new Set([
  'backColor',
  'borderColor',
  'p',
  'bgi',
  'bgs',
  'bgx',
  'bgy',
  'bgo',
])
const TEXT_BOX_APPEARANCE_PROP_KEYS = new Set([
  ...SURFACE_PROP_KEYS,
  'sh',
  'fo',
  'bw',
  'bs',
  'wa',
])

type TextBoxBlock = BlockCraft.IBlockComponents['text-box']

/**
 * Owns the object-selection state of a text box. Text editing remains owned by
 * the first editable descendant and the normal text toolbars.
 */
export class TextBoxToolbarPlugin extends DocPlugin {
  override name = 'text-box-toolbar'

  private readonly _subscription = new Subscription()
  private readonly _closeToolbar$ = new Subject<void>()
  private _toolbarRef?: OverlayRef
  private _toolbarComponent?: TextBoxToolbarComponent
  private _activeBlockId?: string
  private _activeBlockHost?: HTMLElement
  private _toolbarPointerActive = false
  private _toolbarPositionFrame: number | null = null
  private _closing = false

  init(): void {
    this._subscription.add(
      this.doc.subscribeReadonlyChange(readonly => {
        if (readonly) this.closeToolbar()
      }),
    )
    const readonlyStateChange$ = this.doc.readonlyManager?.stateChange$
    if (readonlyStateChange$) {
      this._subscription.add(
        readonlyStateChange$.subscribe(() => {
          const block = this._resolveActiveBlock()
          if (block && this.doc.readonlyManager.isReadonly(block)) {
            this.closeToolbar()
          }
        }),
      )
    }
    this._subscription.add(
      fromEvent<PointerEvent>(document, 'pointerdown', {capture: true})
        .pipe(takeUntil(this.doc.onDestroy$))
        .subscribe(event => this._onPointerDown(event)),
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
      fromEvent<MouseEvent>(document, 'dblclick', {capture: true})
        .pipe(takeUntil(this.doc.onDestroy$))
        .subscribe(event => this._onDoubleClick(event)),
    )
    this._subscription.add(
      fromEvent<FocusEvent>(document, 'focusin', {capture: true})
        .pipe(takeUntil(this.doc.onDestroy$))
        .subscribe(event => this._onFocusIn(event)),
    )
    this._subscription.add(
      this.doc.selection.selectionChange$.subscribe(selection =>
        this._onSelectionChange(selection),
      ),
    )
  }

  destroy(): void {
    this.closeToolbar()
    this._subscription.unsubscribe()
    this._closeToolbar$.complete()
  }

  closeToolbar = (): void => {
    if (this._closing) return
    this._closing = true
    this._closeToolbar$.next()
    this._toolbarRef?.dispose()
    if (this._toolbarPositionFrame !== null) {
      cancelAnimationFrame(this._toolbarPositionFrame)
      this._toolbarPositionFrame = null
    }
    this._toolbarRef = undefined
    this._toolbarComponent = undefined
    this._activeBlockId = undefined
    this._activeBlockHost = undefined
    this._toolbarPointerActive = false
    this._closing = false
  }

  @BindHotKey({key: 'Enter'}, {flavour: TEXT_BOX_FLAVOUR})
  onEnterEditing(ctx: UIEventStateContext): true | void {
    const selection = ctx.get('keyboardState').selection
    if (
      !selection.isInSameBlock ||
      selection.anchor.type !== 'selected' ||
      selection.head.type !== 'selected'
    ) {
      return
    }
    const block = selection.firstBlock as TextBoxBlock
    if (block.flavour !== TEXT_BOX_FLAVOUR) return
    if (!this._enterFirstEditable(block)) return
    ctx.preventDefault()
    return true
  }

  @BindHotKey({key: 'Escape'})
  onDirectChildEscape(ctx: UIEventStateContext): true | void {
    const selection = ctx.get('keyboardState').selection
    if (
      !selection.isInSameBlock ||
      selection.anchor.type !== 'text' ||
      selection.head.type !== 'text'
    ) {
      return
    }

    const child = selection.firstBlock
    const parent = child.parentBlock
    if (
      parent?.flavour !== TEXT_BOX_FLAVOUR ||
      !parent.hostElement.isConnected
    ) {
      return
    }
    ctx.preventDefault()
    this.doc.selection.selectBlock(parent)
    return true
  }

  private _onSelectionChange(selection: BlockCraft.Selection | null): void {
    if (this.doc.isReadonly) {
      this.closeToolbar()
      return
    }
    if (!selection) {
      if (this._toolbarRef && this._toolbarOwnsInteraction()) return
      this.closeToolbar()
      return
    }
    if (
      !isSelectionAlive(selection as any, this.doc) ||
      !selection.isInSameBlock ||
      selection.anchor.type !== 'selected' ||
      selection.head.type !== 'selected' ||
      selection.firstBlock.flavour !== TEXT_BOX_FLAVOUR
    ) {
      this.closeToolbar()
      return
    }

    const block = selection.firstBlock as TextBoxBlock
    if (this.doc.readonlyManager.isReadonly(block)) {
      this.closeToolbar()
      return
    }
    this._openToolbar(block)
  }

  private _openToolbar(block: TextBoxBlock): void {
    if (this._activeBlockId === block.id && this._toolbarRef) return
    this.closeToolbar()
    if (!block.hostElement.isConnected) return

    const toolbar =
      this.doc.overlayService.createConnectedOverlay<TextBoxToolbarComponent>(
        {
          target: block,
          component: TextBoxToolbarComponent,
          positions: [
            getPositionWithOffset('right-center', TOOLBAR_GAP, 0),
            getPositionWithOffset('left-center', TOOLBAR_GAP, 0),
            getPositionWithOffset('right-top', TOOLBAR_GAP, 0),
            getPositionWithOffset('left-top', TOOLBAR_GAP, 0),
          ],
          clampTo: this.doc.scrollContainer ?? undefined,
        },
        this._closeToolbar$,
        this.closeToolbar,
      )

    this._toolbarRef = toolbar.overlayRef
    this._toolbarComponent = toolbar.componentRef.instance
    this._activeBlockId = block.id
    this._activeBlockHost = block.hostElement
    toolbar.componentRef.setInput('textBoxBlock', block)
    toolbar.componentRef.instance.action
      .pipe(takeUntil(this._closeToolbar$))
      .subscribe(action => this._handleAction(block, action))
    toolbar.componentRef.instance.panelChange
      .pipe(takeUntil(this._closeToolbar$))
      .subscribe(() => this._scheduleToolbarPositionUpdate())
    const positionStrategy = toolbar.overlayRef.getConfig().positionStrategy
    if (positionStrategy instanceof FlexibleConnectedPositionStrategy) {
      positionStrategy.positionChanges
        .pipe(takeUntil(this._closeToolbar$))
        .subscribe(change => {
          const side = change.connectionPair.originX === 'start'
            ? 'left'
            : 'right'
          toolbar.componentRef.setInput('side', side)
        })
    }
    block.onPropsChange.pipe(takeUntil(this._closeToolbar$)).subscribe(() => {
      toolbar.componentRef.instance.cdr.markForCheck()
      toolbar.overlayRef.updatePosition()
    })
    block.onDestroy$
      .pipe(takeUntil(this._closeToolbar$))
      .subscribe(() => this.closeToolbar())
  }

  private _handleAction(
    block: TextBoxBlock,
    action: TextBoxToolbarAction,
  ): void {
    if (
      !this._isBlockAlive(block) ||
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
      if (this.doc.placement.setObjectLayout(block, action.value)) {
        this.closeToolbar()
      }
      return
    }
    if (action.name === 'move-forward') {
      this.doc.placement.moveForward(block)
      this._toolbarComponent?.cdr.markForCheck()
      return
    }
    if (action.name === 'move-backward') {
      this.doc.placement.moveBackward(block)
      this._toolbarComponent?.cdr.markForCheck()
      return
    }

    const patch = this._normalizePropsPatch(block.props, action.value)
    if (!patch) return
    block.updateProps(patch)
  }

  private _normalizePropsPatch(
    current: Readonly<TextBoxBlockProps>,
    patch: TextBoxToolbarPropsPatch,
  ): TextBoxToolbarPropsPatch | null {
    const entries = Object.entries(patch)
    if (
      entries.length < 1 ||
      entries.some(([key]) => !TEXT_BOX_APPEARANCE_PROP_KEYS.has(key))
    ) {
      return null
    }

    const normalized = normalizeTextBoxProps({...current, ...patch})
    const result: Record<string, unknown> = {}
    for (const [key, rawValue] of entries) {
      if ((key === 'p' || key === 'bgi' || key === 'wa') && rawValue === null) {
        result[key] = null
        continue
      }
      const value = normalized[key as keyof typeof normalized]
      if (value === undefined) return null
      result[key] = value
    }
    return result as TextBoxToolbarPropsPatch
  }

  private _onPointerDown(event: PointerEvent): void {
    if (event.button !== 0) return
    const target = this._resolveElement(event.target)

    if (this._isToolbarTarget(target)) {
      this._toolbarPointerActive = true
      return
    }

    if (this._toolbarRef && !this._activeBlockHost?.contains(target)) {
      const isInEditor = !!target && this.doc.root.hostElement.contains(target)
      this.closeToolbar()
      if (!isInEditor) return
    }

    const moveEdge = target?.closest('.shape-resizer__move-edge')
    if (target?.closest('shape-resizer') && !moveEdge) return

    const block = this._resolvePointerBlock(target)
    if (!block) return
    const readonly = this.doc.readonlyManager.isReadonly(block)

    event.preventDefault()
    event.stopPropagation()
    this.doc.selection.selectBlock(block)

    if (!moveEdge || readonly) return
    this._openToolbar(block)
    this._startBorderDrag(event, block)
  }

  private _onDoubleClick(event: MouseEvent): void {
    if (event.button !== 0) return
    const target = this._resolveElement(event.target)
    if (!target || this._isToolbarTarget(target)) return
    if (target.closest('shape-resizer')) return
    const block = this._resolveTextBoxAncestor(target)
    if (!block || !this._enterFirstEditable(block)) return
    event.preventDefault()
    event.stopPropagation()
  }

  private _enterFirstEditable(block: TextBoxBlock): boolean {
    if (
      !this._isBlockAlive(block) ||
      this.doc.readonlyManager.isReadonly(block)
    ) {
      return false
    }
    const childId = this._findFirstEditableDescendantId(block.id)
    if (!childId) return false
    this.doc.selection.setCursorAtBlock(childId, true)
    return true
  }

  private _findFirstEditableDescendantId(blockId: string): string | null {
    const pending = [...this.doc.model.getChildrenIds(blockId)].reverse()
    const visited = new Set<string>()
    while (pending.length) {
      const id = pending.pop()!
      if (visited.has(id)) continue
      visited.add(id)
      if (this.doc.model.getNodeType(id) === BlockNodeType.editable) return id
      const children = this.doc.model.getChildrenIds(id)
      for (let index = children.length - 1; index >= 0; index--) {
        pending.push(children[index]!)
      }
    }
    return null
  }

  private _startBorderDrag(
    event: PointerEvent,
    block: TextBoxBlock,
  ): void {
    if (this.doc.placement.getState(block).mode === 'absolute') {
      this.doc.placement.startDrag(event, block)
      return
    }
    if (this.doc.dragController.state !== 'idle') return
    this.doc.dragController.startDrag(
      event,
      {kind: 'origin-block', blockId: block.id},
      {ghostLabel: '文本框'},
    )
  }

  private _onFocusIn(event: FocusEvent): void {
    if (!this._toolbarRef) return
    const target = this._resolveElement(event.target)
    if (
      this._isToolbarTarget(target) ||
      this._activeBlockHost?.contains(target)
    ) {
      return
    }
    // Escape returns text editing to the whole text-box selection and the
    // selection manager focuses the editor root. That root focus belongs to
    // the still-active object interaction; closing here would make the rail
    // flash and disappear immediately after a valid object selection.
    if (
      target === this.doc.root.hostElement &&
      this._hasActiveWholeBlockSelection()
    ) {
      return
    }
    this.closeToolbar()
  }

  private _hasActiveWholeBlockSelection(): boolean {
    const selection = this.doc.selection.value
    if (
      !selection ||
      !selection.isInSameBlock ||
      selection.anchor.type !== 'selected' ||
      selection.head.type !== 'selected'
    ) {
      return false
    }
    try {
      return selection.firstBlock.id === this._activeBlockId &&
        selection.firstBlock.flavour === TEXT_BOX_FLAVOUR
    } catch {
      return false
    }
  }

  private _endToolbarPointerInteraction(): void {
    this._toolbarPointerActive = false
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
    const ownerDocument =
      this._toolbarRef?.overlayElement.ownerDocument ?? document
    return this._isToolbarTarget(ownerDocument.activeElement)
  }

  private _isToolbarTarget(target: Element | null): boolean {
    const toolbarElement = this._toolbarRef?.overlayElement
    if (!target || !toolbarElement) return false
    if (toolbarElement.contains(target)) return true

    // CSES form controls render their interactive panels as sibling CDK
    // overlays. Keep only panels whose owning control is open inside this
    // text-box toolbar; unrelated page overlays must not retain stale state.
    const ownsOpenColorPicker = !!toolbarElement.querySelector(
      'cs-color-picker.cs-color-picker-open',
    )
    if (
      ownsOpenColorPicker &&
      !!target.closest('.cs-color-picker-overlay-pane .cs-color-picker-panel')
    ) {
      return true
    }
    const ownsOpenSelect = !!toolbarElement.querySelector(
      'cs-select.cs-select-open',
    )
    if (
      ownsOpenSelect &&
      !!target.closest('.cs-select-panel .cs-select-dropdown')
    ) {
      return true
    }

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
      candidate => candidate.getAttribute('data-float-id') === bindingId,
    )
  }

  private _resolvePointerBlock(target: Element | null): TextBoxBlock | null {
    if (!target || !this.doc.root.hostElement.contains(target)) return null
    const blockId = closetBlockId(target)
    if (!blockId) return null
    try {
      const block = this.doc.getBlockById(blockId)
      return block.flavour === TEXT_BOX_FLAVOUR && block.hostElement.isConnected
        ? block as TextBoxBlock
        : null
    } catch {
      return null
    }
  }

  /**
   * Double-click may land on a real paragraph/list child. Resolve the owning
   * text-box frame without changing the single-click path, which deliberately
   * leaves descendant text selection to the normal editing pipeline.
   */
  private _resolveTextBoxAncestor(target: Element): TextBoxBlock | null {
    if (!this.doc.root.hostElement.contains(target)) return null
    const host = target.closest<HTMLElement>(
      '[data-bc-text-box][data-block-id]',
    )
    const blockId = host?.getAttribute('data-block-id')
    if (!host || !blockId) return null
    try {
      const block = this.doc.getBlockById(blockId)
      return block.flavour === TEXT_BOX_FLAVOUR &&
        block.hostElement === host &&
        block.hostElement.isConnected
        ? block as TextBoxBlock
        : null
    } catch {
      return null
    }
  }

  private _resolveActiveBlock(): TextBoxBlock | null {
    if (!this._activeBlockId) return null
    try {
      const block = this.doc.getBlockById(this._activeBlockId)
      return block.flavour === TEXT_BOX_FLAVOUR ? block as TextBoxBlock : null
    } catch {
      return null
    }
  }

  private _isBlockAlive(block: TextBoxBlock): boolean {
    try {
      return block.hostElement.isConnected && this.doc.getBlockById(block.id) === block
    } catch {
      return false
    }
  }

  private _resolveElement(target: EventTarget | null): Element | null {
    if (target instanceof Element) return target
    return target instanceof Node ? target.parentElement : null
  }
}
