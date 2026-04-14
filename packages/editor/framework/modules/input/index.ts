import {ORIGIN_SKIP_SYNC} from "../../doc";
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
import {endpointsToLegacy} from "../selection/normalize";
import {isNativeInputTarget, isZeroSpace} from "../../utils";
import {BlockCraftError, ErrorCode, performanceTest, sliceDelta} from "../../../global";
import {CompositionSession} from "./composition-session";

const ALLOW_INPUT_TYPES = new Set(['insertText', 'deleteContentBackward', 'deleteContentForward', 'insertReplacementText', 'insertCompositionText', 'deleteByCut'])

@DocEventRegister
export class InputTransformer {
  readonly compositionSession: CompositionSession
  private _nextInsertAttrs: {
    blockId: string
    index: number
    attrs?: DeltaInsert['attributes']
  } | null = null

  constructor(public readonly doc: BlockCraft.Doc) {
    this.compositionSession = new CompositionSession(doc)
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

  /**
   * `beforeinput.getTargetRanges()` may shrink around read-only void/block
   * nodes, so keep trusting the editor model when the current selection
   * includes whole-block endpoints.
   */
  private _shouldUseSelectionModelForBeforeInput(selection: BlockSelection | null): selection is BlockSelection {
    return !!selection && (selection.start.type === 'selected' || selection.end.type === 'selected')
  }

  private _resolveBeforeInputRange(selection: BlockSelection | null, targetRange: INormalizedRange | null) {
    if (this._shouldUseSelectionModelForBeforeInput(selection)) {
      return selection
    }
    return targetRange
  }

  private _isPrintableKey(event: KeyboardEvent) {
    return event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey
  }

  private _canReplaceSelectedBlocksWithParagraph(range: INormalizedRange | BlockSelection) {
    if (range instanceof BlockSelection) {
      range = endpointsToLegacy({start: range.start, end: range.end})
    }

    const target = range.to || range.from
    const parent = target.block.parentBlock
    if (!parent) return false

    const parentSchema = this.doc.schemas.get(parent.flavour)
    return !!parentSchema?.metadata.renderUnit && this.doc.schemas.isValidChildren('paragraph', parent.flavour)
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

  @EventListen('compositionStart')
  private _handleCompositionStart(context: UIEventStateContext) {
    this.compositionSession.reset()
    const curSel = this.doc.selection.value!
    if (curSel.isAllSelected) {
      context.preventDefault();
      const curParent = curSel.lastBlock.parentBlock!
      const curParentSchema = this.doc.schemas.get(curParent.flavour)!
      if (!curParentSchema.metadata.renderUnit) {
        this.doc.selection.blur()
        return true
      }
      this.doc.crud.undoManager.captureSelectionBeforeChange()
      const p = this.doc.schemas.createSnapshot('paragraph', [])
      this.doc.crud.insertBlocksAfter(curSel.lastBlock.id, [p])
      this._deleteAllSelected(curSel)
      this.doc.selection.setCursorAtBlock(p.id, true)
      this.doc.selection.recalculate()
      this.compositionSession.startFromSelection({isComposing: true})
      return true
    }

    if (curSel.start.type !== 'text') {
      if (curSel.isInSameBlock || curSel.end.type !== 'text') {
        throw new BlockCraftError(ErrorCode.InlineEditorError, 'compositionStart: last block is not editable')
      }
    }

    if (!curSel.collapsed) {
      const needsMerge = !curSel.isInSameBlock
      const anchorBlock = curSel.start.type === 'text' ? curSel.firstBlock : (!curSel.isInSameBlock && curSel.end.type === 'text' ? curSel.lastBlock : null)
      const anchorIndex = curSel.start.type === 'text' ? curSel.start.offset : 0

      if (needsMerge && anchorBlock && curSel.start.type === 'text' && curSel.end.type === 'text') {
        // Composition-specific merge: separate append from delete so the observer's
        // _applyDeltaToView only handles simple deltas. The append uses ORIGIN_SKIP_SYNC
        // + rerender() to avoid DOM patches that the browser's composition setup overrides.
        const fromBlock = curSel.firstBlock as any
        const toBlock = curSel.lastBlock as any
        const remainStart = curSel.end.offset
        const remainingDelta = remainStart < toBlock.textLength
          ? [...sliceDelta(toBlock.textDeltas(), remainStart, toBlock.textLength)]
          : null

        // Step 1: delete selected content + delete to block (normal observer path, skip append)
        this._replaceText(curSel, null, true, true)

        // Step 2: append remaining with ORIGIN_SKIP_SYNC (observer skips _applyDeltaToView)
        if (remainingDelta?.length) {
          this.doc.crud.transact(() => {
            const appendDelta: DeltaOperation[] = [{retain: fromBlock.yText.length}, ...remainingDelta]
            fromBlock.yText.applyDelta(appendDelta)
          }, ORIGIN_SKIP_SYNC)
          fromBlock.rerender()
        }
      } else {
        this._replaceText(curSel, null, needsMerge)
      }

      if (anchorBlock) {
        this.doc.selection.setCursorAt(anchorBlock as any, anchorIndex)
        this.compositionSession.start(anchorBlock as any, anchorIndex)
      }
    } else {
      this.compositionSession.startFromSelection({isComposing: true})
    }
    return true
  }

  @EventListen('compositionEnd')
  private _handleCompositionEnd(context: UIEventStateContext) {
    const ev = context.getDefaultEvent<CompositionEvent>()
    const compositionState = context.get('compositionState')
    ev.preventDefault()
    try {
      const text = compositionState.text
      const fallbackPoint = compositionState.getFallbackPoint()
      const anchorPoint = this.compositionSession.resolveInsertionPoint(fallbackPoint)
      const commitPoint = compositionState.resolveCommitPoint(anchorPoint || fallbackPoint)
      if (!commitPoint) {
        throw new BlockCraftError(ErrorCode.InlineEditorError, `Invalid inputRange`)
      }

      const {block: insertBlock, index: insertIndex} = commitPoint

      const insertAttrs = this.consumeNextInsertAttrs(insertBlock.id, insertIndex, {allowNearby: true})
      const cursorIndex = insertIndex + text.length
      this.doc.crud.transact(() => {
        insertBlock.yText.insert(insertIndex, text, insertAttrs)
        insertBlock.rerender()
        // Set cursor synchronously after rerender to avoid selectionchange race.
        // queueMicrotask would leave a gap where selectionchange fires with
        // invalid DOM selection (isComposing is already false), resetting cursor to 0.
        insertBlock.setInlineRange(cursorIndex)
      }, ORIGIN_SKIP_SYNC)

      // Drain deferred patches WITHOUT replaying.
      // rerender() already built the blot tree from the full Y.Text model,
      // which includes all remote changes. Replaying would double-apply them.
      this.compositionSession.drainDeferredPatches()

      // Recalculate selection from the final DOM state (after setInlineRange),
      // not from the stale pre-transaction state captured by compositionState.
      this.doc.selection.recalculate()
    } finally {
      this.compositionSession.end()
    }
  }

  @EventListen('beforeInput')
  private _handleBeforeInput(context: BlockCraft.EventStateContext) {
    const ev = context.get('defaultState').event as InputEvent
    if (isNativeInputTarget(ev.target)) {
      return
    }
    this.compositionSession.updateAnchorFromInputEvent(ev, {isComposing: true})

    if (!ALLOW_INPUT_TYPES.has(ev.inputType)) {
      ev.preventDefault()
      return
    }

    if (ev.isComposing || ev.defaultPrevented) {
      return
    }

    const staticRange = ev.getTargetRanges ? ev.getTargetRanges()[0] : null;
    const targetRange = staticRange ? this.doc.selection.normalizeRange(staticRange) : null
    const effectiveRange = this._resolveBeforeInputRange(this.doc.selection.value, targetRange)
    if (!effectiveRange) {
      return;
    }

    const normalizedRange = effectiveRange instanceof BlockSelection
      ? endpointsToLegacy({start: effectiveRange.start, end: effectiveRange.end})
      : effectiveRange

    const {from, to, collapsed} = normalizedRange
    const text = getPlainTextFromInputEvent(ev)

    if (from.type === 'selected' && (!to || to.type === 'selected')) {
      ev.preventDefault()
      if (text) {
        this._replaceSelectedBlocksWithParagraph(effectiveRange, text) || this.doc.selection.blur()
      } else {
        this._deleteAllSelected(effectiveRange)
      }
      return
    }

    if (to) {
      ev.preventDefault()
      this._replaceText(effectiveRange, text, true)
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
      let deleteRange: INormalizedRange = normalizedRange
      // 要删除的可能是embed节点
      if (staticRange
        && staticRange.startContainer === staticRange.endContainer
        && isZeroSpace(staticRange.startContainer)
        && normalizedRange.from.type === 'text'
      ) {
        deleteRange = {
          ...normalizedRange,
          from: {...normalizedRange.from, index: normalizedRange.from.index - 1, length: 1}
        }
      }
      this._replaceText(deleteRange)
      if (deleteRange.from.type === 'text') {
        this.doc.selection.setCursorAt(deleteRange.from.block as any, deleteRange.from.index)
      }
      return;
    }

    if (!text) return;

    let needsRerender = false

    // in zero text
    if (staticRange && collapsed && isZeroSpace(staticRange.startContainer)) {
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
      needsRerender = true
    }

    // in inline end break
    if (staticRange
      && collapsed
      && staticRange.startContainer instanceof HTMLElement
      && staticRange.startContainer.classList.contains(INLINE_END_BREAK_CLASS)
    ) {
      const prevElement = staticRange.startContainer.previousElementSibling!
      const child = prevElement.firstElementChild as HTMLElement | null
      if (prevElement.localName === INLINE_ELEMENT_TAG && child?.isContentEditable) {
        const len = child.textContent!.length;
        (child.firstChild as Text).insertData(len, text)
        ev.preventDefault()
      } else {
        const cElement = document.createElement(INLINE_ELEMENT_TAG)
        const textElement: HTMLElement = document.createElement(INLINE_TEXT_NODE_TAG)
        textElement.textContent = text
        cElement.appendChild(textElement)
        staticRange.startContainer.before(cElement)
        ev.preventDefault()
      }
      needsRerender = true
    }

    if (from.type !== 'text') return
    if (!collapsed) {
      ev.preventDefault()
      this.doc.crud.undoManager.captureSelectionBeforeChange()
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

    if (needsRerender) {
      // Zero-space / end-break: DOM was manually patched above, use ORIGIN_SKIP_SYNC + rerender
      this.doc.crud.transact(() => {
        from.block.yText.insert(from.index, text)
      }, ORIGIN_SKIP_SYNC)
      from.block.rerender()
      from.block.setInlineRange(from.index + text.length)
    } else {
      // Normal input: controlled rendering — preventDefault lets observer sync blot tree
      ev.preventDefault()
      this.doc.crud.transact(() => {
        from.block.yText.insert(from.index, text)
      })
      this.doc.selection.setSelection({
        ...from,
        index: from.index + text.length,
        length: 0
      })
    }
  }

  @EventListen('keyDown')
  private _handleSelectedStartPrintableFallback(context: UIEventStateContext) {
    const ev = context.getDefaultEvent<KeyboardEvent>()
    if (!this._isPrintableKey(ev)) return

    const selection = this.doc.selection.value
    if (!selection
      || selection.collapsed
      || selection.start.type !== 'selected'
      // || selection.commonParent !== this.doc.rootId
    ) return

    ev.preventDefault()

    if (selection.end.type === 'text') {
      this._replaceText(selection, ev.key, true)
      this.doc.selection.setSelection({
        blockId: selection.end.blockId,
        type: 'text',
        index: ev.key.length,
        length: 0
      })
      return true
    }

    this._replaceSelectedBlocksWithParagraph(selection, ev.key)
    // || this.doc.selection.blur()
    return true
  }

  private _replaceSelectedBlocksWithParagraph(range: INormalizedRange | BlockSelection, text: string) {
    if (!this._canReplaceSelectedBlocksWithParagraph(range)) {
      return false
    }

    if (range instanceof BlockSelection) {
      range = endpointsToLegacy({start: range.start, end: range.end})
    }

    const {from, to} = range
    const paragraph = this.doc.schemas.createSnapshot('paragraph', [text])

    this.doc.crud.undoManager.captureSelectionBeforeChange()
    this.doc.crud.transact(() => {
      this.doc.crud.insertBlocksAfter((to || from).blockId, [paragraph])
      if (to) {
        const throughPath = this.doc.queryBlocksThroughPathDeeply(from.block, to.block)
        if (throughPath.length) {
          throughPath.forEach(through => {
            this.doc.crud.deleteBlocks(through.parent, through.index, through.length)
          })
        }
        this.doc.crud.deleteBlockById(to.blockId)
      }
      this.doc.crud.deleteBlockById(from.blockId)
    })

    this.doc.selection.setCursorAtBlock(paragraph.id, false)
    return true
  }

  private _replaceText(range: INormalizedRange | BlockSelection, text?: string | null, merge = false, skipAppend = false) {
    if (range instanceof BlockSelection) {
      range = endpointsToLegacy({start: range.start, end: range.end})
    }
    const {from, to, collapsed} = range
    if (collapsed) return

    // Pre-capture selection for undo BEFORE the transaction mutates yText
    this.doc.crud.undoManager.captureSelectionBeforeChange()

    // Capture remaining delta from to block BEFORE the transaction deletes it
    let remainingDelta: DeltaOperation[] | null = null
    if (merge && to?.type === 'text' && from.type === 'text') {
      const remainStart = to.index + to.length
      if (remainStart < to.block.textLength) {
        remainingDelta = [...sliceDelta(to.block.textDeltas(), remainStart, to.block.textLength)]
      }
    }

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
          if (merge) {
            // Delete to block entirely; remaining content appended after transaction
            this.doc.crud.deleteBlockById(to.blockId)
          } else if ((to.type === 'text' && to.length >= to.block.textLength) || to.type === 'selected') {
            this.doc.crud.deleteBlockById(to.blockId)
          } else if (to.type === 'text' && (to.index > 0 || to.length > 0)) {
            const yText = to.block.yText
            yText.delete(to.index, to.length)
          }
        }
        return
      }

      // 无法输入的情况
      if (to?.type !== 'text') return
      this.doc.crud.deleteBlockById(from.blockId)
      to.block.replaceText(to.index, to.length, text)
    })

    // After transaction: append remaining delta from to block to from block.
    // This is a separate implicit transaction, so the observer gets a simple
    // append delta (retain + insert) instead of a complex combined delta.
    if (remainingDelta?.length && from.type === 'text' && !skipAppend) {
      const appendDelta: DeltaOperation[] = [{retain: from.block.yText.length}, ...remainingDelta]
      from.block.applyDeltaOperations(appendDelta)
    }
  }

  private _deleteAllSelected(range: INormalizedRange | BlockSelection) {
    if (range instanceof BlockSelection) {
      range = endpointsToLegacy({start: range.start, end: range.end})
    }
    const {from, to} = range

    // Pre-capture selection for undo BEFORE deleting blocks
    this.doc.crud.undoManager.captureSelectionBeforeChange()

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

  deleteByRange(range: INormalizedRange | BlockSelection, merge = false) {
    if (range instanceof BlockSelection) {
      range = endpointsToLegacy({start: range.start, end: range.end})
    }
    if (range.from.type === 'selected' && (!range.to || range.to.type === 'selected')) {
      return this._deleteAllSelected(range)
    }
    return this._replaceText(range, null, merge)
  }

  @BindHotKey({key: 'Backspace', shiftKey: null, shortKey: null, metaKey: false})
  private _handleBackspace(context: UIEventStateContext) {
    const state = context.get('keyboardState')
    const sel = state.selection

    if (sel.isAllSelected) {
      context.preventDefault()
      return this._deleteAllSelected(sel)
    }

    if (!sel.collapsed || sel.start.type !== 'text' || sel.start.offset !== 0) return false
    const block = sel.firstBlock as any
    // 非paragraph块转化
    if (block.flavour !== 'paragraph') {
      context.preventDefault()
      const schema = this.doc.schemas.get(block.flavour)!
      if (schema.metadata.isLeaf) return true
      const deltas = block.textDeltas()
      const np = this.doc.schemas.createSnapshot('paragraph', [deltas, block.props])
      void this.doc.chain()
        .replaceWithSnapshots(block.id, [np])
        .setSelection({
          index: 0,
          length: 0,
          type: 'text',
          blockId: np.id
        })
        .run()
      return true
    }

    // 每一段的最前面
    if (block.props['heading']) {
      context.preventDefault()
      block.updateProps({
        heading: null
      })
      return true
    }

    if (block.props.depth) {
      context.preventDefault()
      block.updateProps({
        depth: block.props.depth - 1
      })
      return true
    }

    // paragraph块
    const prevBlock = this.doc.prevSibling(block)
    // 最前的block
    if (!prevBlock) {
      const parent = block.parentBlock

      if (parent) {
        context.preventDefault()

        // 如果是第一个空白的文本块，直接删除
        if (!block.textLength && parent.childrenLength > 1) {
          this.doc.selection.selectOrSetCursorAtBlock(parent.getChildrenByIndex(1), true)
          this.doc.crud.deleteBlockById(block.id)
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
      const deltas: DeltaOperation[] = block.textDeltas()
      deltas.unshift({retain: prevBlock.textLength})
      prevBlock.setInlineRange(prevBlock.textLength)
      prevBlock.applyDeltaOperations(deltas)
      this.doc.crud.deleteBlockById(block.id)
      this.doc.selection.recalculate()
      return true
    }

    this.doc.selection.selectBlock(prevBlock)
    !block.textLength && this.doc.crud.deleteBlockById(block.id)
    context.preventDefault()
    return true
  }

  @BindHotKey({key: 'Delete', shiftKey: null, shortKey: null, metaKey: false})
  private _handleDelete(context: UIEventStateContext) {
    const state = context.get('keyboardState')
    const sel = state.selection

    if (sel.isAllSelected) {
      context.preventDefault()
      return this._deleteAllSelected(sel)
    }

    const block = sel.firstBlock as any
    if (!sel.collapsed || sel.start.type !== 'text' || sel.start.offset !== block.textLength) return false

    const nextBlock = this.doc.nextSibling(block)
    if (nextBlock) {
      if (this.doc.isEditable(nextBlock)) {
        const deltas: DeltaOperation[] = nextBlock.textDeltas()
        deltas.unshift({retain: block.textLength})
        block.setInlineRange(block.textLength)
        block.applyDeltaOperations(deltas)
        this.doc.crud.deleteBlockById(nextBlock.id)
        context.preventDefault()
        return true
      } else {
        this.doc.selection.selectBlock(nextBlock)
        context.preventDefault()
        return true
      }
    }

    const parent = block.parentBlock
    if (parent && parent.nodeType !== BlockNodeType.root) {
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
    const sel = state.selection
    const firstBlock = sel.firstBlock

    const prevBlock = this.doc.prevSibling(firstBlock)
    const _prevDepth = prevBlock ? (prevBlock.props.depth ?? 0) : 0
    const _newDepth = (firstBlock.props.depth || 0) + (state.raw.shiftKey ? -1 : 1)
    if (!prevBlock || _newDepth < 0) {
      this.doc.messageService.warn('当前内容块已到最小缩进层级')
      return true
    }

    if (!state.raw.shiftKey && _newDepth > _prevDepth + 1) {
      this.doc.messageService.warn('当前内容块已到最大缩进层级')
      return true
    }

    if (!sel.isInSameBlock) {
      const blocks = this.doc.queryBlocksBetween(firstBlock, sel.lastBlock, true)
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
      firstBlock.updateProps({
        depth: _newDepth
      })
    }
    return true
  }

  @BindHotKey({key: 'Enter', shiftKey: null, ctrlKey: null})
  private async _handlerEnter(context: UIEventStateContext) {
    const state = context.get('keyboardState')
    const sel = state.selection

    context.preventDefault()

    if (sel.isAllSelected) {
      const p = this.doc.schemas.createSnapshot('paragraph', [[], sel.firstBlock.props])
      await (state.raw.ctrlKey ? this.doc.chain().insertBeforeSnapshots(sel.firstBlock, [p]) : this.doc.chain().insertAfterSnapshots(sel.lastBlock, [p]))
        .setCursorAtBlock(p.id, true)
        .run()
      return true
    }

    if (!sel.collapsed) {
      this._replaceText(sel)
      if (sel.start.type === 'text') {
        this.doc.selection.setCursorAt(sel.firstBlock as any, sel.start.offset)
      }
      return true
    }

    if (sel.start.type !== 'text') return false
    const block = sel.firstBlock as any
    const offset = sel.start.offset

    // 强制同段换行
    if (state.raw.shiftKey) {
      block.insertText(offset, STR_LINE_BREAK)
      block.setInlineRange(offset + 1)
      return true
    }

    // 空段落
    if (!block.textLength) {

      if (block.props.heading) {
        block.updateProps({
          heading: null
        })
        return true
      }

      if (block.props.depth > 0) {
        block.updateProps({
          depth: block.props.depth - 1
        })
        return true
      }

      const p = this.doc.schemas.createSnapshot('paragraph', [[], block.props])
      await (block.flavour !== 'paragraph'
        ? this.doc.chain().replaceWithSnapshots(block.id, [p])
        : this.doc.chain().insertAfterSnapshots(block, [p]))
        .selectOrSetCursorAtBlock(p.id, true)
        .run()
      return true
    }

    // 在前面换行
    if (offset === 0) {
      const p = this.doc.schemas.createSnapshot(block.flavour, [[], {
        ...block.props,
        heading: null
      }])
      this.doc.crud.insertBlocksBefore(block, [p])
      return true
    }

    const deltas = sliceDelta(block.textDeltas(), offset)
    const p = this.doc.schemas.createSnapshot(
      (block.textLength && !block.heading && block.flavour !== 'blockquote') ? block.flavour : 'paragraph', [deltas, {
        ...block.props,
        heading: null,
      }])
    void this.doc.chain()
      .transact(() => {
        block.deleteText(offset)
        this.doc.crud.insertBlocksAfter(block, [p])
      })
      .selectOrSetCursorAtBlock(p.id, true)
      .run()
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
