import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter, Injector, Input, OnDestroy, Output, ViewChild, inject } from '@angular/core'
import { BlockCraftDoc, IBlockSnapshot } from '@ccc/blockcraft'
import { FixedTextToolbarComponent } from '@ccc/blockcraft/plugins/fixed-toolbar'
import {
  TEMPLATE_CONSUMER_USER_ID,
  DECO_DOC_PROVIDERS,
  createDecoDoc,
  EDITOR_SURFACE_STYLES,
} from '../host/deco-doc-base'
import { guardDecoDeletion, handleContainerBlankMousedown, replaceRootChildren } from '../core/placement'
import { TEMPLATE_RENDER_EMBEDS, TEMPLATE_RENDER_SCHEMAS } from '../core/registry'
import { TEMPLATE_DATA } from '../data/template-data'
import { EditorViewState } from '../debug-panel/editor-view-state'
import { TemplateSvgSpriteComponent } from '../core/template-svg-sprite.component'
import {createTemplateUseMutationPolicy} from '../core/template-region'

/**
 * 「使用模版」surface：和编辑 surface 同款体验（toolbar + 居中白文档 + 全套编辑插件），
 * 但用 render 套字典（装饰显真实 mock 数据）且**可编辑**——用户在这页填正文、在彩色块里打字、装饰自动显真实值。
 * 初始内容、整页背景和分页状态都由父页从 TemplateStore 读出后通过 @Input 透传。
 */
@Component({
  selector: 'template-use-surface',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [DECO_DOC_PROVIDERS],
  imports: [FixedTextToolbarComponent, TemplateSvgSpriteComponent],
  template: `
    <template-svg-sprite />
    @if (doc) {
      <div class="editor-fixed-toolbar">
        <bc-fixed-toolbar [doc]="doc" [stickyTop]="0"></bc-fixed-toolbar>
      </div>
    }
    <div
      class="editor-scroll"
      [style.--tpl-page-background]="bgStyle">
      <div
        class="editor-container"
        #host
        [style.--tpl-editor-scale]="view.widthPct() / 100"
        [style.background-image]="paginationEnabled ? null : bgStyle"
        (mousedown)="onContainerMousedown($event)"></div>
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
  /** 模板保存的分页显示状态；固定使用 A4 纵向配置。 */
  @Input() paginationEnabled = false
  /** doc 就绪后抛给父页：左侧调试面板绑它。 */
  @Output() ready = new EventEmitter<BlockCraftDoc>()
  private readonly injector = inject(Injector)
  private readonly cdr = inject(ChangeDetectorRef)
  private readonly data = inject(TEMPLATE_DATA)        // render embed 需要真实(mock)数据闭包
  /** 调试用：编辑器列宽缩放（滑块在调试面板）。 */
  protected readonly view = inject(EditorViewState)
  doc!: BlockCraftDoc
  private pagination!: ReturnType<typeof createDecoDoc>['pagination']
  /** 物料保全卫兵的订阅（使用页同样可编辑：全选删除只清普通内容，动态物料保持原布局）。 */
  private decoGuard: { unsubscribe(): void } | null = null

  get bgStyle(): string | null { return this.background ? `url("${this.background}")` : null }

  ngAfterViewInit(): void {
    // 建 doc 的公共流程收进 createDecoDoc；本页差异项：渲染字典（真实值）+ 渲染 embeds（带 mock data 闭包）。readonly:false 在 createDecoDoc 内固定
    const runtime = createDecoDoc({
      additionalSchemas: TEMPLATE_RENDER_SCHEMAS,     // 共享 bundled 块 + 装饰「渲染」组件
      additionalEmbeds: TEMPLATE_RENDER_EMBEDS(this.data, () => this.doc),
      injector: this.injector,
      hostEl: this.host.nativeElement,
      currentUserId: TEMPLATE_CONSUMER_USER_ID,
      blockMutationPolicy: createTemplateUseMutationPolicy(),
    })
    this.doc = runtime.doc
    this.pagination = runtime.pagination
    this.loadTemplate()                                 // 把模板快照的 children 灌入（同预览的 replace 逻辑）
    if (this.paginationEnabled) this.pagination.enable()
    this.decoGuard = guardDecoDeletion(this.doc, this.host.nativeElement)
    this.cdr.markForCheck()                             // OnPush：doc 就绪后挂出 toolbar
    this.ready.emit(this.doc)
  }
  ngOnDestroy(): void {
    this.decoGuard?.unsubscribe()
    this.doc?.destroy()
  }

  // 把存的模板内容替换进当前 doc（清掉默认空段落再插入保存的 children）。
  // 插入前迁移旧 template-layout/x/y/z/行内图片，并归一到标准 placement-layout。
  private loadTemplate(): void {
    replaceRootChildren(this.doc, this.snapshot?.children)   // 快照级自愈 + 替换 root children（两页共用，见 placement）
  }

  // 点空白处 → 光标落到末段/补空段（逻辑收在 core/placement，两个 surface 共用）
  onContainerMousedown(evt: MouseEvent): void { handleContainerBlankMousedown(this.doc, evt) }
}
