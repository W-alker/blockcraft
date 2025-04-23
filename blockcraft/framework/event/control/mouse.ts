import {fromEvent, takeUntil} from "rxjs";
import {UIEventState, UIEventStateContext} from "../base";
import {EventScopeSourceType, EventSourceState} from "../state";
import {EventNames} from "../dispatcher";

function createContext(
  event: MouseEvent,
) {
  return UIEventStateContext.from(
    new UIEventState(event),
    new EventSourceState({
      event,
      sourceType: EventScopeSourceType.Target,
    })
  );
}

export class MouseControl {
  constructor(private _dispatcher: BlockCraft.EventDispatcher) {
  }

  private _down = (event: MouseEvent) => {
    this._dispatcher.run(EventNames.mouseDown, createContext(event))
  }

  private _up = (event: MouseEvent) => {
    this._dispatcher.run(EventNames.mouseUp, createContext(event));
  }

  private _enter = (event: MouseEvent) => {
    this._dispatcher.run(EventNames.mouseEnter, createContext(event));
  }

  private _leave = (event: MouseEvent) => {
    this._dispatcher.run(EventNames.mouseLeave, createContext(event));
  }

  private _dblclick = (event: MouseEvent) => {
    this._dispatcher.run(EventNames.doubleClick, createContext(event));
  }

  listen(root: BlockCraft.IBlockComponents['root']) {
    fromEvent<MouseEvent>(root.hostElement, 'mousedown').pipe(takeUntil(root.onDestroy$)).subscribe(this._down);
    fromEvent<MouseEvent>(root.hostElement, 'mouseup').pipe(takeUntil(root.onDestroy$)).subscribe(this._up);
    fromEvent<MouseEvent>(root.hostElement, 'mouseover').pipe(takeUntil(root.onDestroy$)).subscribe(this._enter);
    fromEvent<MouseEvent>(root.hostElement, 'mouseout').pipe(takeUntil(root.onDestroy$)).subscribe(this._leave);
    fromEvent<MouseEvent>(root.hostElement, 'dblclick').pipe(takeUntil(root.onDestroy$)).subscribe(this._dblclick);
  }
}
