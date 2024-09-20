import {IEditableBlockModel} from "@core";

export interface ITodoListBlockModel extends IEditableBlockModel {
  props: {
    indent: number
    checked: boolean
    startTime?: number
    endTime?: number
  }
}
