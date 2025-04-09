import {fromEvent, takeUntil} from "rxjs";
import {EventScopeSourceType, EventSourceState, KeyboardEventState} from "../state";
import {UIEventState, UIEventStateContext} from "../base";

export class DndControl {
  constructor(private _dispatcher: BlockCraft.EventDispatcher) {
  }

  onDragstart(evt: DragEvent) {

  }

  private _createContext(event: Event, keyboardState: KeyboardEventState) {
    return UIEventStateContext.from(
      new UIEventState(event),
      new EventSourceState({
        event,
        sourceType: EventScopeSourceType.Selection,
      }),
      keyboardState
    );
  }

  listen(root: BlockCraft.IBlockComponents['root']) {
    fromEvent<DragEvent>(root.hostElement, 'dragstart').pipe(takeUntil(root.onDestroy$)).subscribe(evt => {
      console.log('evt   drag start', evt);
    })
  }


}
