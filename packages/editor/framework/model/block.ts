import type {SimpleValue} from '@ccc/blockcraft/global/types';

/**
 * root = 'root',
 * block: 普通的块级节点，一般这代表它有children\
 * void: 无children的block节点，且不可编辑，类似html的 \<img /> 闭合标签类型 \
 * editable: 可编辑的文本块节点，和void一样，是最底层的block节点\
 */
export enum BlockNodeType {
  root = 'root',
  block = 'block',
  void = 'void',
  editable = 'editable'
}

export interface IBlockProps {
  textAlign?: 'center' | 'right'
  depth?: number
  /** Atomic "x y" in layout px, at most two decimals; used in absolute planes. */
  position?: string
  /** Omitted means the default `over` layer. */
  placementLayer?: 'under'
  /** Persisted editable-block fill color. `null` removes the override. */
  backColor?: string | null
  /** Persisted editable-block outline color. `null` removes the override. */
  borderColor?: string | null

  [key: string]: SimpleValue
}

export interface IEditableBlockProps extends IBlockProps {
  depth: number
  heading?: number
  /** Paragraph base font scale; omitted/null inherits the document base size. */
  pfs?: number | null
  /** Compact unitless line-height ratio; omitted inherits the document root. */
  lh?: number | null
  /** Paragraph space before, in typographic points. */
  psb?: number | null
  /** Paragraph space after, in typographic points; omitted inherits the theme gap. */
  psa?: number | null
}
