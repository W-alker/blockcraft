import {ORIGIN_SKIP_SYNC} from "../../doc";
import Delta from "quill-delta";
import {
  BindHotKey,
  BlockNodeType,
  DeltaInsert,
  DeltaOperation,
  DocEventRegister,
  EventListen,
  INLINE_ELEMENT_TAG,
  INLINE_END_BREAK_CLASS,
  INLINE_TEXT_NODE_TAG,
  STR_LINE_BREAK,
  UIEventStateContext
} from "../../block-std";
import {BlockSelection, INormalizedRange} from "../selection";
import {isZeroSpace} from "../../utils";
import {BlockCraftError, ErrorCode, performanceTest, sliceDelta} from "../../../global";
import {OneShotCursorAnchor} from "../../utils/one-shot-selection-anchor";

const ALLOW_INPUT_TYPES = new Set(['insertText', 'deleteContentBackward', 'deleteContentForward', 'insertReplacementText', 'insertCompositionText', 'deleteByCut'])

type CompositionSession = {
  blockId: string
  baselineDelta: DeltaInsert[]
  startIndex: number
  queuedRemoteDeltas: DeltaOperation[][]
  phase: 'active' | 'flushing'
}

@DocEventRegister
export class InputTransformer {
  private readonly _compositionAnchor: OneShotCursorAnchor
  private _compositionSession: CompositionSession | null = null
  private _nextInsertAttrs: {
    blockId: string
    index: number
    attrs?: DeltaInsert['attributes']
  } | null = null

  constructor(public readonly doc: BlockCraft.Doc) {
    this._compositionAnchor = new OneShotCursorAnchor(doc)
  }

  setNextInsertAttrs(attrs: DeltaInsert['attributes'], point: { blockId: string, index: number }) {
    this._nextInsertAttrs = {
      blockId: point.blockId,
      index: point.index,
      attrs
    }
  }

  hasNextInsertAttrs() {
    return this._nextInsertAttrs !== null
  }

  private matchNextInsertPoint(point: { blockId: string, index: number }, allowNearby = false) {
    if (!this._nextInsertAttrs) return false
    if (this._nextInsertAttrs.blockId !== point.blockId) return false
    return allowNearby
      ? Math.abs(this._nextInsertAttrs.index - point.index) <= 1
      : this._nextInsertAttrs.index === point.index
  }

  peekNextInsertAttrs(point: { blockId: string, index: number }, options?: { allowNearby?: boolean }) {
    if (!this._nextInsertAttrs) return undefined
    if (!this.matchNextInsertPoint(point, !!options?.allowNearby)) return undefined
    return this._nextInsertAttrs.attrs
  }

  clearNextInsertAttrs() {
    this._nextInsertAttrs = null
  }

  isCompositionLockedForBlock(blockId: string) {
    return this._compositionSession?.blockId === blockId
  }

  queueCompositionRemoteDelta(blockId: string, delta: DeltaOperation[]) {
    if (!this.isCompositionLockedForBlock(blockId)) return false
    this._compositionSession?.queuedRemoteDeltas.push(delta)
    return true
  }

  private consumeNextInsertAttrs(blockId: string, index: number, options?: { allowNearby?: boolean }) {
    if (!this._nextInsertAttrs) return undefined
    const hit = this.matchNextInsertPoint({
      blockId,
      index
    }, !!options?.allowNearby)
    if (!hit) return undefined
    const attrs = hit ? this._nextInsertAttrs.attrs : undefined
    this._nextInsertAttrs = null
    return attrs
  }

  private _beginCompositionSession() {
    const anchor = this._compositionAnchor.resolve()
    if (!anchor) {
      this._compositionSession = null
      return
    }

    this._compositionSession = {
      blockId: anchor.block.id,
      baselineDelta: anchor.block.textDeltas(),
      startIndex: anchor.index,
      queuedRemoteDeltas: [],
      phase: 'active'
    }
  }

  private _resetCompositionSession() {
    this._compositionSession = null
    this._compositionAnchor.reset()
  }

  private _composeRemoteDelta(session: CompositionSession) {
    return session.queuedRemoteDeltas.reduce(
      (acc, delta) => acc.compose(new Delta(delta)),
      new Delta()
    )
  }

  private _applyInsertAttrs(delta: Delta, attrs?: DeltaInsert['attributes']) {
    if (!attrs || !Object.keys(attrs).length || !delta.ops.length) {
      return delta
    }

    return new Delta(
      delta.ops.map(op => {
        if (typeof op.insert !== 'string') return op
        return {
          ...op,
          attributes: op.attributes ? {
            ...attrs,
            ...op.attributes
          } : attrs
        }
      })
    )
  }

  private _getCompositionDomCursorIndex(session: CompositionSession, selection: BlockSelection | null) {
    if (!selection || selection.from.type !== 'text' || selection.from.blockId !== session.blockId) {
      return session.startIndex
    }

    return selection.from.index + selection.from.length
  }

  @EventListen('compositionStart')
  private _handleCompositionStart(context: UIEventStateContext) {
    this._compositionAnchor.reset()
    const curSel = this.doc.selection.value!
    if (curSel.isAllSelected) {
      context.preventDefault();
      const curParent = curSel.lastBlock.parentBlock!
      const curParentSchema = this.doc.schemas.get(curParent.flavour)!
      if (!curParentSchema.metadata.renderUnit) {
        curSel.raw.collapse(true)
        return true
      }
      const p = this.doc.schemas.createSnapshot('paragraph', [])
      this.doc.crud.insertBlocksAfter(curSel.lastBlock.id, [p])
      this.doc.selection.setCursorAtBlock(p.id, true)
      this.doc.selection.recalculate()
      this._compositionAnchor.captureFromSelection({isComposing: true})
      this._beginCompositionSession()
      // this._deleteAllSelected(curSel)
      return true
    }

    if (curSel.from.type !== 'text') {
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
      this.doc.selection.recalculate()
      this._replaceText(curSel)
    }
    this._compositionAnchor.captureFromSelection({isComposing: true})
    this._beginCompositionSession()
    return true
  }

  @EventListen('compositionEnd')
  private _handleCompositionEnd(context: UIEventStateContext) {
    context.getDefaultEvent<CompositionEvent>()
    const session = this._compositionSession
    if (!session) {
      this._compositionAnchor.reset()
      return
    }

    session.phase = 'flushing'
    try {
      const {value: selection, next} = this.doc.selection.recalculate(false, {isComposing: true})
      const domCursorIndex = this._getCompositionDomCursorIndex(session, selection)

      let block: BlockCraft.BlockComponent
      try {
        block = this.doc.getBlockById(session.blockId)
      } catch {
        next?.()
        return
      }

      if (!this.doc.isEditable(block)) {
        next?.()
        return
      }

      const domDelta = this.doc.inlineManager.readDelta(block.containerElement)
      const remoteDelta = this._composeRemoteDelta(session)
      const insertAttrs = this.consumeNextInsertAttrs(block.id, session.startIndex, {allowNearby: true})
      const localDelta = this._applyInsertAttrs(
        new Delta(session.baselineDelta).diff(new Delta(domDelta)),
        insertAttrs
      )
      const rebasedLocal = session.queuedRemoteDeltas.length
        ? remoteDelta.transform(localDelta, true)
        : localDelta
      const rebasedStartIndex = session.queuedRemoteDeltas.length
        ? remoteDelta.transformPosition(session.startIndex, true)
        : session.startIndex
      const cursorIndex = Math.max(rebasedStartIndex, rebasedStartIndex + Math.max(0, domCursorIndex - session.startIndex))

      this.doc.crud.transact(() => {
        if (rebasedLocal.ops.length) {
          block.yText.applyDelta(rebasedLocal.ops as DeltaOperation[])
        }
      }, ORIGIN_SKIP_SYNC)

      block.rerender()

      queueMicrotask(() => {
        block.setInlineRange(cursorIndex)
      })
      next?.()
    } finally {
      this._resetCompositionSession()
    }
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

    const normalizedRange = this.doc.selection.normalizeRange(staticRange)
    // this.doc.selection.recalculate()
    // const normalizedRange = this.doc.selection.value!
    // const staticRange = normalizedRange.raw

    const {from, to, collapsed} = normalizedRange
    if (from.type === 'selected' && (!to || to.type === 'selected')) {
      ev.preventDefault()
      const p = this.doc.schemas.createSnapshot('paragraph', [])
      this.doc.crud.insertBlocksAfter((to || from).blockId, [p])
      this.doc.selection.setCursorAtBlock(p.id, true)
      this.doc.selection.recalculate()
      return
    }

    const text = getPlainTextFromInputEvent(ev)

    if (to) {
      ev.preventDefault()
      this._replaceText(normalizedRange, text)
      const cursorPos = from.type === 'text' ? from : (to.type === 'text' ? to : null)
      if (!cursorPos) {
        this.doc.selection.recalculate()
        return;
      }
      this.doc.selection.setSelection({
        ...cursorPos,
        index: cursorPos.index + (text?.length || 0),
        length: 0
      })
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
      document.getSelection()?.collapseToStart()
      this._replaceText(normalizedRange)
      this.doc.selection.recalculate()
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

    const pendingInsertAttrs = this.consumeNextInsertAttrs(from.block.id, from.index, {allowNearby: true})

    if (pendingInsertAttrs !== undefined) {
      ev.preventDefault()
      this.doc.crud.transact(() => {
        from.block.yText.insert(from.index, text, pendingInsertAttrs)
      })
      this.doc.selection.setSelection({
        ...from,
        index: from.index + text.length,
        length: 0
      })
      return
    }

    if (this.hasNextInsertAttrs()) {
      this.clearNextInsertAttrs()
    }

    this.doc.crud.transact(() => {
      from.block.yText.insert(from.index, text)
    }, ORIGIN_SKIP_SYNC)

  }

  private _replaceText(range: INormalizedRange, text?: string | null, merge = false) {
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
        const yText = from.block.yText
        yText.delete(from.index, from.length)
        text && yText.insert(from.index, text)

        if (to) {
          if ((to.type === 'text' && to.length >= to.block.textLength) || to.type === 'selected') {
            this.doc.crud.deleteBlockById(to.blockId)
          } else if (to.type === 'text' && (to.index > 0 || to.length > 0)) {
            if (merge) {
              const deltas: DeltaOperation[] = [...sliceDelta(to.block.textDeltas(), to.index + to.length, to.block.textLength)]
              deltas.unshift({retain: yText.length})
              yText.applyDelta(deltas)
              this.doc.crud.deleteBlockById(to.blockId)
            } else {
              const yText = to.block.yText
              yText.delete(to.index, to.length)
            }
          }
        }
        return
      }

      // 无法输入的情况
      if (to?.type !== 'text') return
      this.doc.crud.deleteBlockById(from.blockId)
      to.block.replaceText(to.index, to.length, text)
    })
  }

  private _deleteAllSelected(range: INormalizedRange) {
    const {from, to} = range
    const prevBlock = this.doc.prevSibling(range.from.block)
    if (prevBlock) {
      this.doc.selection.setCursorAtBlock(prevBlock, false)
    } else {
      const nextBlock = this.doc.nextSibling(range.to?.block || range.from.block)
      if (nextBlock) this.doc.selection.setCursorAtBlock(nextBlock, true)
      // else {
      //   const parent = range.from.block.parentBlock
      //   if (parent) {
      //     this.doc.selection.selectAllChildren(parent)
      //   }
      //   return true
      // }
    }
    this.doc.yDoc.transact(() => {
      if (!to) {
        this.doc.crud.deleteBlockById(from.blockId)
        return
      }
      const throughPath = this.doc.queryBlocksThroughPathDeeply(from.block, to.block)
      if (throughPath.length) {
        throughPath.forEach(through => {
          this.doc.crud.deleteBlocks(through.parent, through.index, through.length)
        })
      }
      this.doc.crud.deleteBlockById(from.blockId)
      this.doc.crud.deleteBlockById(to.blockId)
    })
    return true
  }

  deleteByRange(range: INormalizedRange, merge = false) {
    if (range.from.type === 'selected' && (!range.to || range.to.type === 'selected')) {
      return this._deleteAllSelected(range)
    }
    return this._replaceText(range, null, merge)
  }

  @BindHotKey({key: 'Backspace', shiftKey: null, shortKey: null, metaKey: false})
  private _handleBackspace(context: UIEventStateContext) {
    const state = context.get('keyboardState')
    const {from, isAllSelected, collapsed, to} = state.selection

    if (isAllSelected) {
      context.preventDefault()
      return this._deleteAllSelected(state.selection)
    }

    if (!collapsed || from.type !== 'text' || from.index !== 0) return false
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

    // 每一段的最前面
    if (from.block.props['heading']) {
      context.preventDefault()
      from.block.updateProps({
        heading: null
      })
      return true
    }

    if (from.block.props.depth) {
      context.preventDefault()
      from.block.updateProps({
        depth: from.block.props.depth - 1
      })
      return true
    }

    // paragraph块
    const prevBlock = this.doc.prevSibling(from.block)
    // 最前的block
    if (!prevBlock) {
      const parent = from.block.parentBlock

      if (parent) {
        context.preventDefault()

        // 如果是第一个空白的文本块，直接删除
        if (!from.block.textLength && parent.childrenLength > 1) {
          this.doc.selection.selectOrSetCursorAtBlock(parent.getChildrenByIndex(1), true)
          this.doc.crud.deleteBlockById(from.block.id)
          return true
        }

        if (parent.nodeType !== BlockNodeType.root) {
          // 选中父级
          this.doc.selection.selectBlock(parent)
        }

      }

      return true
    }

    // 有前一个兄弟块
    // 如果前一个兄弟块是可编辑块
    if (this.doc.isEditable(prevBlock)) {
      context.preventDefault()
      const deltas: DeltaOperation[] = from.block.textDeltas()
      deltas.unshift({retain: prevBlock.textLength})
      prevBlock.setInlineRange(prevBlock.textLength)
      prevBlock.applyDeltaOperations(deltas)
      this.doc.crud.deleteBlockById(from.block.id)
      this.doc.selection.recalculate()
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
      context.preventDefault()
      return this._deleteAllSelected(state.selection)
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
        from.block.applyDeltaOperations(deltas)
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
    const _newDepth = (fromBlock.props.depth || 0) + (state.raw.shiftKey ? -1 : 1)
    if (!prevBlock || _newDepth < 0) {
      this.doc.messageService.warn('当前内容块已到最小缩进层级')
      return true
    }

    if (!state.raw.shiftKey && _newDepth > _prevDepth + 1) {
      this.doc.messageService.warn('当前内容块已到最大缩进层级')
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
      })
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
    const {from, to, collapsed, isAllSelected, raw} = state.selection

    context.preventDefault()

    if (isAllSelected) {
      const p = this.doc.schemas.createSnapshot('paragraph', [[], from.block.props])
      await (state.raw.ctrlKey ? this.doc.crud.insertBlocksBefore(state.selection.firstBlock, [p]) : this.doc.crud.insertBlocksAfter(state.selection.lastBlock, [p]))
      this.doc.selection.setCursorAtBlock(p.id, true)
      return true
    }

    if (!collapsed) {
      const winSel = window.getSelection()!
      if (from.type === 'text') {
        winSel.setPosition(raw.startContainer, raw.startOffset)
      } else {
        winSel.setPosition(raw.endContainer, raw.endOffset)
      }
      this._replaceText(state.selection)
      return true
    }

    if (from.type !== 'text') return false

    // 强制同段换行
    if (state.raw.shiftKey) {
      from.block.insertText(from.index, STR_LINE_BREAK)
      from.block.setInlineRange(from.index + 1)
      return true
    }

    // 空段落
    if (!from.block.textLength) {

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

    // 在前面换行
    if (from.index === 0) {
      const p = this.doc.schemas.createSnapshot(from.block.flavour, [[], {
        ...from.block.props,
        heading: null
      }])
      this.doc.crud.insertBlocksBefore(from.block, [p])
        // .then(() => {
        //   this.doc.selection.selectOrSetCursorAtBlock(p.id, true)
        // })
      return true
    }

    const deltas = sliceDelta(from.block.textDeltas(), from.index)
    const p = this.doc.schemas.createSnapshot(
      (from.block.textLength && !from.block.heading && from.block.flavour !== 'blockquote') ? from.block.flavour : 'paragraph', [deltas, {
        ...from.block.props,
        heading: null,
      }])
    this.doc.crud.transact(() => {
      from.block.deleteText(from.index)
      this.doc.crud.insertBlocksAfter(from.block, [p]).then(() => {
        this.doc.selection.selectOrSetCursorAtBlock(p.id, true)
      })
    })
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
