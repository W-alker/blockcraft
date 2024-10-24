import {IEditableBlockModel} from "../../core";

export interface ICalloutBlockModel extends IEditableBlockModel{
  flavour: 'callout'
  props: {
    indent: number
    borderColor: string
    backgroundColor: string
    color: string
    emoji: string
  }
}
