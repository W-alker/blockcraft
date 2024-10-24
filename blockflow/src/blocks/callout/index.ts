import {EditableBlockSchema} from "../../core";
import {ICalloutBlockModel} from "./type";
import {CalloutBlock} from "./callout.block";

export const CalloutSchema: EditableBlockSchema<ICalloutBlockModel['props']> = {
  flavour: 'callout',
  nodeType: 'editable',
  icon: 'bf_icon bf_gaoliangkuai',
  svgIcon: 'bf_gaoliangkuai-color',
  label: '高亮块',
  render: CalloutBlock,
  onCreate: (deltas, props) => {
    return {
      props: () => ({
        indent: 0,
        borderColor: '#FDB549',
        backgroundColor: '#fcf2eb',
        emoji: '🔥',
        color: '#333'
      }),
      children: deltas
    }
  }
}
