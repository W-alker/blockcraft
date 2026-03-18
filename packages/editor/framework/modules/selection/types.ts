import {BaseBlockComponent, EditableBlockComponent} from "../../block-std";

export interface IInlineRange {
  readonly index: number
  readonly length: number
}

/**
 * {@link IBlockTextRange} 的 JSON 格式\
 * {@link IBlockSelectedRange} 的 JSON 格式
 */
export type IBlockRange = IBlockTextRange | IBlockSelectedRange

export interface IBlockTextRange extends IInlineRange {
  readonly block: EditableBlockComponent<any>
  readonly blockId: string
  readonly type: 'text'
}

export interface IBlockSelectedRange {
  readonly block: BaseBlockComponent<any>
  readonly blockId: string
  readonly type: 'selected'
}

export interface INormalizedRange {
  readonly from: IBlockRange,
  readonly to: IBlockRange | null,
  readonly collapsed: boolean
}

export type IBlockInlineRangeJSON = {
  index: number,
  length: number,
  blockId: string,
  type: 'text'
} | {
  blockId: string,
  type: 'selected'
}

export interface IBlockSelectionJSON {
  from: IBlockInlineRangeJSON,
  to: IBlockInlineRangeJSON | null
  collapsed: boolean
  commonParent: string
}
