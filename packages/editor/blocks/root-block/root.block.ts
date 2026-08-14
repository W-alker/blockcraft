import {ChangeDetectionStrategy, Component, HostListener} from "@angular/core";
import {
  BaseBlockComponent,
  BlockNodeType,
  closetBlockId,
  normalizeDocumentFontSize,
  normalizeTypographyLineHeight,
  resolveTypographyFontFamily,
  UIEventStateContext,
} from "../../framework";
import {RootBlockModel} from "./index";
import {BehaviorSubject, fromEvent, skip, take, takeUntil} from "rxjs";

@Component({
  selector: 'div.root-block[data-blockcraft-root="true"]',
  template: ``,
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[style.font-family]': 'documentFontFamily',
    '[style.--bc-fs]': 'documentFontSize',
    '[style.--bc-lh]': 'documentLineHeight',
    '[style.color]': 'props.color',
    '[style.--bc-color]': 'props.color',
  }
})
export class RootBlockComponent extends BaseBlockComponent<RootBlockModel> {
  private typographyRefreshQueued = false

  get documentFontFamily(): string | null {
    return resolveTypographyFontFamily(this._native?.props?.ff)
  }

  get documentFontSize(): string | null {
    const fontSize = normalizeDocumentFontSize(this._native?.props?.fs)
    return fontSize === null ? null : `${fontSize}px`
  }

  get documentLineHeight(): string | null {
    const lineHeight = normalizeTypographyLineHeight(this._native?.props?.lh)
    return lineHeight === null ? null : `${lineHeight}`
  }

  @HostListener('contextmenu', ['$event'])
  onContextMenu(event: MouseEvent) {
    event.preventDefault()
  }

  @HostListener('mousedown', ['$event'])
  onSelectStart(event: MouseEvent) {
    if (event.target === this.hostElement) {
      // event.preventDefault()
    }
  }

  private selecting$ = new BehaviorSubject<'end' | 'start' | 'moving'>("end")
  // Set 追踪：单引用模式下，leaveListen 链中前一级 block 的清理订阅若被
  // `selecting$` 的下次 emit 通过 takeUntil 提前打断，pointerleave handler
  // 永远不会执行，`.selecting` 类就会卡死。改用 Set 收集所有打上类的 block，
  // 配合 _cleanupAllSelecting 兜底清理。
  private selectingBlocks = new Set<BlockCraft.BlockComponent>()

  private _isInsideTable(block: BlockCraft.BlockComponent | null) {
    let current = block
    while (current && current.nodeType !== BlockNodeType.root) {
      if (current.flavour === 'table' || current.flavour.startsWith('table-')) return true
      current = current.parentBlock
    }
    return false
  }

  private _isNativeTextSelectionStart(block: BlockCraft.BlockComponent | null) {
    return block?.nodeType === BlockNodeType.editable
  }

  private _markSelecting(block: BlockCraft.BlockComponent) {
    block.hostElement.classList.add('selecting')
    this.selectingBlocks.add(block)
  }

  private _unmarkSelecting(block: BlockCraft.BlockComponent) {
    block.hostElement.classList.remove('selecting')
    this.selectingBlocks.delete(block)
  }

  /**
   * 兜底清理：清空 Set 中追踪的 block，再用 querySelector 扫一遍 DOM 移除
   * 任何漏网的 `.selecting`。覆盖以下异常路径：
   * - selectEnd 因窗口失焦 / tab 切换未触发
   * - selectStart 重入导致前一会话的 takeUntil 提前打断 pointerleave handler
   * - selectingBlocks Set 与 DOM 状态不同步
   * 限定 `[data-block-id]` 范围以避免误伤 table-col-bar 等同名类。
   */
  private _cleanupAllSelecting() {
    this.selectingBlocks.forEach(b => b.hostElement.classList.remove('selecting'))
    this.selectingBlocks.clear()
    this.hostElement.classList.remove('selecting')
    this.hostElement.querySelectorAll('[data-block-id].selecting').forEach(el => {
      el.classList.remove('selecting')
    })
  }

  override ngAfterViewInit() {
    super.ngAfterViewInit();

    this.applyDocumentTypographyProjection()
    this.bindDocumentTypographyProjection()

    this.doc.readonlySwitch$.pipe(takeUntil(this.onDestroy$)).subscribe(v => {
      this.hostElement.setAttribute('contenteditable', v ? 'false' : 'true')
      v ? this.hostElement.classList.add('readonly') : this.hostElement.classList.remove('readonly')
    })

    this.doc.event.add('selectStart', this.onSelectstart)
    this.doc.event.add('selectEnd', this.onSelectEnd)

    // 窗口失焦 / tab 切换时浏览器可能丢 pointerup / mouseup，导致 selectEnd
    // 不触发，`.selecting` 卡在 block 上整个文档变只读。这里做最后兜底。
    fromEvent(window, 'blur').pipe(takeUntil(this.onDestroy$)).subscribe(() => {
      this.selecting$.next('end')
      this._cleanupAllSelecting()
    })
    fromEvent(document, 'visibilitychange').pipe(takeUntil(this.onDestroy$)).subscribe(() => {
      if (document.visibilityState === 'hidden') {
        this.selecting$.next('end')
        this._cleanupAllSelecting()
      }
    })
  }

  private bindDocumentTypographyProjection(): void {
    this.onPropsChange.pipe(takeUntil(this.onDestroy$)).subscribe(changes => {
      if (
        !changes.has('ff') &&
        !changes.has('fs') &&
        !changes.has('lh')
      ) return
      this.scheduleDocumentTypographyRefresh()
    })
  }

  private scheduleDocumentTypographyRefresh(): void {
    if (this.typographyRefreshQueued) return
    this.typographyRefreshQueued = true
    queueMicrotask(() => {
      this.typographyRefreshQueued = false
      if (this.destroyRef.destroyed) return
      // Apply the persisted values before measuring. `onPropsChange` is raised
      // for both local and remote Yjs changes, while Angular's host bindings
      // may not have reached the DOM yet in the same microtask.
      this.applyDocumentTypographyProjection()
      this.changeDetectorRef.markForCheck()
      this.doc.refreshLayoutMetrics()
    })
  }

  private applyDocumentTypographyProjection(): void {
    this.setStyleProperty('font-family', this.documentFontFamily)
    this.setStyleProperty('--bc-fs', this.documentFontSize)
    this.setStyleProperty('--bc-lh', this.documentLineHeight)
  }

  private setStyleProperty(name: string, value: string | null): void {
    if (value === null) {
      this.hostElement.style.removeProperty(name)
      return
    }
    this.hostElement.style.setProperty(name, value)
  }

  onSelectstart = (ctx: UIEventStateContext) => {
    const selectState = ctx.get('selectState')
    if (selectState.trigger !== 'mouse') return;

    const event = ctx.getDefaultEvent<Event>()
    const id = closetBlockId(event.target as HTMLElement)
    if (!id) return
    const selectStartBlock = this.doc.getBlockById(id)
    if (this._isInsideTable(selectStartBlock)) return
    if (this._isNativeTextSelectionStart(selectStartBlock)) return

    // 入口兜底：上一次 selection 若因任何原因（重入、selectEnd 漏触发、
    // takeUntil 提前打断订阅）残留了 `.selecting`，新会话开始前彻底清掉。
    this._cleanupAllSelecting()

    this.selecting$.next('start')

    const leaveListen = (block: BlockCraft.BlockComponent) => {
      this._markSelecting(block)

      if (block.nodeType !== BlockNodeType.root) {
        fromEvent(block.hostElement, 'pointerleave').pipe(take(1), takeUntil(this.selecting$.pipe(skip(1)))).subscribe(e => {
          this._unmarkSelecting(block)
          this.doc.selection.selectBlock(block)

          // TODO 这样实现不太好
          if (block.flavour === 'table-cell') return
          const parentBlock = block.parentBlock!
          leaveListen(parentBlock)
        })
      }
    }

    // TODO
    fromEvent(selectStartBlock.hostElement, 'pointerleave').pipe(take(1), takeUntil(this.selecting$.pipe(skip(1))))
      .subscribe(() => {
        if (this.selecting$.value !== 'start') return

        leaveListen(selectStartBlock!.parentBlock!)
      })
  }

  onSelectEnd = () => {
    this.selecting$.next('end')
    // 不仅清空 Set，还兜底扫一遍 DOM。pointerleave 订阅被 takeUntil 提前
    // 打断时，handler 中的 classList.remove 不会执行，Set 也不会同步删除，
    // querySelector 是兜底的唯一可靠路径。
    this._cleanupAllSelecting()
  }

}
