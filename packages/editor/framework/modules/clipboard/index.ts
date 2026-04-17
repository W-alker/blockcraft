import {
  BlockNodeType,
  DeltaInsert,
  DeltaOperation,
  DocEventRegister,
  EditableBlockComponent,
  EventListen,
  IBlockSnapshot, STR_LINE_BREAK,
  UIEventStateContext
} from "../../block-std";
import {
  compareSimpleValue,
  deltaStrLength,
  deltaToString,
  isUrl,
  nextTick, SimpleBasicType,
  sliceDelta
} from "../../../global";
import {Subject} from "rxjs";
import {
  ClipboardDataType,
  ClipboardPasteApplyResult,
  ClipboardPasteCompletedEvent,
  ClipboardPasteFormatType,
  ClipboardPasteOption,
} from "./types";
import {
  generateId,
  replaceSnapshotsIdDeeply,
} from "../../utils";
import {DOC_ADAPTER_SERVICE_TOKEN} from "../../services";
import {copyBlocks} from "./copyBlocks";
import {
  buildClipboardItems,
  parseClipboardSnapshot,
  parseClipboardSnapshotFromHtml,
} from "./internal-clipboard";
import {cloneSnapshot, getMarkdownClipboardText, looksLikeMarkdown} from "./paste-utils";

export * from './types'

@DocEventRegister
export class ClipboardManager {
  adapter = this.doc.injector.get(DOC_ADAPTER_SERVICE_TOKEN)

  /** Emits null to clear, or format data after a paste with alternatives. */
  readonly pasteFormatData$ = new Subject<ClipboardPasteCompletedEvent | null>()

  constructor(public readonly doc: BlockCraft.Doc) {
  }

  copyText(text: string) {
    return navigator.clipboard.writeText(text)
  }

  copyBlocksModel = (snapshots: IBlockSnapshot[]): Promise<void> => {
    if (!snapshots?.length) return Promise.reject('no blocks to copy')
    const rootSnapshot = this._wrapSnapshotsByRoot(snapshots)
    return copyBlocks.call(this, rootSnapshot)
  }

  private _wrapDeltaByRoot(deltas: DeltaInsert[]) {
    const p = this.doc.schemas.createSnapshot('paragraph', [deltas])
    return this.doc.schemas.createSnapshot('root', [generateId(), [p]])
  }

  private _wrapSnapshotsByRoot(snapshots: IBlockSnapshot[]) {
    return this.doc.schemas.createSnapshot('root', [generateId(), snapshots])
  }

  private _setClipboardData(clipboardData: DataTransfer, items: Record<string, string>) {
    for (const [type, value] of Object.entries(items)) {
      clipboardData.setData(type, value)
    }
  }

  copyFromSelection = async (selection: BlockCraft.Selection, clipboardData: DataTransfer) => {
    const s = selection.start, e = selection.end
    const startBlock = selection.firstBlock
    const endBlock = selection.lastBlock

    if (selection.isInSameBlock) {
      let snapshot: IBlockSnapshot
      let plainText: string
      if (s.type === 'text') {
        const eOff = (e.type === 'text' ? e.offset : (startBlock as EditableBlockComponent).textLength)
        const sliceDeltas = sliceDelta((startBlock as EditableBlockComponent).textDeltas(), s.offset, eOff)
        snapshot = this._wrapDeltaByRoot(sliceDeltas)
        plainText = deltaToString(sliceDeltas)
      } else {
        plainText = startBlock.textContent()
        snapshot = this._wrapSnapshotsByRoot([startBlock.toSnapshot()])
      }

      const items = await buildClipboardItems(this.adapter.supportedAdapters, snapshot, plainText)
      this._setClipboardData(clipboardData, items)
      return
    }

    const snapshots: IBlockSnapshot[] = []
    let plainText = ''
    const betweenBlocks = this.doc.queryBlocksBetween(startBlock, endBlock)
    for (const bid of betweenBlocks) {
      snapshots.push(this.doc.getBlockById(bid).toSnapshot())
      plainText += (this.doc.getBlockById(bid).textContent() + STR_LINE_BREAK)
    }

    if (s.type === 'text') {
      const sBlock = startBlock as EditableBlockComponent
      if (s.offset < sBlock.textLength) {
        const sliceDeltas = sliceDelta(sBlock.textDeltas(), s.offset, sBlock.textLength)
        const snapshot = sBlock.toSnapshot()
        snapshot.children = sliceDeltas
        snapshots.unshift(snapshot)
        plainText = deltaToString(sliceDeltas) + STR_LINE_BREAK + plainText
      }
    } else {
      snapshots.unshift(startBlock.toSnapshot())
      plainText = startBlock.textContent() + plainText
    }

    if (e.type === 'text') {
      if (e.offset > 0) {
        const eBlock = endBlock as EditableBlockComponent
        const sliceDeltas = sliceDelta(eBlock.textDeltas(), 0, e.offset)
        const snapshot = eBlock.toSnapshot()
        snapshot.children = sliceDeltas
        snapshots.push(snapshot)
        plainText += deltaToString(sliceDeltas)
      }
    } else {
      snapshots.push(endBlock.toSnapshot())
      plainText = endBlock.textContent() + plainText
    }

    const rootSnapshot = await this._wrapSnapshotsByRoot(snapshots)
    const items = await buildClipboardItems(this.adapter.supportedAdapters, rootSnapshot, plainText)
    this._setClipboardData(clipboardData, items)
  }

  deleteContentFromSelection = (selection: BlockCraft.Selection) => {
    this.doc.inputManger.deleteByRange(selection, true)
  }

  async applyPasteOption(option: ClipboardPasteOption, selection: BlockCraft.Selection): Promise<ClipboardPasteApplyResult | null> {
    if (selection.start.type !== 'text') return null
    const originalCollapsedSelection = selection.collapsed ? selection.toJSON() : null
    this.doc.selection.blur()

    const {payload} = option
    if (payload.kind === 'text') {
      return this._applyTextPasteOption(payload.text, selection, originalCollapsedSelection)
    }

    if (payload.kind === 'snapshot') {
      return this._applySnapshotPasteOption(payload.snapshot, selection, originalCollapsedSelection)
    }

    return null
  }

  private async _applyTextPasteOption(
    text: string,
    selection: BlockCraft.Selection,
    originalCollapsedSelection: ReturnType<BlockCraft.Selection['toJSON']> | null
  ): Promise<ClipboardPasteApplyResult | null> {
    if (selection.start.type !== 'text') return null

    const editableBlock = selection.firstBlock as EditableBlockComponent
    const fromIndex = selection.start.offset
    const textLines = text.replace(/[\n\r]+$/, '').split('\n')
    const appendedSnapshots = textLines.slice(1).map((line: string) =>
      this.doc.schemas.createSnapshot('paragraph', [[{insert: line}], {depth: editableBlock.props.depth}])
    )

    if (!selection.collapsed) {
      this.deleteContentFromSelection(selection)
    }

    this.doc.crud.transact(() => {
      editableBlock.replaceText(fromIndex, 0, textLines[0])
      if (appendedSnapshots.length) {
        this.doc.crud.insertBlocksAfter(editableBlock, appendedSnapshots)
      }
    })

    await nextTick()
    if (selection.collapsed) {
      this._restoreCollapsedSelectionAndSync(originalCollapsedSelection)
      return {anchorBlockId: editableBlock.id}
    }

    if (!appendedSnapshots.length) {
      this._setTextRangeAndSync(editableBlock, fromIndex, textLines[0].length)
      return {anchorBlockId: editableBlock.id}
    }

    const endBlock = this.doc.getBlockById(appendedSnapshots[appendedSnapshots.length - 1].id)
    this._setCrossBlockRangeAndSync(editableBlock, fromIndex, endBlock)
    return {anchorBlockId: editableBlock.id}
  }

  private async _applySnapshotPasteOption(
    snapshot: IBlockSnapshot,
    selection: BlockCraft.Selection,
    originalCollapsedSelection: ReturnType<BlockCraft.Selection['toJSON']> | null
  ): Promise<ClipboardPasteApplyResult | null> {
    if (selection.start.type !== 'text') return null
    if (snapshot.nodeType !== BlockNodeType.root || !snapshot.children.length) return null

    const editableBlock = selection.firstBlock as EditableBlockComponent
    const fromIndex = selection.start.offset
    const fromLength = selection.isInSameBlock && selection.end.type === 'text'
      ? selection.end.offset - fromIndex
      : editableBlock.textLength - fromIndex
    const {isInSameBlock, collapsed} = selection
    const snapshots: IBlockSnapshot[] = snapshot.children as IBlockSnapshot[]
    replaceSnapshotsIdDeeply(snapshots)

    if (isInSameBlock) {
      const ops: DeltaOperation[] = [{retain: fromIndex}]
      const textLength = editableBlock.textLength

      let insertLength = 0
      if (snapshots[0].nodeType === BlockNodeType.editable
        && (snapshots[0].flavour === 'paragraph' || snapshots[0].flavour === editableBlock.flavour)
        && compareSimpleValue(snapshots[0].props['heading'] as SimpleBasicType, editableBlock.props['heading']) <= 0
      ) {
        insertLength = deltaStrLength(snapshots[0].children)
        ops.push(...snapshots[0].children)
        snapshots.shift()
      }

      if (!snapshots.length) {
        editableBlock.deleteText(fromIndex, fromLength)
        editableBlock.applyDeltaOperations(ops)
        await nextTick()
        if (collapsed) {
          this._restoreCollapsedSelectionAndSync(originalCollapsedSelection)
        } else {
          this._setTextRangeAndSync(editableBlock, fromIndex, insertLength)
        }
        return {anchorBlockId: editableBlock.id}
      }

      if (fromIndex + fromLength < textLength) {
        ops.push({delete: textLength - fromIndex})
        const sliceDeltas = sliceDelta(editableBlock.textDeltas(), fromIndex + fromLength, textLength)
        const splitSnapshot = this.doc.schemas.createSnapshot('paragraph', [sliceDeltas, editableBlock.props])
        this.doc.crud.insertBlocksAfter(editableBlock, [splitSnapshot])
      } else {
        editableBlock.deleteText(fromIndex, fromLength)
      }
      editableBlock.applyDeltaOperations(ops)
    } else {
      this.deleteContentFromSelection(selection)

      if (snapshots[0].nodeType === BlockNodeType.editable && (snapshots[0].flavour === 'paragraph' || snapshots[0].flavour === editableBlock.flavour)) {
        const insertLength = deltaStrLength(snapshots[0].children)
        editableBlock.applyDeltaOperations([{retain: fromIndex}, ...snapshots[0].children])
        snapshots.shift()

        if (!snapshots.length) {
          await nextTick()
          if (collapsed) {
            this._restoreCollapsedSelectionAndSync(originalCollapsedSelection)
          } else {
            this._setTextRangeAndSync(editableBlock, fromIndex, insertLength)
          }
          return {anchorBlockId: editableBlock.id}
        }
      }
    }

    await this.doc.chain()
      .insertAfterSnapshots(editableBlock, snapshots)
      .run()

    await nextTick()
    const endBlock = this.doc.getBlockById(snapshots[snapshots.length - 1].id)
    if (collapsed) {
      this._restoreCollapsedSelectionAndSync(originalCollapsedSelection)
      return {anchorBlockId: editableBlock.id}
    } else {
      this._setCrossBlockRangeAndSync(editableBlock, fromIndex, endBlock)
      return {anchorBlockId: editableBlock.id}
    }
  }

  private _restoreCollapsedSelectionAndSync(selectionJSON: ReturnType<BlockCraft.Selection['toJSON']> | null) {
    if (!selectionJSON) return

    try {
      this.doc.selection.replay(selectionJSON)
      this.doc.selection.recalculate()
    } catch (e) {
      this.doc.logger.warn('restoreCollapsedPasteSelection error', e)
    }
  }

  private _setTextRangeAndSync(block: EditableBlockComponent, index: number, length: number) {
    block.setInlineRange(index, length)
    this.doc.selection.recalculate()
  }

  private _setCrossBlockRangeAndSync(startBlock: EditableBlockComponent, startOffset: number, endBlock: BlockCraft.BlockComponent) {
    this.doc.selection.setSelection({
      blockId: startBlock.id,
      index: startOffset,
      length: startBlock.textLength - startOffset,
      type: 'text'
    }, this.doc.isEditable(endBlock) ? {
      blockId: endBlock.id,
      index: 0,
      length: endBlock.textLength,
      type: 'text'
    } : {
      blockId: endBlock.id,
      type: 'selected'
    })
    this.doc.selection.recalculate()
  }

  private _setCursorAndSync(block: BlockCraft.BlockComponent, atEnd = false, index?: number) {
    if (this.doc.isEditable(block)) {
      const offset = index ?? (atEnd ? block.textLength : 0)
      this.doc.selection.setCursorAt(block, offset)
    } else {
      this.doc.selection.setCursorAtBlock(block, atEnd, false)
    }
    this.doc.selection.recalculate()
  }

  @EventListen('copy')
  async onCopy(context: UIEventStateContext) {
    const state = context.get('clipboardState')
    state.raw.preventDefault()
    this.copyFromSelection(state.selection, state.clipboardData!)
    return true
  }

  @EventListen('cut')
  onCut(context: UIEventStateContext) {
    const state = context.get('clipboardState')
    context.preventDefault()

    const sel = state.selection
    const startType = sel.start.type
    const startBlockId = sel.start.blockId
    const startOffset = startType === 'text' ? sel.start.offset : 0
    this.copyFromSelection(sel, state.clipboardData!).then(() => {
      this.deleteContentFromSelection(sel)
      if (startType === 'text') {
        this.doc.selection.setCursorAt(this.doc.getBlockById(startBlockId) as any, startOffset)
      }
    })

  }

  @EventListen('paste')
  async onPaste(context: UIEventStateContext) {
    context.preventDefault()
    this.pasteFormatData$.next(null)
    const state = context.get('clipboardState')
    state.dataTypes.forEach(v => {
      console.log(`%c${v}`, 'color: red; font-size: large;', state.clipboardData?.getData(v), state.clipboardData?.files)
    })

    const selection = state.selection
    if (selection.start.type !== 'text') return

    const editableBlock = selection.firstBlock as EditableBlockComponent
    const fromIndex = selection.start.offset
    const fromLength = selection.isInSameBlock && selection.end.type === 'text'
      ? selection.end.offset - fromIndex
      : editableBlock.textLength - fromIndex
    const {isInSameBlock, collapsed} = selection

    // 纯文本块
    if (editableBlock.plainTextOnly) {
      const text = state.clipboardData?.getData(ClipboardDataType.TEXT)
      if (!text) return false
      editableBlock.replaceText(fromIndex, fromLength, text)
      nextTick().then(() => {
        collapsed ? editableBlock.setInlineRange(fromIndex + text.length)
          : editableBlock.setInlineRange(fromIndex, text.length)
      })
      return true
    }

    // file
    if (state.dataTypes.includes(ClipboardDataType.FILES)) {
      return false
    }

    let rootSnapshot: IBlockSnapshot | undefined

    // internal snapshot
    if (!rootSnapshot && state.dataTypes.includes(ClipboardDataType.BLOCKCRAFT_SNAPSHOT)) {
      rootSnapshot = parseClipboardSnapshot(state.getData(ClipboardDataType.BLOCKCRAFT_SNAPSHOT)) || undefined
    }

    // html
    if (!rootSnapshot && state.dataTypes.includes(ClipboardDataType.HTML)) {
      const htmlString = state.getData(ClipboardDataType.HTML)
      if (htmlString) {
        rootSnapshot = parseClipboardSnapshotFromHtml(htmlString) || undefined
        if (!rootSnapshot) {
          const htmlAdapter = this.adapter?.getAdapter(ClipboardDataType.HTML)
          if (htmlAdapter) {
            try {
              rootSnapshot = await htmlAdapter.toSnapshot(htmlString)
            } catch (e) {
              this.doc.logger.warn('html2snapshot error', e)
            }
          }
        }
      }
    }

    console.log('---------------html2snapshot', rootSnapshot)

    // Collect alternative format data before mutations (plugin uses this for format selector)
    const altPlainText = state.getData(ClipboardDataType.TEXT) || null
    const savedHtmlSnapshot = rootSnapshot ? cloneSnapshot(rootSnapshot) : null
    const markdownText = getMarkdownClipboardText(state) || (altPlainText && looksLikeMarkdown(altPlainText) ? altPlainText : null)
    const selectionJSON = selection.toJSON()

    const emitFormatData = (appliedType: ClipboardPasteFormatType) => {
      this.pasteFormatData$.next({
        anchorBlockId: editableBlock.id,
        appliedType,
        htmlSnapshot: savedHtmlSnapshot,
        plainText: altPlainText,
        markdownText,
        selectionJSON,
      })
    }

    if (rootSnapshot && rootSnapshot.children.length && rootSnapshot.nodeType === BlockNodeType.root) {
      const snapshots: IBlockSnapshot[] = rootSnapshot.children as IBlockSnapshot[]
      const textLength = editableBlock.textLength

      replaceSnapshotsIdDeeply(snapshots)

      // 同一文本块
      if (isInSameBlock) {
        const ops: DeltaOperation[] = [{retain: fromIndex}]

        let insertLength = 0
        // 是否需要和本段合并
        if (snapshots[0].nodeType === BlockNodeType.editable
          && (snapshots[0].flavour === 'paragraph' || snapshots[0].flavour === editableBlock.flavour)
          && compareSimpleValue(snapshots[0].props['heading'] as SimpleBasicType, editableBlock.props['heading']) <= 0
        ) {
          insertLength = deltaStrLength(snapshots[0].children)
          ops.push(...snapshots[0].children)
          snapshots.shift()
        }

        // 不需要拆分, 代表这是一个行内操作
        if (!snapshots.length) {
          editableBlock.deleteText(fromIndex, fromLength)
          editableBlock.applyDeltaOperations(ops)
          insertLength > 0 && nextTick().then(() => {
            collapsed ? editableBlock.setInlineRange(fromIndex + insertLength) : editableBlock.setInlineRange(fromIndex, insertLength)
          })
          emitFormatData('html')
          return;
        }

        // 文本中间位置
        if (fromIndex + fromLength < textLength) {
          ops.push({delete: textLength - fromIndex})
          // 拆分
          const sliceDeltas = sliceDelta(editableBlock.textDeltas(), fromIndex + fromLength, textLength)
          const splitSnapshot = this.doc.schemas.createSnapshot('paragraph', [sliceDeltas, editableBlock.props])
          this.doc.crud.insertBlocksAfter(editableBlock, [splitSnapshot])
        } else {
          editableBlock.deleteText(fromIndex, fromLength)
        }
        editableBlock.applyDeltaOperations(ops)
      } else {
        // 删除区间内容
        this.deleteContentFromSelection(state.selection)

        // 是否需要和本段合并
        if (snapshots[0].nodeType === BlockNodeType.editable && (snapshots[0].flavour === 'paragraph' || snapshots[0].flavour === editableBlock.flavour)) {
          const insertLength = deltaStrLength(snapshots[0].children)
          editableBlock.applyDeltaOperations([{retain: fromIndex}, ...snapshots[0].children])
          snapshots.shift()

          if (!snapshots.length) {
            insertLength > 0 && nextTick().then(() => {
              collapsed ? editableBlock.setInlineRange(fromIndex + insertLength) : editableBlock.setInlineRange(fromIndex, insertLength)
            })
            emitFormatData('html')
            return
          }
        }
      }

      // 新增blocks
      void this.doc.chain()
        .insertAfterSnapshots(editableBlock, snapshots)
        .tap(() => {
          if (collapsed) return
          const endBlock = this.doc.getBlockById(snapshots[snapshots.length - 1].id)
          this.doc.selection.setSelection({
            blockId: editableBlock.id,
            index: fromIndex,
            length: editableBlock.textLength,
            type: 'text'
          }, this.doc.isEditable(endBlock) ? {
            blockId: endBlock.id,
            index: 0,
            length: endBlock.textLength,
            type: 'text'
          } : {
            blockId: endBlock.id,
            type: 'selected'
          })
        })
        .run()
      emitFormatData('html')
      return true
    }

    // plain-text
    if (state.dataTypes.includes(ClipboardDataType.TEXT)) {
      let text = state.getData(ClipboardDataType.TEXT)!
      if (!text) return false
      text = text.replace(/\n$/g, '')
      if (isUrl(text) && isInSameBlock) {
        selection.collapsed ?
          editableBlock.insertText(fromIndex, text, {'a:link': text})
          : editableBlock.formatText(fromIndex, fromLength, {'a:link': text})
        nextTick().then(() => {
          collapsed ? editableBlock.setInlineRange(fromIndex + text.length)
            : editableBlock.setInlineRange(fromIndex, fromLength)
        })
        return true
      }

      this.doc.crud.transact(() => {
        const text_lines = text.replace(/[\n\r]+$/, '').split('\n')
        if (isInSameBlock) {
          editableBlock.replaceText(fromIndex, fromLength, text_lines[0])
        } else {
          this.deleteContentFromSelection(state.selection)
          editableBlock.applyDeltaOperations([{retain: fromIndex}, {insert: text_lines[0]}])
        }
        if (text_lines.length > 1) {
          const snapshots = text_lines.slice(1).map(line => this.doc.schemas.createSnapshot('paragraph', [[{insert: line}], {depth: editableBlock.props.depth}]))
          this.doc.crud.insertBlocksAfter(editableBlock, snapshots)
        }
      })
      requestAnimationFrame(() => {
        this.doc.selection.recalculate()
      })
      return true
    }

    return false
  }
}
