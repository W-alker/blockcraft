import { ChangeDetectionStrategy, Component } from '@angular/core'
import { BaseBlockComponent, NoEditableBlockNative, BlockNodeType, IBlockSchemaOptions, IBlockSnapshot, generateId } from '@ccc/blockcraft'
import { LAYOUT_FLAVOUR } from './placement'

/**
 * 悬浮层容器模型：root 的一个专用子块，只装「自由悬浮」物料，把它们的 id 与正文的 children 数组分开
 * ——删正文（中间删 / 选到末尾删）走的是 root.children，碰不到 layout.children 里的悬浮物。见设计文档 §2/§6。
 */
export interface LayoutModel extends NoEditableBlockNative {
  flavour: typeof LAYOUT_FLAVOUR   // 类型位置也引用排版域常量（typeof），不再硬编码字面量
  nodeType: BlockNodeType.block
  props: {}   // 无自有属性；用 {}（交集单位元）而非 Record<string,never>——后者会把全局 props 交集毒化成 never
}

/**
 * 悬浮层组件：视觉上是钉在页面内容左上、满内容宽、零高度的**绝对定位覆盖层**。
 * `position:absolute; top:0; left:0; width:100%` 的意义——子物料 `left:x%` 相对 layout 宽(=内容宽 768)、
 * `top:y px` 从 layout 顶(=内容顶)，**原点与物料还在 root 里时完全一致，迁移零改坐标**（见设计文档 §3）。
 * 用 host 内联样式而非 styles：要压过 base.scss 的 `[data-block-id]{position:relative}`（内联优先级最高）。
 * 零高度 → 自身不挡点击；子物料各自 absolute、可点可拖。children 渲染进 `.children-render-container`。
 */
@Component({
  selector: 'div.template-layout-block',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[style.position]': "'absolute'",
    '[style.top.px]': '0',
    '[style.left.px]': '0',
    '[style.width.%]': '100',
    '[style.height.px]': '0',
    '[style.margin]': "'0'",
  },
  template: `<div class="children-render-container"></div>`,
})
export class TemplateLayoutComponent extends BaseBlockComponent<LayoutModel> {}

/**
 * layout 容器 schema 工厂（编辑 / 使用两套字典共用同一个实例——它只装子物料，本身不分编辑 / 渲染态）。
 * includeChildren 由调用方（registry.ts）用 DECOS 注册表**自动派生**——加一个物料自动进白名单，
 * 不再手工维护清单：手工清单会和注册表脱节，漏改不报错（浮起走 moveBlocks 不校验），
 * 只在"拖物料进 layout"时被静默拒绝，是最隐蔽的漏点。做成参数而不是 import registry：
 * registry 已 import 本文件，反向引用会成环。
 * ⚠️ 绝不能打 `isLeaf`：isLeaf 块会被 `schema/index.ts:52` 拒绝当 root 子块。
 */
export const createTemplateLayoutSchema = (includeChildren: string[]): IBlockSchemaOptions<LayoutModel> => ({
  flavour: LAYOUT_FLAVOUR,
  nodeType: BlockNodeType.block,
  component: TemplateLayoutComponent,
  createSnapshot: (children: IBlockSnapshot[] = []) => ({
    id: generateId(),
    flavour: LAYOUT_FLAVOUR,      // 运行时值 + 类型（见 LayoutModel 的 typeof）都取自排版域常量，一处定义
    nodeType: BlockNodeType.block,
    props: {},
    meta: {},
    children,
  }),
  metadata: {
    version: 1,
    label: '',
    renderUnit: true,                 // 是渲染单元（能容纳并渲染子块）
    hideInInsertMenu: true,           // 只由代码在「自由悬浮」时创建，不在插入菜单出现
    includeChildren,
  },
})
