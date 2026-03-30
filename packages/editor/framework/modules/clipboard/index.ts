import {
  BindHotKey,
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
import {BehaviorSubject} from "rxjs";
import {
  ClipboardDataType,
  ClipboardPasteApplyResult,
  ClipboardPasteFormatType,
  ClipboardPasteOption,
  ClipboardPasteSession,
  ClipboardPasteSessionView,
} from "./types";
import {
  generateId,
  replaceSnapshotsIdDeeply,
} from "../../utils";
import {DOC_ADAPTER_SERVICE_TOKEN} from "../../services";
import {copyBlocks} from "./copyBlocks";
import {cloneSnapshot} from "./paste-utils";

export * from './types'

@DocEventRegister
export class ClipboardManager {
  adapter = this.doc.injector.get(DOC_ADAPTER_SERVICE_TOKEN)

  readonly pasteFormatSession$ = new BehaviorSubject<ClipboardPasteSessionView | null>(null)
  private _pasteSession: ClipboardPasteSession | null = null

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

  copyFromSelection = async (selection: BlockCraft.Selection, clipboardData: DataTransfer) => {
    const s = selection.start, e = selection.end
    const startBlock = selection.firstBlock
    const endBlock = selection.lastBlock

    if (selection.isInSameBlock) {
      let snapshot: IBlockSnapshot
      if (s.type === 'text') {
        const eOff = (e.type === 'text' ? e.offset : (startBlock as EditableBlockComponent).textLength)
        const sliceDeltas = sliceDelta((startBlock as EditableBlockComponent).textDeltas(), s.offset, eOff)
        snapshot = this._wrapDeltaByRoot(sliceDeltas)
        clipboardData.setData(ClipboardDataType.TEXT, deltaToString(sliceDeltas))
      } else {
        clipboardData.setData(ClipboardDataType.TEXT, startBlock.textContent())
        snapshot = this._wrapSnapshotsByRoot([startBlock.toSnapshot()])
      }

      for (const adapter1 of this.adapter.supportedAdapters) {
        clipboardData.setData(adapter1.type, await adapter1.fromSnapshot(snapshot))
      }
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

    clipboardData.setData(ClipboardDataType.TEXT, plainText)
    const rootSnapshot = await this._wrapSnapshotsByRoot(snapshots)
    for (const adapter1 of this.adapter.supportedAdapters) {
      clipboardData.setData(adapter1.type, await adapter1.fromSnapshot(rootSnapshot))
    }
  }

  deleteContentFromSelection = (selection: BlockCraft.Selection) => {
    this.doc.inputManger.deleteByRange(selection, false)
  }

  // ── Paste Format Session ──

  clearPasteFormatSession() {
    this._pasteSession = null
    this.pasteFormatSession$.next(null)
  }

  async applyPasteOption(option: ClipboardPasteOption, selection: BlockCraft.Selection): Promise<ClipboardPasteApplyResult | null> {
    if (selection.start.type !== 'text') return null
    const editableBlock = selection.firstBlock as EditableBlockComponent
    const fromIndex = selection.start.offset
    const fromLength = selection.isInSameBlock && selection.end.type === 'text'
      ? selection.end.offset - fromIndex
      : editableBlock.textLength - fromIndex

    const {payload} = option
    if (payload.kind === 'text') {
      const text = payload.text
      this.doc.crud.transact(() => {
        const textLines = text.replace(/[\n\r]+$/, '').split('\n')
        editableBlock.replaceText(fromIndex, fromLength, textLines[0])
        if (textLines.length > 1) {
          const snapshots = textLines.slice(1).map((line: string) =>
            this.doc.schemas.createSnapshot('paragraph', [[{insert: line}], {depth: editableBlock.props.depth}])
          )
          this.doc.crud.insertBlocksAfter(editableBlock, snapshots)
        }
      })
      return {anchorBlockId: editableBlock.id}
    }

    if (payload.kind === 'snapshot') {
      const snapshot = payload.snapshot
      if (snapshot.nodeType === BlockNodeType.root && snapshot.children.length) {
        const snapshots = snapshot.children as IBlockSnapshot[]
        replaceSnapshotsIdDeeply(snapshots)
        await this.doc.chain()
          .insertAfterSnapshots(editableBlock, snapshots)
          .run()
      }
      return {anchorBlockId: editableBlock.id}
    }

    return null
  }

  async reapplyLastPaste(type: ClipboardPasteFormatType) {
    const session = this._pasteSession
    if (!session || session.selectedType === type) return

    const option = session.options.find(o => o.type === type)
    if (!option) return

    this.doc.crud.undoManager.undo()
    await nextTick()

    const selection = this.doc.selection.value
    if (!selection) return

    const result = await this.applyPasteOption(option, selection)
    if (result) {
      session.selectedType = type
      session.anchorBlockId = result.anchorBlockId
      this._emitPasteSessionView()
    }
  }

  openPasteFormatSession(anchorBlockId: string, selectedType: ClipboardPasteFormatType, options: ClipboardPasteOption[]) {
    if (options.length <= 1) return
    this._pasteSession = {anchorBlockId, selectedType, options}
    this._emitPasteSessionView()
  }

  private _emitPasteSessionView() {
    const session = this._pasteSession
    if (!session) {
      this.pasteFormatSession$.next(null)
      return
    }
    this.pasteFormatSession$.next({
      anchorBlockId: session.anchorBlockId,
      selectedType: session.selectedType,
      options: session.options.map(o => ({type: o.type, label: o.label}))
    })
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
    this.clearPasteFormatSession()
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

    // html
    if (!rootSnapshot && state.dataTypes.includes(ClipboardDataType.HTML)) {
      const htmlString = state.getData(ClipboardDataType.HTML)
      const htmlAdapter = this.adapter?.getAdapter(ClipboardDataType.HTML)
      if (htmlAdapter && htmlString) {
        try {
          rootSnapshot = await htmlAdapter.toSnapshot(htmlString)
        } catch (e) {
          this.doc.logger.warn('html2snapshot error', e)
        }
      }
    }

    console.log('---------------html2snapshot', rootSnapshot)

    // Collect alternative format data before mutations
    const altPlainText = state.getData(ClipboardDataType.TEXT) || null
    const savedHtmlSnapshot = rootSnapshot ? cloneSnapshot(rootSnapshot) : null
    const tryOpenFormatSession = (appliedType: ClipboardPasteFormatType) => {
      if (!altPlainText || !savedHtmlSnapshot) return
      this.openPasteFormatSession(editableBlock.id, appliedType, [
        {type: 'html', label: '保留格式', payload: {kind: 'snapshot', snapshot: savedHtmlSnapshot}},
        {type: 'plain-text', label: '纯文本', payload: {kind: 'text', text: altPlainText}},
      ])
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
          tryOpenFormatSession('html')
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
            tryOpenFormatSession('html')
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
      tryOpenFormatSession('html')
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

export * from './types'
