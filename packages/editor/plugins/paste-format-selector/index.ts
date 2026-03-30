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
  ISelectionJSON,
  UIEventStateContext
} from "../../framework";
import {createTableSnapshotFromMatrix} from "../../framework/modules/clipboard/paste-utils";
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
  private _selectionJSON: ISelectionJSON | null = null
  private _sub = new Subscription()

  init() {
    this._sub.add(
      this.doc.clipboard.pasteFormatData$.subscribe(event => {
        if (!event) {
          this._clearSession()
          return
        }
        void this._handlePasteCompleted(event)
      })
    )
  }

  destroy() {
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
    void this._pasteSpreadsheetFile(files[0]!, state.selection)
    return true
  }

  // ── Session management (moved from ClipboardManager) ──

  private async _handlePasteCompleted(event: ClipboardPasteCompletedEvent) {
    const {anchorBlockId, appliedType, htmlSnapshot, plainText, markdownText} = event

    const options: ClipboardPasteOption[] = []

    // Markdown option: parse raw text to snapshot
    if (markdownText) {
      const adapter = this.doc.injector.get(DOC_ADAPTER_SERVICE_TOKEN)
      const mdAdapter = adapter?.getAdapter(ClipboardDataType.MARKDOWN)
      if (mdAdapter) {
        try {
          const mdSnapshot = await mdAdapter.toSnapshot(markdownText)
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

    if (options.length <= 1) return

    this._session = {anchorBlockId, selectedType: appliedType, options}
    this._selectionJSON = event.selectionJSON
    this._emitSessionView()
  }

  private async _reapplyPaste(type: ClipboardPasteFormatType) {
    const session = this._session
    if (!session || session.selectedType === type) return

    const option = session.options.find(o => o.type === type)
    if (!option) return

    try {
      this.doc.crud.undoManager.undo()
      await nextTick()

      // Restore the pre-paste selection since undo may not restore it reliably
      if (this._selectionJSON) {
        this.doc.selection.replay(this._selectionJSON)
        await nextTick()
      }

      const selection = this.doc.selection.value
      if (!selection) {
        this._clearSession()
        return
      }

      const result = await this.doc.clipboard.applyPasteOption(option, selection)
      if (result) {
        session.selectedType = type
        session.anchorBlockId = result.anchorBlockId
        this._emitSessionView()
      } else {
        this._clearSession()
      }
    } catch (e) {
      this.doc.logger.warn('reapplyPaste error', e)
      this._clearSession()
    }
  }

  private _clearSession() {
    this._session = null
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
    void this._createOverlay(session)
  }

  private async _createOverlay(session: ClipboardPasteSessionView) {
    await nextTick()
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
      this._overlayRef = undefined
      this._close$ = undefined
    })

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

  // ── Spreadsheet helpers ──

  private _isSpreadsheetFile(file: File): boolean {
    if (SPREADSHEET_MIME_TYPES.has(file.type)) return true
    const ext = file.name.split('.').pop()?.toLowerCase()
    return ext ? SPREADSHEET_EXTENSIONS.has(ext) : false
  }

  private async _pasteSpreadsheetFile(file: File, selection: BlockCraft.Selection) {
    try {
      const matrix = await this._readSpreadsheetMatrix(file)
      if (!matrix.length) {
        this.doc.messageService.warn('未能解析到表格数据')
        return
      }

      const snapshot = this.doc.schemas.createSnapshot('root', [generateId(), [
        createTableSnapshotFromMatrix(this.doc, matrix, selection.firstBlock.props.depth || 0)
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
