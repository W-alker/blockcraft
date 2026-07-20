import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core'
import { MATERIALS, Material } from '../core/registry'
import { MaterialKind, MATERIAL_KIND_LABEL } from '../core/deco.category'

interface PanelGroup { title: string; items: Material[] }

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
 * symbol 来源：bc_* 由 angular.json scripts 里的 bc-iconfont.js 注入；iconfont 没有的（天气）由下面内联 sprite 提供。
 */
@Component({
  selector: 'deco-insert-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- playground 自带 symbol：iconfont 没有的图标放这（目前只有天气）。其余 bc_* 来自注入的 sprite，统一都走 <use>。 -->
    <svg aria-hidden="true" class="deco-sprite">
      <symbol id="tpl-weather" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="5" fill="#FBBF24"/>
        <g stroke="#FBBF24" stroke-width="2" stroke-linecap="round">
          <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M19.4 4.6l-1.8 1.8M6.4 17.6l-1.8 1.8"/>
        </g>
      </symbol>
    </svg>

    <div class="insert-sidebar">
      <div class="insert-sidebar__content">
        @for (group of groups; track group.title) {
          <section class="insert-section">
            <p class="insert-section__title">{{ group.title }}</p>
            <div class="insert-grid">
              @for (m of group.items; track m.label) {
                <!-- mousedown preventDefault：点面板别清掉编辑器光标/选区，否则 embed 插入读不到落点 -->
                <div class="insert-item" [title]="hintOf(m)" style="touch-action:none"
                     (mousedown)="$event.preventDefault()" (mouseup)="onClick(m)" (pointerdown)="onPointerDown($event, m)">
                  <span class="insert-item__icon">
                    <svg class="deco-icon" aria-hidden="true"><use [attr.xlink:href]="'#' + m.svgIcon"></use></svg>
                  </span>
                  <p class="insert-item__label">{{ m.label }}</p>
                </div>
              }
            </div>
          </section>
        }
      </div>
    </div>
  `,
  styles: [`
    :host{ display:block; min-height:0 }
    .deco-sprite{ position:absolute; width:0; height:0; overflow:hidden }
    .insert-sidebar{ box-sizing:border-box; width:100%; height:100%; padding:14px; background:#fff; overflow-y:auto }
    .insert-sidebar__content{ display:flex; flex-direction:column; gap:20px }
    .insert-section{ display:flex; flex-direction:column; gap:12px }
    .insert-section__title{ margin:0; font-size:12px; color:#999; line-height:normal }
    .insert-grid{ display:flex; flex-wrap:wrap; gap:14px }
    .insert-item{ display:flex; flex-direction:column; align-items:center; gap:6px; cursor:pointer; transition:transform .12s }
    .insert-item:active{ transform:scale(.95) }
    .insert-item__icon{ display:flex; align-items:center; justify-content:center; width:46px; height:46px; border:1px solid #efefef; border-radius:10px; background:#fff; transition:border-color .15s, box-shadow .15s }
    .insert-item:hover .insert-item__icon{ border-color:#4857E2; box-shadow:0 3px 10px rgba(72,87,226,.12) }
    .deco-icon{ width:30px; height:30px }
    .insert-item__label{ margin:0; max-width:56px; text-align:center; font-size:12px; color:#7e7e7e; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; transition:color .15s }
    .insert-item:hover .insert-item__label{ color:#4857E2 }
  `],
})
export class DecoInsertPanelComponent {
  @Input({ required: true }) doc!: BlockCraft.Doc       // 模板编辑 surface 的 doc
  /** 点「背景图」→ 通知父页：用编辑 surface 选图并设为整页背景（背景不是块，不走 doc 插入）。 */
  @Output() pickPageBackground = new EventEmitter<void>()
  protected readonly groups = groupByKind(MATERIALS)

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
      { insert: { [m.name]: '' } },   // kind===Embed 已收窄，name 必有（无需 !）
    ])
    // 光标移到刚插入的 embed 之后（embed 占 1 个位），方便继续打字
    ;(block as unknown as { setInlineRange?(index: number, length?: number): void }).setInlineRange?.(at + 1)
  }
}
