import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter, Injector, Input, OnDestroy, Output, ViewChild, inject } from '@angular/core'
import { BlockCraftDoc, IBlockSnapshot } from '@ccc/blockcraft'
import { FixedTextToolbarComponent } from '@ccc/blockcraft/plugins/fixed-toolbar'
import {
  TEMPLATE_CONSUMER_USER_ID,
  DECO_DOC_PROVIDERS,
  createDecoDoc,
  EDITOR_SURFACE_STYLES,
} from '../host/deco-doc-base'
import {
  guardDecoDeletion,
  handleContainerBlankMousedown,
  normalizeTemplateSnapshots,
  replaceRootChildren,
} from '../core/placement'
import { TEMPLATE_RENDER_EMBEDS, TEMPLATE_RENDER_SCHEMAS } from '../core/registry'
import { TEMPLATE_DATA } from '../data/template-data'
import {firstValueFrom} from 'rxjs'
import { EditorViewState } from '../debug-panel/editor-view-state'
import { TemplateSvgSpriteComponent } from '../core/template-svg-sprite.component'
import {createTemplateUseMutationPolicy} from '../core/template-region'
import {materializeTemplateSnapshots} from '../core/materialize-template'

/**
 * 「使用模版」surface：和编辑 surface 同款体验（toolbar + 居中白文档 + 全套编辑插件），
 * canonical 动态块在建档时把 draft meta 投影成真实 props，随后按普通文档块渲染；
 * Playground 自有装饰仍使用 render schema。页面整体保持可编辑。
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
    // 建 doc 的公共流程收进 createDecoDoc；本页只为模板域自有 Embed 注入真实数据字典。
    const runtime = createDecoDoc({
      additionalSchemas: TEMPLATE_RENDER_SCHEMAS,     // 共享 bundled 块 + 装饰「渲染」组件
      additionalEmbeds: TEMPLATE_RENDER_EMBEDS(),
      injector: this.injector,
      hostEl: this.host.nativeElement,
      currentUserId: TEMPLATE_CONSUMER_USER_ID,
      blockMutationPolicy: createTemplateUseMutationPolicy(),
    })
    this.doc = runtime.doc
    this.pagination = runtime.pagination
    void this.loadTemplate()
    if (this.paginationEnabled) this.pagination.enable()
    this.decoGuard = guardDecoDeletion(this.doc, this.host.nativeElement)
    this.cdr.markForCheck()                             // OnPush：doc 就绪后挂出 toolbar
    this.ready.emit(this.doc)
  }
  ngOnDestroy(): void {
    this.decoGuard?.unsubscribe()
    this.doc?.destroy()
  }

  // 先迁移旧快照，再把 draft meta 投影成真实文档 props，最后经 DocCRUD 写入。
  private async loadTemplate(): Promise<void> {
    const rawChildren = (this.snapshot?.children ?? []) as IBlockSnapshot[]
    if (!rawChildren.length) return
    const user = await firstValueFrom(this.data.user.current())
    const normalized = normalizeTemplateSnapshots(rawChildren)
    const children = materializeTemplateSnapshots(normalized, {
      createdAt: new Date(),
      creator: {
        name: user.name,
        avatar: user.avatarUrl,
        description: user.deptName ?? user.orgName,
      },
    })
    replaceRootChildren(this.doc, children)
  }

  // 点空白处 → 光标落到末段/补空段（逻辑收在 core/placement，两个 surface 共用）
  onContainerMousedown(evt: MouseEvent): void { handleContainerBlankMousedown(this.doc, evt) }
}
