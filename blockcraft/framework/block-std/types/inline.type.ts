import {SimpleBasicType} from "../../../global";
import {DeltaInsert} from "./delta.type";

/**
 * @desc 最小的原子节点\
 * inline: 嵌入的inline组件nodeType，携带文本，可编辑\
 * inlineVoid: 嵌入的inline组件nodeType，但是不可编辑和选中，可能不携带文本\
 * text: 普通文本节点
 */
export enum InlineNodeType {
  inline = 'inline',
  inlineVoid = 'inlineVoid',
  text = 'text'
}

export type IInlineNodeAttrs = ITextStyles & IBaseInlineAttr & IExpandedAttrs

/**
 * inline attr key, it will render as `[bfi-${key}=${value}]`
 */
export type InlineAttrKey = `a:${string}`

interface IBaseInlineAttr {
  'a:bold'?: boolean;
  'a:italic'?: boolean;
  'a:underline'?: boolean;
  'a:strike'?: boolean;
  'a:code'?: boolean;
  'a:link'?: string | null;
}

/**
 * inline data key, it will render as `[data-${key}=${value}]`
 */
export type InlineDataKey = `d:${string}`

export type InlineStyleKey = `s:${string}`

/**
 * inline text style
 */
export interface ITextStyles {
  's:color'?: string | null;
  's:background'?: string | null;
  's:fontSize'?: string | null;
  's:fontFamily'?: string | null;
  [key: InlineStyleKey]: string | null | undefined
}

export interface IExpandedAttrs {
  [key: InlineAttrKey | InlineDataKey]: SimpleBasicType | null
}

export type InlineModel = DeltaInsert[]




