import {ORIGIN_SKIP_SYNC} from "../../doc";
import {
  INLINE_ELEMENT_TAG,
  INLINE_END_BREAK_CLASS,
  INLINE_TEXT_NODE_TAG,
  STR_LINE_BREAK,
  STR_ZERO_WIDTH_SPACE
} from "../../inline";
import {IBlockRange, INormalizedRange} from "../selection";
import {isZeroSpace} from "../../utils";
import {BlockNodeType, DeltaOperation} from "../../types";
import {sliceDelta} from "../../../global";
import {BindHotKey, DocEventRegister, EventListen, EventNames} from "../../event";
import {UIEventStateContext} from "../../event/base";

const ALLOW_INPUT_TYPES = new Set(['insertText', 'deleteContentBackward', 'deleteContentForward', 'insertReplacementText', 'insertCompositionText', 'deleteByCut'])

@DocEventRegister
export class InputTransformer {

  private _composeRange: IBlockRange | null = null
  private _preventCompositionText = false

  constructor(public readonly doc: BlockCraft.Doc) {
  }

  @EventListen(EventNames.compositionStart)
  private _handleCompositionStart(context: UIEventStateContext) {
    const curSel = this.doc.selection.value!
    this._composeRange = curSel.from.type === "text" ? curSel.from : curSel.to
    if (!curSel.collapsed) {
      document.getSelection()!.getRangeAt(0).collapse(curSel.from.type === 'text')
      this._replaceText(curSel)
    }
    // if (curSel.isAllSelected) {
    //   // 防止此时不可选中，但是删除后浏览器自动跳转到合适的文本位置做输入操作，此时记录的输入位置丢失，导致视图数据不一致
    //   const _sub = this.doc.selection.selectionChange$.pipe(takeUntil(fromEvent(document, 'compositionEnd').pipe(take(1)))).subscribe(sel => {
    //     if (!sel) return
    //     if (sel.from.type === 'text') {
    //       this._composeRange = sel.from
    //       _sub.unsubscribe()
    //     }
    //   })
    // }
    return true
  }

  @EventListen(EventNames.compositionEnd)
  private _handleCompositionEnd(context: UIEventStateContext) {
    const ev = context.get('defaultState').event as CompositionEvent
    ev.preventDefault()
    this.doc.crud.transact(() => {
      if (this._composeRange?.type !== 'text') return
      this._composeRange!.block.yText.insert(this._composeRange!.index, ev.data)
      // TODO: 更好的中文输入法反显渲染
      this._composeRange!.block.rerender()
      this._composeRange.block.setInlineRange(this._composeRange!.index + ev.data.length)
      this._composeRange = null
    }, ORIGIN_SKIP_SYNC)
  }

  @EventListen(EventNames.beforeInput)
  private _handleBeforeInput(context: BlockCraft.EventStateContext) {
    const ev = context.get('defaultState').event as InputEvent
    if (this._preventCompositionText || !ALLOW_INPUT_TYPES.has(ev.inputType)) {
      ev.preventDefault()
      return
    }

    if (ev.isComposing || ev.defaultPrevented) {
      return
    }

    const staticRange = ev.getTargetRanges ? ev.getTargetRanges()[0] : null;
    if (!staticRange) {
      return;
    }

    const normalizedRange = this.doc.selection.normalizeRange(staticRange)!
    // TODO: clear console
    console.log(staticRange, normalizedRange)

    const {from, to, collapsed} = normalizedRange
    const text = getPlainTextFromInputEvent(ev)

    this.doc.crud.transact(() => {
      if (!collapsed) {
        ev.preventDefault()
        this._replaceText(normalizedRange, text)
        document.getSelection()!.getRangeAt(0).collapse(from.type === 'text')
        return;
      }

      if (!text) return;

      // in zero text
      if (collapsed && staticRange.startContainer instanceof Text && isZeroSpace(staticRange.startContainer)) {
        const zeroTextEle = staticRange.startContainer.parentElement!
        // <c-element><embed></embed><c-zero-text>ZWS;↓</c-zero-text></c-element>
        const textElement: HTMLElement = document.createElement(INLINE_TEXT_NODE_TAG)
        textElement.textContent = STR_ZERO_WIDTH_SPACE
        if (zeroTextEle.parentElement?.localName === INLINE_ELEMENT_TAG) {
          const cloneElement = zeroTextEle.parentElement.cloneNode(false) as HTMLElement
          cloneElement.replaceChildren(textElement)
          zeroTextEle.parentElement.after(cloneElement)
        } else {
          // <paragraph><c-zero-text>ZWS;↓</c-zero-text></paragraph>
          const cElement = document.createElement(INLINE_ELEMENT_TAG)
          cElement.replaceChildren(textElement)
          zeroTextEle.after(cElement)
        }
        document.getSelection()!.selectAllChildren(textElement)
      }

      // in inline end break
      if (collapsed && staticRange.startContainer instanceof HTMLElement && staticRange.startContainer.classList.contains(INLINE_END_BREAK_CLASS)) {
        const prevElement = staticRange.startContainer.previousElementSibling!
        const child = prevElement.firstElementChild
        if (prevElement.localName === INLINE_ELEMENT_TAG && child?.localName === INLINE_TEXT_NODE_TAG) {
          const len = child.textContent!.length;
          (child.firstChild as Text).insertData(len, text)
          document.getSelection()!.setPosition(child.firstChild!, len + text.length)
          ev.preventDefault()
        } else {
          const cElement = document.createElement(INLINE_ELEMENT_TAG)
          const textElement: HTMLElement = document.createElement(INLINE_TEXT_NODE_TAG)
          textElement.textContent = text
          cElement.appendChild(textElement)
          staticRange.startContainer.before(cElement)
          document.getSelection()!.setPosition(textElement.firstChild!, text.length)
          ev.preventDefault()
        }
      }

      if (from.type !== 'text') return
      from.block.yText.insert(from.index, text)

    }, ORIGIN_SKIP_SYNC)
  }

  private _replaceText(range: INormalizedRange, text?: string | null) {
    const {from, to, collapsed} = range
    if (collapsed) return

    this.doc.crud.transact(() => {
      if (from.type === 'text') {
        from.block.replaceText(from.index, from.length, text)
        // inline
        if (!to) return;
      }

      if (to) {
        const throughPath = this.doc.queryBlocksThroughPathDeeply(from.block, to.block)
        if (throughPath.length) {
          throughPath.forEach(through => {
            this.doc.crud.deleteBlocks(through.parent, through.index, through.length)
          })
        }
      }
      from.type === 'selected' && this.doc.crud.deleteBlockById(from.blockId)
      to?.type === 'selected' && this.doc.crud.deleteBlockById(to.blockId)

      if (to?.type === 'text') {
        if (from.type !== "text") {
          to.block.replaceText(to.index, to.length, text)
        } else {
          to.block.deleteText(to.index, to.length)
        }
      }

    }, ORIGIN_SKIP_SYNC)
  }

  @BindHotKey({key: 'Backspace', shiftKey: null, shortKey: null, metaKey: false})
  private _handleBackspace(context: UIEventStateContext) {
    const state = context.get('keyboardState')

    const {from, isAllSelected, collapsed} = state.selection
    if (isAllSelected) {
      document.getSelection()!.modify('move', 'backward', 'character')
      this._replaceText(state.selection)
      context.preventDefault()
      return true
    }

    if (!collapsed || from.type !== 'text' || from.index !== 0) return false
    // 每一段的最前面
    // 非paragraph块转化
    if (from.block.flavour !== 'paragraph') {
      const deltas = from.block.textDeltas()
      const np = this.doc.schemas.createSnapshot('paragraph', [deltas])
      context.preventDefault()
      this.doc.crud.replaceWithSnapshots(from.block.id, [np]).then(() => {
        // 强制触发selectionChange
        this.doc.selection.setSelection({
          index: 0,
          length: 0,
          type: 'text',
          blockId: np.id
        })
      })
      return true
    }

    // paragraph块
    const prevBlock = this.doc.prevSibling(from.block)
    // 最前的block
    if (!prevBlock) {
      // 如果有非root父级
      const parent = from.block.parentBlock
      if (parent && parent.nodeType !== BlockNodeType.root) {
        // 选中父级
        this.doc.selection.selectBlock(parent)
        context.preventDefault()
        return true
      }

      // 如果是根节点下第一个空白的文本块，直接删除
      if (!from.block.textLength && parent?.nodeType === BlockNodeType.root) {
        this.doc.crud.deleteBlockById(from.block.id)
        context.preventDefault()
        return true
      }
      return true
    }

    // 有前一个兄弟块
    // 如果前一个兄弟块是可编辑块
    if (this.doc.isEditable(prevBlock)) {
      const deltas: DeltaOperation[] = from.block.textDeltas()
      deltas.unshift({retain: prevBlock.textLength})
      prevBlock.setInlineRange(prevBlock.textLength)
      prevBlock.applyDeltaOperation(deltas)
      this.doc.crud.deleteBlockById(from.block.id)
      context.preventDefault()
      return true
    }

    this.doc.selection.selectBlock(prevBlock)
    this.doc.crud.deleteBlockById(from.block.id)
    context.preventDefault()
    return true
  }

  @BindHotKey({key: 'Delete', shiftKey: null, shortKey: null, metaKey: false})
  private _handleDelete(context: UIEventStateContext) {
    const state = context.get('keyboardState')

    const {from, isAllSelected, collapsed} = state.selection
    // 无法正常删除的情况
    if (isAllSelected) {
      document.getSelection()!.modify('move', 'forward', 'character')
      this._replaceText(state.selection)
      context.preventDefault()
      return true
    }

    const nextBlock = this.doc.nextSibling(from.block)
    if (!collapsed || from.type !== 'text' || from.index !== from.block.textLength) return false
    // 每一段的最后面

    if (nextBlock) {
      // 有下一个兄弟块
      // 如果下一个兄弟块是可编辑块
      if (this.doc.isEditable(nextBlock)) {
        const deltas: DeltaOperation[] = nextBlock.textDeltas()
        deltas.unshift({retain: from.block.textLength})
        from.block.setInlineRange(from.block.textLength)
        from.block.applyDeltaOperation(deltas)
        this.doc.crud.deleteBlockById(nextBlock.id)
        context.preventDefault()
        return true
      } else {
        this.doc.selection.selectBlock(nextBlock)
        context.preventDefault()
        return true
      }
    }

    const parent = from.block.parentBlock
    if (parent && parent.nodeType !== BlockNodeType.root) {
      // 选中父级
      this.doc.selection.selectBlock(parent)
      context.preventDefault()
      return true
    }
    return false
  }

  @BindHotKey({key: 'Tab', shiftKey: null})
  private _handlerTab(context: UIEventStateContext) {
    const state = context.get('keyboardState')

    context.preventDefault()
    const fromBlock = state.selection.from.block
    if (fromBlock.nodeType !== BlockNodeType.editable) {
      this.doc.logger.warn('该类型块不可缩进')
      return true
    }

    const prevBlock = this.doc.prevSibling(fromBlock)
    // @ts-ignore
    const _prevDepth: number = prevBlock ? (prevBlock.props['depth'] ?? 0) : 0
    const _newDepth = fromBlock.props.depth + (state.raw.shiftKey ? -1 : 1)
    if (!prevBlock || _newDepth > (_prevDepth + 1) || _newDepth < 0) {
      this.doc.logger.warn('不可缩进')
      return true
    }

    if (state.selection.to) {
      const blocks = this.doc.queryBlocksBetween(fromBlock, state.selection.to.block, true)
      this.doc.crud.transact(() => {
        for (const id of blocks) {
          const b = this.doc.getBlockById(id)
          if (!b || !this.doc.isEditable(b)) return
          const old = b.props['depth'] as number
          if (state.raw.shiftKey && old === 0) return;
          b.updateProps({
            depth: old + (state.raw.shiftKey ? -1 : 1)
          })
        }
      }, ORIGIN_SKIP_SYNC)
    } else {
      fromBlock.updateProps({
        depth: _newDepth
      })
    }
    return true
  }

  @BindHotKey({key: 'Enter', shiftKey: null})
  private _handlerEnter(context: UIEventStateContext) {
    const state = context.get('keyboardState')
    const {from, to, collapsed, isAllSelected} = state.selection
    const endBlock = to ? to.block : from.block
    if (isAllSelected) {
      const nextBlock = this.doc.nextSibling(endBlock)
      if (nextBlock) {
        this.doc.isEditable(nextBlock) ? nextBlock.setInlineRange(0) : this.doc.selection.selectBlock(nextBlock)
      } else {
        const p = this.doc.schemas.createSnapshot('paragraph', [])
        this.doc.crud.insertBlocksAfter(endBlock, [p]).then(() => {
          this.doc.selection.setSelection({
            type: 'text',
            index: 0,
            length: 0,
            blockId: p.id
          })
        })
      }
      context.preventDefault()
      return true
    }

    if (!collapsed) {
      this._replaceText(state.selection)
      context.preventDefault()
      return true
    }

    if (from.type !== 'text') return false

    // 空段落减少缩进
    if (from.block.props.depth > 0 && from.block.textLength === 0) {
      from.block.updateProps({
        depth: from.block.props.depth - 1
      })
      context.preventDefault()
      return true
    }

    // 强制同段换行
    if (state.raw.shiftKey) {
      from.block.insertText(from.index, STR_LINE_BREAK)
      from.block.setInlineRange(from.index + 1)
      context.preventDefault()
      return true
    }

    const deltas = sliceDelta(from.block.textDeltas(), from.index)
    const p = this.doc.schemas.createSnapshot(from.block.flavour, [deltas, from.block.props])
    context.preventDefault()
    this.doc.crud.transact(() => {
      from.block.deleteText(from.index)
      this.doc.crud.insertBlocksAfter(from.block, [p]).then(() => {
        this.doc.selection.setSelection({
          length: 0,
          index: 0,
          blockId: p.id,
          type: 'text'
        })
      })
    }, ORIGIN_SKIP_SYNC)
    return true
  }

}

function getPlainTextFromInputEvent(event: InputEvent) {
  // When `inputType` is "insertText":
  // - `event.data` should be string (Safari uses `event.dataTransfer`).
  // - `event.dataTransfer` should be null.
  // When `inputType` is "insertReplacementText":
  // - `event.data` should be null.
  // - `event.dataTransfer` should contain "text/plain" data.

  if (typeof event.data === 'string') {
    return event.data;
  }
  if (event.dataTransfer?.types.includes('text/plain')) {
    return event.dataTransfer.getData('text/plain');
  }
  return null;
}

