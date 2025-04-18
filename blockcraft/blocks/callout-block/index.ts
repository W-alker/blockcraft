import {generateId, NoEditableBlockNative} from "../../framework";
import {BlockNodeType} from "../../framework/types";
import {IBlockSchemaOptions} from "../../framework/schema/block-schema";
import {CalloutBlockComponent} from "./callout.block";
import {ParagraphBlockSchema} from "../paragraph-block";

export interface CalloutBlockModel extends NoEditableBlockNative {
  flavour: 'callout',
  nodeType: BlockNodeType.block,
  props: {
    color: string
    backColor: string
    borderColor: string
    prefix: string
  }
}

export const CalloutBlockSchema: IBlockSchemaOptions<CalloutBlockModel> = {
  flavour: 'callout',
  nodeType: BlockNodeType.block,
  component: CalloutBlockComponent,
  createSnapshot: () => {
    return {
      id: generateId(),
      flavour: 'callout',
      nodeType: BlockNodeType.block,
      props: {
        backColor: '#FFE6CD',
        color: '#333',
        borderColor: 'transparent',
        prefix: '📢'
      },
      meta: {},
      children: [ParagraphBlockSchema.createSnapshot()]
    }
  },
  metadata: {
    version: 1,
    label: "高亮块",
    icon: 'bc_icon bc_gaoliangkuai-color',
    svgIcon: 'bc_gaoliangkuai-color',
    excludeChildren: ['callout', 'table']
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
