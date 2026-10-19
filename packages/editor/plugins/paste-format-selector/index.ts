import {OverlayRef} from "@angular/cdk/overlay";
import {Subject, Subscription, takeUntil} from "rxjs";
import {
  ClipboardDataType,
  ClipboardPasteCompletedEvent,
  ClipboardPasteFormatType,
  ClipboardPasteOption,
  ClipboardPasteSession,
  ClipboardPasteSessionView,
  DocPlugin,
  DOC_ADAPTER_SERVICE_TOKEN,
  EventListen,
  generateId,
  getPositionWithOffset,
  IBlockSnapshot,
  PasteRegion,
  UIEventStateContext
} from "../../framework";
import {createTableSnapshotFromMatrix} from "../../framework/modules/clipboard/paste-utils";
import {isSelectionAlive} from "../../framework/modules/selection/liveness";
import {nextTick} from "../../global";
import {PasteFormatSelectorComponent} from "./widgets/paste-format-selector.component";

const SPREADSHEET_MIME_TYPES = new Set([
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.oasis.opendocument.spreadsheet',
  'text/csv',
]);

const SPREADSHEET_EXTENSIONS = new Set(['xls', 'xlsx', 'ods', 'csv']);

export class PasteFormatSelectorPlugin extends DocPlugin {
  override name = 'paste-format-selector'

  private _overlayRef?: OverlayRef
  private _close$?: Subject<void>
  private _updateSession?: (session: ClipboardPasteSessionView) => void
  private _session: ClipboardPasteSession | null = null
  private _region: PasteRegion | null = null
  private _collapsed = false
  private _reapplying = false
  private _sub = new Subscription()
  private _destroyed = false
  private _overlayCreateSeq = 0
  private _pasteEventSeq = 0

  init() {
    this._destroyed = false
    this._sub.add(
      this.doc.clipboard.pasteFormatData$.subscribe(event => {
        const seq = ++this._pasteEventSeq
        if (!event) {
          this._clearSession()
          return
        }
        void this._handlePasteCompleted(event, seq)
      })
    )
  }

  destroy() {
    this._destroyed = true
    this._pasteEventSeq++
    this._overlayCreateSeq++
    this._closeOverlay()
    this._sub.unsubscribe()
  }

  // ── Spreadsheet paste ──

  @EventListen('paste', {flavour: 'root'})
  onPaste(context: UIEventStateContext) {
    const state = context.get('clipboardState')
    if (!state.dataTypes.includes(ClipboardDataType.FILES)) return false
    if (state.selection.isAllSelected || state.selection.start.type !== 'text') return false

    const files = Array.from(state.clipboardData?.files || [])
    if (files.length !== 1 || !this._isSpreadsheetFile(files[0]!)) return false

    context.preventDefault()
    const seq = ++this._pasteEventSeq
    const depth = this._selectionDepth(state.selection)
    if (depth == null) {
      this.doc.messageService.warn('当前位置无法插入表格')
      return true
    }
    void this._pasteSpreadsheetFile(files[0]!, state.selection, depth, seq)
    return true
  }

  // ── Session management (moved from ClipboardManager) ──

  private async _handlePasteCompleted(event: ClipboardPasteCompletedEvent, seq = ++this._pasteEventSeq) {
    if (!this._isCurrentPasteEvent(seq)) return
    if (!event.region) {
      this._clearSession()
      return
    }
    const {anchorBlockId, appliedType, htmlSnapshot, plainText, markdownText} = event

    const options: ClipboardPasteOption[] = []

    // Markdown option: parse raw text to snapshot
    if (markdownText) {
      const adapter = this.doc.injector.get(DOC_ADAPTER_SERVICE_TOKEN)
      const mdAdapter = adapter?.getAdapter(ClipboardDataType.MARKDOWN)
      if (mdAdapter) {
        try {
          const mdSnapshot = await mdAdapter.toSnapshot(markdownText)
          if (!this._isCurrentPasteEvent(seq)) return
          options.push({type: 'markdown', label: 'Markdown', payload: {kind: 'snapshot', snapshot: mdSnapshot}})
        } catch (e) {
          this.doc.logger.warn('markdown2snapshot error', e)
        }
      }
    }

    if (htmlSnapshot) {
      options.push({type: 'html', label: '保留格式', payload: {kind: 'snapshot', snapshot: htmlSnapshot}})
    }
    if (plainText) {
      options.push({type: 'plain-text', label: '纯文本', payload: {kind: 'text', text: plainText}})
    }

    if (!this._isCurrentPasteEvent(seq)) return
    if (options.length <= 1) {
      this._clearSession()
      return
    }

    this._session = {anchorBlockId, selectedType: appliedType, options}
    this._region = event.region
    this._collapsed = event.collapsed
    this._emitSessionView()
  }

  private _isCurrentPasteEvent(seq: number) {
    return !this._destroyed && seq === this._pasteEventSeq
  }

  private async _reapplyPaste(type: ClipboardPasteFormatType) {
    const session = this._session
    if (!session || session.selectedType === type || !this._region) return

    const option = session.options.find(o => o.type === type)
    if (!option) return

    // Serialize switches: a re-apply is async (selection round-trip + Yjs writes).
    // Without this guard a fast second click would run while the first's writes are
    // still landing, interleaving regions and orphaning blocks ("内容越来越多").
    if (this._reapplying) return
    this._reapplying = true

    try {
      // Select the span the previous paste produced and replace it in place. No
      // undo() — the region is self-contained, so switching never depends on the
      // global undo stack (which could merge with prior edits or no-op).
      const result = await this.doc.clipboard.replacePasteRegion(this._region, option, this._collapsed)
      if (this._destroyed) return
      if (result && result.region) {
        this._region = result.region
        session.selectedType = type
        session.anchorBlockId = result.anchorBlockId
        this._emitSessionView()
      } else {
        this._clearSession()
      }
    } catch (e) {
      this.doc.logger.warn('reapplyPaste error', e)
      this._clearSession()
    } finally {
      this._reapplying = false
    }
  }

  private _clearSession() {
    this._session = null
    this._region = null
    this._collapsed = false
    this._overlayCreateSeq++
    this._renderSession(null)
  }

  private _emitSessionView() {
    const session = this._session
    if (!session) {
      this._renderSession(null)
      return
    }
    this._renderSession({
      anchorBlockId: session.anchorBlockId,
      selectedType: session.selectedType,
      options: session.options.map(o => ({type: o.type, label: o.label}))
    })
  }

  // ── Overlay rendering ──

  private _renderSession(session: ClipboardPasteSessionView | null) {
    if (!session) {
      this._closeOverlay()
      return
    }

    // If overlay already exists, just update the input to avoid destroy/recreate cycle
    if (this._overlayRef && this._updateSession) {
      this._updateSession(session)
      return
    }

    this._closeOverlay()
    const seq = ++this._overlayCreateSeq
    void this._createOverlay(session, seq)
  }

  private async _createOverlay(session: ClipboardPasteSessionView, seq: number) {
    await nextTick()
    if (this._destroyed || seq !== this._overlayCreateSeq) return
    const anchor = this._getAnchorBlock(session.anchorBlockId)
    if (!anchor) return

    const close$ = new Subject<void>()
    const {componentRef, overlayRef} = this.doc.overlayService.createConnectedOverlay<PasteFormatSelectorComponent>({
      target: anchor,
      component: PasteFormatSelectorComponent,
      positions: [
        getPositionWithOffset('bottom-right', 0, 8),
        getPositionWithOffset('top-right', 0, 8),
        getPositionWithOffset('bottom-left', 0, 8),
      ]
    }, close$, () => {
      if (seq !== this._overlayCreateSeq) return
      this._overlayRef = undefined
      this._close$ = undefined
    })

    if (this._destroyed || seq !== this._overlayCreateSeq) {
      close$.next()
      overlayRef.dispose()
      return
    }

    this._overlayRef = overlayRef
    this._close$ = close$
    this._updateSession = (s) => componentRef.setInput('session', s)
    componentRef.setInput('session', session)

    componentRef.instance.formatChange.subscribe(type => {
      void this._reapplyPaste(type)
    })

    const dismissOverlay = () => this._clearSession()

    this.doc.event.customListen(document, 'mousedown')
      .pipe(takeUntil(close$))
      .subscribe(event => {
        if (overlayRef.overlayElement.contains(event.target as Node)) return
        dismissOverlay()
      })

    this.doc.event.customListen(document, 'keydown')
      .pipe(takeUntil(close$))
      .subscribe(event => {
        if (overlayRef.overlayElement.contains(event.target as Node)) return
        dismissOverlay()
      })
  }

  private _closeOverlay() {
    this._overlayCreateSeq++
    this._close$?.next()
    this._close$ = undefined
    this._overlayRef = undefined
    this._updateSession = undefined
  }

  private _getAnchorBlock(blockId: string) {
    try {
      return this.doc.getBlockById(blockId)
    } catch {
      return null
    }
  }

  private _selectionDepth(selection: BlockCraft.Selection): number | null {
    if (!isSelectionAlive(selection as any, this.doc)) return null
    try {
      return selection.firstBlock.props.depth || 0
    } catch {
      return null
    }
  }

  // ── Spreadsheet helpers ──

  private _isSpreadsheetFile(file: File): boolean {
    if (SPREADSHEET_MIME_TYPES.has(file.type)) return true
    const ext = file.name.split('.').pop()?.toLowerCase()
    return ext ? SPREADSHEET_EXTENSIONS.has(ext) : false
  }

  private async _pasteSpreadsheetFile(file: File, selection: BlockCraft.Selection, depth: number, seq: number) {
    try {
      const matrix = await this._readSpreadsheetMatrix(file)
      if (!this._isCurrentPasteEvent(seq)) return
      if (!matrix.length) {
        this.doc.messageService.warn('未能解析到表格数据')
        return
      }
      if (!isSelectionAlive(selection as any, this.doc)) {
        this.doc.logger.warn('spreadsheet paste target selection is stale, abort')
        return
      }

      const snapshot = this.doc.schemas.createSnapshot('root', [generateId(), [
        createTableSnapshotFromMatrix(this.doc, matrix, depth)
      ]])
      const option: ClipboardPasteOption = {
        type: 'table',
        label: '表格',
        payload: {
          kind: 'snapshot',
          snapshot
        }
      }
      const applyResult = await this.doc.clipboard.applyPasteOption(option, selection)
      if (!this._isCurrentPasteEvent(seq)) return
      if (!applyResult) {
        this.doc.messageService.warn('当前位置无法插入表格')
        return
      }
      this._clearSession()
    } catch (error) {
      this.doc.logger.warn('spreadsheet paste parse error', error)
      this.doc.messageService.error('Excel 文件解析失败')
    }
  }

  private async _readSpreadsheetMatrix(file: File): Promise<string[][]> {
    const XLSX = await import('xlsx')
    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer, {type: 'array', raw: false, cellText: true})
    const firstSheetName = workbook.SheetNames[0]
    if (!firstSheetName) return []

    const sheet = workbook.Sheets[firstSheetName]
    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      blankrows: false,
      defval: ''
    }) as Array<Array<string | number | boolean | null>>

    return rows
      .map((row) => row.map(cell => cell == null ? '' : String(cell).trim()))
      .filter((row) => row.some((cell) => cell.length > 0))
  }
}
