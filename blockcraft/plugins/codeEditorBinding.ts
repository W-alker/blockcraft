import {
  BindHotKey,
  DeltaOperation,
  DocPlugin, EventListen, isZeroSpace, OneShotCursorAnchor, ORIGIN_SKIP_SYNC,
  STR_LINE_BREAK,
  STR_TAB,
  UIEventStateContext
} from "../framework";
import {BlockCraftError, ErrorCode, getLinesByRange, getScrollContainer} from "../global";

export class CodeInlineEditorBinding extends DocPlugin {
  // private _compositionAnchor: OneShotCursorAnchor | null = null

  // private get compositionAnchor() {
  //   return this._compositionAnchor ||= new OneShotCursorAnchor(this.doc)
  // }
  //
  // @EventListen('compositionStart', {flavour: 'code'})
  // @EventListen('compositionStart', {flavour: 'mermaid-textarea'})
  // private _handleCompositionStart() {
  //   this.compositionAnchor.reset()
  //   this.compositionAnchor.captureFromSelection({isComposing: true})
  // }

  @EventListen('compositionEnd', {flavour: 'code'})
  @EventListen('compositionEnd', {flavour: 'mermaid-textarea'})
  private _handleCompositionEnd(context: UIEventStateContext) {
    const ev = context.getDefaultEvent<CompositionEvent>()
    // ev.preventDefault()
    try {
      const {value: sel, next} = this.doc.selection.recalculate(false, {isComposing: true})
      if (!sel || sel.from.type !== 'text') {
        throw new BlockCraftError(ErrorCode.InlineEditorError, `Invalid inputRange`)
      }

      const text = ev.data

      const {block, index} = sel.from
      const isZero = isZeroSpace(sel.raw.startContainer)

      this.doc.crud.transact(() => {
        block.yText.insert(isZero ? index : index - text.length, text)
      }, ORIGIN_SKIP_SYNC)

      block.rerender()
      // if (block.flavour === 'code' && block.props.lang === 'PlainText') {
      // }
      //
      requestAnimationFrame(() => {
        block.setInlineRange(isZero ? text.length + index : index)
      })
      next?.()
      return true
    } finally {
    }
  }

  @BindHotKey({key: 'Enter', shiftKey: null}, {flavour: 'code'})
  @BindHotKey({key: 'Enter', shiftKey: null}, {flavour: 'mermaid-textarea'})
  handleEnterKey(context: UIEventStateContext) {
    if (this.doc.isReadonly) return
    const state = context.get('keyboardState')
    const {from, to, raw} = state.selection
    if (to || from.type !== 'text') return false
    const block = from.block

    // 代码块强制换新行
    if (state.raw.shiftKey && from.block.flavour === 'code') {
      context.preventDefault()
      const splitText = block.textContent().slice(from.index + from.length)
      block.deleteText(from.index, block.textLength - from.index)
      const np = this.doc.schemas.createSnapshot('paragraph', [splitText, block.props])
      this.doc.crud.insertBlocksAfter(block, [np]).then(() => {
        this.doc.selection.setCursorAtBlock(np.id, true)
      })
      return true
    }

    if (from.length !== 0) {
      block.deleteText(from.index, from.length)
    }
    const currLine = block.textContent().slice(0, from.index).split(STR_LINE_BREAK).at(-1)
    const tabs = (currLine?.split(STR_TAB).length || 1) - 1
    const deltas: DeltaOperation[] = [
      {retain: from.index},
      {insert: STR_LINE_BREAK + (tabs ? STR_TAB.repeat(tabs) : '')},
    ]
    block.applyDeltaOperations(deltas)
    const range = block.setInlineRange(from.index + STR_LINE_BREAK.length + tabs * STR_TAB.length)
    block.flavour === 'code' && block.props.h && scrollIntoNearestParentY(range.startContainer.parentElement!)
    return true
  }

  @BindHotKey({key: 'Tab', shiftKey: null}, {flavour: 'code'})
  @BindHotKey({key: 'Tab', shiftKey: null}, {flavour: 'mermaid-textarea'})
  handleTabKey(context: UIEventStateContext) {
    if (this.doc.isReadonly) return
    const state = context.get('keyboardState')
    const {from, to, raw} = state.selection
    if (to || from.type !== 'text') return false
    context.preventDefault()
    const block = from.block

    // collapsed
    if (from.length === 0) {
      if (!state.raw.shiftKey) {
        block.insertText(from.index, STR_TAB)
        block.setInlineRange(from.index + STR_TAB.length)
        return true
      }

      if (from.index === 0) return true
      const prevStr = block.textContent().at(from.index - 1)
      prevStr === STR_TAB && block.deleteText(from.index - 1, 1)
      return true
    }

    const lines = getLinesByRange(block.textContent(), from.index, from.index + from.length)
    let before = lines.before.reduce((prev, curr) => prev + curr.length, 0)
    const deltas: DeltaOperation[] = []

    if (!state.raw.shiftKey) {
      deltas.push({retain: before}, {insert: STR_TAB})
      for (let i = 1; i < lines.current.length; i++) {
        deltas.push({retain: lines.current[i - 1].length}, {insert: STR_TAB})
      }
    } else {
      for (let i = 0; i < lines.current.length; i++) {
        const line = lines.current[i]
        const startStr = line[0]
        if (startStr === STR_TAB) {
          deltas.push({retain: before}, {delete: 1})
          before = -1
        }
        before += line.length
      }
    }

    if (!deltas.length) return true
    block.applyDeltaOperations(deltas)
    this.doc.selection.recalculate()
    return true
  }

  init(): void {
  }

  destroy(): void {
  }

}

/**
 * 滚动目标元素或光标所在行到最近可滚动父级可视区
 * @param {HTMLElement} target - 元素或选区
 * @param {object} [opts]
 * @param {'auto'|'smooth'} [opts.behavior='auto']
 */
function scrollIntoNearestParentY(target: HTMLElement, {behavior = 'auto'} = {}) {
  if (!target) return;

  // 找到最近可滚动父级
  const parent = getScrollContainer(target);
  const rect = target.getBoundingClientRect()
  const elHeight = rect.height;
  const offset = elHeight

  // 计算在父容器中的位置
  const parentRect = parent.getBoundingClientRect();
  const topInParent = rect.top - parentRect.top + parent.scrollTop;
  const bottomInParent = rect.bottom - parentRect.top + parent.scrollTop;
  const visibleTop = parent.scrollTop + offset;
  const visibleBottom = parent.scrollTop + parent.clientHeight - offset;

  let targetScrollTop = parent.scrollTop;

  if (elHeight <= parent.clientHeight - 2 * offset) {
    // 元素能完整显示时：只在超出可视区才滚
    if (topInParent < visibleTop) {
      targetScrollTop = topInParent - offset + rect.height;
    } else if (bottomInParent > visibleBottom) {
      targetScrollTop = bottomInParent - parent.clientHeight + offset;
    }
  } else {
    // 元素太高：尽量让顶部可见
    if (topInParent < visibleTop || bottomInParent > visibleBottom) {
      targetScrollTop = topInParent - offset + rect.height;
    }
  }

  // 限制范围
  targetScrollTop = Math.max(0, Math.min(targetScrollTop, parent.scrollHeight - parent.clientHeight));
  if (Math.abs(targetScrollTop - parent.scrollTop) < 1) return;

  if (behavior === 'smooth' && parent.scrollTo) {
    parent.scrollTo({top: targetScrollTop + rect.height, behavior});
  } else {
    parent.scrollTop = targetScrollTop + rect.height
  }
}
