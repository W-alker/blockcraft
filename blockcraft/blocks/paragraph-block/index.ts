import {EditableBlockNative} from "../../framework";
import {BlockNodeType} from "../../framework/types";
import {BlockSchemaOptions, EditableBlockCreateSnapshotParams} from "../../framework/schema/block-schema";
import {ParagraphBlockComponent} from "./paragraph.block";
import {BlockCraftError, ErrorCode} from "../../global";
import {nanoid} from "nanoid";

export interface ParagraphBlockModel extends EditableBlockNative {
  flavour: 'paragraph',
  nodeType: BlockNodeType.editable,
}

export const ParagraphBlockSchema: BlockSchemaOptions<ParagraphBlockModel> = {
  flavour: 'paragraph',
  nodeType: BlockNodeType.editable,
  component: ParagraphBlockComponent,
  createSnapshot: (deltas, props) => {
    const ch = []
    if (!deltas) {
    } else if (typeof deltas === 'string') {
      ch.push({insert: deltas})
    } else if (Array.isArray(deltas)) {
      ch.push(...deltas)
    } else {
      throw new BlockCraftError(ErrorCode.ModelCRUDError, 'Paragraph block createSnapshot error: deltas must be string or deltas')
    }

    return {
      id: nanoid(),
      flavour: 'paragraph',
      nodeType: BlockNodeType.editable,
      props: {...props},
      meta: {},
      children: ch
    }
  },
  metadata: {
    version: 1,
    label: "基础段落"
  }
}

declare global {
  namespace BlockCraft {
    interface IBlockComponents {
      paragraph: ParagraphBlockComponent
    }

    interface IBlockCreateParameters {
      paragraph: EditableBlockCreateSnapshotParams
    }
  }
}
