import {fromEvent, takeUntil} from "rxjs";
import {UIEventState, UIEventStateContext} from "../base";
import {EventScopeSourceType, EventSourceState} from "../state";

export class CompositionControl {

  constructor(private _dispatcher: BlockCraft.EventDispatcher) {
  }

  private _buildContext = (event: CompositionEvent) => {
    return UIEventStateContext.from(
      new UIEventState(event),
      new EventSourceState({event, sourceType: EventScopeSourceType.Selection})
    )
  }

  private _start = (event: CompositionEvent) => {
    this._dispatcher.run('compositionStart', this._buildContext(event))
  }

  private _end = (event: CompositionEvent) => {
    this._dispatcher.run('compositionEnd', this._buildContext(event))
  }

  listen(root: BlockCraft.IBlockComponents['root']) {
    fromEvent<CompositionEvent>(root.hostElement, 'compositionstart').pipe(takeUntil(root.onDestroy$)).subscribe(this._start)
    fromEvent<CompositionEvent>(root.hostElement, 'compositionend').pipe(takeUntil(root.onDestroy$)).subscribe(this._end)
  }

}
