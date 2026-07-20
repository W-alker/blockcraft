import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter, Injector, Input, OnDestroy, Output, ViewChild, inject } from '@angular/core'
import { BlockCraftDoc, IBlockSnapshot } from '@ccc/blockcraft'
import { FixedTextToolbarComponent } from '@ccc/blockcraft/plugins/fixed-toolbar'
import { TEMPLATE_USE_SCHEMA_STORE, DECO_DOC_PROVIDERS, createDecoDoc, EDITOR_SURFACE_STYLES } from '../host/deco-doc-base'
import { guardDecoDeletion, handleContainerBlankMousedown, replaceRootChildren } from '../core/placement'
import { TEMPLATE_RENDER_EMBEDS } from '../core/registry'
import { TEMPLATE_DATA } from '../data/template-data'
import { EditorViewState } from '../debug-panel/editor-view-state'

/**
 * 「使用模版」surface：和编辑 surface 同款体验（toolbar + 居中白文档 + 全套编辑插件），
 * 但用 render 套字典（装饰显真实 mock 数据）且**可编辑**——用户在这页填正文、在彩色块里打字、装饰自动显真实值。
 * 初始内容来自 TemplateStore 存的模板快照（父页通过 @Input 灌入），整页背景同样由 @Input 透传。
 */
@Component({
  selector: 'template-use-surface',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [DECO_DOC_PROVIDERS],
  imports: [FixedTextToolbarComponent],
  template: `
    @if (doc) {
      <div class="editor-fixed-toolbar">
        <bc-fixed-toolbar [doc]="doc" [stickyTop]="0"></bc-fixed-toolbar>
      </div>
    }
    <div class="editor-scroll">
      <div class="editor-container" #host [style.--tpl-editor-scale]="view.widthPct() / 100" [style.background-image]="bgStyle" (mousedown)="onContainerMousedown($event)"></div>
    </div>
  `,
  styles: [EDITOR_SURFACE_STYLES],
})
export class TemplateUseSurfaceComponent implements AfterViewInit, OnDestroy {
  @ViewChild('host', { static: true }) host!: ElementRef<HTMLElement>
  /** 初始内容（编辑页导出的模板快照的 root snapshot；可空）。 */
  @Input() snapshot: IBlockSnapshot | null = null
  /** 整页背景图（data URL），随模板带过来。 */
  @Input() background: string | null = null
  /** doc 就绪后抛给父页：左侧调试面板绑它。 */
  @Output() ready = new EventEmitter<BlockCraftDoc>()
  private readonly injector = inject(Injector)
  private readonly cdr = inject(ChangeDetectorRef)
  private readonly data = inject(TEMPLATE_DATA)        // render embed 需要真实(mock)数据闭包
  /** 调试用：编辑器列宽缩放（滑块在调试面板）。 */
  protected readonly view = inject(EditorViewState)
  doc!: BlockCraftDoc
  /** 物料保全卫兵的订阅（使用页同样可编辑：全选删除只清正文、物料归位 layout 保全，见 placement.ts）。 */
  private decoGuard: { unsubscribe(): void } | null = null

  get bgStyle(): string | null { return this.background ? `url("${this.background}")` : null }

  ngAfterViewInit(): void {
    // 建 doc 的公共流程收进 createDecoDoc；本页差异项：渲染字典（真实值）+ 渲染 embeds（带 mock data 闭包）。readonly:false 在 createDecoDoc 内固定
    this.doc = createDecoDoc({
      schemas: TEMPLATE_USE_SCHEMA_STORE,             // 标准块 + 装饰「渲染」组件（真实值）
      embeds: TEMPLATE_RENDER_EMBEDS(this.data, () => this.doc),
      injector: this.injector,
      hostEl: this.host.nativeElement,
    })
    this.loadTemplate()                                 // 把模板快照的 children 灌入（同预览的 replace 逻辑）
    this.decoGuard = guardDecoDeletion(this.doc, this.host.nativeElement)
    this.cdr.markForCheck()                             // OnPush：doc 就绪后挂出 toolbar
    this.ready.emit(this.doc)
  }
  ngOnDestroy(): void {
    this.decoGuard?.unsubscribe()
    this.doc?.destroy()
  }

  // 把存的模板内容替换进当前 doc（清掉默认空段落再插入保存的 children）。
  // 插入前过一遍快照级自愈：悬浮物料归位 layout children、layout 钉回末尾（老数据可能是坏形态）。
  private loadTemplate(): void {
    replaceRootChildren(this.doc, this.snapshot?.children)   // 快照级自愈 + 替换 root children（两页共用，见 placement）
  }

  // 点空白处 → 光标落到末段/补空段（逻辑收在 core/placement，两个 surface 共用）
  onContainerMousedown(evt: MouseEvent): void { handleContainerBlankMousedown(this.doc, evt) }
}
