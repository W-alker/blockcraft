import {UIEventState, UIEventStateContext} from "./base";
import {EventScopeSourceType, EventSourceState} from "./state";
import {BlockCraftError, ErrorCode, performanceTest} from "../../../global";
import {KeyboardControl, CompositionControl, ClipboardControl, DndControl, MouseControl} from "./control";
import {fromEvent, take, takeUntil} from "rxjs";
import {closetBlockId} from "../../utils";
import {HasEventTargetAddRemove} from "rxjs/internal/observable/fromEvent";

const bypassEditorEventName = ['beforeInput', 'focusOut', 'focusIn', 'contextMenu', 'wheel'] as Array<EditorEventName>

export type EventOptions = {
  flavour?: BlockCraft.BlockFlavour
  blockId?: string;
};
export type EventHandlerRunner = {
  fn: BlockCraft.EventHandler;
  flavour?: BlockCraft.BlockFlavour;
  blockId?: string;
};

export type EditorEventName =
  | 'beforeInput'
  | 'focusOut'
  | 'focusIn'
  | 'contextMenu'
  | 'wheel'
  | 'click'
  | 'doubleClick'
  | 'tripleClick'
  // | 'pointerDown'
  // | 'pointerMove'
  // | 'pointerUp'
  // | 'pointerOut'
  | 'mouseDown'
  | 'mouseMove'
  | 'mouseUp'
  | 'mouseEnter'
  | 'mouseLeave'
  | 'dragStart'
  | 'dragEnter'
  | 'dragMove'
  | 'dragLeave'
  | 'dragEnd'
  | 'drop'
  | 'pinch'
  | 'pan'
  | 'keyDown'
  | 'keyUp'
  | 'selectionChange'
  | 'compositionStart'
  | 'compositionUpdate'
  | 'compositionEnd'
  | 'cut'
  | 'copy'
  | 'paste';


export class UIEventDispatcher {

  private _handlersMap = {} as Record<EditorEventName, Array<EventHandlerRunner>>;

  private readonly compositionControl = new CompositionControl(this)
  private keyboardControl = new KeyboardControl(this)
  // private pointerControl = new PointerControl(this)
  private clipboardControl = new ClipboardControl(this)
  private dndControl = new DndControl(this)
  private mouseControl = new MouseControl(this)

  constructor(private doc: BlockCraft.Doc) {
    this.doc.afterInit(this._bindEvents)
  }

  get rootElement() {
    return this.doc.root.hostElement
  }

  get isReadOnly() {
    return this.doc.isReadonly
  }

  get isComposing() {
    return this.compositionControl.isComposing
  }

  customListen<T extends Event = Event>(target: HasEventTargetAddRemove<unknown> | ArrayLike<HasEventTargetAddRemove<unknown>>,
                                             eventName: string,
                                             config?: { once?: true }) {
    const s = fromEvent<T>(target, eventName).pipe(takeUntil(this.doc.onDestroy$))
    if (config?.once) {
      s.pipe(take(1))
    }
    return s
  }

  bindHotkey = (...args: Parameters<KeyboardControl['bindHotKey']>) =>
    this.keyboardControl.bindHotKey(...args);

  /**
   * add event handler
   * @param name
   * @param handler
   * @param options
   * @return remove handler function
   */
  add(name: EditorEventName, handler: BlockCraft.EventHandler, options?: EventOptions) {
    const runner: EventHandlerRunner = {
      fn: handler,
      flavour: options?.flavour,
      blockId: options?.blockId,
    };
    this._handlersMap[name] ||= []
    this._handlersMap[name].push(runner);
    return () => {
      if (this._handlersMap[name].includes(runner)) {
        this._handlersMap[name] = this._handlersMap[name].filter(x => x !== runner);
      }
    };
  }

  private _bindEvents = (root: BlockCraft.IBlockComponents['root']) => {
    bypassEditorEventName.forEach(eventName => {
      fromEvent(root.hostElement, eventName.toLowerCase(), {passive: eventName === 'wheel' ? false : undefined})
        .pipe(takeUntil(root.onDestroy$))
        .subscribe(event => {
          this.run(
            eventName,
            UIEventStateContext.from(
              new UIEventState(event),
              new EventSourceState({
                event,
                sourceType: EventScopeSourceType.Selection,
              })
            )
          );
        })
    })
    // fromEvent(document, 'selectionchange').pipe(takeUntil(root.onDestroy$)).subscribe(ev => {
    //   this.run(
    //     EditorEventName.selectionChange,
    //     UIEventStateContext.from(
    //       new UIEventState(ev),
    //       new EventSourceState({
    //         sourceType: EventScopeSourceType.Selection,
    //         event: ev,
    //       })
    //     ))
    // })

    this.compositionControl.listen(root)
    this.keyboardControl.listen(root)
    // this.pointerControl.listen(root)
    this.clipboardControl.listen(root)
    this.dndControl.listen(root)
    this.mouseControl.listen(root)
  }

  hasHandler(name: EditorEventName) {
    return this._handlersMap[name].length > 0
  }

  get currentSelection() {
    return this.doc.selection.value
  }

  private _runEventsBySelection(name: EditorEventName, context: UIEventStateContext) {
    const handlers = this._handlersMap[name];
    if (!handlers) return;

    const selection = this.currentSelection!
    if (!selection) return;
    this._runEvents(name, [selection.commonParent], context)
  }

  private _runEventsByTarget(name: EditorEventName, context: UIEventStateContext) {
    const handlers = this._handlersMap[name];
    if (!handlers) return;

    const target = context.get('defaultState').event.target as HTMLElement
    const blockId = closetBlockId(target)
    if (!blockId) throw new BlockCraftError(ErrorCode.EventDispatcherError, `cannot find blockId for target ${target}`)
    this._runEvents(name, [blockId], context)
  }

  private _runEventScope(runners: EventHandlerRunner[], context: UIEventStateContext): boolean {
    for (const h of runners) {
      const res = h.fn(context)
      // 如果用户手动阻止了冒泡
      if (context.isStopPropagation) return true
      // 停止冒泡
      if (res) {
        context.stopPropagation()
        return true
      }
    }
    return false
  }

  @performanceTest('event dispatcher')
  private _runEvents(name: EditorEventName, blocks: string[], context: UIEventStateContext) {
    const handlers = this._handlersMap[name];
    if (!handlers?.length) return;

    let blockIds = blocks;
    while (blockIds.length > 0) {
      const _blocks = blockIds.map(blockId => this.doc.getBlockById(blockId))
      // 优先id匹配
      const idHandlers = handlers.filter(h => h.blockId && blockIds.includes(h.blockId));
      const flavourHandlers = handlers.filter(h => h.flavour && _blocks.some(block => block.flavour === h.flavour));

      const res = this._runEventScope(idHandlers.concat(flavourHandlers), context)
      if (res) return

      blockIds = _blocks.map(b => b.parentId).filter(Boolean) as string[]
    }

    if (context.isStopPropagation) return;
    // 如果没有匹配到，则执行全局事件
    const hs = handlers.filter(handler => handler.flavour === undefined && handler.blockId === undefined)
    this._runEventScope(hs, context)
  }

  run(
    name: EditorEventName,
    context: UIEventStateContext,
    runners?: EventHandlerRunner[]
  ) {

    if (runners) {
      this._runEventScope(runners, context)
      return
    }

    const sourceState = context.get('sourceState');
    switch (sourceState.sourceType) {
      case EventScopeSourceType.Selection:
        this._runEventsBySelection(name, context);
        break;
      case EventScopeSourceType.Target:
        this._runEventsByTarget(name, context);
        break;
    }
  }

}

declare global {
  namespace BlockCraft {
    type EventDispatcher = UIEventDispatcher
  }
}
