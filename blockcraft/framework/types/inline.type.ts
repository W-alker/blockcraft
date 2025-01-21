import {SimpleBasicType} from "../../global";

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

interface IBaseInlineNodeAttr {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  code?: boolean;
  color?: string;
  bgColor?: string;
  fontSize?: number;
  fontFamily?: string;
}

export interface IInlineNodeAttr extends IBaseInlineNodeAttr {
  [key: string]: SimpleBasicType | undefined
}


