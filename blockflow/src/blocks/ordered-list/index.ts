import {OrderedListBlock} from "@blocks/ordered-list/ordered-list.block";
import {BlockSchema} from "@core";

export * from './utils/index'
export const OrderedListSchema: BlockSchema = {
  flavour: 'ordered-list',
  nodeType: 'editable',
  render: OrderedListBlock,
  icon: 'bf_icon bf_youxuliebiao',
  label: '有序列表',
}
