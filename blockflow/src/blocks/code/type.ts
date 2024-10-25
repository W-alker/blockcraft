import {IEditableBlockModel} from "../../core";

export interface IModeItem {
  value: string,
  name: string
}

export interface ICodeBlockModel extends IEditableBlockModel {
  flavour: 'code'
  nodeType: 'editable'
  props: {
    lang: string
    indent: number
  }
}
