import {fromEvent, takeUntil} from "rxjs";
import {UIEventState, UIEventStateContext} from "../base";
import {EventScopeSourceType, EventSourceState, SelectEventState} from "../state";
import {isMac} from "lib0/environment";

export class SelectionControl {
  constructor(private _dispatcher: BlockCraft.EventDispatcher) {
  }

  private _isSelecting = false;
  private _shiftKeyPressing = false;
  private _mouseDown = false;

  get isSelecting() {
    return this._isSelecting;
  }

  onSelectstart = (e: Event) => {
    this._isSelecting = true;
    this._dispatcher.run('selectStart', this._buildContext(e))
    // 键盘多选
    if (this._shiftKeyPressing) {

    } else if (this._mouseDown) {
      this._dispatcher.rootElement.addEventListener('dragstart', e => {
        if (!this._isSelecting) return;
        this._isSelecting = false;
        this._dispatcher.run('selectEnd', this._buildContext(e))
      }, {once: true, capture: true})
      // 鼠标滑动选择
      document.body.addEventListener('pointerup', e => {
        if (e.pointerType !== 'mouse' || !this._isSelecting) return;
        this._isSelecting = false;
        this._dispatcher.run('selectEnd', this._buildContext(e))
      }, {once: true, capture: true})
    }
  }

  private _buildContext = (event: Event) => {
    return UIEventStateContext.from(
      new UIEventState(event),
      new EventSourceState({
        event,
        sourceType: this._isSelecting ? EventScopeSourceType.Target : EventScopeSourceType.Selection
      }),
      new SelectEventState({
        event,
        trigger: this._mouseDown ? 'mouse' : 'keyboard',
        state: this._isSelecting ? 'start' : 'end'
      })
    )
  }

  listen(root: BlockCraft.IBlockComponents['root']) {
    fromEvent<MouseEvent>(root.hostElement, 'selectstart').pipe(takeUntil(root.onDestroy$)).subscribe(e => {
      if (this._shiftKeyPressing) {
        this._dispatcher.run('selectEnd', this._buildContext(e))
        return
      }
      this.onSelectstart(e)
    });
    fromEvent<KeyboardEvent>(root.hostElement, 'keydown', {capture: true}).pipe(takeUntil(root.onDestroy$)).subscribe(evt => {
      if (evt.shiftKey) {
        this._shiftKeyPressing = true;
      }
      if (evt.key === 'a' &&
        (isMac ? evt.metaKey : evt.ctrlKey)) {
        this._dispatcher.doc.selection.afterNextChange(sel => {
          if (sel && !sel.collapsed) {
            this._dispatcher.run('selectEnd', this._buildContext(evt))
          }
        })
      }
    })
    fromEvent<KeyboardEvent>(root.hostElement, 'keyup', {capture: true}).pipe(takeUntil(root.onDestroy$)).subscribe(evt => {
      if (!evt.shiftKey) {
        this._shiftKeyPressing = false;

        if (this._isSelecting) {
          this._isSelecting = false;
          this._dispatcher.run('selectEnd', this._buildContext(evt))
        }
      }
    })
    fromEvent<PointerEvent>(root.hostElement, 'pointerdown', {capture: true}).pipe(takeUntil(root.onDestroy$)).subscribe(evt => {
      if (evt.pointerType !== 'mouse') return;
      if (evt.button === 0) this._mouseDown = true;
    })
  }
}
