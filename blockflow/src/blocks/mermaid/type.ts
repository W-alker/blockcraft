import { IEditableBlockModel } from "../../core";

export interface IMermaidBlockModel extends IEditableBlockModel {
  flavour: 'mermaid'
  nodeType: 'editable'
  props: {
    viewMode: 'graph' | 'text'
    indent: number
  }
}
