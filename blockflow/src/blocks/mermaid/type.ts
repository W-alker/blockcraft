import { IEditableBlockModel } from "../../core";

export interface IMermaidBlockModel extends IEditableBlockModel {
  flavour: 'mermaid'
  nodeType: 'editable'
  props: {
    mode: string
    viewMode: 'graph' | 'text'
    indent: number
  }
}
