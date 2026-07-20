import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, NgZone, OnDestroy, OnInit, inject, signal } from '@angular/core'
import { BlockCraftDoc } from '@ccc/blockcraft'
import { Subscription } from 'rxjs'
import { ActiveDecoService, DecoBlockRef } from '../core/active-deco.service'
import { applyPlacement, isPlaceableDeco, placementModeFromProps, PlacementMode, PlaceableProps } from '../core/placement'
import { pageColumnContentWidth } from '../decos/_shared/page-size'

/** 面板视图模型：选中物料的一次完整解析结果。一组同源派生数据收成一个对象（P1 单一真源），不拆散 signal。 */
interface PanelVM {
  mode: PlacementMode
  floatSide: 'left' | 'right'
  align: 'left' | 'center' | 'right'
  x: number | null
  y: number | null
  z: number | null
  deg: number | null
  mb: number | null
  ml: number | null
  mr: number | null
  /** 边距占位符 = 未设值时的**真实生效数**（用户裁定：别写"默认"两个字，直接给数）。 */
  ph: { y: string; mb: string; ml: string; mr: string }
}

/**
 * 未设值时各边距的真实生效数（做占位符）：独占 上/左/右=0、下=主题段间距（就地量 host 的
 * computed marginBottom）；环绕 = 绕排预设（上4 下8 px；文字侧 16px 按列宽换算成%、外侧 0）。
 */
const placeholdersOf = (b: DecoBlockRef): PanelVM['ph'] => {
  const el = (b as unknown as { hostElement?: HTMLElement }).hostElement
  const p = b.props as PlaceableProps | undefined
  if (placementModeFromProps(p) === 'float') {
    const side = p?.float === 'right' ? 'right' : 'left'
    let sidePct = '2'
    try { const w = pageColumnContentWidth(el!); if (w) sidePct = String(Math.round((16 / w) * 1000) / 10) } catch { /* 量不到列宽就用近似值 */ }
    return { y: '4', mb: '8', ml: side === 'left' ? '0' : sidePct, mr: side === 'left' ? sidePct : '0' }
  }
  let gap = '16'
  try { if (el && p?.mb == null) gap = String(Math.round(parseFloat(getComputedStyle(el).marginBottom) || 16)) } catch { /* 同上 */ }
  return { y: '0', mb: gap, ml: '0', mr: '0' }
}

/** 纯函数：块 → 面板 VM。以后加字段（如 rotate）只改这一处 + 模板，漏不掉。 */
const toVM = (b: DecoBlockRef): PanelVM => ({
  mode: placementModeFromProps(b.props),
  floatSide: b.props?.float === 'right' ? 'right' : 'left',
  align: b.props?.align ?? 'left',
  x: b.props?.x ?? null,
  y: b.props?.y ?? null,
  z: b.props?.z ?? null,
  deg: (b.props as PlaceableProps | undefined)?.deg ?? null,
  mb: b.props?.mb ?? null,
  ml: b.props?.ml ?? null,
  mr: b.props?.mr ?? null,
  ph: placeholdersOf(b),
})

/**
 * 右侧「排版 / 位置」面板（在"插入装饰"上方）。点中一个装饰物料后：
 * - 「排版方式」三选一：独占一行 / 图文环绕 / 自由悬浮——切换即迁移（applyPlacement，move+改属性一步撤销）；
 * - 独占出「对齐 左/中/右」、环绕出「图在左 / 右」，两者共用四向边距盒（上/下 px、左/右列宽%；
 *   独占的左右仅对齐锚定侧可改，x 是悬浮判别位、独占不用 x，见 PlaceableProps 注释）；
 * - 悬浮出 Figma 检查器式字段格：x（占列宽%）/ y（离顶 px）+ 层级三档分段器（文字下/默认/置顶）；
 * - 「删除物料」收在标题行右上角图标（悬浮物料绕开了框架选区、键盘删不着，这是唯一删除入口）。
 *
 * 数据源：订阅 `ActiveDecoService.active$`（物料点/拖时 next 自己的 id）+ yDoc `afterAllTransactions`。
 * 两处都走 resolve() → 整体重建一个 vm 对象塞进 signal——新对象引用必变、永不触发 Object.is 判等吞更新
 * （此前 5 个散 signal 逐字段 set 的写法就是为绕开这个坑，现在收敛成 VM 后天然成立）。
 * 写只走 `updateProps` / `applyPlacement`（进 Yjs+撤销），不碰底层。
 */
@Component({
  selector: 'deco-layout-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="tpl-layout">
      <!-- 标题行：删除收成右上角图标按钮（幽灵态、hover 才变危险色）——不再是底部一整条红按钮 -->
      <div class="tpl-layout__head">
        <span class="tpl-layout__title">排版 / 位置</span>
        @if (vm()) {
          <button class="tpl-layout__del" type="button" title="删除物料" (click)="removeCurrent()"><i class="bc_icon bc_shanchu"></i></button>
        }
      </div>
      @if (vm(); as v) {
        <div class="tpl-layout__modes">
          <button type="button" [class.is-on]="v.mode==='block'" (click)="setMode('block')">独占一行</button>
          <button type="button" [class.is-on]="v.mode==='float'" (click)="setMode('float')">图文环绕</button>
          <button type="button" [class.is-on]="v.mode==='absolute'" (click)="setMode('absolute')">自由悬浮</button>
        </div>

        @if (v.mode==='block') {
          <div class="tpl-layout__seg">
            <span class="tpl-layout__seg-label">对齐</span>
            <span class="tpl-layout__seg-track">
              <button type="button" [class.is-on]="v.align==='left'" (click)="setAlign('left')">左</button>
              <button type="button" [class.is-on]="v.align==='center'" (click)="setAlign('center')">中</button>
              <button type="button" [class.is-on]="v.align==='right'" (click)="setAlign('right')">右</button>
            </span>
          </div>
        }
        @if (v.mode==='float') {
          <div class="tpl-layout__seg">
            <span class="tpl-layout__seg-label">图在</span>
            <span class="tpl-layout__seg-track">
              <button type="button" [class.is-on]="v.floatSide==='left'" (click)="setSide('left')">左侧</button>
              <button type="button" [class.is-on]="v.floatSide==='right'" (click)="setSide('right')">右侧</button>
            </span>
          </div>
        }

        @if (v.mode!=='absolute') {
          <!-- 四向边距盒（独占 + 环绕共用）：上/下 px、左/右 %（随列宽适配）。
               独占：左右仅对齐锚定侧可改（另一侧 auto 吃剩余，CSS 物理约束）；环绕：float 盒四向全生效 -->
          <div class="tpl-margin-box">
            <label class="tpl-cell tpl-cell--box tpl-margin-box__t"><input type="number" [value]="v.y ?? ''" [placeholder]="v.ph.y" title="上边距" (focus)="clearZero($event)" (change)="setMargin('y', $event)" /><span class="u">px</span></label>
            <label class="tpl-cell tpl-cell--box tpl-margin-box__l" [class.is-off]="v.mode==='block' && v.align!=='left'"><input type="number" [value]="v.ml ?? ''" [placeholder]="v.ph.ml" title="左边距（占列宽%）" [disabled]="v.mode==='block' && v.align!=='left'" (focus)="clearZero($event)" (change)="setMargin('ml', $event)" /><span class="u">%</span></label>
            <span class="tpl-margin-box__icon" title="物料"></span>
            <label class="tpl-cell tpl-cell--box tpl-margin-box__r" [class.is-off]="v.mode==='block' && v.align!=='right'"><input type="number" [value]="v.mr ?? ''" [placeholder]="v.ph.mr" title="右边距（占列宽%）" [disabled]="v.mode==='block' && v.align!=='right'" (focus)="clearZero($event)" (change)="setMargin('mr', $event)" /><span class="u">%</span></label>
            <label class="tpl-cell tpl-cell--box tpl-margin-box__b"><input type="number" [value]="v.mb ?? ''" [placeholder]="v.ph.mb" title="下边距" (focus)="clearZero($event)" (change)="setMargin('mb', $event)" /><span class="u">px</span></label>
          </div>
          <div class="tpl-layout__hint">{{ v.mode==='block' ? '左右边距按列宽百分比、跟随对齐侧生效；切换对齐会清空左右' : '边距控制图文间距；左右按列宽百分比自适应' }}</div>
        }

        @if (v.mode==='absolute') {
          <!-- 悬浮：Figma 检查器式字段格——标签/数值/单位装进同一个描边格，focus 整格点亮 -->
          <div class="tpl-layout__grid">
            <label class="tpl-cell"><span class="k">X</span><input type="number" [value]="v.x ?? ''" (focus)="clearZero($event)" (change)="setX($event)" /><span class="u">%</span></label>
            <label class="tpl-cell"><span class="k">Y</span><input type="number" [value]="v.y ?? ''" (focus)="clearZero($event)" (change)="setY($event)" /><span class="u">px</span></label>
          </div>
          <div class="tpl-layout__grid">
            <label class="tpl-cell"><span class="k">旋转</span><input type="number" [value]="v.deg ?? ''" placeholder="0" (focus)="clearZero($event)" (change)="setDeg($event)" /><span class="u">°</span></label>
          </div>
          <!-- 层级三档（导师裁定：数字 z 对用户太开发者思维，收敛成档位分段器） -->
          <div class="tpl-layout__seg">
            <span class="tpl-layout__seg-label">层级</span>
            <span class="tpl-layout__seg-track">
              <button type="button" [class.is-on]="v.z != null && v.z < 0" (click)="setTier('under')">文字下</button>
              <button type="button" [class.is-on]="v.z == null" (click)="setTier('normal')">默认</button>
              <button type="button" [class.is-on]="v.z != null && v.z > 0" (click)="setTier('top')">置顶</button>
            </span>
          </div>
          <div class="tpl-layout__hint">文字下 = 沉到正文下当水印 · 默认 = 浮于正文上（后插入的在上）· 置顶 = 压过其他物料</div>
        }
      } @else {
        <div class="tpl-layout__empty">点中一个物料，调它的排版 / 位置</div>
      }
    </section>
  `,
  styles: [`
    /* ── 结构节奏：标题行(含删除) → 模式分段器 → 情境控件组；间距 12/8 两级 ── */
    .tpl-layout{ display:flex; flex-direction:column; gap:12px; padding:14px; border-bottom:1px solid #eef0f6 }
    .tpl-layout__head{ display:flex; align-items:center; justify-content:space-between }
    .tpl-layout__title{ font-size:12px; font-weight:600; color:#4b5168; letter-spacing:.02em }
    .tpl-layout__empty{ font-size:12px; color:#9aa1b5; padding:2px 0 6px }
    .tpl-layout__hint{ font-size:11px; color:#9aa1b5; line-height:1.6 }

    /* ── 模式分段器：单一滑槽 + 白片高亮，替代三颗散排描边按钮 ── */
    .tpl-layout__modes{ display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:2px; padding:3px; background:#f1f2f7; border-radius:9px }
    .tpl-layout__modes button{ padding:6px 0; border:0; border-radius:7px; background:transparent; font-size:12px; color:#5b6270; cursor:pointer; white-space:nowrap; transition:background .15s, color .15s, box-shadow .15s }
    .tpl-layout__modes button:hover{ color:#202637 }
    .tpl-layout__modes button.is-on{ background:#fff; color:#4857E2; font-weight:600; box-shadow:0 1px 2px rgba(18,26,63,.10) }
    .tpl-layout__modes button:focus-visible{ outline:2px solid #4857E2; outline-offset:-2px }

    /* ── 行内小分段（对齐 / 图在左右）：同一套分段器语言的紧凑版，按钮装进滑槽 ── */
    .tpl-layout__seg{ display:flex; align-items:center; gap:8px; font-size:12px }
    .tpl-layout__seg-label{ flex:none; width:3em; color:#7e879f }
    .tpl-layout__seg-track{ flex:1 1 auto; min-width:0; display:flex; gap:2px; padding:3px; background:#f1f2f7; border-radius:8px }
    .tpl-layout__seg button{ flex:1 1 0; min-width:0; padding:4px 0; border:0; border-radius:6px; background:transparent; font-size:12px; color:#5b6270; cursor:pointer; transition:background .15s, color .15s, box-shadow .15s }
    .tpl-layout__seg button:hover{ color:#202637 }
    .tpl-layout__seg button.is-on{ background:#fff; color:#4857E2; font-weight:600; box-shadow:0 1px 2px rgba(18,26,63,.10) }
    .tpl-layout__seg button:focus-visible{ outline:2px solid #4857E2; outline-offset:-2px }

    /* ── 输入统一形制：26px 高、7px 圆角、hover/focus/disabled 三态；数字输入去 spinner ── */
    .tpl-layout input[type=number]{ appearance:textfield; -moz-appearance:textfield }
    .tpl-layout input[type=number]::-webkit-inner-spin-button,
    .tpl-layout input[type=number]::-webkit-outer-spin-button{ -webkit-appearance:none; margin:0 }
    .tpl-layout input{ height:26px; border:1px solid #e6e8f0; border-radius:7px; background:#fff; font-size:12px; color:#202637; box-sizing:border-box; transition:border-color .15s, box-shadow .15s }
    .tpl-layout input:hover:not(:disabled){ border-color:#c9cede }
    .tpl-layout input:focus{ outline:none; border-color:#4857E2; box-shadow:0 0 0 2px rgba(72,87,226,.12) }
    .tpl-layout input:disabled{ background:#f5f6f8; border-color:#eef0f6; color:#c2c7d4; cursor:not-allowed }

    /* ── Figma 检查器式字段格：标签/数值/单位同格，focus 整格点亮（悬浮坐标 + 边距盒共用） ── */
    .tpl-layout__grid{ display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:8px }
    .tpl-cell{ display:flex; align-items:center; gap:5px; height:28px; padding:0 8px; border:1px solid #e6e8f0; border-radius:7px; background:#fff; box-sizing:border-box; cursor:text; transition:border-color .15s, box-shadow .15s, background .15s }
    .tpl-cell:hover{ border-color:#c9cede }
    .tpl-cell:focus-within{ border-color:#4857E2; box-shadow:0 0 0 2px rgba(72,87,226,.12) }
    .tpl-cell .k{ flex:none; font-size:11px; color:#9aa1b5; user-select:none }
    .tpl-cell .u{ flex:none; font-size:11px; color:#b3bac9; user-select:none }
    .tpl-cell input{ flex:1 1 auto; min-width:0; width:100%; height:auto; padding:0; border:0; background:transparent }
    .tpl-cell input:focus{ outline:none; border:0; box-shadow:none }
    .tpl-cell.is-off{ background:#f5f6f8; border-color:#eef0f6; cursor:not-allowed }
    .tpl-cell.is-off .u{ color:#d3d8e3 }
    .tpl-cell--box{ padding:0 6px; gap:2px }
    .tpl-cell--box input{ text-align:center }
    /* ── 四向边距盒（独占+环绕共用）：卡片化盒模型，中间方块=物料；字段格流式，面板改宽不破版 ── */
    .tpl-margin-box{ display:grid; grid-template-columns:minmax(0,1fr) auto minmax(0,1fr); gap:6px 8px; justify-items:center; align-items:center; padding:10px 8px; background:#fafbff; border:1px solid #eef0f6; border-radius:10px }
    .tpl-margin-box .tpl-cell{ width:100%; max-width:82px }
    .tpl-margin-box__t{ grid-area:1 / 2 }
    .tpl-margin-box__l{ grid-area:2 / 1; justify-self:end }
    .tpl-margin-box__icon{ grid-area:2 / 2; width:22px; height:22px; border:2px solid #aeb6cc; border-radius:5px; background:#fff; box-shadow:inset 0 0 0 3px #f5f6ff }
    .tpl-margin-box__r{ grid-area:2 / 3; justify-self:start }
    .tpl-margin-box__b{ grid-area:3 / 2 }

    /* ── 删除：标题行右上角的幽灵图标钮，hover 才显危险色——不再是底部一整条红按钮 ── */
    .tpl-layout__del{ width:24px; height:24px; display:inline-flex; align-items:center; justify-content:center; border:0; border-radius:6px; background:transparent; color:#9aa1b5; font-size:14px; cursor:pointer; transition:color .15s, background .15s }
    .tpl-layout__del:hover{ color:#d05252; background:#fdf3f3 }
    .tpl-layout__del:focus-visible{ outline:2px solid #d05252; outline-offset:1px }
  `],
})
export class DecoLayoutPanelComponent implements OnInit, OnDestroy {
  @Input({ required: true }) doc!: BlockCraftDoc

  private readonly active = inject(ActiveDecoService)
  /** 视图状态只有这一个 signal（VM 整体重建）；块引用是私有字段，模板不直接碰块。 */
  protected readonly vm = signal<PanelVM | null>(null)
  private currentBlock: DecoBlockRef | null = null
  private currentId: string | null = null
  private readonly sub = new Subscription()
  private readonly onYUpdate = (): void => this.zone.run(() => { this.resolve(); this.cdr.markForCheck() })

  constructor(private readonly zone: NgZone, private readonly cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.sub.add(this.active.active$.subscribe(id => this.zone.run(() => {
      this.currentId = id
      this.resolve()
      this.cdr.markForCheck()
    })))
    this.doc.yDoc.on('afterAllTransactions', this.onYUpdate)   // 迁移/拖动改了 props → 重解析回显
  }
  ngOnDestroy(): void {
    this.sub.unsubscribe()
    this.doc.yDoc.off('afterAllTransactions', this.onYUpdate)
  }

  // 按当前 id 解析出装饰物料 → 存块引用（写入口用）+ 整体重建 VM（回显用）
  private resolve(): void {
    let b: DecoBlockRef | null = null
    if (this.currentId) { try { b = this.doc.getBlockById(this.currentId) as unknown as DecoBlockRef } catch { b = null } }
    this.currentBlock = b && isPlaceableDeco(b.flavour) ? b : null
    this.vm.set(this.currentBlock ? toVM(this.currentBlock) : null)
  }

  // 排版方式切换：move + 改属性打进一个事务（applyPlacement），afterAllTransactions 再 resolve 回显
  protected setMode(m: PlacementMode): void { if (this.currentId) applyPlacement(this.doc, this.currentId, m) }
  // 环绕换边：已在 float 模式，改 float 值即可
  protected setSide(s: 'left' | 'right'): void { this.currentBlock?.updateProps({ float: s }) }

  // ── 独占：对齐 + 四向边距（不碰 x——x 一有值就变悬浮，独占的水平位置语义是对齐） ──
  /** 切对齐同时清空左右边距：左右的"锚定侧"换了，旧值的参照基准已失义，留着会在新侧莫名顶开一块。 */
  protected setAlign(a: 'left' | 'center' | 'right'): void { this.currentBlock?.updateProps({ align: a, ml: null, mr: null }) }
  /**
   * 四向边距统一入口（独占 + 环绕共用）：y=上 px、mb=下 px、ml/mr=左右（**列宽百分比**）。
   * 留空 = 传 null 删 prop → 回落默认（独占下=主题段间距；环绕=绕排预设）。⚠️ 别复用 setY——那个会连带写 x（把独占顶成悬浮）。
   */
  protected setMargin(key: 'y' | 'mb' | 'ml' | 'mr', e: Event): void {
    const raw = (e.target as HTMLInputElement).value.trim()
    this.currentBlock?.updateProps({ [key]: raw === '' ? null : Math.round(Number(raw) || 0) })
  }
  /** 数字输入聚焦时值为 0 → 清空：直接输新数不用先删"0"（失焦没输入会走 change 的空值分支回落默认，恰与 0 等效）。 */
  protected clearZero(e: Event): void {
    const input = e.target as HTMLInputElement
    if (input.value === '0') input.value = ''
  }

  // 输入框改 x/y（仅悬浮态显示）：两个一起写，避免只设一个 → 另一个 top/left 变 auto 的怪状态
  protected setX(e: Event): void { this.currentBlock?.updateProps({ x: this.num(e), y: this.vm()?.y ?? 0 }) }
  protected setY(e: Event): void { this.currentBlock?.updateProps({ y: this.num(e), x: this.vm()?.x ?? 0 }) }

  /**
   * 层级三档（数字 z 输入已弃用——一堆数字层级对用户太麻烦，导师裁定档位化）：
   * 文字下(-1) = 沉到正文下当水印（靠 .editor-container 的 isolation 兜在本页背景之上）；
   * 默认(null = z-index:auto) = 浮于正文上，同档多个物料按树序后插在上；
   * 置顶(10) = 压过其他默认档物料。老文档遗留的任意数字 z 按符号归档亮灯（>0 亮置顶、<0 亮文字下），
   * 用户一点击就归一成档位值——历史数据自然收敛，不用迁移。
   */
  protected setTier(t: 'under' | 'normal' | 'top'): void {
    this.currentBlock?.updateProps({ z: t === 'under' ? -1 : t === 'top' ? 10 : null })
  }

  /** 旋转角度°（悬浮域专属，同 z；回流由 applyPlacement 清除）。留空 = 不旋转（删 prop）。 */
  protected setDeg(e: Event): void {
    const raw = (e.target as HTMLInputElement).value.trim()
    this.currentBlock?.updateProps({ deg: raw === '' ? null : Math.round(Number(raw) || 0) })
  }

  // 删除当前物料（悬浮物料键盘删不着，这是它唯一删除入口）
  protected removeCurrent(): void {
    if (!this.currentId) return
    this.doc.crud.deleteBlockById(this.currentId)
    this.active.set(null)
  }

  private num(e: Event): number { return Math.round(Number((e.target as HTMLInputElement).value) || 0) }
}
