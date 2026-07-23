import {fromEvent, takeUntil} from "rxjs";
import {IS_MAC, IS_SAFARI} from "../../../../global";
import {EventScopeSourceType, EventSourceState, KeyboardEventState} from "../state";
import {UIEventState, UIEventStateContext} from "../base";
import {EventOptions} from "../dispatcher";
import {isNativeInputTarget} from "../../../utils";

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
  private readonly _hotKeyRegistrations = new Set<{
    binding: HotKeyTrigger
    handler: BlockCraft.EventHandler
    options?: EventOptions
  }>()

  constructor(private _dispatcher: BlockCraft.EventDispatcher) {
  }

  private _down = (event: KeyboardEvent) => {
    if (!this._shouldTrigger(event)) return;
    const keyboardState = this._createKeyboardEventState(event)
    if (!keyboardState) {
      if (this._runRootHotKeyWithoutSelection(event)) return
      this._handleMissingSelection(event, true)
      return
    }
    this._dispatcher.run('keyDown', this._createContext(event, keyboardState));
  }

  private _up = (event: KeyboardEvent) => {
    if (!this._shouldTrigger(event)) return;
    const keyboardState = this._createKeyboardEventState(event)
    if (!keyboardState) {
      this._handleMissingSelection(event, false)
      return
    }
    this._dispatcher.run('keyUp', this._createContext(event, keyboardState))
  }

  private _shouldTrigger = (event: KeyboardEvent) => {
    // evt.isComposing is false when pressing Enter/Backspace when composing in Safari
    if (event.isComposing || (IS_SAFARI && event.keyCode === 229 && (event.key === 'Enter' || event.key === 'Backspace'))) return false;
    if (isNativeInputTarget(event.target)) return false
    const mod = IS_MAC ? event.metaKey : event.ctrlKey;
    return !(['c', 'v', 'x'].includes(event.key) &&
      mod &&
      !event.shiftKey &&
      !event.altKey)
  };

  private _createKeyboardEventState(event: KeyboardEvent): KeyboardEventState | null {
    const selection = this._dispatcher.currentSelection
    if (!selection) return null

    try {
      return new KeyboardEventState({
        event,
        selection
      })
    } catch {
      return null
    }
  }

  private _runRootHotKeyWithoutSelection(event: KeyboardEvent): boolean {
    const root = this._dispatcher.doc.root
    const rootId = this._dispatcher.doc.rootId ?? root?.id
    if (!root || !rootId) return false

    const matches = [...this._hotKeyRegistrations].filter(registration =>
      registration.options?.blockId === rootId &&
      this._isHotKeyMatch(registration.binding, event)
    )
    if (!matches.length) return false

    const point = {blockId: rootId, type: 'selected', block: root}
    const selection = {
      start: point,
      end: point,
      commonParent: rootId,
      collapsed: true,
      isInSameBlock: true,
      firstBlock: root,
      lastBlock: root,
    } as unknown as BlockCraft.Selection
    const context = this._createContext(
      event,
      new KeyboardEventState({event, selection}),
    )

    for (const registration of matches) {
      const result = registration.handler(context)
      if (context.isStopPropagation) return true
      if (result) {
        context.stopPropagation()
        return true
      }
    }
    return false
  }

  private _handleMissingSelection(event: KeyboardEvent, preventMutation: boolean) {
    if (preventMutation && this._shouldPreventDefaultForStaleSelection(event)) {
      event.preventDefault()
    }
    this._dispatcher.doc.selection?.blur?.()
  }

  private _shouldPreventDefaultForStaleSelection(event: KeyboardEvent) {
    return event.key.length === 1 || ['Backspace', 'Delete', 'Enter'].includes(event.key)
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


  bindHotKey(binding: HotKeyTrigger, handler: BlockCraft.EventHandler, options?: EventOptions) {
    const _binding = {...binding}
    if (binding.shortKey) {
      _binding[SHORT_KEY] = binding.shortKey
      delete _binding.shortKey
    }
    const registration = {binding: _binding, handler, options}
    this._hotKeyRegistrations.add(registration)
    const remove = this._dispatcher.add('keyDown', (context) => {
      const state = context.get('keyboardState')
      if (!this._isHotKeyMatch(_binding, state.raw)) return false
      return handler(context)
    }, options)
    return () => {
      this._hotKeyRegistrations.delete(registration)
      remove()
    }
  }

  listen(root: BlockCraft.IBlockComponents['root']) {
    fromEvent<KeyboardEvent>(root.hostElement, 'keydown').pipe(takeUntil(root.onDestroy$)).subscribe(this._down)
    fromEvent<KeyboardEvent>(root.hostElement, 'keyup').pipe(takeUntil(root.onDestroy$)).subscribe(this._up)
  }
}
