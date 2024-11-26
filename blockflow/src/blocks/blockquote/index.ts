import {EditableBlockSchema} from "../../core";
import {BlockquoteBlock} from "./blockquote.block";

export const BlockquoteSchema: EditableBlockSchema<any> = {
  flavour: 'blockquote',
  nodeType: 'editable',
  icon: 'bf_icon bf_blockquote',
  label: '引用块',
  render: BlockquoteBlock,
  onCreate: (deltas, props) => {
    return {
      props: () => ({
        indent: 0
      }),
      children: deltas
    }
  }
}
