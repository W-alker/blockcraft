import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, NgZone, OnDestroy, OnInit, inject, signal } from '@angular/core'
import { BlockCraftDoc } from '@ccc/blockcraft'
import { Subscription } from 'rxjs'
import { EditorViewState } from './editor-view-state'

/** JSON.stringify replacer：把过长字符串（data URL 等）截断，避免快照面板被 base64 撑爆。 */
const truncate = (_k: string, v: unknown): unknown =>
  typeof v === 'string' && v.length > 120 ? `${v.slice(0, 80)}…(${v.length} chars)` : v

/**
 * 调试面板三个区块的显隐开关（侧栏标题行的三个 checkbox，勾选=显示）。
 * set = 「设置」卡（编辑器宽度 + 文档与编辑操作，合成一张卡）；data = 实时数据 snapshot；selection = 实时选区。
 * 状态由 aside 持有（checkbox 长在它的标题行里），本组件只按值渲染。
 */
export interface DebugSections {
  set: boolean
  data: boolean
  selection: boolean
}

/**
 * 左侧调试面板：实时展示文档数据（snapshot，铺满 + 字号可调）+ 可折叠的实时 Selection +
 * 「文档与编辑」调试操作（初始化/只读/追加段落），对齐 blockcraft 主页。设计页与使用页共用。
 */
@Component({
  selector: 'template-debug-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="dbg">
      @if (visible.set) {
        <!-- 「设置」卡：编辑器宽度 + 文档与编辑操作合成一张（对应标题行 set 开关） -->
        <section class="dbg-card">
          <div class="dbg-card__head">
            <span class="dbg-card__title">设置 · 编辑器宽度</span>
            <span class="dbg-pill dbg-pill--on">{{ view.widthPct() }}%</span>
          </div>
          <input class="dbg-range" type="range" min="5" max="100" step="1"
                 [value]="view.widthPct()" (input)="onWidthInput($event)" />
          <div class="dbg-actions">
            <button type="button" class="dbg-btn dbg-btn--primary" (click)="doInit()">初始化</button>
            <button type="button" class="dbg-btn" (click)="doReadonly()">{{ readonly() ? '取消只读' : '只读' }}</button>
            <button type="button" class="dbg-btn" (click)="doAddParagraph()">追加段落</button>
            <button type="button" class="dbg-btn" (click)="doLog()">打印到控制台</button>
          </div>
        </section>
      }

      @if (visible.data) {
        <section class="dbg-card dbg-card--grow">
          <div class="dbg-card__head">
            <span class="dbg-card__title">实时数据 · snapshot</span>
            <span class="dbg-head__right">
              <span class="dbg-pill">{{ blockCount() }} blocks</span>
              <span class="dbg-font">
                <button type="button" class="dbg-iconbtn" title="缩小字号" (click)="fontDelta(-1)">−</button>
                <button type="button" class="dbg-iconbtn" title="放大字号" (click)="fontDelta(1)">＋</button>
              </span>
            </span>
          </div>
          <pre class="dbg-pre" [style.font-size.px]="fontSize()">{{ snapshotJson() }}</pre>
        </section>
      }

      @if (visible.selection) {
        <section class="dbg-card dbg-card--sel" [class.is-open]="selOpen()">
          <button type="button" class="dbg-card__toggle" (click)="selOpen.set(!selOpen())">
            <span class="dbg-card__title">实时 Selection</span>
            <span class="dbg-pill" [class.dbg-pill--on]="hasSelection()">{{ hasSelection() ? '已同步' : '无选区' }}</span>
            <span class="dbg-caret" [class.is-open]="selOpen()">▾</span>
          </button>
          @if (selOpen()) {
            <pre class="dbg-pre dbg-pre--sm">{{ selectionJson() || '当前没有可展示的选区数据' }}</pre>
          }
        </section>
      }
    </div>
  `,
  styles: [`
    :host{ display:block; height:100%; min-height:0 }
    .dbg{ box-sizing:border-box; height:100%; display:flex; flex-direction:column; gap:12px; padding:14px; background:#fff; overflow:hidden }
    .dbg-card{ display:flex; flex-direction:column; gap:10px; padding:12px; border:1px solid #eef0f6; border-radius:12px; background:#fafbff }
    .dbg-card--grow{ flex:1 1 auto; min-height:120px }
    .dbg-card--sel{ flex:none }
    .dbg-card__head{ display:flex; align-items:center; justify-content:space-between; gap:8px }
    .dbg-head__right{ display:flex; align-items:center; gap:8px }
    .dbg-card__title{ margin:0; font-size:12px; font-weight:600; color:#4b5168 }
    .dbg-card__toggle{ display:flex; align-items:center; gap:8px; width:100%; padding:0; border:0; background:transparent; cursor:pointer; text-align:left }
    .dbg-caret{ margin-left:auto; color:#9aa1b5; font-size:11px; transition:transform .15s }
    .dbg-caret.is-open{ transform:rotate(180deg) }
    .dbg-pill{ font-size:10px; color:#9aa1b5; padding:1px 8px; border-radius:999px; background:#eef0f6 }
    .dbg-pill--on{ color:#fff; background:#4857E2 }
    .dbg-actions{ display:flex; flex-wrap:wrap; gap:8px }
    .dbg-btn{ flex:none; padding:5px 12px; border:1px solid #e6e8f0; border-radius:8px; background:#fff; color:#4b5168; font-size:12px; cursor:pointer }
    .dbg-btn:hover{ border-color:#4857E2; color:#4857E2 }
    .dbg-btn--primary{ background:#4857E2; border-color:#4857E2; color:#fff }
    .dbg-btn--primary:hover{ color:#fff; opacity:.9 }
    .dbg-font{ display:inline-flex; gap:4px }
    .dbg-iconbtn{ width:22px; height:22px; display:inline-flex; align-items:center; justify-content:center; border:1px solid #e6e8f0; border-radius:6px; background:#fff; color:#4b5168; font-size:13px; line-height:1; cursor:pointer }
    .dbg-iconbtn:hover{ border-color:#4857E2; color:#4857E2 }
    .dbg-pre{ margin:0; flex:1 1 auto; min-height:0; overflow:auto; padding:10px; border-radius:8px; background:#0f1424; color:#cdd6f4; line-height:1.5; white-space:pre-wrap; word-break:break-all; font-family:ui-monospace, SFMono-Regular, Menlo, monospace }
    .dbg-pre--sm{ flex:none; max-height:200px; background:#f3f4f8; color:#374151; font-size:11px }
    .dbg-range{ width:100%; margin:0; accent-color:#4857E2; cursor:pointer }
  `],
})
export class TemplateDebugPanelComponent implements OnInit, OnDestroy {
  @Input({ required: true }) doc!: BlockCraftDoc
  /** 区块显隐（aside 标题行的 checkbox 状态透传；默认全显，保持无开关时的旧观感）。 */
  @Input() visible: DebugSections = { set: true, data: true, selection: true }
  protected readonly snapshotJson = signal('')
  protected readonly selectionJson = signal('')
  protected readonly blockCount = signal(0)
  protected readonly hasSelection = signal(false)
  protected readonly readonly = signal(false)
  protected readonly fontSize = signal(11)              // snapshot 字号，- / + 调节
  protected readonly selOpen = signal(false)            // 实时 Selection 默认折叠，给 snapshot 让位
  /** 编辑器列宽（5–100%）共享状态：滑块写它，surface 读它缩放 .editor-container（同页 provide，见 template-page）。 */
  protected readonly view = inject(EditorViewState)

  private readonly sub = new Subscription()
  private snapHandle: ReturnType<typeof setTimeout> | null = null
  // Yjs 事务在 Angular zone 外触发；这里只调度一次防抖刷新。
  private readonly onYUpdate = (): void => this.scheduleSnapshot()

  constructor(private readonly zone: NgZone, private readonly cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.readonly.set(this.doc.isReadonly)
    this.sub.add(this.doc.selection.changeObserve().subscribe(sel => this.zone.run(() => {
      this.hasSelection.set(!!sel)
      this.selectionJson.set(sel ? JSON.stringify(sel.toJSON(), null, 2) : '')
      this.cdr.markForCheck()
    })))
    this.sub.add(this.doc.subscribeReadonlyChange(ro => this.zone.run(() => { this.readonly.set(ro); this.cdr.markForCheck() })))
    this.doc.yDoc.on('afterAllTransactions', this.onYUpdate)
    this.refreshSnapshot()
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe()
    this.doc.yDoc.off('afterAllTransactions', this.onYUpdate)
    if (this.snapHandle) clearTimeout(this.snapHandle)
  }

  fontDelta(d: number): void { this.fontSize.update(v => Math.min(22, Math.max(8, v + d))) }

  /** 宽度滑块 → 共享状态（5–100%），surface 即时缩放编辑器列宽，用于现场验证百分比自适应。 */
  onWidthInput(e: Event): void { this.view.widthPct.set(Number((e.target as HTMLInputElement).value)) }

  // ── 文档与编辑（对齐主页 runAction，去掉「主题」） ──
  /** 初始化：清空内容、回到单个空段落（doc 已 init，故做内容 reset 而非 initBySnapshot）。 */
  doInit(): void {
    const count = this.doc.root.childrenLength
    if (count > 0) this.doc.crud.deleteBlocks(this.doc.rootId, 0, count, true)
    this.doc.crud.insertBlocks(this.doc.rootId, 0, [this.doc.schemas.createSnapshot('paragraph', [''])])
  }
  doReadonly(): void { this.doc.toggleReadonly(!this.doc.isReadonly) }
  doAddParagraph(): void {
    const idx = this.doc.root.childrenLength
    this.doc.crud.insertBlocks(this.doc.rootId, idx, [this.doc.schemas.createSnapshot('paragraph', [`追加段落 #${idx + 1}`])])
  }
  /** 打印当前快照 + 选区到控制台（对象形式，可在 DevTools 展开查看完整 props/children）。 */
  doLog(): void {
    const sel = this.doc.selection.value
    console.log('[template] snapshot', this.doc.exportSnapshot())
    console.log('[template] selection', sel ? sel.toJSON() : null)
  }

  private scheduleSnapshot(): void {
    if (this.snapHandle) return
    this.snapHandle = setTimeout(() => {
      this.snapHandle = null
      this.zone.run(() => { this.refreshSnapshot(); this.cdr.markForCheck() })
    }, 150)
  }

  private refreshSnapshot(): void {
    const snap = this.doc.exportSnapshot()
    this.blockCount.set(snap?.children?.length ?? 0)
    this.snapshotJson.set(snap ? JSON.stringify(snap, truncate, 2) : '')
  }
}
