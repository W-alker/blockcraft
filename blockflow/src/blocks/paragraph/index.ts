import {BlockSchema} from "@core";
import {ParagraphBlock} from "./paragraph.block";

export const ParagraphSchema: BlockSchema = {
  flavour: 'paragraph',
  nodeType: 'editable',
  render: ParagraphBlock,
}
