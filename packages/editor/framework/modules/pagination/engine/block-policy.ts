// packages/editor/framework/modules/pagination/engine/block-policy.ts
import {BlockNodeType} from "../../../block-std/types/block.type";

/** 手动分页符 flavour（复用 demo-presentation 的 page-divider 语义）。 */
export const MANUAL_BREAK_FLAVOUR = 'page-divider';

export interface BlockPolicy {
  breakable: boolean;
  keepWithNext: boolean;
  /**
   * 超高时**锁定最大高度到 ≤ 一页**：流式图片/视频可约束媒体 wrapper，
   * 其余原子块仍裁剪；都不拆、不溢出。
   * 图片/视频/音频/mermaid/公式/书签/各类嵌入等原子块 + 代码块。与 `breakable` 互斥。
   */
  capHeight: boolean;
}

export interface BlockPolicyInput {
  flavour: string;
  nodeType: BlockNodeType;
  /** 是否标题（props.heading 真值），由调用方解析后传入。 */
  isHeading?: boolean;
}

export function isManualBreak(flavour: string): boolean {
  return flavour === MANUAL_BREAK_FLAVOUR;
}

/** @deprecated 仅表示媒体 flavour；是否允许分页约束还必须检查流式 placement 与真实 wrapper。 */
export function fitsOversizedMedia(flavour: string): boolean {
  return flavour === 'image' || flavour === 'video'
}

/** 按 flavour + nodeType 解析分页策略（spec §7 默认表）。 */
export function resolveBlockPolicy(input: BlockPolicyInput): BlockPolicy {
  const {flavour, nodeType, isHeading = false} = input;

  // void 块一律原子（图片/视频/分割线/公式/嵌入…）；超高时锁定最大高度到一页内，不溢出。
  if (nodeType === BlockNodeType.void) {
    return {breakable: false, keepWithNext: false, capHeight: true};
  }

  switch (flavour) {
    case 'image':
      // 图片可带 caption 子块，因此 schema 是 block；分页仍把整张图片卡片视为原子块。
      return {breakable: false, keepWithNext: false, capHeight: true};
    case 'paragraph':
      return {breakable: true, keepWithNext: isHeading, capHeight: false};
    case 'bullet':
    case 'ordered':
    case 'todo':
    case 'mermaid-textarea':
    case 'blockquote':
    case 'caption':
      return {breakable: true, keepWithNext: false, capHeight: false};
    case 'code':
      // 代码块超高时锁定最大高度到一页内（不按行拆）——与图片等原子块同策略。
      return {breakable: false, keepWithNext: false, capHeight: true};
    case 'table':
      return {breakable: true, keepWithNext: false, capHeight: false};
    case 'callout':
    case 'columns':
    case 'column':
    case 'table-row':
    case 'table-cell':
      return {breakable: false, keepWithNext: false, capHeight: false};
    default:
      return {breakable: nodeType === BlockNodeType.editable, keepWithNext: false, capHeight: false};
  }
}
