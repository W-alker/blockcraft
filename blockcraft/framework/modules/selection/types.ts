import {BaseBlockComponent, EditableBlockComponent} from "../../block-std";

export interface IInlineRange {
  index: number
  length: number
}

/**
 * {@link IBlockTextRange} 的 JSON 格式\
 * {@link IBlockSelectedRange} 的 JSON 格式
 */
export type IBlockRange = IBlockTextRange | IBlockSelectedRange

export interface IBlockTextRange extends IInlineRange {
  block: EditableBlockComponent<any>
  blockId: string
  type: 'text'
}

export interface IBlockSelectedRange {
  block: BaseBlockComponent<any>
  blockId: string
  type: 'selected'
}

export interface INormalizedRange {
  from: IBlockRange,
  to: IBlockRange | null,
  collapsed: boolean
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
