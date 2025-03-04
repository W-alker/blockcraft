import {fromEvent, takeUntil} from "rxjs";
import {MultiPointerEventState, PointerEventState} from "../state/pointerState";
import {UIEventState, UIEventStateContext} from "../base";
import {EventScopeSourceType, EventSourceState} from "../state";
import {performanceTest} from "../../decorators";

type PointerId = typeof PointerEvent.prototype.pointerId;

function createContext(
  event: Event,
  state: PointerEventState | MultiPointerEventState
) {
  return UIEventStateContext.from(
    new UIEventState(event),
    new EventSourceState({
      event,
      sourceType: EventScopeSourceType.Target,
    }),
    state
  );
}

abstract class PointerControllerBase {
  constructor(
    protected _dispatcher: BlockCraft.EventDispatcher,
    protected _getRect: () => DOMRect
  ) {
  }

  abstract listen(): void;
}

export class PointerControl {
  constructor(private _dispatcher: BlockCraft.EventDispatcher) {
  }

  private _startStates = new Map<PointerId, PointerEventState>();
  private _lastStates = new Map<PointerId, PointerEventState>();

  private _cachedRect: DOMRect | null = null;

  private _getRect = () => {
    if (this._cachedRect === null) {
      this._updateRect();
    }
    return this._cachedRect as DOMRect;
  }

  protected _updateRect() {
    if (!this._dispatcher.rootElement) return;
    this._cachedRect = this._dispatcher.rootElement.getBoundingClientRect();
  }

  @performanceTest()
  private _down(event: PointerEvent){
    const { pointerId } = event;

    const pointerState = new PointerEventState({
      event,
      rect: this._getRect(),
      startX: -Infinity,
      startY: -Infinity,
      last: null,
    });
    this._startStates.set(pointerId, pointerState);
    this._lastStates.set(pointerId, pointerState);
    this._dispatcher.run('pointerDown', createContext(event, pointerState));

    console.log(pointerState)
  }

  listen(root: BlockCraft.IBlockComponents['root']) {
    fromEvent<PointerEvent>(root.hostElement, 'pointerdown').pipe(takeUntil(root.onDestroy$)).subscribe(e => this._down(e))
  }
}
