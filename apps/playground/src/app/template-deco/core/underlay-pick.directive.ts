import { Directive, ElementRef, Input, NgZone, OnDestroy, inject } from '@angular/core'
import { Subscription } from 'rxjs'
import { BlockCraftDoc } from '@ccc/blockcraft'
import { RESIZER_SELECTOR, startFreeDrag } from '../decos/_shared/free-drag'
import { ActiveDecoService } from './active-deco.service'
import { commitAbsolute, listLayoutDecos } from './placement'

/** 边缘环带厚度（px）。被文字盖住的区域只有这一圈可拾取——环带中间照常归正文，「能选中衬底图」和「不抢文字编辑」的平衡点。 */
const BAND = 8

/**
 * 衬底物料（z<0，置于文字后）的拾取 + 全体物料的「选中框」。挂在编辑面的 .editor-container 上，仅编辑态。
 *
 * 为什么必须在容器层做：z<0 的块是**独立 stacking context**，握把长在块内部永远翻不到文字上面；
 * 且正文块（段落是全宽盒）在命中测试里永远先接住指针——所以用容器的**捕获监听**先于一切子处理器拿到
 * 事件，按几何判断「这一下其实点的是衬底图」。
 *
 * 拾取规则（只管 z<0 的物料，z≥0 的自己就能接到指针）：
 * - 点落在物料**边缘 BAND px 环带** → 拾取（被文字盖住时的入口）；
 * - 点落在物料内部、且该点**没有被任何正文块盖住**（elementFromPoint 只命中 root/结构层/物料自己）
 *   → 整图任意位置可拾取——拖出文字区域后就跟普通物料一样在图上直接拖，不必再摸边；
 * - **已选中的物料整图可拖**：点名（边缘选中）之后意图已明确，矩形内任意位置按下都判给它
 *   ——只有第一下需要瞄边缘；点别处取消选中，中间区域立刻还给正文编辑。层级/渲染不变，仍在文字下。
 * 拾取 = 选中（ActiveDecoService）+ 接 startFreeDrag（只点不拖=仅选中；拖=移动，与物料自带拖拽同一条
 * commitAbsolute 链路）。preventDefault 压掉派生 mousedown：正文光标不动、blank-click 不触发。
 *
 * 选中框（Word 式）：**选中谁就框谁、取消就消失**——跟 hover 无关。数据源就是 active$（物料自己的
 * pointerdown / 本指令拾取都会 set），没有新增任何点击通道；点到容器内非物料处（正文/空白）时由本指令
 * 的同一个捕获监听清掉 active → 框消失。
 * 框的跟位用**选中期间的 rAF 跟随循环**（每帧把框贴到 host 当前矩形）：对齐/边距/拖拽/撤销引起的任何
 * 几何变化下一帧即贴合——此前"事务后延时重摆"的做法在面板点对齐时会先看到块动、框半拍后才追上（闪一下）。
 *
 * 性能：监听全部 zone 外挂，高频 pointermove 经 rAF 节流只管光标；跟随循环**仅在有选中时运行**，
 * 每帧两次 getBoundingClientRect + 仅在值变化时写样式，不触发 Angular 变更检测；
 * 只有「选中状态变化」这一步 zone.run 回去刷右侧面板。销毁时监听/订阅/rAF/框成对清理。
 */
@Directive({ selector: '[underlayPick]', standalone: true })
export class UnderlayPickDirective implements OnDestroy {
  @Input('underlayPick') doc: BlockCraftDoc | null = null

  private readonly el: HTMLElement = inject(ElementRef).nativeElement
  private readonly zone = inject(NgZone)
  private readonly active = inject(ActiveDecoService)
  private readonly sub = new Subscription()
  private frame: HTMLElement | null = null
  /** 当前选中物料 id —— 单一真源是 ActiveDecoService.active$，这里只读取、不再镜像存一份（改动走 active$）。 */
  private get activeId(): string | null { return this.active.active$.value }
  private cursorRafId: number | null = null
  private followRafId: number | null = null
  private lastX = 0
  private lastY = 0

  constructor() {
    this.zone.runOutsideAngular(() => {
      this.el.addEventListener('pointerdown', this.onDown, true)   // 捕获：先于框架/物料自己的处理器
      this.el.addEventListener('pointermove', this.onMove)
      this.el.addEventListener('pointerleave', this.onLeave)
      this.sub.add(this.active.active$.subscribe(() => this.syncFollow()))   // active$ 变 → 只触发副作用（起停跟随循环）
    })
  }

  ngOnDestroy(): void {
    this.el.removeEventListener('pointerdown', this.onDown, true)
    this.el.removeEventListener('pointermove', this.onMove)
    this.el.removeEventListener('pointerleave', this.onLeave)
    this.sub.unsubscribe()
    if (this.cursorRafId != null) cancelAnimationFrame(this.cursorRafId)
    if (this.followRafId != null) cancelAnimationFrame(this.followRafId)
    this.frame?.remove()
    this.el.style.cursor = ''
  }

  private readonly onDown = (ev: PointerEvent): void => {
    // 交互控件放行：resizer 手柄悬在物料边缘 ±10px，和边缘环带几何上天然重叠——目标是手柄就让它做缩放。
    // 不放行的话本指令 preventDefault 会吞掉派生 mousedown，手柄永远收不到事件，拖出来的是"移动"不是"缩放"。
    if ((ev.target as Element | null)?.closest?.(RESIZER_SELECTOR)) return
    const hit = this.hitUnderlay(ev.clientX, ev.clientY)
    if (hit) {
      ev.preventDefault()                                // 压掉派生 mousedown：光标不落、blank-click 不触发
      ev.stopPropagation()                               // 这次按下不再进框架 / 物料自己的处理器
      const doc = this.doc!
      this.zone.run(() => this.active.set(hit.id))       // 面板是 OnPush+订阅，回 zone 保证刷新
      startFreeDrag(ev, hit.host, (x, y) => commitAbsolute(doc, hit.id, x, y))
      return
    }
    // 没拾取到 = 点在正文/空白：清选中（Word 的"点别处取消"）。若点的是 z≥0 物料，
    // 它自己的 pointerdown 在目标阶段会立刻把 active 设回来，同一轮变更检测内无闪烁。
    if (this.activeId) this.zone.run(() => this.active.set(null))
  }

  private readonly onMove = (ev: PointerEvent): void => {
    this.lastX = ev.clientX
    this.lastY = ev.clientY
    if (this.cursorRafId != null) return                 // rAF 节流：一帧最多算一次
    this.cursorRafId = requestAnimationFrame(() => {
      this.cursorRafId = null
      this.el.style.cursor = this.hitUnderlay(this.lastX, this.lastY) ? 'move' : ''
    })
  }

  private readonly onLeave = (): void => {
    if (this.cursorRafId != null) { cancelAnimationFrame(this.cursorRafId); this.cursorRafId = null }
    this.el.style.cursor = ''
  }

  /** 选中态变化 → 起 / 停跟随循环。停时立刻摆一次（把框藏掉），起时循环里每帧贴合。 */
  private syncFollow(): void {
    if (this.activeId == null) {
      if (this.followRafId != null) { cancelAnimationFrame(this.followRafId); this.followRafId = null }
      this.positionFrame()
      return
    }
    this.positionFrame()                                 // 选中当帧先贴一次，不等下一帧
    if (this.followRafId != null) return
    const step = (): void => {
      this.positionFrame()
      this.followRafId = this.activeId != null ? requestAnimationFrame(step) : null
    }
    this.followRafId = requestAnimationFrame(step)
  }

  /**
   * 拾取命中：只收 z<0 的物料，按绘制序（z 升序、同 z 树序）倒着找视觉最上的。
   * 环带必中；环带外的内部点，要求该点视觉上自由（没被正文块盖住）才中——见类注释的拾取规则。
   */
  private hitUnderlay(x: number, y: number): { id: string; host: HTMLElement } | null {
    const doc = this.doc
    if (!doc || doc.isReadonly) return null
    const painted = listLayoutDecos(doc)
      .map((b, i) => ({ b, i }))
      .filter(p => (p.b.props?.z ?? 0) < 0)
      .sort((p, q) => ((p.b.props?.z ?? 0) - (q.b.props?.z ?? 0)) || (p.i - q.i))
    for (let k = painted.length - 1; k >= 0; k--) {
      const host = painted[k].b.hostElement
      const r = host.getBoundingClientRect()
      if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue
      // 选中态整图可拖：点名后的物料矩形内任意点必中（见类注释第三条）；未选中仍走环带/自由点判定
      if (painted[k].b.id === this.activeId || this.inBand(r, x, y) || this.pointFree(x, y, host)) return { id: painted[k].b.id, host }
    }
    return null
  }

  /** 离任一边不超过环带厚度（小图取边长 1/3 封顶，防环带吞掉整图没有"中间"）。调用方保证点已在矩形内。 */
  private inBand(r: DOMRect, x: number, y: number): boolean {
    const bx = Math.min(BAND, r.width / 3)
    const by = Math.min(BAND, r.height / 3)
    return x - r.left < bx || r.right - x < bx || y - r.top < by || r.bottom - y < by
  }

  /**
   * 该点是否"视觉自由"（没被正文块盖住）：取指针下的真实命中元素，向上找最近的块——
   * 只命中 root（结构透明层）/ 完全没有块（页边距区）/ 物料自己，都算自由；命中段落等正文块 = 被盖住。
   * 这正是「拖出文字区域后整图可拖」的判据：z<0 的物料在 DOM 命中测试里永远输给全宽的 root/段落盒，
   * 所以"图露在外面"没法靠 DOM 命中直接知道，只能反过来问"这一点被谁接住了"。
   */
  private pointFree(x: number, y: number, host: HTMLElement): boolean {
    const top = document.elementFromPoint(x, y)          // 选中框 pointer-events:none，不会挡在这
    if (!top) return false
    const blockEl = top.closest('[data-block-id]') as HTMLElement | null
    return !blockEl || blockEl === host || blockEl.dataset['blockId'] === this.doc!.rootId
  }

  // ── 选中框：一个复用 div，选中显示、取消隐藏；位置由跟随循环每帧贴到选中物料的 host ──

  private positionFrame(): void {
    const host = this.activeId ? this.el.querySelector<HTMLElement>(`[data-block-id="${this.activeId}"]`) : null
    if (!host) {
      if (this.frame) this.frame.style.display = 'none'
      return
    }
    const f = this.frame ?? (this.frame = this.createFrame())
    const cr = this.el.getBoundingClientRect()
    const r = host.getBoundingClientRect()
    // 逐帧调用：值没变就不写样式，避免无谓的 style 失效
    const next = { display: 'block', left: `${r.left - cr.left}px`, top: `${r.top - cr.top}px`, width: `${r.width}px`, height: `${r.height}px` }
    for (const [k, v] of Object.entries(next)) {
      if (f.style[k as 'left'] !== v) f.style[k as 'left'] = v
    }
  }

  /** 选中框：纯视觉、不参与命中（pointer-events:none）；z 只需高于正文，仍在容器 isolation 之内。 */
  private createFrame(): HTMLElement {
    const f = document.createElement('div')
    f.style.cssText = 'position:absolute;z-index:10;pointer-events:none;border:1px dashed #4857E2;border-radius:2px;box-sizing:border-box;display:none'
    this.el.appendChild(f)
    return f
  }
}
