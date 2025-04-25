import {fromEvent, Subject, take, takeUntil, throttleTime} from "rxjs";
import {EventScopeSourceType, EventSourceState} from "../state";
import {UIEventState, UIEventStateContext} from "../base";
import {EventNames} from "../dispatcher";

export class DndControl {
  constructor(private _dispatcher: BlockCraft.EventDispatcher) {
  }

  private _startEvent: DragEvent | null = null
  private _prevEvent: DragEvent | null = null

  private dragState$ = new Subject<'start' | 'move' | 'end'>();

  onDragStart(evt: DragEvent) {
    this._startEvent = evt;
    this._dispatcher.run(EventNames.dragStart, this._createContext(evt))
  }

  onDragEnter(evt: DragEvent) {
    this._dispatcher.run(EventNames.dragEnter, this._createContext(evt))
  }

  onDragMove(evt: DragEvent) {
    this._dispatcher.run(EventNames.dragMove, this._createContext(evt))
  }

  onDragLeave(evt: DragEvent) {
    this._dispatcher.run(EventNames.dragLeave, this._createContext(evt))
  }

  onDragEnd(evt: DragEvent) {
    this._dispatcher.run(EventNames.dragEnd, this._createContext(evt))
    this._startEvent = null
  }

  onDrop(evt: DragEvent) {
    this._dispatcher.run(EventNames.drop, this._createContext(evt))
  }

  private _createContext(event: DragEvent) {
    return UIEventStateContext.from(
      new UIEventState(event),
      new EventSourceState({
        event,
        sourceType: EventScopeSourceType.Target,
      }),
      // new DragState({event, startEvent: this._startEvent, prevEvent: this._prevEvent})
    );
  }

  /**
   * 创建拖拽链, 独立于Event Dispatcher机制(不会影响)
   * @param target 拖拽目标
   * @param events
   * @returns
   */
  createChains(target: HTMLElement,
               events: {
                 onDragStart?: BlockCraft.EventHandler,
                 onDragEnter?: BlockCraft.EventHandler,
                 onDragMove?: BlockCraft.EventHandler,
                 onDragLeave?: BlockCraft.EventHandler,
                 onDragEnd?: BlockCraft.EventHandler
               }
  ) {

    const {onDragStart, onDragEnter, onDragMove, onDragLeave, onDragEnd} = events

    return fromEvent<DragEvent>(target, 'dragstart').subscribe(evt => {
      this._startEvent = evt
      this.dragState$.next('start');
      onDragStart?.(this._createContext(evt))

      this.dragState$.next('move');

      onDragEnter && fromEvent<DragEvent>(this._dispatcher.rootElement, 'dragenter').pipe(takeUntil(this.dragState$.pipe(take(1))))
        .subscribe(evt => {
          onDragEnter?.(this._createContext(evt))
        })

      onDragMove && fromEvent<DragEvent>(this._dispatcher.rootElement, 'dragover').pipe(takeUntil(this.dragState$.pipe(take(1))))
        .subscribe(evt => {
          onDragMove?.(this._createContext(evt))
        })

      onDragLeave && fromEvent<DragEvent>(this._dispatcher.rootElement, 'dragleave').pipe(takeUntil(this.dragState$.pipe(take(1))))
        .subscribe(evt => {
          onDragLeave?.(this._createContext(evt))
        })

      fromEvent<DragEvent>(target, 'dragend').pipe(take(1)).subscribe(evt => {
        onDragEnd?.(this._createContext(evt))
        this.dragState$.next('end');
      })

    })

  }

  listen(root: BlockCraft.IBlockComponents['root']) {
    fromEvent<DragEvent>(root.hostElement, 'dragstart').pipe(takeUntil(root.onDestroy$)).subscribe(evt => {
      this.onDragStart(evt)
    })

    fromEvent<DragEvent>(root.hostElement, 'dragenter').pipe(takeUntil(root.onDestroy$)).subscribe(evt => {
      this.onDragEnter(evt)
    })

    fromEvent<DragEvent>(root.hostElement, 'dragover').pipe(takeUntil(root.onDestroy$), throttleTime(20)).subscribe(evt => {
      this.onDragMove(evt)
    })

    fromEvent<DragEvent>(root.hostElement, 'dragleave').pipe(takeUntil(root.onDestroy$)).subscribe(evt => {
      this.onDragLeave(evt)
    })

    fromEvent<DragEvent>(root.hostElement, 'dragend').pipe(takeUntil(root.onDestroy$)).subscribe(evt => {
      this.onDragEnd(evt)
    })

    fromEvent<DragEvent>(root.hostElement, 'drop').pipe(takeUntil(root.onDestroy$)).subscribe(evt => {
      this.onDrop(evt)
    })
  }


}
