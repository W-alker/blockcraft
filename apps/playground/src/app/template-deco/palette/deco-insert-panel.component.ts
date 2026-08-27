import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnDestroy, OnInit, Output, signal } from '@angular/core'
import {
  BUNDLED_EDITOR_BLOCK_MATERIAL_GROUPS,
  BlockCraftDoc,
  BundledBlockMaterial,
} from '@ccc/blockcraft'
import { Subscription } from 'rxjs'
import { MATERIALS, Material } from '../core/registry'
import { MaterialKind, MATERIAL_KIND_LABEL } from '../core/deco.category'
import {
  insertContentBlock,
  insertTemplateRegion,
} from './content-block-insertion'

interface PanelGroup { title: string; items: Material[] }
type InsertPanelTab = 'content' | 'dynamic'

/** 按 MaterialKind 固定顺序分组（整页 → 卡片 → 随文），跳过空组。title 取中文显示名。 */
function groupByKind(materials: Material[]): PanelGroup[] {
  const order = [MaterialKind.PageBg, MaterialKind.Block, MaterialKind.Embed]
  return order
    .map(k => ({ title: MATERIAL_KIND_LABEL[k], items: materials.filter(m => m.kind === k) }))
    .filter(g => g.items.length > 0)
}

/**
 * 右侧装饰插入面板（镜像 cses insert-sidebar：图标下沉到数据 + 单一渲染路径）。
 * 每个物料只有一个 svgIcon，面板统一 `<svg><use #svgIcon>` 渲染——零分支，加装饰不改面板。
 * symbol 来源：bc_* 由 playground 静态加载的 bc-iconfont.js 注入；模板自有 symbol 由 surface 级共享 sprite 提供。
 */
@Component({
  selector: 'deco-insert-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="insert-sidebar">
      <div class="insert-tabs" role="tablist" aria-label="插入能力">
        <button
          type="button"
          role="tab"
          [attr.aria-selected]="activeTab() === 'content'"
          [class.is-active]="activeTab() === 'content'"
          (click)="activeTab.set('content')">
          内容块
        </button>
        <button
          type="button"
          role="tab"
          [attr.aria-selected]="activeTab() === 'dynamic'"
          [class.is-active]="activeTab() === 'dynamic'"
          (click)="activeTab.set('dynamic')">
          动态能力
        </button>
      </div>
      <div class="insert-sidebar__content">
        @if (activeTab() === 'content') {
          <section class="insert-section">
            <p class="insert-section__title">模板区域</p>
            <div class="insert-grid">
              <button
                type="button"
                class="insert-item insert-item--button"
                title="插入可配置提示语和内容块范围的区域"
                (mousedown)="$event.preventDefault()"
                (click)="insertRegion()">
                <span class="insert-item__icon">
                  <i class="bc_icon bc_fenlan" aria-hidden="true"></i>
                </span>
                <p class="insert-item__label">内容区域</p>
              </button>
            </div>
          </section>
          @for (group of contentGroups; track group.key) {
            <section class="insert-section">
              <p class="insert-section__title">{{ group.label }}</p>
              <div class="insert-grid">
                @for (m of group.items; track m.flavour) {
                  <div
                    class="insert-item"
                    [title]="m.description || ('点击插入' + m.label + '，或拖入文档')"
                    style="touch-action:none"
                    (mousedown)="$event.preventDefault()"
                    (pointerdown)="onContentPointerDown($event, m)"
                    (pointerup)="onContentPointerUp($event, m)"
                    (pointercancel)="clearContentPointer($event)">
                    <span class="insert-item__icon">
                      @if (m.svgIcon) {
                        <svg class="deco-icon" aria-hidden="true">
                          <use [attr.href]="'#' + m.svgIcon" [attr.xlink:href]="'#' + m.svgIcon"></use>
                        </svg>
                      } @else if (m.icon) {
                        <i [class]="iconClass(m.icon)"></i>
                      }
                    </span>
                    <p class="insert-item__label">{{ m.label }}</p>
                  </div>
                }
              </div>
            </section>
          }
        } @else {
          @for (group of dynamicGroups; track group.title) {
            <section class="insert-section">
              <p class="insert-section__title">{{ group.title }}</p>
              <div class="insert-grid">
                @if (group.title === pageGroupTitle) {
                  <button
                    type="button"
                    class="insert-item insert-item--button"
                    [class.is-active]="paginationEnabled"
                    [attr.aria-pressed]="paginationEnabled"
                    title="开启或关闭 A4 分页布局"
                    (mousedown)="$event.preventDefault()"
                    (click)="paginationToggle.emit()">
                    <span class="insert-item__icon">
                      <i class="bc_icon bc_fenyefu" aria-hidden="true"></i>
                    </span>
                    <p class="insert-item__label">分页布局</p>
                  </button>
                }
                @for (m of group.items; track m.label) {
                  <!-- mousedown preventDefault：点面板别清掉编辑器光标/选区，否则 embed 插入读不到落点 -->
                  <div class="insert-item" [title]="hintOf(m)" style="touch-action:none"
                       (mousedown)="$event.preventDefault()" (pointerup)="onClick(m)" (pointerdown)="onPointerDown($event, m)">
                    <span class="insert-item__icon">
                      <svg class="deco-icon" aria-hidden="true">
                        <use [attr.href]="'#' + m.svgIcon" [attr.xlink:href]="'#' + m.svgIcon"></use>
                      </svg>
                    </span>
                    <p class="insert-item__label">{{ m.label }}</p>
                  </div>
                }
                @if (group.title === pageGroupTitle) {
                  <button
                    type="button"
                    class="insert-item insert-item--button insert-item--clear"
                    [disabled]="!hasPageBackground"
                    [title]="hasPageBackground ? '取消当前背景图片' : '当前没有背景图片'"
                    (mousedown)="$event.preventDefault()"
                    (click)="clearPageBackground.emit()">
                    <span class="insert-item__icon">
                      <i class="bc_icon bc_shanchu" aria-hidden="true"></i>
                    </span>
                    <p class="insert-item__label">取消背景</p>
                  </button>
                }
              </div>
            </section>
          }
        }
      </div>
    </div>
  `,
  styles: [`
    :host{ display:block; min-height:0 }
    .insert-sidebar{ box-sizing:border-box; width:100%; height:100%; padding:14px; background:#fff; overflow-y:auto }
    .insert-tabs{ position:sticky; top:-14px; z-index:2; display:grid; grid-template-columns:1fr 1fr; gap:4px; margin:-14px -14px 16px; padding:12px 14px 10px; border-bottom:1px solid #eef0f6; background:#fff }
    .insert-tabs button{ height:30px; border:0; border-radius:7px; background:#f2f3f7; color:#6f7688; font-size:12px; cursor:pointer }
    .insert-tabs button.is-active{ background:#eef0ff; color:#4857e2; font-weight:600 }
    .insert-tabs button:focus-visible{ outline:2px solid #4857e2; outline-offset:1px }
    .insert-sidebar__content{ display:flex; flex-direction:column; gap:20px }
    .insert-section{ display:flex; flex-direction:column; gap:12px }
    .insert-section__title{ margin:0; font-size:12px; color:#999; line-height:normal }
    .insert-grid{ display:flex; flex-wrap:wrap; gap:14px }
    .insert-item{ display:flex; flex-direction:column; align-items:center; gap:6px; cursor:pointer; transition:transform .12s }
    .insert-item--button{ appearance:none; padding:0; border:0; background:transparent; font:inherit }
    .insert-item:active{ transform:scale(.95) }
    .insert-item__icon{ display:flex; align-items:center; justify-content:center; width:46px; height:46px; border:1px solid #efefef; border-radius:10px; background:#fff; transition:border-color .15s, box-shadow .15s }
    .insert-item__icon i{ font-size:28px; color:#4857e2 }
    .insert-item:hover .insert-item__icon{ border-color:#4857E2; box-shadow:0 3px 10px rgba(72,87,226,.12) }
    .insert-item.is-active .insert-item__icon{ border-color:#4857E2; background:#eef0ff; box-shadow:0 3px 10px rgba(72,87,226,.12) }
    .insert-item.is-active .insert-item__label{ color:#4857E2; font-weight:600 }
    .insert-item--clear:not(:disabled):hover .insert-item__icon{ border-color:#d05252; color:#d05252; background:#fdf3f3 }
    .insert-item--clear:not(:disabled):hover .insert-item__label{ color:#d05252 }
    .insert-item--button:disabled{ cursor:not-allowed; opacity:.42 }
    .insert-item--button:disabled:active{ transform:none }
    .insert-item--button:disabled:hover .insert-item__icon{ border-color:#efefef; box-shadow:none }
    .deco-icon{ width:30px; height:30px }
    .insert-item__label{ margin:0; max-width:56px; text-align:center; font-size:12px; color:#7e7e7e; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; transition:color .15s }
    .insert-item:hover .insert-item__label{ color:#4857E2 }
  `],
})
export class DecoInsertPanelComponent implements OnInit, OnDestroy {
  @Input({ required: true }) doc!: BlockCraft.Doc       // 模板编辑 surface 的 doc
  @Input() paginationEnabled = false
  @Input() hasPageBackground = false
  /** 点「背景图」→ 通知父页：用编辑 surface 选图并设为整页背景（背景不是块，不走 doc 插入）。 */
  @Output() pickPageBackground = new EventEmitter<void>()
  @Output() clearPageBackground = new EventEmitter<void>()
  @Output() paginationToggle = new EventEmitter<void>()
  protected readonly activeTab = signal<InsertPanelTab>('content')
  protected readonly contentGroups = BUNDLED_EDITOR_BLOCK_MATERIAL_GROUPS
  protected readonly dynamicGroups = groupByKind(MATERIALS)
  protected readonly pageGroupTitle = MATERIAL_KIND_LABEL[MaterialKind.PageBg]
  private contentPointer: {
    pointerId: number
    startX: number
    startY: number
    dragged: boolean
  } | null = null
  private dragStateSub: Subscription | null = null

  ngOnInit(): void {
    this.dragStateSub = this.doc.dragController.state$.subscribe(state => {
      if (state === 'dragging' && this.contentPointer) {
        this.contentPointer.dragged = true
      }
    })
  }

  ngOnDestroy(): void {
    this.dragStateSub?.unsubscribe()
    this.dragStateSub = null
  }

  protected hintOf(m: Material): string {
    return m.kind === MaterialKind.Block ? '拖入文档' : (m.kind === MaterialKind.PageBg ? '点击设为背景' : '点击插入')
  }

  // block：pointerdown 起拖，框架接管 ghost/dropLine/落点/插入。
  onPointerDown(evt: PointerEvent, m: Material): void {
    if (m.kind !== MaterialKind.Block) return
    if (evt.button !== 0 || this.doc.isReadonly) return
    this.doc.dragController.startDrag(
      evt,
      { kind: 'new-block', flavour: m.flavour as BlockCraft.BlockFlavour },   // kind===Block 已收窄，flavour 必有（无需 !）
      { ghostLabel: m.label },
    )
  }

  onContentPointerDown(
    evt: PointerEvent,
    material: BundledBlockMaterial,
  ): void {
    if (evt.button !== 0 || this.doc.isReadonly) return
    this.contentPointer = {
      pointerId: evt.pointerId,
      startX: evt.clientX,
      startY: evt.clientY,
      dragged: false,
    }
    this.doc.dragController.startDrag(
      evt,
      {kind: 'new-block', flavour: material.flavour},
      {ghostLabel: material.label},
    )
  }

  onContentPointerUp(
    evt: PointerEvent,
    material: BundledBlockMaterial,
  ): void {
    const pointer = this.contentPointer
    this.contentPointer = null
    if (!pointer || pointer.pointerId !== evt.pointerId || pointer.dragged) return
    const dx = evt.clientX - pointer.startX
    const dy = evt.clientY - pointer.startY
    if (dx * dx + dy * dy > 64) return
    insertContentBlock(this.doc as BlockCraftDoc, material)
  }

  clearContentPointer(evt: PointerEvent): void {
    if (this.contentPointer?.pointerId === evt.pointerId) {
      this.contentPointer = null
    }
  }

  protected iconClass(icon: string): string {
    return icon.includes('bc_icon') ? icon : `bc_icon ${icon}`
  }

  protected insertRegion(): void {
    insertTemplateRegion(this.doc as BlockCraftDoc)
  }

  // page-bg：交给父页（编辑 surface 选图 + 设整页背景）。embed：点击在当前光标处插 embed delta，没有光标就兜底落到最后一个段落末尾。
  onClick(m: Material): void {
    if (m.kind === MaterialKind.PageBg) { this.pickPageBackground.emit(); return }
    if (m.kind !== MaterialKind.Embed) return
    let sel = this.doc.selection.value
    if (!sel || sel.start.type !== 'text') {
      const last = this.doc.root.lastChildren
      if (last?.flavour === 'paragraph') {
        this.doc.selection.setCursorAtBlock(last, false)
        sel = this.doc.selection.value
      }
    }
    if (!sel || sel.start.type !== 'text') return
    const block = sel.start.block
    const at = sel.start.offset
    block.applyDeltaOperations([
      { retain: at },
      m.createDelta(),
    ])
    // 光标移到刚插入的 embed 之后（embed 占 1 个位），方便继续打字
    ;(block as unknown as { setInlineRange?(index: number, length?: number): void }).setInlineRange?.(at + 1)
  }
}
