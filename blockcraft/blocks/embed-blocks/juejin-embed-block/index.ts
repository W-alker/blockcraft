import {generateId, NoEditableBlockNative} from "../../../framework";
import {BlockNodeType} from "../../../framework/types";
import {IBlockSchemaOptions} from "../../../framework/schema/block-schema";
import {JuejinEmbedBlockComponent} from "./juejin-embed.block";

export interface JuejinEmbedBlockModel extends NoEditableBlockNative {
  flavour: 'juejin-embed',
  nodeType: BlockNodeType.void,
  props: {
    url: string
    width: number | null
    height: number
  }
}

export const JuejinEmbedBlockSchema: IBlockSchemaOptions<JuejinEmbedBlockModel> = {
  flavour: 'juejin-embed',
  nodeType: BlockNodeType.void,
  component: JuejinEmbedBlockComponent,
  createSnapshot: (url) => {
    return {
      id: generateId(),
      flavour: 'juejin-embed',
      nodeType: BlockNodeType.void,
      props: {
        url,
        width: null,
        height: 424
      },
      meta: {},
      children: []
    }
  },
  metadata: {
    version: 1,
    label: "掘金",
    svgIcon: "bc_juejin",
    icon: "bc_icon bc_juejin"
  }
}

declare global {
  namespace BlockCraft {
    interface IBlockComponents {
      'juejin-embed': JuejinEmbedBlockComponent
    }

    interface IBlockCreateParameters {
      'juejin-embed': [string]
    }
  }
}
