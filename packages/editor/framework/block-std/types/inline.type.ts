import {SimpleBasicType} from "../../../global";
import {DeltaInsert} from "./delta.type";
import type {TypographyFontFamilyId} from '../typography'

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
 * inline attr key, it will render as `[${key}=${value}]`
 */
export type InlineAttrKey = `a:${string}`

interface IBaseInlineAttr {
  /** `null` removes an existing format in a Y.Text format operation. */
  'a:bold'?: boolean | null;
  'a:italic'?: boolean | null;
  'a:underline'?: boolean | null;
  'a:strike'?: boolean | null;
  'a:code'?: boolean | null;
  'a:link'?: string | null;
}

/**
 * inline data key, it will render as `[data-${key}=${value}]`
 */
export type InlineDataKey = `d:${string}`

export type InlineStyleKey = `s:${string}`

export type InlineCustomKey = string

/**
 * inline text style
 */
export interface ITextStyles {
  /** Compact semantic typography keys used by new content. */
  't:ff'?: TypographyFontFamilyId | null;
  't:fs'?: number | null;
  't:ls'?: number | null;
  /** Legacy generic CSS keys kept read-compatible. */
  's:color'?: string | null;
  's:background'?: string | null;
  's:fontSize'?: string | null;
  's:fontFamily'?: string | null;
  's:letterSpacing'?: string | null;
  [key: InlineStyleKey]: string | null | undefined
}

export interface IExpandedAttrs {
  [key: InlineAttrKey | InlineDataKey | InlineCustomKey]: SimpleBasicType | null
}

export type InlineModel = DeltaInsert[]

