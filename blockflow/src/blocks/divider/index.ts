import {BlockSchema} from "../../core";
import {DividerBlock} from "./divider.block";

export const DividerSchema: BlockSchema = {
  flavour: 'divider',
  nodeType: 'void',
  render: DividerBlock,
  icon: 'bf_icon bf_fengexian',
  svgIcon: 'bf_fengexian-color',
  label: '分割线',
}
