import {fromEvent, takeUntil} from "rxjs";
import {IS_MAC, IS_SAFARI} from "../../../global";
import {EventScopeSourceType, EventSourceState, KeyboardEventState} from "../state";
import {UIEventState, UIEventStateContext} from "../base";
import {EventOptions} from "../dispatcher";

/**
 * @description Keyboard event trigger\
 * If a modifier key is false, it is assumed to mean that modifier is not active. You may also pass null to mean any value for the modifier.
 */
export interface HotKeyTrigger {
  key: string | string[]
  ctrlKey?: boolean | null
  shiftKey?: boolean | null
  altKey?: boolean | null
  metaKey?: boolean | null
  shortKey?: boolean | null
}

const SHORT_KEY = IS_MAC ? 'metaKey' : 'ctrlKey';

export class KeyboardControl {
  constructor(private _dispatcher: BlockCraft.EventDispatcher) {
  }

  private _down = (event: KeyboardEvent) => {
    if (!this._shouldTrigger(event)) return;
    this._dispatcher.run('keyDown', this._createContext(event, new KeyboardEventState({
      event,
      selection: this._dispatcher.currentSelection!
    })));
  }

  private _up = (event: KeyboardEvent) => {
    if (!this._shouldTrigger(event)) return;
    this._dispatcher.run('keyUp', this._createContext(event, new KeyboardEventState({
      event,
      selection: this._dispatcher.currentSelection!
    })))
  }

  private _shouldTrigger = (event: KeyboardEvent) => {
    // evt.isComposing is false when pressing Enter/Backspace when composing in Safari
    if (event.isComposing || (IS_SAFARI && event.keyCode === 229 && (event.key === 'Enter' || event.key === 'Backspace'))) return false;
    const mod = IS_MAC ? event.metaKey : event.ctrlKey;
    return !(['c', 'v', 'x'].includes(event.key) &&
      mod &&
      !event.shiftKey &&
      !event.altKey);
  };

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

  private _isHotKeyMatch(keyBinding: HotKeyTrigger, event: KeyboardEvent) {
    for (const p in keyBinding) {
      if (p === 'key') {
        const bindKeys = keyBinding[p]
        if (typeof bindKeys === 'string' ? bindKeys !== event.key : !bindKeys.includes(event.key)) return false
        continue
      }
      // @ts-ignore
      if (keyBinding[p] !== null && !!keyBinding[p] !== event[p]) return false
    }
    return true
  }

  private _keyMap: Record<string, { binding: HotKeyTrigger, handler: BlockCraft.EventHandler, options?: EventOptions }> = {}

  bindHotKey(binding: HotKeyTrigger, handler: BlockCraft.EventHandler, options?: EventOptions) {
    const keys = typeof binding.key === 'string' ? [binding.key] : binding.key
    for (const key of keys) {
      if(binding.shortKey) {
        binding[SHORT_KEY] = binding.shortKey
        delete binding.shortKey
      }
      this._keyMap[key] = {binding, handler, options}
    }
    return this._dispatcher.add('keyDown', (context) => {
      const state = context.get('keyboardState')
      const key = state.raw.key
      if(!this._keyMap[key]) return
      const {binding, handler} = this._keyMap[key]
      if (!this._isHotKeyMatch(binding, context.getDefaultEvent())) return false
      return handler(context)
    })
  }

  listen(root: BlockCraft.IBlockComponents['root']) {
    fromEvent<KeyboardEvent>(root.hostElement, 'keydown').pipe(takeUntil(root.onDestroy$)).subscribe(this._down)
    fromEvent<KeyboardEvent>(root.hostElement, 'keyup').pipe(takeUntil(root.onDestroy$)).subscribe(this._up)
  }
}
