import {fromEvent, takeUntil} from "rxjs";
import {UIEventState, UIEventStateContext} from "../base";
import {ClipboardEventState, EventScopeSourceType, EventSourceState} from "../state";

export class ClipboardControl {
  constructor(private _dispatcher: BlockCraft.EventDispatcher) {
  }

  listen(root: BlockCraft.IBlockComponents['root']) {
    fromEvent<ClipboardEvent>(root.hostElement, 'copy').pipe(takeUntil(root.onDestroy$)).subscribe(ev => {
      this._dispatcher.run(
        'copy',
        this._createContext(ev)
      )
    })
    fromEvent<ClipboardEvent>(root.hostElement, 'cut').pipe(takeUntil(root.onDestroy$)).subscribe(ev => {
      if (this._dispatcher.isReadOnly) {
        ev.preventDefault()
        return
      }
      this._dispatcher.run(
        'cut',
        this._createContext(ev)
      )
    })
    fromEvent<ClipboardEvent>(root.hostElement, 'paste').pipe(takeUntil(root.onDestroy$)).subscribe(ev => {
      if (this._dispatcher.isReadOnly) {
        ev.preventDefault()
        return
      }
      this._dispatcher.run(
        'paste',
        this._createContext(ev)
      )
    })
  }

  private _createContext(event: ClipboardEvent) {
    return UIEventStateContext.from(
      new UIEventState(event),
      new ClipboardEventState({event, selection: this._dispatcher.currentSelection!}),
      new EventSourceState({event, sourceType: EventScopeSourceType.Selection})
    )
  }

}
