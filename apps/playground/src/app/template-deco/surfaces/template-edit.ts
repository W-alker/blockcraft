import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter, Injector, OnDestroy, Output, ViewChild, computed, inject, signal } from '@angular/core'
import { BlockCraftDoc, DocFileService, DOC_FILE_SERVICE_TOKEN } from '@ccc/blockcraft'
import { pickImageAsDataURL } from '../decos/_shared/image-pick'
import { FixedTextToolbarComponent } from '@ccc/blockcraft/plugins/fixed-toolbar'
import { TEMPLATE_EDIT_SCHEMA_STORE, DECO_DOC_PROVIDERS, createDecoDoc, EDITOR_SURFACE_STYLES } from '../host/deco-doc-base'
import { guardDecoDeletion, handleContainerBlankMousedown, replaceRootChildren } from '../core/placement'
import { UnderlayPickDirective } from '../core/underlay-pick.directive'
import { TEMPLATE_EDIT_EMBEDS } from '../core/registry'
import { TemplateStore } from '../data/template-store'
import { EditorViewState } from '../debug-panel/editor-view-state'
import { ActiveDecoService } from '../core/active-deco.service'

@Component({
  selector: 'template-edit-surface',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [DECO_DOC_PROVIDERS],                  // 本 surface 自带一套 DI service（含 logger/comment，供插件注入）
  imports: [FixedTextToolbarComponent, UnderlayPickDirective],
  // 结构同 block-craft-editor：顶部 fixed-toolbar + 灰底滚动区里一根居中白文档列（cses .document-page 那种）
  template: `
    @if (doc) {
      <div class="editor-fixed-toolbar">
        <bc-fixed-toolbar [doc]="doc" [stickyTop]="0"></bc-fixed-toolbar>
      </div>
    }
    <div class="editor-scroll">
      <!-- [underlayPick]：衬底物料（z<0，置于文字后）的边缘拾取，见 core/underlay-pick.directive -->
      <div class="editor-container" #host [underlayPick]="doc" [style.--tpl-editor-scale]="view.widthPct() / 100" [style.background-image]="bgStyle()" (mousedown)="onContainerMousedown($event)"></div>
    </div>
  `,
  styles: [EDITOR_SURFACE_STYLES],
})
export class TemplateEditSurfaceComponent implements AfterViewInit, OnDestroy {
  @ViewChild('host', { static: true }) host!: ElementRef<HTMLElement>
  /** doc 就绪后抛给父页：右侧装饰面板绑它、左侧调试面板绑它。 */
  @Output() ready = new EventEmitter<BlockCraftDoc>()
  private readonly injector = inject(Injector)
  private readonly cdr = inject(ChangeDetectorRef)
  private readonly store = inject(TemplateStore)
  /** 调试用：编辑器列宽缩放（滑块在调试面板，这里读它驱动 .editor-container 宽度）。 */
  protected readonly view = inject(EditorViewState)
  /** 当前选中的悬浮物料通道：传给删除卫兵，支持「选中悬浮物料后按 Delete 删它」。 */
  private readonly activeDeco = inject(ActiveDecoService)
  doc!: BlockCraftDoc
  /** 整页背景图（data URL）——铺在 .editor-container 上；存进模板、带去使用页。 */
  readonly pageBg = signal<string | null>(null)
  protected readonly bgStyle = computed(() => { const u = this.pageBg(); return u ? `url("${u}")` : null })

  private saveHandle: ReturnType<typeof setTimeout> | null = null
  /** 物料保全卫兵的订阅（选区吸附 + 删除拦截：全选删除只清正文、物料/悬浮层全保，见 placement.ts）。 */
  private decoGuard: { unsubscribe(): void } | null = null
  // 内容变更（Yjs 事务在 Angular zone 外触发）→ 防抖自动存盘，保证导航来回不丢设计。
  private readonly onYUpdate = (): void => this.scheduleSave()

  ngAfterViewInit(): void {
    // 建 doc 的公共流程收进 createDecoDoc（对标 cses const.ts）；本页差异项：编辑字典 + 编辑 embeds（docRef 懒取，icon 改大小才用）
    this.doc = createDecoDoc({
      schemas: TEMPLATE_EDIT_SCHEMA_STORE,            // 标准块 + 装饰「编辑」组件
      embeds: TEMPLATE_EDIT_EMBEDS(() => this.doc),
      injector: this.injector,
      hostEl: this.host.nativeElement,
    })
    this.restore()                                   // 恢复上次设计（含整页背景），使用模版→返回不丢
    this.decoGuard = guardDecoDeletion(this.doc, this.host.nativeElement, this.activeDeco)
    this.doc.yDoc.on('afterAllTransactions', this.onYUpdate)
    this.cdr.markForCheck()                           // OnPush：doc 就绪后让 @if(doc) 重算挂出 toolbar
    this.ready.emit(this.doc)
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
    const src = await pickImageAsDataURL(fileService)
    if (!src) return
    this.pageBg.set(src)
    this.persist()                                    // 背景不是 doc 事务，显式存盘
    this.cdr.markForCheck()
  }

  /** 立即把当前模板（内容 + 整页背景）写入 TemplateStore。供「使用模版」跳转前调用，保证使用页拿到最新。 */
  persist(): void {
    if (!this.doc) return
    this.store.save({ snapshot: this.doc.exportSnapshot() ?? null, background: this.pageBg() })
  }

  private scheduleSave(): void {
    if (this.saveHandle) return
    this.saveHandle = setTimeout(() => { this.saveHandle = null; this.persist() }, 400)
  }

  // 从 TemplateStore 恢复上次保存的模板（有内容就替换默认空段落）。
  // 插入前过一遍快照级自愈：悬浮物料归位 layout children、layout 钉回末尾——旧版本 bug 存下的
  // 坏树（段落挂在 layout 之后等）不自愈的话每次刷新都原样还魂（normalizeTemplateSnapshots）。
  private restore(): void {
    const payload = this.store.load()
    if (!payload) return
    if (payload.background) this.pageBg.set(payload.background)
    replaceRootChildren(this.doc, payload.snapshot?.children)   // 快照级自愈 + 替换 root children（两页共用，见 placement）
  }

  // 点编辑器空白处 → 光标落到末段/补空段（逻辑收在 core/placement：layout 钉底是排版域知识，两个 surface 共用）
  onContainerMousedown(evt: MouseEvent): void { handleContainerBlankMousedown(this.doc, evt) }
}
