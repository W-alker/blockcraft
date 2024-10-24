import {BlockSchema} from "../../core";
import {BulletListBlock} from "./bullet-list.block";

export const BulletListSchema: BlockSchema = {
  flavour: 'bullet-list',
  nodeType: 'editable',
  render: BulletListBlock,
  icon: 'bf_icon bf_wuxuliebiao',
  svgIcon: 'bf_wuxuliebiao-color',
  label: '无序列表',
}
