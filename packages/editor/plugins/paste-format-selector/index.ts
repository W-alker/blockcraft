import {OverlayRef} from "@angular/cdk/overlay";
import {Subject, Subscription, takeUntil} from "rxjs";
import {
  ClipboardDataType,
  ClipboardPasteOption,
  ClipboardPasteSessionView,
  DocPlugin,
  EventListen,
  generateId,
  getPositionWithOffset,
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

  private overlayRef?: OverlayRef
  private close$?: Subject<void>
  private sub = new Subscription()

  init() {
    this.sub.add(this.doc.clipboard.pasteFormatSession$.pipe(takeUntil(this.doc.onDestroy$)).subscribe(session => {
      void this._renderSession(session)
    }))
  }

  destroy() {
    this.closeOverlay()
    this.sub.unsubscribe()
  }

  @EventListen('paste', {flavour: 'root'})
  onPaste(context: UIEventStateContext) {
    const state = context.get('clipboardState')
    if (!state.dataTypes.includes(ClipboardDataType.FILES)) return false
    if (state.selection.isAllSelected || state.selection.from.type !== 'text') return false

    const files = Array.from(state.clipboardData?.files || [])
    if (files.length !== 1 || !this._isSpreadsheetFile(files[0]!)) return false

    context.preventDefault()
    void this._pasteSpreadsheetFile(files[0]!, state.selection)
    return true
  }

  private async _renderSession(session: ClipboardPasteSessionView | null) {
    this.closeOverlay()
    if (!session) return

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
      this.overlayRef = undefined
      this.close$ = undefined
    })

    this.overlayRef = overlayRef
    this.close$ = close$
    componentRef.setInput('session', session)
    componentRef.instance.formatChange.subscribe(type => {
      void this.doc.clipboard.reapplyLastPaste(type)
    })

    this.doc.event.customListen(document, 'mousedown').pipe(takeUntil(close$)).subscribe(event => {
      const target = event.target as Node | null
      if (target && overlayRef.overlayElement.contains(target)) return
      this.doc.clipboard.clearPasteFormatSession()
    })

    this.doc.event.customListen(document, 'keydown').pipe(takeUntil(close$)).subscribe(event => {
      const target = event.target as Node | null
      if (target && overlayRef.overlayElement.contains(target)) return
      this.doc.clipboard.clearPasteFormatSession()
    })
  }

  private closeOverlay() {
    this.close$?.next()
    this.close$ = undefined
    this.overlayRef = undefined
  }

  private _getAnchorBlock(blockId: string) {
    try {
      return this.doc.getBlockById(blockId)
    } catch {
      return null
    }
  }

  private _isSpreadsheetFile(file: File) {
    if (SPREADSHEET_MIME_TYPES.has(file.type)) {
      return true
    }

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
      this.doc.clipboard.clearPasteFormatSession()
    } catch (error) {
      this.doc.logger.warn('spreadsheet paste parse error', error)
      this.doc.messageService.error('Excel 文件解析失败')
    }
  }

  private async _readSpreadsheetMatrix(file: File) {
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
      .map((row: Array<string | number | boolean | null>) => row.map(cell => cell == null ? '' : String(cell).trim()))
      .filter((row: string[]) => row.some((cell: string) => cell.length > 0))
  }
}
