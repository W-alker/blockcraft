import {BlockCraftError, ErrorCode} from "../../../global";

type MatchEvent<T extends string> = T extends BlockCraftUIEventStateType
  ? BlockCraftUIEventState[T]
  : UIEventState;

export class UIEventState {
  /** when extends, override it with pattern `xxxState` */
  type = 'defaultState';

  constructor(public event: Event) {
  }
}

export class UIEventStateContext {
  private _map: Record<string, UIEventState> = {};

  private _isStopPropagation = false;

  get isStopPropagation() {
    return this._isStopPropagation;
  }

  get defaultPrevented() {
    return this.getDefaultEvent().defaultPrevented;
  }

  getDefaultEvent<T extends Event = Event>() {
    return this.get('defaultState').event as T;
  }

  preventDefault() {
    this.getDefaultEvent().preventDefault();
  }

  stopPropagation() {
    this._isStopPropagation = true;
    this.getDefaultEvent().stopPropagation()
  }

  add = <State extends UIEventState = UIEventState>(state: State) => {
    const name = state.type;
    if (this._map[name]) {
      console.warn('UIEventStateContext: state name duplicated', name);
    }

    this._map[name] = state;
  }

  get = <Type extends BlockCraftUIEventStateType = BlockCraftUIEventStateType>(type: Type): MatchEvent<Type> => {
    const state = this._map[type];
    if (!state) {
      throw new BlockCraftError(
        ErrorCode.EventDispatcherError,
        `UIEventStateContext: state ${type} not found`
      );
    }
    return state as MatchEvent<Type>;
  }

  has = <Type extends BlockCraftUIEventStateType = BlockCraftUIEventStateType>(type: Type): boolean => {
    return !!this._map[type];
  }

  static from(...states: UIEventState[]) {
    const context = new UIEventStateContext();
    states.forEach(state => {
      context.add(state);
    });
    return context;
  }
}

declare global {
  namespace BlockCraft {
    type EventHandler = (context: UIEventStateContext) => boolean | null | undefined | void;
    type EventStateContext = UIEventStateContext
  }

  interface BlockCraftUIEventState {
    defaultState: UIEventState;
  }

  type BlockCraftUIEventStateType = keyof BlockCraftUIEventState;
}
