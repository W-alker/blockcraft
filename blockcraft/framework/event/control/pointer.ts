import {fromEvent, takeUntil} from "rxjs";
import {MultiPointerEventState, PointerEventState} from "../state/pointerState";
import {UIEventState, UIEventStateContext} from "../base";
import {EventScopeSourceType, EventSourceState} from "../state";
import {performanceTest} from "../../decorators";
import {isFarEnough} from "../utils";
import {nextTick, throttle} from "../../../global";

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

const POLL_INTERVAL = 1000;

abstract class PointerControllerBase {
  constructor(
    protected _dispatcher: BlockCraft.EventDispatcher,
    protected _getRect: () => DOMRect
  ) {
  }

  abstract listen(root: BlockCraft.IBlockComponents['root']): void;
}

class PointerEventForward extends PointerControllerBase {
  private _down = (event: PointerEvent) => {
    const {pointerId} = event;

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
  };

  private _lastStates = new Map<PointerId, PointerEventState>();

  private _move = (event: PointerEvent) => {
    const {pointerId} = event;

    const start = this._startStates.get(pointerId) ?? null;
    const last = this._lastStates.get(pointerId) ?? null;

    const state = new PointerEventState({
      event,
      rect: this._getRect(),
      startX: start?.x ?? -Infinity,
      startY: start?.y ?? -Infinity,
      last,
    });
    this._lastStates.set(pointerId, state);

    this._dispatcher.run('pointerMove', createContext(event, state));
  };

  private _startStates = new Map<PointerId, PointerEventState>();

  private _upOrOut = (up: boolean) => (event: PointerEvent) => {
    const {pointerId} = event;

    const start = this._startStates.get(pointerId) ?? null;
    const last = this._lastStates.get(pointerId) ?? null;

    const state = new PointerEventState({
      event,
      rect: this._getRect(),
      startX: start?.x ?? -Infinity,
      startY: start?.y ?? -Infinity,
      last,
    });

    this._startStates.delete(pointerId);
    this._lastStates.delete(pointerId);

    this._dispatcher.run(up ? 'pointerUp' : 'pointerOut', createContext(event, state));
  };

  listen(root: BlockCraft.IBlockComponents['root']) {
    fromEvent<PointerEvent>(root.hostElement, 'pointerdown').pipe(takeUntil(root.onDestroy$)).subscribe(this._down);
    fromEvent<PointerEvent>(root.hostElement, 'pointermove').pipe(takeUntil(root.onDestroy$)).subscribe(throttle(this._move, 60));
    fromEvent<PointerEvent>(root.hostElement, 'pointerup').pipe(takeUntil(root.onDestroy$)).subscribe(() => this._upOrOut(true));
    fromEvent<PointerEvent>(root.hostElement, 'pointerout').pipe(takeUntil(root.onDestroy$)).subscribe(() => this._upOrOut(false));
  }
}

class ClickController extends PointerControllerBase {
  private _down = (event: PointerEvent) => {
    // disable for secondary pointer
    if (!event.isPrimary) return;

    if (
      this._downPointerState &&
      event.pointerId === this._downPointerState.raw.pointerId &&
      event.timeStamp - this._downPointerState.raw.timeStamp < 500 &&
      !isFarEnough(event, this._downPointerState.raw)
    ) {
      this._pointerDownCount++;
    } else {
      this._pointerDownCount = 1;
    }

    this._downPointerState = new PointerEventState({
      event,
      rect: this._getRect(),
      startX: -Infinity,
      startY: -Infinity,
      last: null,
    });
  };

  private _downPointerState: PointerEventState | null = null;

  private _pointerDownCount = 0;

  private _up = (event: PointerEvent) => {
    if (!this._downPointerState) return;

    if (isFarEnough(this._downPointerState.raw, event)) {
      this._pointerDownCount = 0;
      this._downPointerState = null;
      return;
    }

    const state = new PointerEventState({
      event,
      rect: this._getRect(),
      startX: -Infinity,
      startY: -Infinity,
      last: null,
    });
    const context = createContext(event, state);

    const run = () => {
      this._dispatcher.run('click', context);
      if (this._pointerDownCount === 2) {
        this._dispatcher.run('doubleClick', context);
      }
      if (this._pointerDownCount === 3) {
        this._dispatcher.run('tripleClick', context);
      }
    };

    run();
  };

  listen(root: BlockCraft.IBlockComponents['root']) {
    fromEvent<PointerEvent>(root.hostElement, 'pointerdown').pipe(takeUntil(root.onDestroy$)).subscribe(this._down);
    fromEvent<PointerEvent>(root.hostElement, 'pointerup').pipe(takeUntil(root.onDestroy$)).subscribe(this._up);
  }
}

export class PointerControl {

  private controllers: PointerControllerBase[];

  constructor(private _dispatcher: BlockCraft.EventDispatcher) {
    this.controllers = [
      new PointerEventForward(_dispatcher, this._getRect),
      new ClickController(_dispatcher, this._getRect),
    ];
  }

  private _cachedRect: DOMRect | null = null;

  private _getRect = () => {
    this._cachedRect === null && this._updateRect();
    return this._cachedRect as DOMRect;
  }

  protected _updateRect() {
    if (!this._dispatcher.rootElement) return;
    this._cachedRect = this._dispatcher.rootElement.getBoundingClientRect();
  }

  // XXX: polling is used instead of MutationObserver
  // due to potential performance issues
  private _pollingInterval: number | null = null;

  private _startPolling() {
    const poll = () => {
      nextTick()
        .then(() => this._updateRect())
        .catch(console.error);
    };
    this._pollingInterval = window.setInterval(poll, POLL_INTERVAL);
    poll();
  }

  dispose() {
    if (this._pollingInterval) {
      clearInterval(this._pollingInterval);
      this._pollingInterval = null;
    }
  }

  listen(root: BlockCraft.IBlockComponents['root']) {
    this._startPolling()
    this.controllers.forEach(c => c.listen(root))
  }
}
