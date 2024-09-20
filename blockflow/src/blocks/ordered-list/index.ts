import {OrderedListBlock} from "@blocks/ordered-list/ordered-list.block";
import {EditableBlockSchema} from "@core";
import {IOrderedListBlockModel} from "@blocks/ordered-list/type";

export * from './utils/index'
export * from './type'

export * from './ordered-list.block'

export const OrderedListSchema: EditableBlockSchema<IOrderedListBlockModel['props']> = {
  flavour: 'ordered-list',
  nodeType: 'editable',
  render: OrderedListBlock,
  icon: 'bf_icon bf_youxuliebiao',
  label: '有序列表',
  // onCreate: (deltas, props) => {
  //   return {
  //     props: () => ({
  //       order: (<number>props["order"] || 0) + 1,
  //       indent: props.indent || 0
  //     }),
  //     children: deltas
  //   }
  // }
}
