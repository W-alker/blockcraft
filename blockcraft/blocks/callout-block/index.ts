import {generateId, NoEditableBlockNative} from "../../framework";
import {BlockNodeType} from "../../framework/types";
import {BlockSchemaOptions} from "../../framework/schema/block-schema";
import {CalloutBlockComponent} from "./callout.block";
import {ParagraphBlockSchema} from "../paragraph-block";

export interface CalloutBlockModel extends NoEditableBlockNative {
  flavour: 'callout',
  nodeType: BlockNodeType.block,
  props: {
    backColor: string
    color: string
    prefix: string
  },
}

export const CalloutBlockSchema: BlockSchemaOptions<CalloutBlockModel> = {
  flavour: 'callout',
  nodeType: BlockNodeType.block,
  component: CalloutBlockComponent,
  createSnapshot: () => {
    return {
      id: generateId(),
      flavour: 'callout',
      nodeType: BlockNodeType.block,
      props: {
        backColor: '#f6f8fa',
        color: '#000',
        prefix: '📢'
      },
      meta: {},
      children: [ParagraphBlockSchema.createSnapshot()]
    }
  },
  metadata: {
    version: 1,
    label: "高亮块",
    children: ['paragraph', 'divider']
  }
}

declare global {
  namespace BlockCraft {
    interface IBlockComponents {
      callout: CalloutBlockComponent
    }

    interface IBlockCreateParameters {
      callout: []
    }
  }
}
