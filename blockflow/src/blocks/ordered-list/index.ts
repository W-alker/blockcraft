import {EditableBlockSchema} from "../../core";
import {IOrderedListBlockModel} from "./type";
import {OrderedListBlock} from "./ordered-list.block";
export * from './utils/index'
export * from './type'
export * from './ordered-list.block'

export const OrderedListSchema: EditableBlockSchema<IOrderedListBlockModel['props']> = {
  flavour: 'ordered-list',
  nodeType: 'editable',
  render: OrderedListBlock,
  icon: 'bf_icon bf_youxuliebiao',
  svgIcon: 'bf_youxuliebiao-color',
  label: '有序列表',
  onCreate: (deltas, props) => {
    return {
      props: () => ({
        order: Math.max((<number>props?.["order"] || 0), 0),
        indent: props?.indent || 0
      }),
      children: deltas
    }
  }
}
