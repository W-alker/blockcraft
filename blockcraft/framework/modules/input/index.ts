import {ORIGIN_SKIP_SYNC} from "../../doc";
import {
  BindHotKey,
  BlockNodeType,
  DeltaOperation,
  DocEventRegister,
  EventListen,
  INLINE_ELEMENT_TAG,
  INLINE_END_BREAK_CLASS,
  INLINE_TEXT_NODE_TAG,
  STR_LINE_BREAK,
  STR_ZERO_WIDTH_SPACE,
  UIEventStateContext
} from "../../block-std";
import {INormalizedRange} from "../selection";
import {isZeroSpace} from "../../utils";
import {BlockCraftError, ErrorCode, nextTick, sliceDelta} from "../../../global";

const ALLOW_INPUT_TYPES = new Set(['insertText', 'deleteContentBackward', 'deleteContentForward', 'insertReplacementText', 'insertCompositionText', 'deleteByCut'])

@DocEventRegister
export class InputTransformer {
  constructor(public readonly doc: BlockCraft.Doc) {
  }

  @EventListen('compositionStart')
  private _handleCompositionStart(context: UIEventStateContext) {
    const curSel = this.doc.selection.value!
    if (curSel.from.type !== 'text') {
      // const clone = curSel.raw.cloneRange()
      // clone.collapse(false)
      // let sel = window.getSelection()!
      // this.doc.root.hostElement.blur()
      // sel.removeAllRanges();
      // setTimeout(() => {
      //   sel.addRange(clone);
      //   clone.detach()
      // }, 0);

      if (!curSel.to || curSel.to.type !== 'text') {
        throw new BlockCraftError(ErrorCode.InlineEditorError, 'compositionStart: last block is not editable')
      }
    }

    if (!curSel.collapsed) {
      const winSel = window.getSelection()!
      if (curSel.from.type === 'text') {
        winSel.setPosition(curSel.raw.startContainer, curSel.raw.startOffset)
      } else {
        winSel.setPosition(curSel.raw.endContainer, curSel.raw.endOffset)
      }
      this._replaceText(curSel)
    }
    return true
  }

  @EventListen('compositionEnd')
  private _handleCompositionEnd(context: UIEventStateContext) {
    const ev = context.get('defaultState').event as CompositionEvent
    ev.preventDefault()
    this.doc.selection.recalculate()
    const sel = this.doc.selection.value!
    if (sel.from.type !== 'text') {
      throw new BlockCraftError(ErrorCode.InlineEditorError, `Invalid inputRange`)
    }
    const text = ev.data
    const {block, index} = sel.from
    this.doc.crud.transact(() => {
      block.yText.insert(index, text)
      // TODO: 更好的中文输入法反显渲染
      if (index === 0 || sel.raw.startContainer.parentElement?.localName !== INLINE_TEXT_NODE_TAG) {
        block.rerender()

        requestAnimationFrame(() => {
          block.setInlineRange(index + text.length)
        })
      }
    }, ORIGIN_SKIP_SYNC)
  }

  @EventListen('beforeInput')
  private _handleBeforeInput(context: BlockCraft.EventStateContext) {
    const ev = context.get('defaultState').event as InputEvent
    if (!ALLOW_INPUT_TYPES.has(ev.inputType)) {
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

    const {from, to, collapsed} = normalizedRange
    const text = getPlainTextFromInputEvent(ev)

    this.doc.crud.transact(() => {
      if (to) {
        ev.preventDefault()
        this._replaceText(normalizedRange, text)
        if (from.type === 'text') {
          this.doc.selection.setSelection({
            ...from,
            index: from.index + (text?.length || 0),
            length: 0
          })
        }
        return;
      }

      // delete content
      if (from.type === 'text' && ev.inputType.startsWith('delete')) {
        ev.preventDefault()
        // 要删除的可能是embed节点
        if (staticRange.startContainer === staticRange.endContainer && isZeroSpace(staticRange.startContainer) && normalizedRange.from.type === 'text') {
          normalizedRange.from.index = normalizedRange.from.index - 1
          normalizedRange.from.length = 1
        }
        this._replaceText(normalizedRange)
        this.doc.selection.recalculate()
        // from.block.yText.delete(from.index, from.length)
        return;
      }

      if (!text) return;

      // in zero text
      if (collapsed && isZeroSpace(staticRange.startContainer)) {
        ev.preventDefault()
        const zeroTextEle = staticRange.startContainer.parentElement!
        const textElement: HTMLElement = document.createElement(INLINE_TEXT_NODE_TAG)
        textElement.textContent = text
        // <c-element><embed></embed><c-zero-text>ZWS;↓</c-zero-text></c-element>
        if (zeroTextEle.parentElement?.localName === INLINE_ELEMENT_TAG) {
          const cloneElement = zeroTextEle.parentElement.cloneNode(false) as HTMLElement
          cloneElement.appendChild(textElement)
          zeroTextEle.parentElement.after(cloneElement)
        } else {
          // <paragraph><c-zero-text>ZWS;↓</c-zero-text></paragraph>
          const cElement = document.createElement(INLINE_ELEMENT_TAG)
          cElement.appendChild(textElement)
          zeroTextEle.after(cElement)
        }
        document.getSelection()!.setPosition(textElement.firstChild!, text.length)
      }

      // in inline end break
      if (collapsed && staticRange.startContainer instanceof HTMLElement && staticRange.startContainer.classList.contains(INLINE_END_BREAK_CLASS)) {
        const prevElement = staticRange.startContainer.previousElementSibling!
        const child = prevElement.firstElementChild as HTMLElement | null
        if (prevElement.localName === INLINE_ELEMENT_TAG && child?.isContentEditable) {
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
      if (!collapsed) {
        ev.preventDefault()
        from.block.replaceText(from.index, from.length, text)
        this.doc.selection.setSelection({
          ...from,
          index: from.index + (text?.length || 0),
          length: 0
        })
        return
      }
      from.block.yText.insert(from.index, text)

    }, ORIGIN_SKIP_SYNC)
  }

  private _replaceText(range: INormalizedRange, text?: string | null) {
    const {from, to, collapsed} = range
    if (collapsed) return

    this.doc.crud.transact(() => {
      if (to) {
        const throughPath = this.doc.queryBlocksThroughPathDeeply(from.block, to.block)
        if (throughPath.length) {
          throughPath.forEach(through => {
            this.doc.crud.deleteBlocks(through.parent, through.index, through.length)
          })
        }
      }

      if (from.type === 'text') {
        const deltas: DeltaOperation[] = []
        from.index > 0 && deltas.push({retain: from.index})
        from.length > 0 && deltas.push({delete: from.length})
        text && deltas.push({insert: text})

        if (to) {
          if (to.type === 'text' && (to.index > 0 || to.length > 0)) {
            deltas.push(...sliceDelta(to.block.textDeltas(), to.index + to.length, to.block.textLength))
            this.doc.crud.deleteBlockById(to.blockId)
          } else if (to.type === 'selected') {
            to && this.doc.crud.deleteBlockById(to.blockId)
          }
        }

        from.block.applyDeltaOperation(deltas)
        return
      }

      from.type === 'selected' && this.doc.crud.deleteBlockById(from.blockId)
      // 无法输入的情况
      if (to?.type !== 'text') return
      this.doc.crud.deleteBlockById(from.blockId)
      to.block.replaceText(to.index, to.length, text)
    }, ORIGIN_SKIP_SYNC)
  }

  @BindHotKey({key: 'Backspace', shiftKey: null, shortKey: null, metaKey: false})
  private _handleBackspace(context: UIEventStateContext) {
    const state = context.get('keyboardState')
    const {from, isAllSelected, collapsed, to} = state.selection

    if (isAllSelected) {
      context.preventDefault()
      const prevBlock = this.doc.prevSibling(from.block)
      if (prevBlock) {
        this.doc.selection.setCursorAtBlock(prevBlock, false)
      } else {
        const nextBlock = this.doc.nextSibling(from.block)
        if (nextBlock) {
          this.doc.selection.setCursorAtBlock(nextBlock, true)
        } else {
          return true
        }
      }
      this._replaceText(state.selection)
      return true
    }

    if (!collapsed || from.type !== 'text' || from.index !== 0) return false
    // 每一段的最前面
    if (from.block.props['heading']) {
      context.preventDefault()
      from.block.updateProps({
        heading: null
      })
      return true
    }

    // 非paragraph块转化
    if (from.block.flavour !== 'paragraph') {
      context.preventDefault()
      const schema = this.doc.schemas.get(from.block.flavour)!
      if (schema.metadata.isLeaf) return true
      const deltas = from.block.textDeltas()
      const np = this.doc.schemas.createSnapshot('paragraph', [deltas, from.block.props])
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
      if (!from.block.textLength && parent?.nodeType === BlockNodeType.root && this.doc.root.childrenLength > 1) {
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
    !from.block.textLength && this.doc.crud.deleteBlockById(from.block.id)
    context.preventDefault()
    return true
  }

  @BindHotKey({key: 'Delete', shiftKey: null, shortKey: null, metaKey: false})
  private _handleDelete(context: UIEventStateContext) {
    const state = context.get('keyboardState')

    const {from, isAllSelected, collapsed} = state.selection
    // 无法正常删除的情况
    if (isAllSelected) {
      const nextBlock = this.doc.nextSibling(from.block)
      if (nextBlock) {
        this.doc.selection.setCursorAtBlock(nextBlock, true)
      } else {
        const prevBlock = this.doc.prevSibling(from.block)
        if (prevBlock) {
          this.doc.selection.setCursorAtBlock(prevBlock, false)
        } else {
          return true
        }
      }
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

    const prevBlock = this.doc.prevSibling(fromBlock)
    const _prevDepth = prevBlock ? (prevBlock.props.depth ?? 0) : 0
    const _newDepth = fromBlock.props.depth + (state.raw.shiftKey ? -1 : 1)
    if (!prevBlock || _newDepth < 0) {
      this.doc.messageService.warn('不可缩进')
      return true
    }

    if (!state.raw.shiftKey && _newDepth > _prevDepth + 1) {
      this.doc.messageService.warn('不可缩进')
      return true
    }

    if (state.selection.to) {
      const blocks = this.doc.queryBlocksBetween(fromBlock, state.selection.to.block, true)
      this.doc.crud.transact(() => {
        for (const id of blocks) {
          const b = this.doc.getBlockById(id)
          if (!b
            // || !this.doc.isEditable(b)
          ) return
          // @ts-ignore
          const old = (b.props['depth'] || 0) as number
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

  @BindHotKey({key: 'Enter', shiftKey: null, ctrlKey: null})
  private async _handlerEnter(context: UIEventStateContext) {
    const state = context.get('keyboardState')
    const {from, to, collapsed, isAllSelected} = state.selection
    if (isAllSelected) {
      // const nextBlock = this.doc.nextSibling(endBlock)
      // if (nextBlock) {
      //   this.doc.isEditable(nextBlock) ? nextBlock.setInlineRange(0) : this.doc.selection.selectBlock(nextBlock)
      // } else {
      context.preventDefault()

      const p = this.doc.schemas.createSnapshot('paragraph', [[], from.block.props])
      await (state.raw.ctrlKey ? this.doc.crud.insertBlocksBefore(state.selection.firstBlock, [p]) : this.doc.crud.insertBlocksAfter(state.selection.lastBlock, [p]))
      this.doc.selection.setCursorAtBlock(p.id, true)
      // }
      return true
    }

    if (!collapsed) {
      this._replaceText(state.selection)
      context.preventDefault()
      return true
    }

    if (from.type !== 'text') return false

    // 强制同段换行
    if (state.raw.shiftKey) {
      from.block.insertText(from.index, STR_LINE_BREAK)
      from.block.setInlineRange(from.index + 1)
      context.preventDefault()
      return true
    }

    // 空段落
    if (!from.block.textLength) {
      context.preventDefault()

      if (from.block.props.heading) {
        from.block.updateProps({
          heading: null
        })
        return true
      }

      if (from.block.props.depth > 0) {
        from.block.updateProps({
          depth: from.block.props.depth - 1
        })
        return true
      }

      const p = this.doc.schemas.createSnapshot('paragraph', [[], from.block.props])
      if (from.block.flavour !== 'paragraph') {
        await this.doc.crud.replaceWithSnapshots(from.blockId, [p])
      } else {
        await this.doc.crud.insertBlocksAfter(from.block, [p])
      }
      this.doc.selection.selectOrSetCursorAtBlock(p.id, true)
      return true
    }

    const deltas = sliceDelta(from.block.textDeltas(), from.index)
    const p = this.doc.schemas.createSnapshot(from.block.textLength ? from.block.flavour : 'paragraph', [deltas, from.block.props])
    context.preventDefault()
    this.doc.crud.transact(() => {
      from.block.deleteText(from.index)
      this.doc.crud.insertBlocksAfter(from.block, [p]).then(() => {
        this.doc.selection.selectOrSetCursorAtBlock(p.id, true)
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

