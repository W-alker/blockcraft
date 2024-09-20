import {BlockSchema} from "@core";
import {DividerBlock} from "@blocks/divider/divider.block";

export const DividerSchema: BlockSchema = {
  flavour: 'divider',
  nodeType: 'void',
  render: DividerBlock,
  icon: 'bf_icon bf_fengexian',
  label: '分割线',
}
