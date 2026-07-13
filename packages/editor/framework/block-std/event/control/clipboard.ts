import {fromEvent, takeUntil} from "rxjs";
import {UIEventState, UIEventStateContext} from "../base";
import {ClipboardEventState, EventScopeSourceType, EventSourceState} from "../state";
import {isNativeInputTarget} from "../../../utils";
import {isSelectionAlive} from "../../../modules/selection/liveness";

export class ClipboardControl {
  constructor(private _dispatcher: BlockCraft.EventDispatcher) {
  }

  listen(root: BlockCraft.IBlockComponents['root']) {
    // When a block is in `selected` state we set its host to
    // `contenteditable=false` and let inner ZWS gap spans stay editable.
    // The browser then treats the ZWS span as the editing host and
    // `document.activeElement` is no longer root itself — so we accept any
    // active element that lives *inside* root.
    //
    // Readonly 模式下没有任何 contenteditable=true 的元素，activeElement 通常
    // 是 body；但用户仍可用鼠标选中编辑器内的文本。此时用原生 Selection 兜底：
    // 只有整段选区都被 root 包含（commonAncestor 在 root 内）时才算编辑器持有，
    // 跨越编辑器边界的选区不会被误判。
    const isEditorFocused = () => {
      const ae = document.activeElement
      if (ae && root.hostElement.contains(ae)) return true
      const sel = document.getSelection()
      if (!sel || sel.rangeCount === 0) return false
      try {
        const range = sel.getRangeAt(0)
        return root.hostElement.contains(range.commonAncestorContainer)
      } catch {
        return false
      }
    }
    const isNativeClipboardTarget = (ev: ClipboardEvent) =>
      isNativeInputTarget(ev.target) || isNativeInputTarget(document.activeElement)

    fromEvent<ClipboardEvent>(document, 'copy').pipe(takeUntil(root.onDestroy$)).subscribe(ev => {
      if (isNativeClipboardTarget(ev)) return
      if (!isEditorFocused()) return
      // copy 不修改文档，readonly 模式也允许走 adapter 流程
      this._runWithSelection('copy', ev)
    })
    fromEvent<ClipboardEvent>(document, 'cut').pipe(takeUntil(root.onDestroy$)).subscribe(ev => {
      if (isNativeClipboardTarget(ev)) return
      if (!isEditorFocused()) return
      if (this._dispatcher.status.isReadOnly) {
        ev.preventDefault()
        return
      }
      this._runWithSelection('cut', ev, true)
    })
    fromEvent<ClipboardEvent>(document, 'paste').pipe(takeUntil(root.onDestroy$)).subscribe(ev => {
      if (isNativeClipboardTarget(ev)) return
      if (!isEditorFocused()) return
      if (this._dispatcher.status.isReadOnly) {
        ev.preventDefault()
        return
      }
      this._runWithSelection('paste', ev, true)
    })
  }

  private _runWithSelection(name: 'copy' | 'cut' | 'paste', event: ClipboardEvent, preventDefaultIfMissing = false) {
    const selection = this._dispatcher.currentSelection
    if (!selection) {
      if (preventDefaultIfMissing) event.preventDefault()
      return
    }
    if (!isSelectionAlive(selection as any, this._dispatcher.doc ?? {})) {
      if (preventDefaultIfMissing) event.preventDefault()
      this._dispatcher.doc?.selection?.blur?.()
      return
    }
    this._dispatcher.run(name, this._createContext(event, selection))
  }

  private _createContext(event: ClipboardEvent, selection: BlockCraft.Selection) {
    return UIEventStateContext.from(
      new UIEventState(event),
      new ClipboardEventState({event, selection}),
      new EventSourceState({event, sourceType: EventScopeSourceType.Selection})
    )
  }

}
