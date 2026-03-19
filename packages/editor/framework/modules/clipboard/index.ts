import {
  BindHotKey,
  BlockNodeType,
  ClipboardEventState,
  DeltaInsert,
  DeltaOperation,
  DocEventRegister,
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
import {
  ClipboardDataType,
  ClipboardPasteApplyResult,
  ClipboardPasteFormatType,
  ClipboardPasteOption,
  ClipboardPasteSession,
  ClipboardPasteSessionView
} from "./types";
import {
  generateId,
  replaceSnapshotsIdDeeply,
} from "../../utils";
import {DOC_ADAPTER_SERVICE_TOKEN} from "../../services";
import {copyBlocks} from "./copyBlocks";
import {BehaviorSubject} from "rxjs";
import {
  cloneSnapshot,
  createTableSnapshotFromMatrix,
  getMarkdownClipboardText,
  looksLikeMarkdown,
  parseTabularText
} from "./paste-utils";

export * from './types'

@DocEventRegister
export class ClipboardManager {
  adapter = this.doc.injector.get(DOC_ADAPTER_SERVICE_TOKEN)
  readonly pasteFormatSession$ = new BehaviorSubject<ClipboardPasteSessionView | null>(null)
  private _lastPasteSession: ClipboardPasteSession | null = null

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
    const {from, to} = selection
    if (!to) {
      let snapshot: IBlockSnapshot
      if (from.type === 'text') {
        const sliceDeltas = sliceDelta(from.block.textDeltas(), from.index, from.length + from.index)
        snapshot = this._wrapDeltaByRoot(sliceDeltas)
        clipboardData.setData(ClipboardDataType.TEXT, deltaToString(sliceDeltas))
      } else {
        clipboardData.setData(ClipboardDataType.TEXT, from.block.textContent())
        snapshot = this._wrapSnapshotsByRoot([from.block.toSnapshot()])
      }

      for (const adapter1 of this.adapter.supportedAdapters) {
        clipboardData.setData(adapter1.type, await adapter1.fromSnapshot(snapshot))
      }
      return
    }

    const snapshots: IBlockSnapshot[] = []
    let plainText = ''
    const betweenBlocks = this.doc.queryBlocksBetween(from.block, to.block)
    for (const bid of betweenBlocks) {
      snapshots.push(this.doc.getBlockById(bid).toSnapshot())
      plainText += (this.doc.getBlockById(bid).textContent() + STR_LINE_BREAK)
    }

    if (from.type === 'text') {
      if (from.index < from.block.textLength) {
        const sliceDeltas = sliceDelta(from.block.textDeltas(), from.index, from.length + from.index)
        const snapshot = from.block.toSnapshot()
        snapshot.children = sliceDeltas
        snapshots.unshift(snapshot)
        plainText = deltaToString(sliceDeltas) + STR_LINE_BREAK + plainText
      }
    } else {
      snapshots.unshift(from.block.toSnapshot())
      plainText = from.block.textContent() + plainText
    }

    if (to.type === 'text') {
      if (to.length > 0) {
        const sliceDeltas = sliceDelta(to.block.textDeltas(), to.index, to.length + to.index)
        const snapshot = to.block.toSnapshot()
        snapshot.children = sliceDeltas
        snapshots.push(snapshot)
        plainText += deltaToString(sliceDeltas)
      }
    } else {
      snapshots.push(to.block.toSnapshot())
      plainText = to.block.textContent() + plainText
    }

    clipboardData.setData(ClipboardDataType.TEXT, plainText)
    // clipboardData.setData(ClipboardDataType.BLOCK_SNAPSHOTS, JSON.stringify(snapshots))
    const rootSnapshot = await this._wrapSnapshotsByRoot(snapshots)
    for (const adapter1 of this.adapter.supportedAdapters) {
      clipboardData.setData(adapter1.type, await adapter1.fromSnapshot(rootSnapshot))
    }
  }

  deleteContentFromSelection = (selection: BlockCraft.Selection) => {
    this.doc.inputManger.deleteByRange(selection, false)
  }

  clearPasteFormatSession() {
    this._lastPasteSession = null
    if (this.pasteFormatSession$.value) {
      this.pasteFormatSession$.next(null)
    }
  }

  async reapplyLastPaste(type: ClipboardPasteFormatType) {
    const session = this._lastPasteSession
    if (!session || session.selectedType === type) return false

    const option = session.options.find(candidate => candidate.type === type)
    if (!option || !this.doc.crud.undoManager.isCanUndo()) {
      this.clearPasteFormatSession()
      return false
    }

    this.doc.crud.undoManager.undo()
    await nextTick()
    await nextTick()

    const selection = this.doc.selection.value
    const applyResult = selection ? await this.applyPasteOption(option, selection) : null
    if (!applyResult) {
      this.clearPasteFormatSession()
      return false
    }

    session.selectedType = type
    session.anchorBlockId = applyResult.anchorBlockId
    await nextTick()
    this.pasteFormatSession$.next(this._toPasteSessionView(session))
    return true
  }

  async applyPasteOption(
    option: ClipboardPasteOption,
    selection: BlockCraft.Selection
  ): Promise<ClipboardPasteApplyResult | null> {
    if (selection.from.type !== 'text') return null

    if (option.payload.kind === 'text') {
      return this._applyPlainText(option.payload.text, selection)
    }

    return this._applySnapshot(option.payload.snapshot, selection)
  }

  private _setPasteFormatSession(
    options: ClipboardPasteOption[],
    selectedType: ClipboardPasteFormatType,
    anchorBlockId: string
  ) {
    if (options.length < 2) {
      this.clearPasteFormatSession()
      return
    }

    this._lastPasteSession = {
      anchorBlockId,
      selectedType,
      options
    }
    this.pasteFormatSession$.next(this._toPasteSessionView(this._lastPasteSession))
  }

  private _toPasteSessionView(session: ClipboardPasteSession): ClipboardPasteSessionView {
    return {
      anchorBlockId: session.anchorBlockId,
      selectedType: session.selectedType,
      options: session.options.map(({type, label}) => ({type, label}))
    }
  }

  private _pushPasteOption(options: ClipboardPasteOption[], option: ClipboardPasteOption | null) {
    if (!option || options.some(candidate => candidate.type === option.type)) return
    options.push(option)
  }

  private _pickDefaultPasteOption(options: ClipboardPasteOption[]) {
    const priority: ClipboardPasteFormatType[] = ['html', 'table', 'markdown', 'plain-text']
    for (const type of priority) {
      const option = options.find(candidate => candidate.type === type)
      if (option) return option
    }
    return options[0]
  }

  private async _buildPasteOptions(state: ClipboardEventState) {
    const options: ClipboardPasteOption[] = []

    if (state.dataTypes.includes(ClipboardDataType.HTML)) {
      const htmlString = state.getData(ClipboardDataType.HTML)
      const htmlAdapter = this.adapter?.getAdapter(ClipboardDataType.HTML)
      if (htmlAdapter && htmlString) {
        try {
          const htmlSnapshot = await htmlAdapter.toSnapshot(htmlString)
          if (htmlSnapshot.nodeType === BlockNodeType.root && htmlSnapshot.children.length) {
            this._pushPasteOption(options, {
              type: 'html',
              label: 'HTML',
              payload: {
                kind: 'snapshot',
                snapshot: htmlSnapshot
              }
            })
          }
        } catch (e) {
          this.doc.logger.warn('html2snapshot error', e)
        }
      }
    }

    const plainText = state.getData(ClipboardDataType.TEXT)?.replace(/\n$/g, '') || ''
    if (plainText) {
      this._pushPasteOption(options, {
        type: 'plain-text',
        label: '纯文本',
        payload: {
          kind: 'text',
          text: plainText
        }
      })
    }

    const tableText = state.getData(ClipboardDataType.TSV) || plainText
    const tableMatrix = tableText ? parseTabularText(tableText) : null
    if (tableMatrix?.length) {
      this._pushPasteOption(options, {
        type: 'table',
        label: '表格',
        payload: {
          kind: 'snapshot',
          snapshot: {
            id: generateId(),
            flavour: 'root',
            nodeType: BlockNodeType.root,
            props: {},
            meta: {},
            children: [
              createTableSnapshotFromMatrix(
                this.doc,
                tableMatrix,
                state.selection.firstBlock?.props.depth || 0
              )
            ]
          }
        }
      })
    }

    const markdownText = getMarkdownClipboardText(state)
      || (plainText && looksLikeMarkdown(plainText) ? plainText : null)
    if (markdownText) {
      const markdownAdapter = this.adapter?.getAdapter(ClipboardDataType.MARKDOWN)
        || this.adapter?.getAdapter(ClipboardDataType.RTF)
      if (markdownAdapter) {
        try {
          const markdownSnapshot = await markdownAdapter.toSnapshot(markdownText)
          if (markdownSnapshot.nodeType === BlockNodeType.root && markdownSnapshot.children.length) {
            this._pushPasteOption(options, {
              type: 'markdown',
              label: 'Markdown',
              payload: {
                kind: 'snapshot',
                snapshot: markdownSnapshot
              }
            })
          }
        } catch (e) {
          this.doc.logger.warn('markdown2snapshot error', e)
        }
      }
    }

    return options
  }

  private _applyPlainText(text: string, selection: BlockCraft.Selection): ClipboardPasteApplyResult | null {
    if (selection.from.type !== 'text') return null

    const {from: selFrom, isInSameBlock, collapsed} = selection
    let normalizedText = text.replace(/\n$/g, '')
    if (!normalizedText) return null

    if (isUrl(normalizedText) && isInSameBlock) {
      selection.collapsed ?
        selFrom.block.insertText(selFrom.index, normalizedText, {'a:link': normalizedText})
        : selFrom.block.formatText(selFrom.index, selFrom.length, {'a:link': normalizedText})
      nextTick().then(() => {
        collapsed ? selFrom.block.setInlineRange(selFrom.index + normalizedText.length)
          : selFrom.block.setInlineRange(selFrom.index, selFrom.length)
      })
      return {
        anchorBlockId: selFrom.block.id
      }
    }

    let anchorBlockId = selFrom.block.id
    this.doc.crud.transact(() => {
      const textLines = normalizedText.replace(/[\n\r]+$/, '').split('\n')
      if (isInSameBlock) {
        selFrom.block.replaceText(selFrom.index, selFrom.length, textLines[0])
      } else {
        this.deleteContentFromSelection(selection)
        selFrom.block.applyDeltaOperations([{retain: selFrom.index}, {insert: textLines[0]}])
      }
      if (textLines.length > 1) {
        const snapshots = textLines
          .slice(1)
          .map(line => this.doc.schemas.createSnapshot('paragraph', [[{insert: line}], {depth: selFrom.block.props.depth}]))
        anchorBlockId = snapshots[snapshots.length - 1]?.id || anchorBlockId
        this.doc.crud.insertBlocksAfter(selFrom.block, snapshots)
      }
    })

    requestAnimationFrame(() => {
      this.doc.selection.recalculate()
    })

    return {
      anchorBlockId
    }
  }

  private async _applySnapshot(
    snapshot: IBlockSnapshot,
    selection: BlockCraft.Selection
  ): Promise<ClipboardPasteApplyResult | null> {
    if (selection.from.type !== 'text') return null
    if (snapshot.nodeType !== BlockNodeType.root || !snapshot.children.length) return null

    const rootSnapshot = cloneSnapshot(snapshot)
    const snapshots = rootSnapshot.children as IBlockSnapshot[]
    const {from: selFrom, isInSameBlock, collapsed} = selection
    const {index: fromIndex, length: fromLength, block: editableBlock} = selFrom
    const textLength = editableBlock.textLength

    replaceSnapshotsIdDeeply(snapshots)

    if (isInSameBlock) {
      const ops: DeltaOperation[] = [{retain: fromIndex}]
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
        insertLength > 0 && nextTick().then(() => {
          collapsed ? editableBlock.setInlineRange(fromIndex + insertLength) : editableBlock.setInlineRange(fromIndex, insertLength)
        })
        return {
          anchorBlockId: editableBlock.id
        }
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

      if (snapshots[0].nodeType === BlockNodeType.editable
        && (snapshots[0].flavour === 'paragraph' || snapshots[0].flavour === editableBlock.flavour)
      ) {
        const insertLength = deltaStrLength(snapshots[0].children)
        editableBlock.applyDeltaOperations([{retain: fromIndex}, ...snapshots[0].children])
        snapshots.shift()

        if (!snapshots.length) {
          insertLength > 0 && nextTick().then(() => {
            collapsed ? editableBlock.setInlineRange(fromIndex + insertLength) : editableBlock.setInlineRange(fromIndex, insertLength)
          })
          return {
            anchorBlockId: editableBlock.id
          }
        }
      }
    }

    const anchorBlockId = snapshots[snapshots.length - 1]?.id || editableBlock.id

    await this.doc.chain()
      .insertAfterSnapshots(editableBlock, snapshots)
      .tap(() => {
        if (collapsed) return
        const endBlock = this.doc.getBlockById(anchorBlockId)
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

    return {
      anchorBlockId
    }
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

    this.copyFromSelection(state.selection, state.clipboardData!).then(() => {
      this.deleteContentFromSelection(state.selection)
      state.selection.raw.collapse(true)
    })

  }

  @EventListen('paste')
  async onPaste(context: UIEventStateContext) {
    context.preventDefault()
    const state = context.get('clipboardState')

    const selection = state.selection
    if (selection.from.type !== 'text') return

    const {from: selFrom, isInSameBlock, collapsed} = selection

    // 纯文本块
    if (selFrom.block.plainTextOnly) {
      const text = state.clipboardData?.getData(ClipboardDataType.TEXT)
      if (!text) return false
      this.clearPasteFormatSession()
      selFrom.block.replaceText(selection.from.index, selection.from.length, text)
      nextTick().then(() => {
        collapsed ? selFrom.block.setInlineRange(selFrom.index + text.length)
          : selFrom.block.setInlineRange(selFrom.index, text.length)
      })
      return true
    }

    // file
    if (state.dataTypes.includes(ClipboardDataType.FILES)) {
      this.clearPasteFormatSession()
      return false
    }

    const options = await this._buildPasteOptions(state)
    const defaultOption = this._pickDefaultPasteOption(options)
    if (!defaultOption) {
      this.clearPasteFormatSession()
      return false
    }

    const applyResult = await this.applyPasteOption(defaultOption, selection)
    if (!applyResult) {
      this.clearPasteFormatSession()
      return false
    }

    await nextTick()
    this._setPasteFormatSession(options, defaultOption.type, applyResult.anchorBlockId)
    return true
  }
}

export * from './types'
