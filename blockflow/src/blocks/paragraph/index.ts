import {ParagraphBlock} from "./paragraph.block";
import {BlockSchema} from "../../core";

export const ParagraphSchema: BlockSchema = {
  flavour: 'paragraph',
  nodeType: 'editable',
  render: ParagraphBlock,
  icon: 'bf_icon bf_wenben',
  label: '基础段落',
}
