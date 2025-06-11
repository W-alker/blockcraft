import {fromEvent, takeUntil} from "rxjs";
import {UIEventState, UIEventStateContext} from "../base";
import {EventScopeSourceType, EventSourceState} from "../state";

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
    console.log('----------onSelectstart----------', e, this._shiftKeyPressing, this._mouseDown)
    this._isSelecting = true;
    this._dispatcher.run('selectStart', this._buildContext(e))
    // 键盘多选
    if (this._shiftKeyPressing) {

    } else if (this._mouseDown) {
      // 鼠标滑动选择
      document.body.addEventListener('mouseup', e => {
        this._isSelecting = false;
        this._dispatcher.run('selectEnd', this._buildContext(e))
      }, {once: true})
    }
  }

  private _buildContext = (event: Event) => {
    return UIEventStateContext.from(
      new UIEventState(event),
      new EventSourceState({event, sourceType: EventScopeSourceType.Selection})
    )
  }

  listen(root: BlockCraft.IBlockComponents['root']) {
    fromEvent<MouseEvent>(root.hostElement, 'selectstart').pipe(takeUntil(root.onDestroy$)).subscribe(this.onSelectstart);
    fromEvent<KeyboardEvent>(root.hostElement, 'keydown').pipe(takeUntil(root.onDestroy$)).subscribe(evt => {
      if (evt.shiftKey) {
        this._shiftKeyPressing = true;
      }
    })
    fromEvent<KeyboardEvent>(root.hostElement, 'keyup').pipe(takeUntil(root.onDestroy$)).subscribe(evt => {
      if (!evt.shiftKey) {
        this._shiftKeyPressing = false;

        if (this._isSelecting) {
          this._isSelecting = false;
          this._dispatcher.run('selectEnd', this._buildContext(evt))
        }
      }
    })
    fromEvent<MouseEvent>(root.hostElement, 'mousedown').pipe(takeUntil(root.onDestroy$)).subscribe(evt => {
      if (evt.button === 0) this._mouseDown = true;
    })
  }
}
