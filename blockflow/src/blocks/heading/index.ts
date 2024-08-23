import {BlockSchema, DeltaInsert} from "@core";
import {HeadingOneBlock} from "./heading-one.block";

export const HeadingOneSchema: BlockSchema = {
  flavour: 'heading-one',
  nodeType: 'editable',
  render: HeadingOneBlock,
  onCreate: (texts: DeltaInsert[]) => ({
    children: texts
  })
}
