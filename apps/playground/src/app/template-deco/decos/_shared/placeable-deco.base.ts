import { Component, HostBinding } from '@angular/core'
import { BaseBlockComponent, NoEditableBlockNative } from '@ccc/blockcraft'
import { PlaceableProps } from '../../core/placement'

/**
 * 可排版装饰的组件基类：把「三态 props → host CSS」的映射收敛成唯一一份。
 * 编辑态 / 渲染态组件都继承它、template 各写各的——排版规则不再在两个组件里复制
 * （weather 等物料接三态时同样继承，不许再抄 host 绑定）。
 *
 * 用 @HostBinding 装饰器而不是 @Component 的 host 元数据：host 元数据**不随继承传递**，装饰器属性会。
 * 必须是 @Component（空 template、不直接使用）而非 @Directive：BaseBlockComponent 本身是 @Component，
 * Angular 禁止 Directive 继承 Component（NG0903），且这个错 ng build 不报、只在运行时炸。
 * 三态判定与 core/placement.ts 的 placementModeFromProps 同源语义：
 * 有 x = 悬浮(absolute，块在 layout 容器里) > 有 float = 环绕 > 独占（走默认 block 流）。
 */
@Component({ selector: 'placeable-deco-base', template: ``, standalone: true })
export abstract class PlaceableDecoBase<M extends NoEditableBlockNative & { props: PlaceableProps }> extends BaseBlockComponent<M> {
  /** 悬浮才 absolute（在流里保持默认，插入掉哪是哪；拖拽/面板切换才浮起）。 */
  @HostBinding('style.position') get hostPosition(): string | null { return this.props.x != null ? 'absolute' : null }
  /** 环绕（有 float 且非悬浮）才 float 左/右。 */
  @HostBinding('style.float') get hostFloat(): 'left' | 'right' | null { return this.props.x == null && this.props.float ? this.props.float : null }
  /**
   * 独占（流内非浮动）自成 BFC：普通块盒的顶端贴着上一个块的下沿（CSS 浮动只推**行盒**、不推块盒），
   * 而盒内图片是行内内容、行盒要避让前面的环绕浮动被压到浮动下方——块盒被内容拉高成
   * "罩住上方浮动区的空壳"，按 host 矩形定位的选中框/拖拽手柄全跟着窜到图片上方
   * （"两个图挨着、下面图的外框上侧很高"就是它）。flow-root 让整个盒子作为一体避让浮动、
   * 重新贴回图片（同 styles.scss 给分栏块治"分栏上方超出"的药方）；图片落点不变——
   * 行盒避让和 BFC 避让同一套"放得下并排、放不下下移"判定。环绕/悬浮不用：float/absolute 本身就建 BFC。
   */
  @HostBinding('style.display') get hostDisplay(): string | null {
    return this.props.x == null && !this.props.float ? 'flow-root' : null
  }
  /**
   * 流内（独占 + 环绕）一律 clear:both——「物料不并排」是产品裁定：CSS 对相邻浮动/块盒的默认是
   * "放得下就并排"，于是下方物料被上方环绕图挤到右侧（Word 式双图同排在模板场景里判为 bug）。
   * clear 强制流内物料跌到所有在前浮动之下：独占名副其实独占一行，环绕永远从自己的新行起绕。
   * 悬浮脱流 clear 无意义；前面没有浮动时 clear 是无操作，零风险。
   */
  @HostBinding('style.clear') get hostClear(): string | null {
    return this.props.x == null ? 'both' : null
  }
  /**
   * 悬浮清 0（防 absolute 按 margin 偏移跳右下）。
   * 环绕：四向都是"真边距"（float 盒不参与 auto 对齐，四边全生效）——没设任何值走绕排预设
   * （文字侧 16px 留白 + 上 4 下 8），设过就按覆盖值。
   * 独占：y=上、mb=下（默认回落主题段间距变量），左右只有「对齐锚定侧」生效（左对齐吃 ml、
   * 右对齐吃 mr、居中两侧 auto）——另一侧必须 auto 吃剩余空间，px/% 和 auto 抢同一侧是 CSS
   * 块级对齐的物理冲突，面板同步禁用无效输入。
   * 单位：上下 px（垂直间距是绝对量）；**左右 %**（水平空间相对列宽，页面宽度变了间距比例不变）。
   * 全部没设时返回 null 走 base.scss / 预设默认——不产生无谓内联样式。
   */
  @HostBinding('style.margin') get hostMargin(): string | null {
    if (this.props.x != null) return '0'
    const { float, align, y, mb, ml, mr } = this.props
    if (float) {
      // 绕排预设（文字侧 16px 留白、上 4 下 8）只在下面这套 ?? / defR / defL fallback 表达一次；
      // 某方向设过就按覆盖值。原「四值全 null 走快路径」返回的串与此处逐字节相同，纯重复，已删。
      const defR = float === 'left' ? '16px' : '0'
      const defL = float === 'left' ? '0' : '16px'
      return `${y ?? 4}px ${mr != null ? `${mr}%` : defR} ${mb ?? 8}px ${ml != null ? `${ml}%` : defL}`
    }
    if (align == null && y == null && mb == null && ml == null && mr == null) return null
    const side = align ?? 'left'
    const top = `${y ?? 0}px`
    const bottom = mb != null ? `${mb}px` : 'var(--bc-segments-gap)'
    const left = side === 'left' ? `${ml ?? 0}%` : 'auto'
    const right = side === 'right' ? `${mr ?? 0}%` : 'auto'
    return `${top} ${right} ${bottom} ${left}`
  }
  /**
   * 宽度落 host（absolute 时不给宽会 shrink-wrap → 内部 img 的 % 循环、塌掉）。
   * 不存宽度的物料（复合卡片：尺寸=内容 px × zoom）**流内给 fit-content**：块盒收缩到内容宽，
   * 独占的 margin:auto 对齐才有空间可挪（满宽盒子谈不上左中右）；给它 width% 是错工具——
   * 卡片视觉大小由 zoom 决定，% 只会造一个和内容无关的空壳。悬浮 absolute 本就 shrink-wrap，返 null。
   */
  @HostBinding('style.width') get hostWidth(): string | null {
    if (this.props.width != null) return `${this.props.width}%`
    return this.props.x == null ? 'fit-content' : null
  }
  @HostBinding('style.left.%') get hostLeft(): number | null { return this.props.x ?? null }
  /** top 只属于悬浮：独占的 y 已换义为 margin-top（见 hostMargin），别再往静态定位的 host 上写死 top。 */
  @HostBinding('style.top.px') get hostTop(): number | null { return this.props.x != null ? this.props.y ?? null : null }
  /**
   * 层级——**只在悬浮域生效**（面板也只在悬浮暴露层级控件）：默认不设 = z-index:auto = 走树序；
   * 负值沉到正文下（水印，靠 .editor-container 的 isolation）。
   * 流内（独占/环绕）不吃 props.z：流内块不与正文重叠，层级无意义，负 z 反而致命——float 盒会被
   * **后续段落的全宽 relative 盒**盖住（base.scss 给所有块 `position:relative`，定位盒绘制在 float
   * 之上、命中测试也赢），环绕图"看得见点不中"；边缘拾取（underlay-pick）又只管 layout 里的悬浮衬底，
   * 救不了流内块。所以环绕固定 1 压过 z:auto 的段落盒保住可点（文字绕排是布局行为，不受 z 影响）；
   * 独占返回 null（流内块盒上下排布不重叠）。这也让「悬浮设过文字后再切回环绕」的历史脏 z 立即失效自愈
   * （applyPlacement 回流已同步清 z，此处兜底旧文档数据）。
   */
  @HostBinding('style.z-index') get hostZ(): number | null {
    if (this.props.x != null) return this.props.z ?? null
    return this.props.float ? 1 : null
  }
  /**
   * 旋转——**悬浮域专属**（同 z）：流内块转了也只是视觉转，绕排/推挤仍按未旋转盒算，语义破碎，
   * 所以只在悬浮生效、回流时由 applyPlacement 随 x/y/z 一并清除。围绕中心旋转（CSS 默认
   * transform-origin:center）——中心是旋转不变量，free-drag 起手位置的反推依赖这一点。
   */
  @HostBinding('style.transform') get hostRotate(): string | null {
    return this.props.x != null && this.props.deg ? `rotate(${this.props.deg}deg)` : null
  }
}
