import { EditableBlockSchema } from "../../core";
import { IMermaidBlockModel } from "./type";
import { MermaidBlock } from "./mermaid.block";

export const MermaidBlockSchema: EditableBlockSchema<IMermaidBlockModel['props']> = {
  flavour: 'mermaid',
  nodeType: 'editable',
  render: MermaidBlock,
  icon: 'bf_icon bf_daimakuai',
  label: '代码绘图',
  onCreate: (deltas) => {
    return {
      props: () => ({
        mode: 'javascript',
        viewMode: 'text',
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
