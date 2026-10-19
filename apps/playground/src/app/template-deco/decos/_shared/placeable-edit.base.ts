import { Component, HostBinding, HostListener, inject } from '@angular/core'
import { NoEditableBlockNative } from '@ccc/blockcraft'
import { PlaceableProps } from '../../core/placement'
import { ActiveDecoService } from '../../core/active-deco.service'
import { PlaceableDecoBase } from './placeable-deco.base'

/**
 * 编辑态物料内部的交互控件放行选单：这些元素被按下时不接管——
 * resizer 手柄与本监听在 DOM 上是包含关系，不放行会被 startFreeDrag 的 preventDefault 吞成"移动"
 * （同 underlay-pick 对手柄的放行道理）；按钮/输入框类同理，让它们做自己的事。
 * `[data-deco-nodrag]`：物料自定义点击区的放行标记（如 logo 空态"选择图片"卡）——实测 preventDefault
 * 掉 pointerdown 后 click 在真实输入管线里**不派发**，纯点击控件必须打标放行，别指望"click 反正会来"。
 */
const EDIT_PASS_THROUGH = `block-resizer, button, a, input, textarea, select, [data-deco-nodrag]`

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

  /**
   * 可拖提示（✥ move 光标）：有效块锁同样要去掉移动提示；只看 doc.isReadonly 会让冻结物料仍显示可拖，
   * 且松手才由写入守卫抛错。内部交互控件（按钮/手柄/选图卡）继续用自己的 cursor 覆盖。
   */
  @HostBinding('style.cursor') get hostCursor(): string { return this.isReadonly ? 'default' : 'move' }

  // 点身 → 设为当前物料（面板读它，走 id 通道，不走框架 selection）→ 起拖；只点不拖 = 仅选中
  @HostListener('pointerdown', ['$event'])
  onPlaceablePointerdown(ev: PointerEvent): void {
    this.activeDeco.set(this.id)                       // 监听本身在 zone 内：面板 靠这轮变更检测点亮
    // 先选中、再判断交互放行：空 logo 的整个可见卡片都带 data-deco-nodrag，若先 return，
    // 冻结后就没有任何可点击区域能打开面板解锁。按钮/输入仍只是不启动拖拽，不影响其原生行为。
    if ((ev.target as Element | null)?.closest?.(EDIT_PASS_THROUGH)) return
    // 冻结物料仍允许被点选，创建人才能在右侧面板解除冻结；选中与写交互必须分离。
    // 有效只读包含文档锁、自身锁和祖先锁，短路后不 focus/改选区、不注册 document 高频监听。
    if (this.isReadonly) return
    this.doc.selection.selectBlock(this.id)
    if (this.isAbsolutePlacement) {
      this.doc.placement.startDrag(ev, this.id)
    }
  }
}
