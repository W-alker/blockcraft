import {BlockSchema} from "../../core";
import {ILinkBlockModel} from "./type";
import {LinkBlock} from "./link.block";

export const LinkSchema: BlockSchema<ILinkBlockModel['props']> = {
  flavour: 'link',
  nodeType: 'void',
  label: '链接',
  render: LinkBlock,
  icon: 'bf_icon bf_lianjie',
  svgIcon: 'bf_lianjie-color',
  onCreate: () => {
    return {
      props: () => ({
        href: '',
        text: '',
        appearance: 'text'
      }),
      children: []
    }
  }
}
