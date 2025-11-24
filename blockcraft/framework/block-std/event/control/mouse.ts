import {fromEvent, takeUntil} from "rxjs";
import {UIEventState, UIEventStateContext} from "../base";
import {EventScopeSourceType, EventSourceState} from "../state";

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
  private _isMouseReleased = true;

  get isMouseReleased() {
    return this._isMouseReleased;
  }

  constructor(private _dispatcher: BlockCraft.EventDispatcher) {
  }

  private _down = (event: MouseEvent) => {
    this._isMouseReleased = false;
    this._dispatcher.run('mouseDown', createContext(event))
  }

  private _up = (event: MouseEvent) => {
    this._isMouseReleased = true;
    this._dispatcher.run('mouseUp', createContext(event));
  }

  private _enter = (event: MouseEvent) => {
    this._dispatcher.run('mouseEnter', createContext(event));
  }

  private _leave = (event: MouseEvent) => {
    this._dispatcher.run('mouseLeave', createContext(event));
  }

  private _dblclick = (event: MouseEvent) => {
    this._dispatcher.run('doubleClick', createContext(event));
  }

  listen(root: BlockCraft.IBlockComponents['root']) {
    fromEvent<MouseEvent>(root.hostElement, 'mousedown', {capture: true}).pipe(takeUntil(root.onDestroy$)).subscribe(this._down);
    fromEvent<MouseEvent>(root.hostElement, 'mouseup', {capture: true}).pipe(takeUntil(root.onDestroy$)).subscribe(this._up);
    fromEvent<MouseEvent>(root.hostElement, 'mouseover', {capture: true}).pipe(takeUntil(root.onDestroy$)).subscribe(this._enter);
    fromEvent<MouseEvent>(root.hostElement, 'mouseout', {capture: true}).pipe(takeUntil(root.onDestroy$)).subscribe(this._leave);
    fromEvent<MouseEvent>(root.hostElement, 'dblclick', {capture: true}).pipe(takeUntil(root.onDestroy$)).subscribe(this._dblclick);
  }
}
