import { Component, HostBinding, HostListener, NgZone, inject } from '@angular/core'
import { NoEditableBlockNative } from '@ccc/blockcraft'
import { PlaceableProps, commitAbsolute } from '../../core/placement'
import { ActiveDecoService } from '../../core/active-deco.service'
import { RESIZER_SELECTOR, startFreeDrag } from './free-drag'
import { PlaceableDecoBase } from './placeable-deco.base'

/**
 * 编辑态物料内部的交互控件放行选单：这些元素被按下时不接管——
 * resizer 手柄与本监听在 DOM 上是包含关系，不放行会被 startFreeDrag 的 preventDefault 吞成"移动"
 * （同 underlay-pick 对手柄的放行道理）；按钮/输入框类同理，让它们做自己的事。
 * `[data-deco-nodrag]`：物料自定义点击区的放行标记（如 logo 空态"选择图片"卡）——实测 preventDefault
 * 掉 pointerdown 后 click 在真实输入管线里**不派发**，纯点击控件必须打标放行，别指望"click 反正会来"。
 */
const EDIT_PASS_THROUGH = `${RESIZER_SELECTOR}, button, a, input, textarea, select, [data-deco-nodrag]`

/**
 * 可排版装饰的「编辑态」基类：渲染绑定（继承 PlaceableDecoBase）之上，把**选中 + 自由拖拽**的
 * 接线也收进基类——「void 物料都能拖」是物料家族的领域默认能力，不再要求每个物料自抄三行 wiring。
 * 编辑组件继承它 = 点击即选中（排版面板认）、拖动越过 3px 阈值即浮起（commitAbsolute 一步事务）；
 * 渲染态组件**不许**继承它（使用页只渲染不拖），继续继承 PlaceableDecoBase。
 *
 * host 级 pointerdown 而不是各组件绑内容元素：内容元素形状各异（img / chip / 空态卡片），host 是
 * 唯一稳定挂点；点击类子控件不受影响——startFreeDrag 的 preventDefault 只压掉派生 mouse 事件与
 * 原生拖选，click 仍照常派发（logo 空态"选择图片"就靠这个）。只 preventDefault 不 stopPropagation：
 * 与 logo 旧接线语义一致，框架仍能看到这次按下。
 * 必须是 @Component（空模板、不直接使用）而非 @Directive（NG0903 只在运行时炸）——同 PlaceableDecoBase。
 */
@Component({ selector: 'placeable-edit-base', template: ``, standalone: true })
export abstract class PlaceableEditBase<M extends NoEditableBlockNative & { props: PlaceableProps }> extends PlaceableDecoBase<M> {
  private readonly activeDeco = inject(ActiveDecoService)//选中物料 广播流 物料属性控制
  private readonly ngZone = inject(NgZone)//重建检测界面 依附结束通知angular

  /** 可拖提示（✥ move 光标）：家族默认，物料不必各写 CSS；内部交互控件（按钮/手柄/选图卡）用自己的 cursor 覆盖。 */
  @HostBinding('style.cursor') get hostCursor(): string | null { return this.doc.isReadonly ? null : 'move' }

  // 点身 → 设为当前物料（面板读它，走 id 通道，不走框架 selection）→ 起拖；只点不拖 = 仅选中
  @HostListener('pointerdown', ['$event'])
  onPlaceablePointerdown(ev: PointerEvent): void {
    if (this.doc.isReadonly) return
    if ((ev.target as Element | null)?.closest?.(EDIT_PASS_THROUGH)) return
    this.activeDeco.set(this.id)                       // 监听本身在 zone 内：面板 靠这轮变更检测点亮
    // 悬浮 void 物料默认不可聚焦，点它编辑器不获焦 → 删除卫兵挂在 .editor-container 上的 keydown（capture）
    // 收不到（keydown 只派发到 document.activeElement 再沿祖先冒泡/捕获）。让「选中悬浮物料后按 Delete 删它」成立需两步：
    // ① 给 host 设 tabindex 并 focus 它（host 在 .editor-container 内）→ Delete 的 keydown 才会经容器捕获到达卫兵；
    // ② blur 框架选区 → 卫兵里 selectionJson() 返回 null，才进「选区空 → 删 active 悬浮物料」分支，且不误删正文光标处字符。
    // 独占/环绕住正文流、走框架 BlockSelection，不动它们的选区/焦点。
    if (this.props.x != null) {
      const host = this.hostElement
      if (host.getAttribute('tabindex') == null) host.setAttribute('tabindex', '-1')
      host.style.outline = 'none'                       // tabindex 聚焦会带默认焦点框，物料已有 underlay-pick 蓝框，去掉重复
      try { host.focus({ preventScroll: true }) } catch { /* 边界不阻塞选中/拖拽 */ }
      try { (this.doc.selection as unknown as { blur?: () => void }).blur?.() } catch { /* 同上 */ }
    }
    // 拖动期挪到 zone 外：startFreeDrag 在 document 上挂高频 pointermove、逐帧写内联样式预览，
    // 留在 zone 内 = 每帧一轮全局变更检测（性能清单红线）。提交那一下回 zone——Yjs 写入后的
    // 面板回显 / 撤销按钮态需要一轮 CD（对齐 underlay-pick「高频 zone 外、状态变化才回 zone」的处理）。
    //拖动期在 zone 外(不检测),但松手提交那一下要 ngZone.run 回到 zone 内
    this.ngZone.runOutsideAngular(() =>
      startFreeDrag(ev, this.hostElement, (x, y) => this.ngZone.run(() => commitAbsolute(this.doc, this.id, x, y))),
    )
  }
}
