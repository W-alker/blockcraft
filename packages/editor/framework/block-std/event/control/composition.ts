import {fromEvent, takeUntil} from "rxjs";
import {UIEventState, UIEventStateContext} from "../base";
import {EventScopeSourceType, EventSourceState} from "../state";
import {CompositionEventState} from "../state/compositionState";
import {isNativeInputTarget} from "../../../utils";

export class CompositionControl {

  constructor(private _dispatcher: BlockCraft.EventDispatcher) {
  }

  private _isComposing = false

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
    this._isComposing = true
    this._dispatcher.run('compositionStart', this._buildContext(event))
  }

  private _end = (event: CompositionEvent) => {
    if (isNativeInputTarget(event.target)) return
    this._isComposing = false
    this._dispatcher.run('compositionEnd', this._buildContext(event))
  }

  listen(root: BlockCraft.IBlockComponents['root']) {
    fromEvent<CompositionEvent>(root.hostElement, 'compositionstart').pipe(takeUntil(root.onDestroy$)).subscribe(this._start)
    fromEvent<CompositionEvent>(root.hostElement, 'compositionend').pipe(takeUntil(root.onDestroy$)).subscribe(this._end)
  }

}
