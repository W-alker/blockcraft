import {BlockSchema} from "@core";
import {BulletListBlock} from "@blocks/bullet-list/bullet-list.block";

export const BulletListSchema: BlockSchema = {
  flavour: 'bullet-list',
  nodeType: 'editable',
  render: BulletListBlock,
  icon: 'bf_icon bf_wuxuliebiao',
  label: '无序列表',
}
