import {fromEvent, take, takeUntil} from "rxjs";
import {UIEventState, UIEventStateContext} from "../base";
import {EventScopeSourceType, EventSourceState} from "../state";
import {CompositionEventState} from "../state/compositionState";
import {closetBlockId, isNativeInputTarget} from "../../../utils";

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
    this._compositionBlockId = event.target instanceof Node
      ? closetBlockId(event.target) ?? null
      : null
    this._compositionBlockHost = this._resolveBlockHost(event.target)
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

  private _queueReset = () => {
    if (this._compositionResetTimer !== null) return
    const version = this._compositionVersion
    this._compositionResetTimer = setTimeout(() => {
      this._compositionResetTimer = null
      // A synchronous compositionend/pointer recovery or a new composition
      // supersedes this stale-selection recovery.
      if (version !== this._compositionVersion) return
      this._reset()
    }, 0)
  }

  private _cancelQueuedReset() {
    if (this._compositionResetTimer === null) return
    clearTimeout(this._compositionResetTimer)
    this._compositionResetTimer = null
  }

  private _resolveBlockHost(target: EventTarget | null): HTMLElement | null {
    const element = target instanceof HTMLElement
      ? target
      : target instanceof Node
        ? target.parentElement
        : null
    return element?.closest<HTMLElement>('[data-block-id]') ?? null
  }

  private _onSelectionChange = () => {
    if (!this._isComposing) return
    if (this._compositionBlockHost && !this._compositionBlockHost.isConnected) {
      this._queueReset()
      return
    }

    const anchorNode = document.getSelection()?.anchorNode
    if (!anchorNode || !this._compositionBlockId) return
    const anchorBlockId = closetBlockId(anchorNode)
    if (anchorBlockId && anchorBlockId !== this._compositionBlockId) {
      // Keep the state stable across the complete native event dispatch. Some
      // Zone/browser combinations run a microtask checkpoint between adjacent
      // listeners, so a macrotask boundary is required here.
      this._queueReset()
    }
  }

  private _onPointerDown = (event: PointerEvent) => {
    if (!this._isComposing || event.button !== 0 || !event.isPrimary) return
    this._reset()
  }

  listen(root: BlockCraft.IBlockComponents['root']) {
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
        if (event.relatedTarget instanceof Node && root.hostElement.contains(event.relatedTarget)) return
        this._reset()
      })
    fromEvent(document, 'selectionchange')
      .pipe(takeUntil(root.onDestroy$))
      .subscribe(this._onSelectionChange)
  }

}
