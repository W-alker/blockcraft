import {EditableBlockSchema} from "../../core";
import {ICodeBlockModel} from "./type";
import {CodeBlock} from "./code.block";

export const CodeBlockSchema: EditableBlockSchema<ICodeBlockModel['props']> = {
  flavour: 'code',
  nodeType: 'editable',
  render: CodeBlock,
  icon: 'bf_icon bf_daimakuai',
  svgIcon: 'bf_daimakuai1',
  label: '代码块',
  onCreate: (deltas) => {
    return {
      props: () => ({
        lang: 'javascript',
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
