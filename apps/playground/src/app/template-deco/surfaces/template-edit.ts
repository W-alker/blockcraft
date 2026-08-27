import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter, Injector, OnDestroy, Output, ViewChild, computed, inject, signal } from '@angular/core'
import { BlockCraftDoc, DocFileService, DOC_FILE_SERVICE_TOKEN } from '@ccc/blockcraft'
import { pickImageAsDataURL } from '../decos/_shared/image-pick'
import { FixedTextToolbarComponent } from '@ccc/blockcraft/plugins/fixed-toolbar'
import {
  TEMPLATE_CREATOR_USER_ID,
  DECO_DOC_PROVIDERS,
  createDecoDoc,
  EDITOR_SURFACE_STYLES,
} from '../host/deco-doc-base'
import { guardDecoDeletion, handleContainerBlankMousedown, replaceRootChildren } from '../core/placement'
import { TEMPLATE_EDIT_EMBEDS, TEMPLATE_EDIT_SCHEMAS } from '../core/registry'
import { TemplateStore } from '../data/template-store'
import { EditorViewState } from '../debug-panel/editor-view-state'
import { ActiveDecoService } from '../core/active-deco.service'
import { TemplateSvgSpriteComponent } from '../core/template-svg-sprite.component'

export interface TemplatePageViewState {
  paginationEnabled: boolean
  hasBackground: boolean
}

@Component({
  selector: 'template-edit-surface',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [DECO_DOC_PROVIDERS],                  // 本 surface 自带一套 DI service（含 logger/comment，供插件注入）
  imports: [FixedTextToolbarComponent, TemplateSvgSpriteComponent],
  // 结构同 block-craft-editor：顶部 fixed-toolbar + 灰底滚动区里一根居中白文档列（cses .document-page 那种）
  template: `
    <template-svg-sprite />
    @if (doc) {
      <div class="editor-fixed-toolbar">
        <bc-fixed-toolbar [doc]="doc" [stickyTop]="0"></bc-fixed-toolbar>
      </div>
    }
    <div
      class="editor-scroll"
      [style.--tpl-page-background]="bgStyle()">
      <div
        class="editor-container"
        data-bc-reveal-template-locks
        #host
        [style.--tpl-editor-scale]="view.widthPct() / 100"
        [style.background-image]="paginationEnabled() ? null : bgStyle()"
        (mousedown)="onContainerMousedown($event)"></div>
    </div>
  `,
  styles: [EDITOR_SURFACE_STYLES],
})
export class TemplateEditSurfaceComponent implements AfterViewInit, OnDestroy {
  @ViewChild('host', { static: true }) host!: ElementRef<HTMLElement>
  /** doc 就绪后抛给父页：右侧装饰面板绑它、左侧调试面板绑它。 */
  @Output() ready = new EventEmitter<BlockCraftDoc>()
  /** 非 Yjs 的页面视图状态，供父页驱动右侧“整页”能力区。 */
  @Output() pageViewStateChange = new EventEmitter<TemplatePageViewState>()
  private readonly injector = inject(Injector)
  private readonly cdr = inject(ChangeDetectorRef)
  private readonly store = inject(TemplateStore)
  /** 调试用：编辑器列宽缩放（滑块在调试面板，这里读它驱动 .editor-container 宽度）。 */
  protected readonly view = inject(EditorViewState)
  /** 当前选中的悬浮物料通道：传给删除卫兵，支持「选中悬浮物料后按 Delete 删它」。 */
  private readonly activeDeco = inject(ActiveDecoService)
  doc!: BlockCraftDoc
  private pagination!: ReturnType<typeof createDecoDoc>['pagination']
  /** 整页背景图（data URL）——铺在 .editor-container 上；存进模板、带去使用页。 */
  readonly pageBg = signal<string | null>(null)
  /** 分页只属于模板视图状态，不写入 Yjs。 */
  readonly paginationEnabled = signal(false)
  protected readonly bgStyle = computed(() => { const u = this.pageBg(); return u ? `url("${u}")` : null })

  private saveHandle: ReturnType<typeof setTimeout> | null = null
  /** 物料保全卫兵的订阅（选区吸附 + 删除拦截：全选删除只清正文、物料/悬浮层全保，见 placement.ts）。 */
  private decoGuard: { unsubscribe(): void } | null = null
  // 内容变更（Yjs 事务在 Angular zone 外触发）→ 防抖自动存盘，保证导航来回不丢设计。
  private readonly onYUpdate = (): void => this.scheduleSave()

  ngAfterViewInit(): void {
    // 建 doc 的公共流程收进 createDecoDoc（对标 cses const.ts）；本页只追加模板域自有 Embed。
    const runtime = createDecoDoc({
      additionalSchemas: TEMPLATE_EDIT_SCHEMAS,       // 共享 bundled 块 + 装饰「编辑」组件
      additionalEmbeds: TEMPLATE_EDIT_EMBEDS(),
      injector: this.injector,
      hostEl: this.host.nativeElement,
      currentUserId: TEMPLATE_CREATOR_USER_ID,
      defaultBlockLockKind: 'template',
      canUnlockBlock: ({currentUserId, lockKind, lockUserId}) =>
        lockKind === 'template'
        && currentUserId === TEMPLATE_CREATOR_USER_ID
        && lockUserId === currentUserId,
    })
    this.doc = runtime.doc
    this.pagination = runtime.pagination
    this.restore()                                   // 恢复上次设计（含整页背景），使用模版→返回不丢
    if (this.paginationEnabled()) this.pagination.enable()
    this.decoGuard = guardDecoDeletion(this.doc, this.host.nativeElement, this.activeDeco)
    this.doc.yDoc.on('afterAllTransactions', this.onYUpdate)
    this.cdr.markForCheck()                           // OnPush：doc 就绪后让 @if(doc) 重算挂出 toolbar
    this.ready.emit(this.doc)
    this.emitPageViewState()
  }
  ngOnDestroy(): void {
    if (this.saveHandle) clearTimeout(this.saveHandle)
    this.decoGuard?.unsubscribe()
    this.doc?.yDoc.off('afterAllTransactions', this.onYUpdate)
    this.persist()                                    // 卸载前 flush 最新一份
    this.doc?.destroy()
  }

  /** 选一张图设为整页背景（data URL：立即可显，且随模板带进使用页）。 */
  async pickPageBackground(): Promise<void> {
    const fileService = this.doc.injector.get<DocFileService>(DOC_FILE_SERVICE_TOKEN)
    let src: string | null
    try {
      src = await pickImageAsDataURL(fileService)
    } catch {
      this.doc.messageService.warn('背景图片读取失败')
      return
    }
    if (!src) return
    this.pageBg.set(src)
    this.persist()                                    // 背景不是 doc 事务，显式存盘
    this.emitPageViewState()
    this.cdr.markForCheck()
  }

  /** 切换 A4 纵向分页；插件 API 幂等，状态即时持久化并同步右侧面板。 */
  togglePagination(): void {
    const enabled = !this.paginationEnabled()
    if (enabled) this.pagination.enable()
    else this.pagination.disable()
    this.paginationEnabled.set(enabled)
    this.persist()
    this.emitPageViewState()
    this.cdr.markForCheck()
  }

  /** 移除整页背景；无背景时保持幂等，不产生冗余存盘。 */
  clearPageBackground(): void {
    if (!this.pageBg()) return
    this.pageBg.set(null)
    this.persist()
    this.emitPageViewState()
    this.cdr.markForCheck()
  }

  /** 立即把当前模板（内容 + 整页背景 + 分页状态）写入 TemplateStore。 */
  persist(): void {
    if (!this.doc) return
    this.store.save({
      snapshot: this.doc.exportSnapshot() ?? null,
      background: this.pageBg(),
      paginationEnabled: this.paginationEnabled(),
    })
  }

  private scheduleSave(): void {
    if (this.saveHandle) return
    this.saveHandle = setTimeout(() => { this.saveHandle = null; this.persist() }, 400)
  }

  // 从 TemplateStore 恢复上次保存的模板（有内容就替换默认空段落）。
    // 插入前迁移旧 template-layout/x/y/z/行内图片，并归一到标准 placement-layout。
  private restore(): void {
    const payload = this.store.load()
    if (!payload) return
    this.pageBg.set(payload.background)
    this.paginationEnabled.set(payload.paginationEnabled === true)
    replaceRootChildren(this.doc, payload.snapshot?.children)   // 快照级自愈 + 替换 root children（两页共用，见 placement）
  }

  private emitPageViewState(): void {
    this.pageViewStateChange.emit({
      paginationEnabled: this.paginationEnabled(),
      hasBackground: !!this.pageBg(),
    })
  }

  // 点编辑器空白处 → 光标落到末段/补空段（逻辑收在 core/placement：layout 钉底是排版域知识，两个 surface 共用）
  onContainerMousedown(evt: MouseEvent): void { handleContainerBlankMousedown(this.doc, evt) }
}
