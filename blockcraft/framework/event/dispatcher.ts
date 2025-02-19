import {UIEventHandler} from "./base";

const bypassEventNames = [
  'beforeInput',

  'blur',
  'focus',
  'contextMenu',
  'wheel',
] as const;

const eventNames = [
  'click',
  'doubleClick',
  'tripleClick',

  'pointerDown',
  'pointerMove',
  'pointerUp',
  'pointerOut',

  'dragStart',
  'dragMove',
  'dragEnd',

  'pinch',
  'pan',

  'keyDown',
  'keyUp',

  'selectionChange',
  'compositionStart',
  'compositionUpdate',
  'compositionEnd',

  'cut',
  'copy',
  'paste',

  'nativeDragStart',
  'nativeDragMove',
  'nativeDragEnd',
  'nativeDrop',

  ...bypassEventNames,
] as const;

export type EventName = (typeof eventNames)[number];
export type EventOptions = {
  flavour?: string;
  blockId?: string;
};
export type EventHandlerRunner = {
  fn: UIEventHandler;
  flavour?: string;
  blockId?: string;
};

export class UIEventDispatcher {

  private _handlersMap = Object.fromEntries(
    eventNames.map((name): [EventName, Array<EventHandlerRunner>] => [name, []])
  ) as Record<EventName, Array<EventHandlerRunner>>;

  constructor(readonly doc: BlockCraft.Doc) {
  }

  /**
   * add event handler
   * @param name
   * @param handler
   * @param options
   * @return remove handler function
   */
  add(name: EventName, handler: UIEventHandler, options?: EventOptions) {
    const runner: EventHandlerRunner = {
      fn: handler,
      flavour: options?.flavour,
      blockId: options?.blockId,
    };
    this._handlersMap[name].unshift(runner);
    return () => {
      if (this._handlersMap[name].includes(runner)) {
        this._handlersMap[name] = this._handlersMap[name].filter(x => x !== runner);
      }
    };
  }


}
