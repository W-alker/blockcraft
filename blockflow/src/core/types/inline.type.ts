import {DeltaInsert} from "./delta.type";
import {SimpleBasicType} from "./currency.type";

export type IInlineModel = DeltaInsert

export type IInlineAttrs = ITextStyles & IInlineAttr & IExpandedAttrs

/**
 * inline attr key, it will render as `[bfi-${key}=${value}]`
 */
export type IInlineAttrKey = `a:${string}`

/**
 * inline data key, it will render as `[data-${key}=${value}]`
 */
export type IInlineDataKey = `d:${string}`

/**
 * inline text style
 */
export interface ITextStyles {
  's:c'?: string | null;
  's:bc'?: string | null;
  's:fs'?: number | null;
  's:ff'?: string | null;
}

export interface IExpandedAttrs {
  [key: IInlineAttrKey | IInlineDataKey]: SimpleBasicType | null
}

interface IInlineAttr {
  'a:bold'?: boolean;
  'a:italic'?: boolean;
  'a:underline'?: boolean;
  'a:strike'?: boolean;
  'a:code'?: boolean;
}


