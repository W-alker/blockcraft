import { EditableBlockSchema } from "../../core";
import { IMermaidBlockModel } from "./type";
import { MermaidBlock } from "./mermaid.block";

export const MermaidBlockSchema: EditableBlockSchema<IMermaidBlockModel['props']> = {
  flavour: 'code',
  nodeType: 'editable',
  render: MermaidBlock,
  icon: 'bf_icon bf_daimakuai',
  label: '图表',
  onCreate: (deltas) => {
    return {
      props: () => ({
        mode: 'javascript',
        indent: 0
      }),
      children: [{
        insert: deltas.reduce((acc, cur) => {
          acc += cur.insert
          return acc
        }, '')
      }]
    }
  }
}
