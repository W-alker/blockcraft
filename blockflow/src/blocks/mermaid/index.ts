import { DeltaInsert, EditableBlockSchema } from "../../core";
import { IMermaidBlockModel } from "./type";
import { MermaidBlock } from "./mermaid.block";

export const MermaidBlockSchema: EditableBlockSchema<IMermaidBlockModel['props']> = {
  flavour: 'mermaid',
  nodeType: 'editable',
  render: MermaidBlock,
  icon: 'bf_icon bf_daimahuitu',
  svgIcon: 'bf_daimahuitu',
  label: '代码绘图',
  onCreate: (deltas: DeltaInsert[]) => {
    return {
      props: () => ({
        indent: 0
      }),
      children: deltas?.length ? [{
        insert: deltas.reduce((acc, cur) => {
          acc += cur.insert
          return acc
        }, '')
      }] : []
    }
  }
}
