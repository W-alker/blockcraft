import {fromEvent, take, takeUntil} from "rxjs";
import {UIEventState, UIEventStateContext} from "../base";
import {EventScopeSourceType, EventSourceState} from "../state";
import {CompositionEventState} from "../state/compositionState";
import {isNativeInputTarget} from "../../../utils";

export class CompositionControl {

  constructor(private _dispatcher: BlockCraft.EventDispatcher) {
  }

  private _isComposing = false
  private _compositionBlockId: string | null = null
  private _compositionBlockHost: HTMLElement | null = null
  private _compositionVersion = 0
  private _compositionResetTimer: ReturnType<typeof setTimeout> | null = null

  get isComposing() {
    return this._isComposing
  }

  private _buildContext = (event: CompositionEvent) => {
    return UIEventStateContext.from(
      new UIEventState(event),
      new CompositionEventState(this._dispatcher.doc, event),
      new EventSourceState({event, sourceType: EventScopeSourceType.Selection})
    )
  }

  private _start = (event: CompositionEvent) => {
    if (isNativeInputTarget(event.target)) return
    this._cancelQueuedReset()
    this._compositionVersion++
    this._isComposing = true
    this._compositionBlockHost = this._resolveBlockHost(event.target)
    this._compositionBlockId = this._compositionBlockHost?.dataset['blockId'] ?? null
    this._dispatcher.run('compositionStart', this._buildContext(event))
  }

  private _end = (event: CompositionEvent) => {
    this._reset()
    if (isNativeInputTarget(event.target)) return
    this._dispatcher.run('compositionEnd', this._buildContext(event))
  }

  private _reset = () => {
    this._cancelQueuedReset()
    this._compositionVersion++
    this._isComposing = false
    this._compositionBlockId = null
    this._compositionBlockHost = null
  }

  private _queueReset = (ownerDocument: Document) => {
    if (this._compositionResetTimer !== null) return
    const version = this._compositionVersion
    this._compositionResetTimer = setTimeout(() => {
      this._compositionResetTimer = null
      // A synchronous compositionend/pointer recovery or a new composition
      // supersedes this stale-selection recovery.
      if (version !== this._compositionVersion) return
      if (this._isNativeSelectionInsideCompositionHost(ownerDocument)) {
        return
      }
      this._reset()
    }, 0)
  }

  private _cancelQueuedReset() {
    if (this._compositionResetTimer === null) return
    clearTimeout(this._compositionResetTimer)
    this._compositionResetTimer = null
  }

  private _resolveBlockHost(target: EventTarget | null): HTMLElement | null {
    const element = this._resolveElement(target)
    return element?.closest<HTMLElement>('[data-block-id]') ?? null
  }

  private _resolveNode(target: EventTarget | null): Node | null {
    if (!target || typeof (target as Node).nodeType !== 'number') return null
    return target as Node
  }

  private _resolveElement(target: EventTarget | null): Element | null {
    const node = this._resolveNode(target)
    if (!node) return null
    return node.nodeType === 1 ? node as Element : node.parentElement
  }

  private _onSelectionChange = (ownerDocument: Document) => {
    if (!this._isComposing) return
    if (this._compositionBlockHost && !this._compositionBlockHost.isConnected) {
      this._queueReset(ownerDocument)
      return
    }

    const anchorNode = ownerDocument.getSelection()?.anchorNode
    if (!anchorNode || !this._compositionBlockId) return
    if (this._isNativeSelectionInsideCompositionHost(ownerDocument)) {
      this._cancelQueuedReset()
      return
    }
    // Keep the state stable across the complete native event dispatch. Some
    // Zone/browser combinations run a microtask checkpoint between adjacent
    // listeners, so a macrotask boundary is required here. The timer rechecks
    // the original host identity, which also covers same-id remounts and a
    // selection whose anchor is inside while its focus escaped.
    this._queueReset(ownerDocument)
  }

  private _isNativeSelectionInsideCompositionHost(ownerDocument: Document): boolean {
    const host = this._compositionBlockHost
    const selection = ownerDocument.getSelection()
    return !!host?.isConnected &&
      !!selection?.anchorNode &&
      !!selection.focusNode &&
      host.contains(selection.anchorNode) &&
      host.contains(selection.focusNode)
  }

  private _onPointerDown = (event: PointerEvent) => {
    if (!this._isComposing || event.button !== 0 || !event.isPrimary) return
    this._reset()
  }

  listen(root: BlockCraft.IBlockComponents['root']) {
    const ownerDocument = root.hostElement.ownerDocument
    root.onDestroy$.pipe(take(1)).subscribe(() => this._cancelQueuedReset())
    fromEvent<CompositionEvent>(root.hostElement, 'compositionstart').pipe(takeUntil(root.onDestroy$)).subscribe(this._start)
    fromEvent<CompositionEvent>(root.hostElement, 'compositionend').pipe(takeUntil(root.onDestroy$)).subscribe(this._end)
    fromEvent<PointerEvent>(root.hostElement, 'pointerdown', {capture: true})
      .pipe(takeUntil(root.onDestroy$))
      .subscribe(this._onPointerDown)
    fromEvent<FocusEvent>(root.hostElement, 'focusout', {capture: true})
      .pipe(takeUntil(root.onDestroy$))
      .subscribe(event => {
        if (!this._isComposing) return
        const relatedNode = this._resolveNode(event.relatedTarget)
        if (relatedNode && root.hostElement.contains(relatedNode)) return
        this._reset()
      })
    fromEvent(ownerDocument, 'selectionchange')
      .pipe(takeUntil(root.onDestroy$))
      .subscribe(() => this._onSelectionChange(ownerDocument))
  }

}
