import {BaseBlockComponent, EditableBlockComponent} from "../../block-std";

// ── New: anchor/head endpoint model ──

export interface ITextSelectionPoint {
  readonly blockId: string
  readonly type: 'text'
  readonly offset: number
  /** Lazy-resolved block reference (non-enumerable, defined via Object.defineProperty) */
  readonly block: EditableBlockComponent<any>
}

export interface ISelectedSelectionPoint {
  readonly blockId: string
  readonly type: 'selected'
  /** Lazy-resolved block reference (non-enumerable, defined via Object.defineProperty) */
  readonly block: BaseBlockComponent<any>
}

export type ISelectionPoint = ITextSelectionPoint | ISelectedSelectionPoint

export interface ISelectionPointJSON {
  blockId: string
  type: 'text' | 'selected'
  offset?: number
}

export interface ISelectionJSON {
  anchor: ISelectionPointJSON
  head: ISelectionPointJSON
  commonParent: string
}

// ── Legacy types (backward compat, will be removed) ──

export interface IInlineRange {
  readonly index: number
  readonly length: number
}

/** @deprecated Use ISelectionPoint instead */
export type IBlockRange = IBlockTextRange | IBlockSelectedRange

/** @deprecated Use ITextSelectionPoint instead */
export interface IBlockTextRange extends IInlineRange {
  readonly block: EditableBlockComponent<any>
  readonly blockId: string
  readonly type: 'text'
}

/** @deprecated Use ISelectedSelectionPoint instead */
export interface IBlockSelectedRange {
  readonly block: BaseBlockComponent<any>
  readonly blockId: string
  readonly type: 'selected'
}

/** @deprecated Replaced by anchor/head in BlockSelection */
export interface INormalizedRange {
  readonly from: IBlockRange,
  readonly to: IBlockRange | null,
  readonly collapsed: boolean
}

/** @deprecated Use ISelectionPointJSON instead */
export type IBlockInlineRangeJSON = {
  index: number,
  length: number,
  blockId: string,
  type: 'text'
} | {
  blockId: string,
  type: 'selected'
}

/** @deprecated Use ISelectionJSON instead */
export interface IBlockSelectionJSON {
  from: IBlockInlineRangeJSON,
  to: IBlockInlineRangeJSON | null
  collapsed: boolean
  commonParent: string
}
