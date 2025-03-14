import {fromEvent, takeUntil} from "rxjs";
import {UIEventState, UIEventStateContext} from "../base";
import {ClipboardEventState, EventScopeSourceType, EventSourceState} from "../state";
import {EventNames} from "../dispatcher";

export class ClipboardControl {
  constructor(private _dispatcher: BlockCraft.EventDispatcher) {
  }

  listen(root: BlockCraft.IBlockComponents['root']) {
    fromEvent<ClipboardEvent>(root.hostElement, 'copy').pipe(takeUntil(root.onDestroy$)).subscribe(ev => {
      this._dispatcher.run(
        EventNames.copy,
        this._createContext(ev)
      )
    })
    fromEvent<ClipboardEvent>(root.hostElement, 'cut').pipe(takeUntil(root.onDestroy$)).subscribe(ev => {
      this._dispatcher.run(
        EventNames.cut,
        this._createContext(ev)
      )
    })
    fromEvent<ClipboardEvent>(root.hostElement, 'paste').pipe(takeUntil(root.onDestroy$)).subscribe(ev => {
      this._dispatcher.run(
        EventNames.paste,
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
