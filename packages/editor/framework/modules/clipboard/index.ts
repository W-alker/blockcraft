import {
  BlockNodeType,
  ClipboardEventState,
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
  PasteRegion,
  PasteRegionPoint,
} from "./types";
import {IGapSelectionPoint, ISelectionPointJSON} from "../selection/types";
import {focusBlockSelectionEdge} from "../selection/restore";
import {
  generateId,
  replaceSnapshotsIdDeeply,
  snapshots2Text,
} from "../../utils";
import {DOC_ADAPTER_SERVICE_TOKEN, DOC_FILE_SERVICE_TOKEN} from "../../services";
import {copyBlocks} from "./copyBlocks";
import {applyCopyFilters, resolveCopyFilters, stripBlockLockMetaDeep} from "./copy-filter";
import {
  BLOCKCRAFT_WEB_SNAPSHOT_MIME,
  buildClipboardSnapshotMarkerHtml,
  buildClipboardItems,
  parseClipboardSnapshot,
  parseClipboardSnapshotFromHtml,
  serializeClipboardSnapshot,
  supportsClipboardWriteType,
} from "./internal-clipboard";
import {cloneSnapshot, getMarkdownClipboardText, looksLikeMarkdown} from "./paste-utils";
import {logPasteFormats} from "./paste-debug";
import {
  collectAndStripRehostMarkers,
  isYoudaoHtml,
  parseYoudaoHtml,
  parseYneClipboard,
  rehostYneAttachments,
  YNE_JSON_MIME,
} from "./adapters/yne";
import * as Y from "yjs";
import {
  BlockReadonlyError,
  BlockReadonlyOperation,
} from "../../doc/block-readonly.types";
import {focusEditingHostForBlock} from "../selection/focus-editing-host";
import {getClipboardNavigator} from "./dom-context";
import {insertAbsolutePlacementCopies} from '../../services/block-placement/duplicate-command'

export * from './types'
export * from './copy-filter'

interface GapPastePayload {
  rootSnapshot: IBlockSnapshot
  appliedType: ClipboardPasteFormatType
  exposeFormattedSnapshot: boolean
}

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
    return getClipboardNavigator(this.doc).clipboard.writeText(text)
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
    rootSnapshot = stripBlockLockMetaDeep(rootSnapshot)
    return copyBlocks.call(this, rootSnapshot)
  }

  private _wrapDeltaByRoot(deltas: DeltaInsert[]) {
    const p = this.doc.schemas.createSnapshot('paragraph', [deltas])
    return this.doc.schemas.createSnapshot('root', [generateId(), [p]])
  }

  private _wrapSnapshotsByRoot(snapshots: IBlockSnapshot[]) {
    return this.doc.schemas.createSnapshot('root', [generateId(), snapshots])
  }

  private _hasModelBlock(blockId: string): boolean {
    return typeof (this.doc as any).model?.exists === 'function' && this.doc.model.exists(blockId)
  }

  private _copyBlockSnapshot(blockId: string): IBlockSnapshot {
    if (this._hasModelBlock(blockId)) {
      const snapshot = this.doc.model.toSnapshot(blockId)
      if (snapshot) return snapshot
    }
    return this.doc.getBlockById(blockId).toSnapshot()
  }

  private _copyBlockDeltas(blockId: string): DeltaInsert[] {
    if (this._hasModelBlock(blockId)) {
      return this.doc.model.getTextDeltas(blockId) ?? []
    }
    return (this.doc.getBlockById(blockId) as EditableBlockComponent).textDeltas()
  }

  private _copyBlockText(blockId: string, visiting = new Set<string>()): string {
    if (this._hasModelBlock(blockId)) {
      if (visiting.has(blockId)) return ''
      const deltas = this.doc.model.getTextDeltas(blockId)
      if (deltas) return deltaToString(deltas)
      if (this.doc.model.getNodeType(blockId) === BlockNodeType.void) return ''

      visiting.add(blockId)
      const text = this.doc.model.getChildrenIds(blockId)
        .map(id => this._copyBlockText(id, visiting))
        .join(STR_LINE_BREAK)
      visiting.delete(blockId)
      return text
    }
    return this.doc.getBlockById(blockId).textContent()
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
    const selectionReadonly = this._isSelectionReadonly(selection)
    const filters = resolveCopyFilters(this._copyFilters, opts?.filter)
    if (filters.length) {
      snapshot = applyCopyFilters(snapshot, filters, {source: 'selection', readonly: selectionReadonly}, this.doc.logger)
      if (!snapshot.children.length) return // all content filtered out → no-op, don't clobber clipboard
      plainText = snapshots2Text([snapshot])
    }
    snapshot = stripBlockLockMetaDeep(snapshot)

    const absoluteObjectSelection =
      this.doc.placement?.isAbsoluteObjectSelection(selection) === true
    if (absoluteObjectSelection) {
      // ClipboardEvent.clipboardData is writable only during the synchronous
      // copy event. Object selections have no native Range, so waiting for
      // async adapters can leave the real browser clipboard empty even though
      // a plain DataTransfer-based unit test succeeds. Persist both the native
      // snapshot MIME and an HTML marker before the first await; the latter is
      // the fallback for browsers that strip custom event MIME types.
      this._setClipboardData(clipboardData, {
        [ClipboardDataType.TEXT]: plainText,
        [ClipboardDataType.HTML]: buildClipboardSnapshotMarkerHtml(snapshot),
        [ClipboardDataType.BLOCKCRAFT_SNAPSHOT]: serializeClipboardSnapshot(snapshot),
      })
      await this._writeRichClipboardAsync(snapshot, plainText)
      return
    }

    if (selectionReadonly) {
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

  private _isSelectionReadonly(selection: BlockCraft.Selection): boolean {
    if (this.doc.isReadonly) return true
    const manager = this.doc.readonlyManager
    if (!manager) return false

    const boundaryChildIds = selection.getBoundarySelectedChildIds?.()
    const blockIds = boundaryChildIds ?? (
      selection.isInSameBlock
        ? [selection.start.blockId]
        : this.doc.queryBlocksBetween(selection.firstBlock, selection.lastBlock, true)
    )
    return blockIds.some(blockId => manager.isReadonly(blockId))
  }

  private _assertClipboardSelection(
    selection: BlockCraft.Selection,
    operation: BlockReadonlyOperation,
  ): boolean {
    try {
      this.doc.inputManger?.assertSelectionWritable(selection, operation, 'clipboard')
      return true
    } catch (error) {
      if (!(error instanceof BlockReadonlyError)) throw error
      return false
    }
  }

  private _readAbsoluteObjectClipboardSnapshot(
    state: ClipboardEventState,
  ): IBlockSnapshot | null {
    if (state.dataTypes.includes(ClipboardDataType.BLOCKCRAFT_SNAPSHOT)) {
      const snapshot = parseClipboardSnapshot(
        state.getData(ClipboardDataType.BLOCKCRAFT_SNAPSHOT),
      )
      if (snapshot) return snapshot
    }
    if (state.dataTypes.includes(BLOCKCRAFT_WEB_SNAPSHOT_MIME)) {
      const snapshot = parseClipboardSnapshot(
        state.getData(BLOCKCRAFT_WEB_SNAPSHOT_MIME),
      )
      if (snapshot) return snapshot
    }
    if (state.dataTypes.includes(ClipboardDataType.HTML)) {
      return parseClipboardSnapshotFromHtml(
        state.getData(ClipboardDataType.HTML),
      )
    }
    return null
  }

  private _applyAbsoluteObjectPaste(
    selection: BlockCraft.Selection,
    state: ClipboardEventState,
  ): boolean {
    const rootSnapshot = this._readAbsoluteObjectClipboardSnapshot(state)
    if (
      !rootSnapshot ||
      rootSnapshot.nodeType !== BlockNodeType.root ||
      !rootSnapshot.children.length
    ) {
      return false
    }
    try {
      return !!insertAbsolutePlacementCopies(
        this.doc,
        selection,
        rootSnapshot.children as IBlockSnapshot[],
        BlockReadonlyOperation.Paste,
        'clipboard',
      )
    } catch (error) {
      if (!(error instanceof BlockReadonlyError)) throw error
      return false
    }
  }

  private _buildCopyPayload(selection: BlockCraft.Selection): {snapshot: IBlockSnapshot, plainText: string} {
    const boundaryChildIds = selection.getBoundarySelectedChildIds()
    if (boundaryChildIds) {
      const snapshots = boundaryChildIds.map(id => this._copyBlockSnapshot(id))
      return {
        snapshot: this._wrapSnapshotsByRoot(snapshots),
        plainText: snapshots2Text(snapshots),
      }
    }

    const s = selection.start, e = selection.end
    const startId = (selection as BlockCraft.Selection & {firstBlockId?: string}).firstBlockId ?? selection.firstBlock.id
    const endId = (selection as BlockCraft.Selection & {lastBlockId?: string}).lastBlockId ?? selection.lastBlock.id
    const modelBacked = this._hasModelBlock(startId) && this._hasModelBlock(endId)

    if (selection.isInSameBlock) {
      if (s.type === 'text') {
        const deltas = this._copyBlockDeltas(startId)
        const eOff = e.type === 'text' ? e.offset : deltaStrLength(deltas)
        const sliceDeltas = sliceDelta(deltas, s.offset, eOff)
        return {
          snapshot: this._wrapDeltaByRoot(sliceDeltas),
          plainText: deltaToString(sliceDeltas),
        }
      }
      return {
        snapshot: this._wrapSnapshotsByRoot([this._copyBlockSnapshot(startId)]),
        plainText: this._copyBlockText(startId),
      }
    }

    const snapshots: IBlockSnapshot[] = []
    const plainTextParts: string[] = []
    const startBlock = modelBacked ? null : selection.firstBlock
    const endBlock = modelBacked ? null : selection.lastBlock
    const betweenBlocks = modelBacked
      ? this.doc.queryBlocksBetween(startId, endId)
      : this.doc.queryBlocksBetween(startBlock!, endBlock!)
    const pushSnapshot = (blockId: string) => {
      snapshots.push(this._copyBlockSnapshot(blockId))
      plainTextParts.push(this._copyBlockText(blockId))
    }

    if (s.type === 'text') {
      const deltas = this._copyBlockDeltas(startId)
      const textLength = deltaStrLength(deltas)
      if (s.offset < textLength) {
        const sliceDeltas = sliceDelta(deltas, s.offset, textLength)
        const sn = this._copyBlockSnapshot(startId)
        sn.children = sliceDeltas
        snapshots.push(sn)
        plainTextParts.push(deltaToString(sliceDeltas))
      }
    } else {
      pushSnapshot(startId)
    }

    for (const bid of betweenBlocks) {
      pushSnapshot(bid)
    }

    if (e.type === 'text') {
      if (e.offset > 0) {
        const sliceDeltas = sliceDelta(this._copyBlockDeltas(endId), 0, e.offset)
        const sn = this._copyBlockSnapshot(endId)
        sn.children = sliceDeltas
        snapshots.push(sn)
        plainTextParts.push(deltaToString(sliceDeltas))
      }
    } else {
      pushSnapshot(endId)
    }

    return {
      snapshot: this._wrapSnapshotsByRoot(snapshots),
      plainText: plainTextParts.join(STR_LINE_BREAK),
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
    if (!this._assertClipboardSelection(selection, BlockReadonlyOperation.Paste)) return null
    const originalCollapsedSelection = selection.collapsed ? selection.toJSON() : null
    this.doc.selection.blur()

    const {payload} = option
    if (payload.kind === 'text') {
      return this._applyTextPasteOption(payload.text, selection, originalCollapsedSelection)
    }

    if (payload.kind === 'snapshot') {
      // Clone first: _applySnapshotPasteOption mutates the snapshot in place
      // (replaceSnapshotsIdDeeply + snapshots.shift()). The same option object is
      // reused across every format switch, so applying it must never consume it —
      // otherwise re-selecting a format would paste a progressively shortened tree.
      return this._applySnapshotPasteOption(cloneSnapshot(payload.snapshot), selection, originalCollapsedSelection)
    }

    return null
  }

  /**
   * Re-apply a paste option over the span a previous paste produced.
   *
   * Resolves the tracked {@link PasteRegion} (relative-position anchors) back to a
   * live range selection, then pastes the new option over it. This replaces the
   * old "undo() + re-apply" flow: switching format is now a self-contained,
   * single-undo-item replace that never depends on the global undo stack (which
   * could merge with prior edits, no-op under re-entrancy, or revert too much/little).
   *
   * @param collapsed when the original paste was at a collapsed cursor, leave a
   *   collapsed caret at the paste point (region start) instead of selecting the content.
   * @returns the new region for the next switch, or null if the region no longer resolves.
   */
  async replacePasteRegion(region: PasteRegion, option: ClipboardPasteOption, collapsed = false): Promise<ClipboardPasteApplyResult | null> {
    const selection = this._resolveRegionToSelection(region)
    if (!selection || selection.start.type !== 'text') return null
    if (!this._assertClipboardSelection(selection, BlockReadonlyOperation.Paste)) return null

    // Each switch is its own undo step: stopCapturing keeps Yjs from time-merging it
    // into the paste (or a prior switch).
    this.doc.crud.undoManager.stopCapturing()

    // Collapsed-origin: the caret belongs at the paste point (region start) and stays
    // there across every switch. Park it there BEFORE the change so the undo snapshot
    // records the paste point (not wherever the caret drifted), then
    // captureSelectionBeforeChange picks it up. Net caret position is unchanged → no flash.
    if (collapsed) {
      this._placeCaretAtRegionStart(region)
    }
    this.doc.crud.undoManager.captureSelectionBeforeChange()

    const result = await this.applyPasteOption(option, selection)
    if (!result) return result

    // Set the final selection ourselves, focusing the editing host FIRST so the caret
    // is visible — the content swap removes the node that held focus, dropping it to
    // <body> ("失焦"). collapsed → caret at the paste point (region start); range →
    // reselect the inserted content.
    this._finishSwitchSelection(result.region ?? region, collapsed)
    return result
  }

  /** Park a collapsed caret at the paste point (region start), syncing the model. */
  private _placeCaretAtRegionStart(region: PasteRegion) {
    const start = this._resolveRegionPoint(region.start)
    if (!start || start.type !== 'text') return
    try {
      const block = this.doc.getBlockById(start.blockId)
      this._setCursorAndSync(block, false, start.offset)
    } catch (e) {
      this.doc.logger.warn('placeCaretAtRegionStart error', e)
    }
  }

  /**
   * Final caret/selection after a switch. Focus the editing host first (the content
   * swap drops DOM focus to <body>, hiding the caret), then assert the selection:
   * collapsed-origin → caret at the paste point (region start — stable across switches
   * and undo); range-origin → reselect [start, end].
   */
  private _finishSwitchSelection(region: PasteRegion, collapsed: boolean) {
    const startJson = this._resolveRegionPoint(region.start)
    if (!startJson || startJson.type !== 'text') return
    const headJson = collapsed ? startJson : (this._resolveRegionPoint(region.end) ?? startJson)

    let block: BlockCraft.BlockComponent | null = null
    try {
      block = this.doc.getBlockById(startJson.blockId)
    } catch {
      // anchor block gone — fall back to the root editing host
    }

    try {
      focusEditingHostForBlock(this.doc, block)
      this.doc.selection.replay({anchor: startJson, head: headJson, commonParent: startJson.blockId})
    } catch (e) {
      this.doc.logger.warn('finishSwitchSelection error', e)
    }
  }

  /**
   * Capture the span [startIndex, endIndex] as relative-position anchors. Called
   * right after a paste transaction commits (Y.Text already reflects the inserted
   * content). `endIndex === null` marks a whole-block end (non-editable last block).
   * Start associates right, end associates left, so the region brackets exactly the
   * inserted content even if a remote peer edits at the boundaries before the switch.
   */
  private _captureRegion(
    startBlockId: string,
    startIndex: number,
    endBlockId: string,
    endIndex: number | null,
  ): PasteRegion | null {
    try {
      const startBlock = this.doc.getBlockById(startBlockId)
      if (!this.doc.isEditable(startBlock)) return null
      const start: PasteRegionPoint = {
        blockId: startBlockId,
        rel: Y.createRelativePositionFromTypeIndex(startBlock.yText, startIndex),
      }

      let end: PasteRegionPoint
      if (endIndex == null) {
        end = {blockId: endBlockId, rel: null}
      } else {
        const endBlock = this.doc.getBlockById(endBlockId)
        end = this.doc.isEditable(endBlock)
          ? {blockId: endBlockId, rel: Y.createRelativePositionFromTypeIndex(endBlock.yText, endIndex, -1)}
          : {blockId: endBlockId, rel: null}
      }
      return {start, end}
    } catch (e) {
      this.doc.logger.warn('capturePasteRegion error', e)
      return null
    }
  }

  private _resolveRegionToSelection(region: PasteRegion): BlockCraft.Selection | null {
    const anchor = this._resolveRegionPoint(region.start)
    if (!anchor || anchor.type !== 'text') return null
    const head = this._resolveRegionPoint(region.end)
    if (!head) return null

    // Build the selection WITHOUT a DOM round-trip (no replay → no cursor flash).
    // applyPasteOption works on the model selection directly; moving the live cursor
    // to the region first would visibly jump it on every switch.
    return this.doc.selection.createSelection({anchor, head, commonParent: anchor.blockId})
  }

  private _resolveRegionPoint(point: PasteRegionPoint): ISelectionPointJSON | null {
    let block: BlockCraft.BlockComponent
    try {
      block = this.doc.getBlockById(point.blockId)
    } catch {
      return null
    }
    if (point.rel === null) {
      return {blockId: point.blockId, type: 'selected'}
    }
    if (!this.doc.isEditable(block)) return null
    const abs = Y.createAbsolutePositionFromRelativePosition(point.rel, this.doc.yDoc)
    if (!abs || abs.type !== block.yText) return null
    const offset = Math.max(0, Math.min(abs.index, block.textLength))
    return {blockId: point.blockId, type: 'text', offset}
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

    // Delete + insert in ONE transaction → a single undo step (so Ctrl+Z reverts the
    // whole switch, not just the insert leaving the delete behind).
    this.doc.crud.transact(() => {
      if (!selection.collapsed) {
        this.deleteContentFromSelection(selection)
      }
      editableBlock.replaceText(fromIndex, 0, textLines[0])
      if (appendedSnapshots.length) {
        this.doc.crud.insertBlocksAfter(editableBlock, appendedSnapshots)
      }
    })

    await nextTick()

    const len0 = textLines[0].length
    if (!this._isBlockAlive(editableBlock)) {
      return {anchorBlockId: editableBlock.id, region: null}
    }
    const lastAppended = appendedSnapshots.length
      ? this._getBlockByIdSafe(appendedSnapshots[appendedSnapshots.length - 1].id)
      : null
    if (appendedSnapshots.length && !lastAppended) {
      return {anchorBlockId: editableBlock.id, region: null}
    }
    const region = lastAppended
      ? this._captureRegion(editableBlock.id, fromIndex, lastAppended.id, this.doc.isEditable(lastAppended) ? lastAppended.textLength : null)
      : this._captureRegion(editableBlock.id, fromIndex, editableBlock.id, fromIndex + len0)

    if (selection.collapsed) {
      this._restoreCollapsedSelectionAndSync(originalCollapsedSelection)
    } else if (!lastAppended) {
      this._setTextRangeAndSync(editableBlock, fromIndex, len0)
    } else {
      this._setCrossBlockRangeAndSync(editableBlock, fromIndex, lastAppended)
    }
    return {anchorBlockId: editableBlock.id, region}
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

    // All structural writes go into ONE transaction so the entire re-apply is a
    // single undo step (matching onPaste). Previously delete/split/insert landed in
    // separate Yjs transactions that only merged by a 500ms timer, so Ctrl+Z could
    // revert just a fragment of the switch — losing content or restoring a mid-state.
    let inlineLength = 0           // chars merged inline into editableBlock at fromIndex
    let hasTrailingBlocks = false  // standalone blocks inserted after editableBlock

    this.doc.crud.transact(() => {
      if (isInSameBlock) {
        const ops: DeltaOperation[] = [{retain: fromIndex}]
        const textLength = editableBlock.textLength

        if (snapshots[0].nodeType === BlockNodeType.editable
          && (snapshots[0].flavour === 'paragraph' || snapshots[0].flavour === editableBlock.flavour)
          && compareSimpleValue(snapshots[0].props['heading'] as SimpleBasicType, editableBlock.props['heading']) <= 0
        ) {
          inlineLength = deltaStrLength(snapshots[0].children)
          ops.push(...snapshots[0].children)
          snapshots.shift()
        }

        if (!snapshots.length) {
          editableBlock.deleteText(fromIndex, fromLength)
          editableBlock.applyDeltaOperations(ops)
          return
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
        this.doc.crud.insertBlocksAfter(editableBlock, snapshots)
        hasTrailingBlocks = true
      } else {
        this.deleteContentFromSelection(selection)

        if (snapshots[0].nodeType === BlockNodeType.editable && (snapshots[0].flavour === 'paragraph' || snapshots[0].flavour === editableBlock.flavour)) {
          inlineLength = deltaStrLength(snapshots[0].children)
          editableBlock.applyDeltaOperations([{retain: fromIndex}, ...snapshots[0].children])
          snapshots.shift()
        }

        if (snapshots.length) {
          this.doc.crud.insertBlocksAfter(editableBlock, snapshots)
          hasTrailingBlocks = true
        }
      }
    })

    await nextTick()
    if (!this._isBlockAlive(editableBlock)) {
      return {anchorBlockId: editableBlock.id, region: null}
    }

    if (!hasTrailingBlocks) {
      const region = this._captureRegion(editableBlock.id, fromIndex, editableBlock.id, fromIndex + inlineLength)
      if (collapsed) {
        this._restoreCollapsedSelectionAndSync(originalCollapsedSelection)
      } else {
        this._setTextRangeAndSync(editableBlock, fromIndex, inlineLength)
      }
      return {anchorBlockId: editableBlock.id, region}
    }

    const endBlock = this._getBlockByIdSafe(snapshots[snapshots.length - 1].id)
    if (!endBlock) {
      return {anchorBlockId: editableBlock.id, region: null}
    }
    const region = this._captureRegion(
      editableBlock.id, fromIndex,
      endBlock.id, this.doc.isEditable(endBlock) ? endBlock.textLength : null,
    )
    if (collapsed) {
      this._restoreCollapsedSelectionAndSync(originalCollapsedSelection)
    } else {
      this._setCrossBlockRangeAndSync(editableBlock, fromIndex, endBlock)
    }
    return {anchorBlockId: editableBlock.id, region}
  }

  /**
   * Paste at a gap cursor (collapsed selection beside a void/container block).
   *
   * Inserts the clipboard blocks as SIBLINGS at the gap index — gap-before inserts
   * before the block, gap-after inserts after it — and KEEPS the void/container
   * block (never replaces it). Falls back to a plain-text paragraph paste when no
   * structured snapshot is available.
   *
   * @returns the applied paste result when blocks were inserted, or null on no-op
   *   (nothing usable on the clipboard, or the gap block's parent is gone).
   */
  private async _applyGapPaste(selection: BlockCraft.Selection, state: ClipboardEventState): Promise<ClipboardPasteApplyResult | null> {
    const gapPoint = selection.start as IGapSelectionPoint
    const gapBlock = gapPoint.block
    if (!gapBlock?.parentId) return null

    const payload = await this._collectGapPasteSnapshot(state, gapBlock.props?.depth ?? 0)
    const rootSnapshot = payload?.rootSnapshot
    if (!rootSnapshot || !rootSnapshot.children.length || rootSnapshot.nodeType !== BlockNodeType.root) {
      return null
    }
    try {
      this.doc.readonlyManager?.assertInsertable(
        gapBlock.parentId,
        BlockReadonlyOperation.Paste,
        'clipboard',
      )
    } catch (error) {
      if (!(error instanceof BlockReadonlyError)) throw error
      return null
    }

    const altPlainText = state.getData(ClipboardDataType.TEXT) || null
    const markdownText = getMarkdownClipboardText(state) || (altPlainText && looksLikeMarkdown(altPlainText) ? altPlainText : null)

    // 有道云附件重传标记：插入前统一收集并剥离（绝不写进 Yjs），插入后异步重传。
    const rehostMarkers = collectAndStripRehostMarkers(rootSnapshot)
    if (rehostMarkers.length) {
      nextTick().then(() => rehostYneAttachments(this.doc, rehostMarkers))
    }

    const savedHtmlSnapshot = payload.exposeFormattedSnapshot ? cloneSnapshot(rootSnapshot) : null
    const snapshots: IBlockSnapshot[] = rootSnapshot.children as IBlockSnapshot[]
    replaceSnapshotsIdDeeply(snapshots)

    // Insert as siblings at the gap index. insertBlocksBefore/After resolve the
    // parent + index from the live block and run inside their own transaction, so
    // the void/container block is preserved (no delete) and this is a single undo step.
    const inserted = gapPoint.side === 'after'
      ? this.doc.crud.insertBlocksAfter(gapBlock, snapshots)
      : this.doc.crud.insertBlocksBefore(gapBlock, snapshots)
    if (!inserted.length) return null

    await nextTick()

    // Place the caret in the last inserted block (end of its text, or whole-block).
    const lastBlock = inserted[inserted.length - 1]
    this._setCursorAndSync(lastBlock, true)

    const region = this._captureGapPasteRegion(inserted)
    const result = {
      anchorBlockId: region?.start.blockId ?? lastBlock.id,
      region,
    }

    if (payload.exposeFormattedSnapshot) {
      this.pasteFormatData$.next({
        anchorBlockId: result.anchorBlockId,
        appliedType: payload.appliedType,
        htmlSnapshot: savedHtmlSnapshot,
        plainText: altPlainText,
        markdownText,
        region,
        collapsed: true,
      })
    }

    return result
  }

  /**
   * Resolve the clipboard payload to a root snapshot for a gap paste, trying the
   * structured formats first (internal snapshot → web-custom snapshot → YNE JSON →
   * HTML adapter) and falling back to splitting plain text into paragraphs.
   */
  private async _collectGapPasteSnapshot(state: ClipboardEventState, gapDepth: number): Promise<GapPastePayload | undefined> {
    let rootSnapshot: IBlockSnapshot | undefined
    let exposeFormattedSnapshot = false

    if (state.dataTypes.includes(ClipboardDataType.BLOCKCRAFT_SNAPSHOT)) {
      rootSnapshot = parseClipboardSnapshot(state.getData(ClipboardDataType.BLOCKCRAFT_SNAPSHOT)) || undefined
      exposeFormattedSnapshot = !!rootSnapshot
    }
    if (!rootSnapshot && state.dataTypes.includes(BLOCKCRAFT_WEB_SNAPSHOT_MIME)) {
      rootSnapshot = parseClipboardSnapshot(state.getData(BLOCKCRAFT_WEB_SNAPSHOT_MIME)) || undefined
      exposeFormattedSnapshot = !!rootSnapshot
    }

    if (!rootSnapshot && state.dataTypes.includes(YNE_JSON_MIME)) {
      const snap = parseYneClipboard(state, this.doc)
      if (snap && snap.children.length) {
        rootSnapshot = snap
        exposeFormattedSnapshot = true
      }
    }

    if (!rootSnapshot && state.dataTypes.includes(ClipboardDataType.HTML)) {
      const htmlString = state.getData(ClipboardDataType.HTML)
      if (htmlString) {
        rootSnapshot = parseClipboardSnapshotFromHtml(htmlString) || undefined
        exposeFormattedSnapshot = !!rootSnapshot
        if (!rootSnapshot && isYoudaoHtml(htmlString)) {
          rootSnapshot = parseYoudaoHtml(
            htmlString,
            this.doc.injector.get(DOC_FILE_SERVICE_TOKEN),
          ) || undefined
          exposeFormattedSnapshot = !!rootSnapshot
        }
        if (!rootSnapshot) {
          const htmlAdapter = this.adapter?.getAdapter(ClipboardDataType.HTML)
          if (htmlAdapter) {
            try {
              rootSnapshot = await htmlAdapter.toSnapshot(htmlString)
              exposeFormattedSnapshot = !!rootSnapshot
            } catch (e) {
              this.doc.logger.warn('html2snapshot error in gap paste', e)
            }
          }
        }
      }
    }

    // Plain-text fallback: one paragraph per line, wrapped in a root snapshot.
    if (!rootSnapshot && state.dataTypes.includes(ClipboardDataType.TEXT)) {
      const text = state.getData(ClipboardDataType.TEXT)
      if (!text) return undefined
      const paras = text.replace(/[\n\r]+$/, '').split('\n').map(line =>
        this.doc.schemas.createSnapshot('paragraph', [[{insert: line}], {depth: gapDepth}])
      )
      rootSnapshot = this._wrapSnapshotsByRoot(paras)
    }

    return rootSnapshot
      ? {rootSnapshot, appliedType: exposeFormattedSnapshot ? 'html' : 'plain-text', exposeFormattedSnapshot}
      : undefined
  }

  private _captureGapPasteRegion(inserted: BlockCraft.BlockComponent[]): PasteRegion | null {
    const firstBlock = inserted[0]
    const lastBlock = inserted[inserted.length - 1]
    if (!firstBlock || !lastBlock || !this.doc.isEditable(firstBlock)) return null

    return this._captureRegion(
      firstBlock.id,
      0,
      lastBlock.id,
      this.doc.isEditable(lastBlock) ? lastBlock.textLength : null,
    )
  }

  private _restoreCollapsedSelectionAndSync(selectionJSON: ReturnType<BlockCraft.Selection['toJSON']> | null) {
    if (!selectionJSON) return

    try {
      this.doc.selection.replay(selectionJSON)
    } catch (e) {
      this.doc.logger.warn('restoreCollapsedPasteSelection error', e)
    }
  }

  private _isBlockAlive(block: BlockCraft.BlockComponent | null | undefined): block is BlockCraft.BlockComponent {
    if (!block) return false
    if (typeof (this.doc as any).getBlockById !== 'function') return true
    try {
      return this.doc.getBlockById(block.id) === block
    } catch {
      return false
    }
  }

  private _getBlockByIdSafe(id: string): BlockCraft.BlockComponent | null {
    try {
      return this.doc.getBlockById(id)
    } catch {
      return null
    }
  }

  private _setInlineRangeIfAlive(block: EditableBlockComponent, index: number, length?: number) {
    if (!this._isBlockAlive(block)) return false
    const rangeLength = length ?? 0
    if (
      !Number.isInteger(index) ||
      !Number.isInteger(rangeLength) ||
      index < 0 ||
      rangeLength < 0 ||
      index + rangeLength > block.textLength
    ) {
      return false
    }
    try {
      focusEditingHostForBlock(this.doc, block)
      if (rangeLength > 0) {
        this.doc.selection.setSelection(
          {blockId: block.id, type: 'text', offset: index, block} as any,
          {blockId: block.id, type: 'text', offset: index + rangeLength, block} as any,
        )
      } else {
        this.doc.selection.setCursorAt(block, index)
      }
      return true
    } catch (e) {
      this.doc.logger.warn('setInlineRange after paste failed', e)
      return false
    }
  }

  private _setTextRangeAndSync(block: EditableBlockComponent, index: number, length: number) {
    this._setInlineRangeIfAlive(block, index, length)
  }

  private _setCrossBlockRangeAndSync(startBlock: EditableBlockComponent, startOffset: number, endBlock: BlockCraft.BlockComponent) {
    if (!this._isBlockAlive(startBlock) || !this._isBlockAlive(endBlock)) return
    try {
      focusEditingHostForBlock(this.doc, startBlock)
      this.doc.selection.setSelection({
        blockId: startBlock.id,
        type: 'text',
        offset: startOffset,
        block: startBlock,
      } as any, (this.doc.isEditable(endBlock) ? {
        blockId: endBlock.id,
        type: 'text',
        offset: endBlock.textLength,
        block: endBlock,
      } : {
        blockId: endBlock.id,
        type: 'selected',
        block: endBlock,
      }) as any)
    } catch (e) {
      this.doc.logger.warn('setCrossBlockRange after paste failed', e)
    }
  }

  private _setCursorAndSync(block: BlockCraft.BlockComponent, atEnd = false, index?: number) {
    if (!this._isBlockAlive(block)) return
    try {
      focusEditingHostForBlock(this.doc, block)
      if (this.doc.isEditable(block)) {
        const offset = index ?? (atEnd ? block.textLength : 0)
        this.doc.selection.setCursorAt(block, offset)
      } else if (!focusBlockSelectionEdge(this.doc, block, !atEnd)) {
        this.doc.selection.setCursorAtBlock(block, !atEnd, false)
      }
    } catch (e) {
      this.doc.logger.warn('setCursor after paste failed', e)
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

    const sel = state.selection
    if (!this._assertClipboardSelection(sel, BlockReadonlyOperation.Cut)) return true
    const startType = sel.start.type
    const startBlockId = sel.start.blockId
    const startOffset = startType === 'text' ? sel.start.offset : 0
    this.copyFromSelection(sel, state.clipboardData!).then(() => {
      if (!this._assertClipboardSelection(sel, BlockReadonlyOperation.Cut)) return
      // 异步复制期间端点块可能被远端删除：内容已入剪贴板，删除环节安全放弃，
      // 避免对悬空选区执行删除时未捕获异常中断整个 cut 流程
      const startAlive = !!this.doc.vm.get(startBlockId)
      const endAlive = sel.isInSameBlock || !!this.doc.vm.get(sel.end.blockId)
      if (!startAlive || !endAlive) {
        this.doc.logger.warn('cut: selection block removed during copy, skip delete')
        return
      }
      this.deleteContentFromSelection(sel)
      if (startType === 'text') {
        const block = this.doc.getBlockById(startBlockId) as EditableBlockComponent | null
        if (!block) return
        // 远端并发编辑后旧 offset 可能越界，夹取到现存文本范围
        this.doc.selection.setCursorAt(block as any, Math.min(startOffset, block.textLength))
      }
    }).catch(e => {
      this.doc.logger.warn('cut: delete after copy failed', e)
    })
    return true
  }

  @EventListen('paste')
  async onPaste(context: UIEventStateContext) {
    context.preventDefault()
    this.pasteFormatData$.next(null)
    const state = context.get('clipboardState')

    // Dev-only: dump raw clipboard formats. No-op unless window.__BC_PASTE_LOG__ is set.
    logPasteFormats(state.clipboardData)

    const selection = state.selection
    if (this.doc.placement?.isAbsoluteObjectSelection(selection)) {
      return this._applyAbsoluteObjectPaste(selection, state)
    }
    if (!this._assertClipboardSelection(selection, BlockReadonlyOperation.Paste)) {
      return false
    }

    // Gap cursor paste: insert clipboard blocks as siblings beside the void/container
    // block (keeping it), instead of the text-only paste path below.
    if (selection.start.type === 'gap') {
      return !!(await this._applyGapPaste(selection, state))
    }

    if (selection.start.type !== 'text') return

    const editableBlock = selection.firstBlock as EditableBlockComponent
    // HTML 异步解析路径会在 await 后用 RelativePosition 重解析这两个坐标，其余路径同步使用
    let fromIndex = selection.start.offset
    let fromLength = selection.isInSameBlock && selection.end.type === 'text'
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
        nextTick().then(() => this._setInlineRangeIfAlive(editableBlock, fromIndex, text.length))
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

    // 有道云 text/yne-json —— 浏览器侧的高保真结构化格式（自定义 MIME，Tauri/WKWebView
    // 会剥离，那种环境改由 HTML 分支的 Clipboard adapter 识别 <article data-content>）。
    // 解析失败/未知块返回 null，自然落到下方 HTML 分支（兜底）。
    if (!rootSnapshot && state.dataTypes.includes(YNE_JSON_MIME)) {
      const snap = parseYneClipboard(state, this.doc)
      if (snap && snap.children.length) rootSnapshot = snap
    }

    // html（先由 Clipboard 领域识别有道云，再进入通用 HtmlAdapter）
    if (!rootSnapshot && state.dataTypes.includes(ClipboardDataType.HTML)) {
      const htmlString = state.getData(ClipboardDataType.HTML)
      if (htmlString) {
        rootSnapshot = parseClipboardSnapshotFromHtml(htmlString) || undefined
        if (!rootSnapshot && isYoudaoHtml(htmlString)) {
          rootSnapshot = parseYoudaoHtml(
            htmlString,
            this.doc.injector.get(DOC_FILE_SERVICE_TOKEN),
          ) || undefined
        }
        if (!rootSnapshot) {
          const htmlAdapter = this.adapter?.getAdapter(ClipboardDataType.HTML)
          if (htmlAdapter) {
            // HTML 解析是本流程唯一的异步间隙：解析期间远端可能编辑/删除锚点块，
            // 事件时刻捕获的 fromIndex/fromLength 会漂移。用 RelativePosition
            // 锚定选区端点（一次性创建，无热路径开销），解析完成后重解析回绝对坐标
            const anchorStart = Y.createRelativePositionFromTypeIndex(editableBlock.yText, fromIndex)
            const anchorEnd = Y.createRelativePositionFromTypeIndex(editableBlock.yText, fromIndex + fromLength)
            try {
              rootSnapshot = await htmlAdapter.toSnapshot(htmlString)
            } catch (e) {
              this.doc.logger.warn('html2snapshot error', e)
            }
            // 锚点块在解析期间被远端删除：数据未动，放弃本次粘贴（安全降级）
            if (!this.doc.vm.get(editableBlock.id)) {
              this.doc.logger.warn('paste: anchor block removed during html parsing, abort')
              return false
            }
            const liveStart = Y.createAbsolutePositionFromRelativePosition(anchorStart, this.doc.yDoc)
            const liveEnd = Y.createAbsolutePositionFromRelativePosition(anchorEnd, this.doc.yDoc)
            const liveMax = editableBlock.textLength
            fromIndex = Math.max(0, Math.min(liveStart?.index ?? fromIndex, liveMax))
            fromLength = Math.max(0, Math.min(liveEnd?.index ?? (fromIndex + fromLength), liveMax) - fromIndex)
          }
        }
      }
    }

    // 有道云附件重传：两条有道云路径（text/yne-json + HTML data-content）都在 attachment
    // snapshot 的 meta 上打了重传标记。这里在插入/克隆前统一收集并剥离标记（绝不写进 Yjs、
    // 不同步给协同端），插入后再异步 fetch 重传——只有本地粘贴者做，读取插入后的最终 block id。
    const rehostMarkers = rootSnapshot ? collectAndStripRehostMarkers(rootSnapshot) : []
    if (rehostMarkers.length) {
      nextTick().then(() => rehostYneAttachments(this.doc, rehostMarkers))
    }

    // HTML parsing can yield to remote collaboration. Recheck immediately
    // before the first mutation so a newly locked target cannot be changed.
    if (!this._assertClipboardSelection(selection, BlockReadonlyOperation.Paste)) {
      return false
    }

    // Collect alternative format data before mutations (plugin uses this for format selector)
    const altPlainText = state.getData(ClipboardDataType.TEXT) || null
    const savedHtmlSnapshot = rootSnapshot ? cloneSnapshot(rootSnapshot) : null
    const markdownText = getMarkdownClipboardText(state) || (altPlainText && looksLikeMarkdown(altPlainText) ? altPlainText : null)

    const emitFormatData = (appliedType: ClipboardPasteFormatType, region: PasteRegion | null) => {
      this.pasteFormatData$.next({
        anchorBlockId: editableBlock.id,
        appliedType,
        htmlSnapshot: savedHtmlSnapshot,
        plainText: altPlainText,
        markdownText,
        region,
        collapsed,
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
          // 删除 + 插入并入同一事务：协同方观察不到「已删未插」的中间态
          this.doc.crud.transact(() => {
            editableBlock.deleteText(fromIndex, fromLength)
            editableBlock.applyDeltaOperations(ops)
          })
          insertLength > 0 && nextTick().then(() => {
            collapsed
              ? this._setInlineRangeIfAlive(editableBlock, fromIndex + insertLength)
              : this._setInlineRangeIfAlive(editableBlock, fromIndex, insertLength)
          })
          emitFormatData('html', this._captureRegion(editableBlock.id, fromIndex, editableBlock.id, fromIndex + insertLength))
          return;
        }

        // 拆分/删除 + 行内合并 + 插入后续块并入同一事务（原先分散在 2-3 个
        // 事务，远端会闪现拆分了但内容未到的中间态）
        this.doc.crud.transact(() => {
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
          this.doc.crud.insertBlocksAfter(editableBlock, snapshots)
        })
      } else {
        // 端点存活校验：HTML 异步解析期间选区端点块可能已被远端删除
        const endPoint = state.selection.end
        if (endPoint.blockId !== editableBlock.id && !this.doc.vm.get(endPoint.blockId)) {
          this.doc.logger.warn('paste: selection end block removed during parsing, abort')
          return false
        }

        let mergedInsertLength = 0
        // 跨块粘贴：删选区 + 首块合并 + 插入后续块并入同一事务。
        // 注：deleteContentFromSelection 内部 _replaceText 原设计是「删除事务 +
        // 独立 append 事务」两步；嵌套后被 Yjs 合并为单事务——这是有意为之：
        // 整次粘贴成为一步 undo，远端也只观察到一次原子变更。观察者收到的
        // 合并 delta 若超出增量应用能力，会走一致性检查 → rerender 兜底。
        this.doc.crud.transact(() => {
          // 删除区间内容
          this.deleteContentFromSelection(state.selection)

          // 是否需要和本段合并
          if (snapshots[0].nodeType === BlockNodeType.editable && (snapshots[0].flavour === 'paragraph' || snapshots[0].flavour === editableBlock.flavour)) {
            mergedInsertLength = deltaStrLength(snapshots[0].children)
            editableBlock.applyDeltaOperations([{retain: fromIndex}, ...snapshots[0].children])
            snapshots.shift()
          }

          if (snapshots.length) {
            this.doc.crud.insertBlocksAfter(editableBlock, snapshots)
          }
        })

        if (!snapshots.length) {
          mergedInsertLength > 0 && nextTick().then(() => {
            collapsed
              ? this._setInlineRangeIfAlive(editableBlock, fromIndex + mergedInsertLength)
              : this._setInlineRangeIfAlive(editableBlock, fromIndex, mergedInsertLength)
          })
          emitFormatData('html', this._captureRegion(editableBlock.id, fromIndex, editableBlock.id, fromIndex + mergedInsertLength))
          return
        }
      }

      // 粘贴块的选区设置（原 chain.tap 逻辑；插入已在上方事务内完成）
      const endBlock = this.doc.getBlockById(snapshots[snapshots.length - 1].id)
      if (!collapsed) {
        this.doc.selection.setSelection({
          blockId: editableBlock.id,
          type: 'text',
          offset: fromIndex,
          block: editableBlock,
        } as any, (this.doc.isEditable(endBlock) ? {
          blockId: endBlock.id,
          type: 'text',
          offset: endBlock.textLength,
          block: endBlock,
        } : {
          blockId: endBlock.id,
          type: 'selected',
          block: endBlock,
        }) as any)
      }
      emitFormatData('html', this._captureRegion(
        editableBlock.id, fromIndex,
        endBlock.id, this.doc.isEditable(endBlock) ? endBlock.textLength : null,
      ))
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
          collapsed
            ? this._setInlineRangeIfAlive(editableBlock, fromIndex + text.length)
            : this._setInlineRangeIfAlive(editableBlock, fromIndex, fromLength)
        })
        return true
      }

      const textLines = text.replace(/[\n\r]+$/, '').split('\n')
      let finalCursorBlockId = editableBlock.id
      let finalCursorOffset = fromIndex + textLines[0].length
      this.doc.crud.transact(() => {
        if (isInSameBlock) {
          editableBlock.replaceText(fromIndex, fromLength, textLines[0])
        } else {
          this.deleteContentFromSelection(state.selection)
          editableBlock.applyDeltaOperations([{retain: fromIndex}, {insert: textLines[0]}])
        }
        if (textLines.length > 1) {
          const snapshots = textLines.slice(1).map(line => this.doc.schemas.createSnapshot('paragraph', [[{insert: line}], {depth: editableBlock.props.depth}]))
          const inserted = this.doc.crud.insertBlocksAfter(editableBlock, snapshots)
          const lastInserted = inserted[inserted.length - 1]
          finalCursorBlockId = lastInserted?.id ?? snapshots[snapshots.length - 1].id
          finalCursorOffset = textLines[textLines.length - 1].length
        }
      })
      if (markdownText) {
        emitFormatData('plain-text', this._captureRegion(
          editableBlock.id,
          fromIndex,
          finalCursorBlockId,
          finalCursorOffset,
        ))
      }
      requestAnimationFrame(() => {
        const finalBlock = this._getBlockByIdSafe(finalCursorBlockId)
        if (!finalBlock || !this.doc.isEditable(finalBlock)) return
        this._setCursorAndSync(
          finalBlock,
          false,
          Math.min(finalCursorOffset, finalBlock.textLength),
        )
      })
      return true
    }

    return false
  }
}
