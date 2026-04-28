import {fromEvent, takeUntil} from "rxjs";
import {UIEventState, UIEventStateContext} from "../base";
import {ClipboardEventState, EventScopeSourceType, EventSourceState} from "../state";
import {isNativeInputTarget} from "../../../utils";

export class ClipboardControl {
  constructor(private _dispatcher: BlockCraft.EventDispatcher) {
  }

  listen(root: BlockCraft.IBlockComponents['root']) {
    // When a block is in `selected` state we set its host to
    // `contenteditable=false` and let inner ZWS gap spans stay editable.
    // The browser then treats the ZWS span as the editing host and
    // `document.activeElement` is no longer root itself — so we accept any
    // active element that lives *inside* root.
    const isEditorFocused = () => {
      const ae = document.activeElement
      return !!ae && root.hostElement.contains(ae)
    }

    fromEvent<ClipboardEvent>(document, 'copy').pipe(takeUntil(root.onDestroy$)).subscribe(ev => {
      if (!isEditorFocused()) return
      if (this._dispatcher.status.isReadOnly) {
        ev.preventDefault()
        return
      }
      this._dispatcher.run('copy', this._createContext(ev))
    })
    fromEvent<ClipboardEvent>(document, 'cut').pipe(takeUntil(root.onDestroy$)).subscribe(ev => {
      if (!isEditorFocused()) return
      if (this._dispatcher.status.isReadOnly) {
        ev.preventDefault()
        return
      }
      this._dispatcher.run('cut', this._createContext(ev))
    })
    fromEvent<ClipboardEvent>(root.hostElement, 'paste').pipe(takeUntil(root.onDestroy$)).subscribe(ev => {
      if (isNativeInputTarget(ev.target)) return
      if (this._dispatcher.status.isReadOnly) {
        ev.preventDefault()
        return
      }
      this._dispatcher.run('paste', this._createContext(ev))
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
