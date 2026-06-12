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
  ClipboardCopyFilter,
  ClipboardDataType,
  ClipboardPasteApplyResult,
  ClipboardPasteCompletedEvent,
  ClipboardPasteFormatType,
  ClipboardPasteOption,
} from "./types";
import {
  generateId,
  replaceSnapshotsIdDeeply,
  snapshots2Text,
} from "../../utils";
import {DOC_ADAPTER_SERVICE_TOKEN} from "../../services";
import {copyBlocks} from "./copyBlocks";
import {applyCopyFilters, resolveCopyFilters} from "./copy-filter";
import {
  BLOCKCRAFT_WEB_SNAPSHOT_MIME,
  buildClipboardItems,
  parseClipboardSnapshot,
  parseClipboardSnapshotFromHtml,
  serializeClipboardSnapshot,
  supportsClipboardWriteType,
} from "./internal-clipboard";
import {cloneSnapshot, getMarkdownClipboardText, looksLikeMarkdown} from "./paste-utils";

export * from './types'
export * from './copy-filter'

@DocEventRegister
export class ClipboardManager {
  adapter = this.doc.injector.get(DOC_ADAPTER_SERVICE_TOKEN)

  /** Emits null to clear, or format data after a paste with alternatives. */
  readonly pasteFormatData$ = new Subject<ClipboardPasteCompletedEvent | null>()

  /** Composable copy-filter registry. Seeded by config; plugins append via registerCopyFilter. */
  private _copyFilters: ClipboardCopyFilter[] =
    this.doc.config.copyFilter ? [this.doc.config.copyFilter] : []

  /**
   * Register a copy filter. Returns a disposer.
   * Plugins call this in init() and the disposer in destroy(); filters compose in registration order.
   */
  registerCopyFilter(filter: ClipboardCopyFilter): () => void {
    this._copyFilters.push(filter)
    return () => {
      const i = this._copyFilters.indexOf(filter)
      if (i >= 0) this._copyFilters.splice(i, 1)
    }
  }

  constructor(public readonly doc: BlockCraft.Doc) {
  }

  copyText(text: string) {
    return navigator.clipboard.writeText(text)
  }

  copyBlocksModel = (
    snapshots: IBlockSnapshot[],
    opts?: { filter?: ClipboardCopyFilter | false }
  ): Promise<void> => {
    if (!snapshots?.length) return Promise.reject('no blocks to copy')
    let rootSnapshot = this._wrapSnapshotsByRoot(snapshots)
    const filters = resolveCopyFilters(this._copyFilters, opts?.filter)
    if (filters.length) {
      rootSnapshot = applyCopyFilters(rootSnapshot, filters, {source: 'programmatic', readonly: this.doc.isReadonly}, this.doc.logger)
      if (!rootSnapshot.children.length) return Promise.reject('all blocks filtered out')
    }
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

  copyFromSelection = async (
    selection: BlockCraft.Selection,
    clipboardData: DataTransfer,
    opts?: { filter?: ClipboardCopyFilter | false }
  ) => {
    let {snapshot, plainText} = this._buildCopyPayload(selection)
    const filters = resolveCopyFilters(this._copyFilters, opts?.filter)
    if (filters.length) {
      snapshot = applyCopyFilters(snapshot, filters, {source: 'selection', readonly: this.doc.isReadonly}, this.doc.logger)
      if (!snapshot.children.length) return // all content filtered out → no-op, don't clobber clipboard
      plainText = snapshots2Text([snapshot])
    }

    if (this.doc.isReadonly) {
      // 只读模式：contenteditable=false 时 Chromium（特别是 Windows）会在
      // 同步 copy 事件 handler 返回后立刻解绑 event.clipboardData，await 之后
      // 的 setData 会被丢——之前 Windows 上只读复制完全拿不到内容就是这个
      // 原因。这里改成两步：
      //   1. 同步写最小集（TEXT + 内部 snapshot）兜底，确保 sync 窗口里
      //      就已经有内容落地
      //   2. 异步走 navigator.clipboard.write（接受 Promise，不受同步事件
      //      窗口限制）覆盖富文本 MIME；非内置 MIME 自动走 `web ` 前缀的
      //      Web Custom Format，BC↔BC 内部粘贴可以从那边恢复
      // 外部应用读取 `text/markdown` / `text/rtf` 这类非标准 MIME 在这条
      // 路径下会拿不到，是 web 平台 async clipboard 的硬约束，不是回归。
      this._setClipboardData(clipboardData, {
        [ClipboardDataType.TEXT]: plainText,
        [ClipboardDataType.BLOCKCRAFT_SNAPSHOT]: serializeClipboardSnapshot(snapshot),
      })
      await this._writeRichClipboardAsync(snapshot, plainText)
      return
    }

    // 可编辑模式：沿用旧路径——await 完 adapter 转换后再一次性 setData。
    // 可编辑上下文里 Chromium 对同一 copy 事件 microtask 内的 setData 容忍
    // 度高，所有 adapter 产出的 MIME（含 text/markdown / text/rtf 等非内置
    // 类型）都能直写到 event.clipboardData，粘贴到外部应用时格式完整。
    const items = await buildClipboardItems(this.adapter.supportedAdapters, snapshot, plainText)
    this._setClipboardData(clipboardData, items)
  }

  private _buildCopyPayload(selection: BlockCraft.Selection): {snapshot: IBlockSnapshot, plainText: string} {
    const s = selection.start, e = selection.end
    const startBlock = selection.firstBlock
    const endBlock = selection.lastBlock

    if (selection.isInSameBlock) {
      if (s.type === 'text') {
        const eOff = (e.type === 'text' ? e.offset : (startBlock as EditableBlockComponent).textLength)
        const sliceDeltas = sliceDelta((startBlock as EditableBlockComponent).textDeltas(), s.offset, eOff)
        return {
          snapshot: this._wrapDeltaByRoot(sliceDeltas),
          plainText: deltaToString(sliceDeltas),
        }
      }
      return {
        snapshot: this._wrapSnapshotsByRoot([startBlock.toSnapshot()]),
        plainText: startBlock.textContent(),
      }
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
        const sn = sBlock.toSnapshot()
        sn.children = sliceDeltas
        snapshots.unshift(sn)
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
        const sn = eBlock.toSnapshot()
        sn.children = sliceDeltas
        snapshots.push(sn)
        plainText += deltaToString(sliceDeltas)
      }
    } else {
      snapshots.push(endBlock.toSnapshot())
      plainText = endBlock.textContent() + plainText
    }

    return {
      snapshot: this._wrapSnapshotsByRoot(snapshots),
      plainText,
    }
  }

  private async _writeRichClipboardAsync(snapshot: IBlockSnapshot, plainText: string): Promise<void> {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.write) return
    if (typeof ClipboardItem === 'undefined') return

    let items: Record<string, string>
    try {
      items = await buildClipboardItems(this.adapter.supportedAdapters, snapshot, plainText)
    } catch (e) {
      this.doc.logger.warn('buildClipboardItems error', e)
      return
    }

    // 内置 MIME（text/plain、text/html、image/png）直写；其余 MIME（markdown、
    // rtf、blockcraft snapshot 等）一律包成 Web Custom Format（`web <mime>`），
    // 这样 navigator.clipboard.write 的整体调用能容纳全部 adapter 产出，BC↔BC
    // 内部粘贴可以从这些 web 前缀类型恢复完整 snapshot/markdown/rtf 数据。
    // 注意：外部应用（Word / Google Docs / 第三方 MD 编辑器）只读取原始 MIME，
    // 不识别 `web ` 前缀——这是 web 平台 async clipboard API 的硬约束，
    // 没法在保留 Windows 兼容的同时同时满足。
    const itemData: Record<string, Blob> = {}
    for (const [type, value] of Object.entries(items)) {
      if (supportsClipboardWriteType(type)) {
        itemData[type] = new Blob([value], {type})
        continue
      }
      const webType = `web ${type}`
      if (supportsClipboardWriteType(webType)) {
        itemData[webType] = new Blob([value], {type: webType})
      }
    }

    if (Object.keys(itemData).length === 0) return

    try {
      await navigator.clipboard.write([new ClipboardItem(itemData)])
    } catch (e) {
      this.doc.logger.warn('navigator.clipboard.write error', e)
    }
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
      // 收缩选区粘贴后不重设光标位置；仅范围选区时把粘贴内容选中
      if (!collapsed) {
        nextTick().then(() => editableBlock.setInlineRange(fromIndex, text.length))
      }
      return true
    }

    // file
    if (state.dataTypes.includes(ClipboardDataType.FILES)) {
      return false
    }

    let rootSnapshot: IBlockSnapshot | undefined

    // internal snapshot —— 优先取直 MIME；若被 navigator.clipboard.write 覆盖到
    // `web ` 前缀变体下也能恢复，保证 BC↔BC 内部粘贴不依赖 HTML marker 路径。
    if (!rootSnapshot && state.dataTypes.includes(ClipboardDataType.BLOCKCRAFT_SNAPSHOT)) {
      rootSnapshot = parseClipboardSnapshot(state.getData(ClipboardDataType.BLOCKCRAFT_SNAPSHOT)) || undefined
    }
    if (!rootSnapshot && state.dataTypes.includes(BLOCKCRAFT_WEB_SNAPSHOT_MIME)) {
      rootSnapshot = parseClipboardSnapshot(state.getData(BLOCKCRAFT_WEB_SNAPSHOT_MIME)) || undefined
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
