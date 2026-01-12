import { debounceTime, fromEvent, skip, takeUntil } from "rxjs";
import { UIEventState, UIEventStateContext } from "../base";
import { EventScopeSourceType, EventSourceState, SelectEventState } from "../state";
import { isMac } from "lib0/environment";

export class SelectionControl {
  constructor(private _dispatcher: BlockCraft.EventDispatcher) {
  }

  private _isSelecting = false;
  private _shiftKeyPressing = false;
  private _mouseDown = false;
  private _lastSelectionString = ''; // 用于检测选区变化
  private _selectionChangeDebounceTimer: any = null;

  get isSelecting() {
    return this._isSelecting;
  }

  get shiftKeyPressing() {
    return this._shiftKeyPressing;
  }

  /**
   * 触发 selectStart 事件
   * 覆盖场景：鼠标拖拽、双击、三击、触摸操作
   */
  onSelectstart = (e: Event) => {
    this._isSelecting = true;
    this._dispatcher.run('selectStart', this._buildContext(e))

    // 键盘多选（Shift + 方向键）
    if (this._shiftKeyPressing) {
      // Shift键盘选择通过 keyup 或 selectionchange 结束
      this._setupKeyboardSelectionEnd();
    }
    // 鼠标/触摸选择
    else if (this._mouseDown) {
      // 监听拖拽开始（可能转为拖放操作）
      this._dispatcher.rootElement.addEventListener('dragstart', e => {
        if (!this._isSelecting) return;
        this._isSelecting = false;
        this._dispatcher.run('selectEnd', this._buildContext(e))
      }, { once: true, capture: true })

      // 监听鼠标/触摸释放（覆盖鼠标、触摸板、触屏）
      document.body.addEventListener('pointerup', e => {
        // 移除 pointerType 限制，支持所有指针类型
        if (!this._isSelecting) return;
        this._isSelecting = false;
        this._dispatcher.run('selectEnd', this._buildContext(e))
      }, { once: true, capture: true })
    }
  }

  /**
   * 为键盘选择设置结束监听
   */
  private _setupKeyboardSelectionEnd() {
    // Shift 键释放时结束选择
    const keyupHandler = (e: KeyboardEvent) => {
      if (!e.shiftKey && this._isSelecting) {
        this._isSelecting = false;
        this._dispatcher.run('selectEnd', this._buildContext(e));
      }
    };
    window.addEventListener('keyup', keyupHandler, { once: true, capture: true });
  }

  /**
   * 处理双击/三击选择结束
   */
  private _handleMultiClickEnd = (e: MouseEvent) => {
    if (this._isSelecting) {
      // 双击/三击后立即标记选择结束
      setTimeout(() => {
        if (this._isSelecting) {
          this._isSelecting = false;
          this._dispatcher.run('selectEnd', this._buildContext(e));
        }
      }, 0);
    }
  }

  /**
   * 通过 selectionchange 检测程序化选择
   */
  private _handleSelectionChange = () => {
    const selection = document.getSelection();
    if (!selection || selection.rangeCount === 0) {
      // 选区清空
      if (this._lastSelectionString) {
        this._lastSelectionString = '';
        if (this._isSelecting) {
          this._isSelecting = false;
          this._dispatcher.run('selectEnd', this._buildContext(new Event('selectionchange')));
        }
      }
      return;
    }

    const currentString = selection.toString();

    // 检测到选区从空变为非空（程序化选择开始）
    if (!this._lastSelectionString && currentString && !this._isSelecting) {
      // 不在用户主动选择中，可能是程序化选择
      if (!this._mouseDown && !this._shiftKeyPressing) {
        this._isSelecting = true;
        this._dispatcher.run('selectStart', this._buildContext(new Event('selectionchange')));

        // 设置延迟触发 selectEnd（处理快速的程序化选择）
        clearTimeout(this._selectionChangeDebounceTimer);
        this._selectionChangeDebounceTimer = setTimeout(() => {
          if (this._isSelecting) {
            this._isSelecting = false;
            this._dispatcher.run('selectEnd', this._buildContext(new Event('selectionchange')));
          }
        }, 100);
      }
    }
    // 检测选区从非空变为空或改变
    else if (this._lastSelectionString !== currentString) {
      // 如果正在通过 selectionchange 追踪，重置定时器
      if (!this._mouseDown && !this._shiftKeyPressing && this._isSelecting) {
        clearTimeout(this._selectionChangeDebounceTimer);
        this._selectionChangeDebounceTimer = setTimeout(() => {
          if (this._isSelecting) {
            this._isSelecting = false;
            this._dispatcher.run('selectEnd', this._buildContext(new Event('selectionchange')));
          }
        }, 100);
      }
    }

    this._lastSelectionString = currentString;
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
    // 1. 监听原生 selectstart 事件（鼠标拖拽、双击、三击）
    fromEvent<MouseEvent>(root.hostElement, 'selectstart').pipe(takeUntil(root.onDestroy$)).subscribe(e => {
      this.onSelectstart(e)
    });

    // 2. 监听键盘事件
    fromEvent<KeyboardEvent>(window, 'keydown', { capture: true }).pipe(takeUntil(root.onDestroy$)).subscribe(evt => {
      // 追踪 Shift 键状态
      if (evt.shiftKey) {
        this._shiftKeyPressing = true;
      }

      // Ctrl/Cmd + A 全选
      if (evt.key === 'a' && (isMac ? evt.metaKey : evt.ctrlKey)) {
        this._dispatcher.doc.selection.afterNextChange(sel => {
          if (sel && !sel.collapsed) {
            this._dispatcher.run('selectEnd', this._buildContext(evt))
          }
        })
      }
    })

    // 3. 键盘释放事件
    fromEvent<KeyboardEvent>(window, 'keyup', { capture: true }).pipe(takeUntil(root.onDestroy$)).subscribe(evt => {
      if (!evt.shiftKey) {
        this._shiftKeyPressing = false;

        // Shift 键释放时，如果有选区则触发 selectEnd
        if (this._isSelecting || !this._dispatcher.doc.selection.value?.collapsed) {
          this._isSelecting = false;
          this._dispatcher.run('selectEnd', this._buildContext(evt))
        }
      }
    })

    // 4. 监听鼠标按下（支持所有指针类型：鼠标、触摸板、触屏）
    fromEvent<PointerEvent>(root.hostElement, 'pointerdown', { capture: true }).pipe(takeUntil(root.onDestroy$)).subscribe(evt => {
      // 移除 pointerType 限制，支持所有类型的指针设备
      this._mouseDown = true;
    })

    // 5. 监听鼠标释放（重置状态）
    fromEvent<PointerEvent>(window, 'pointerup', { capture: true }).pipe(takeUntil(root.onDestroy$)).subscribe(evt => {
      this._mouseDown = false;
    })

    // 6. 监听双击事件（双击选中单词）
    fromEvent<MouseEvent>(root.hostElement, 'dblclick').pipe(takeUntil(root.onDestroy$)).subscribe(e => {
      this._handleMultiClickEnd(e);
    });
  }

  /**
   * 清理资源
   */
  dispose() {
    clearTimeout(this._selectionChangeDebounceTimer);
  }
}
