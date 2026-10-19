/**
 * 物料分类 = 插入方式：一个枚举同时决定「怎么插」（行为）和「分到哪组」（展示）。
 * 原先 DecoCategory(整页/卡片/随文) 与本枚举一一对应、冗余，已合并——面板直接按 kind 分组，组名走 MATERIAL_KIND_LABEL。
 */
export enum MaterialKind {
  PageBg = 'page-bg',  // 整页：点击选图设为整页背景（不进文档）
  Block = 'block',     // 卡片：块装饰，拖入文档
  Embed = 'embed',     // 随文：行内 embed，点击在光标处插
}

/** 面板分组显示名*/
export const MATERIAL_KIND_LABEL: Record<MaterialKind, string> = {
  [MaterialKind.PageBg]: '整页',
  [MaterialKind.Block]: '卡片',
  [MaterialKind.Embed]: '随文',
}

