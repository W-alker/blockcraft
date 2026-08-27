import {generateId, NoEditableBlockNative, IBlockSchemaOptions, BlockNodeType} from "../../../framework";
import {JuejinEmbedBlockComponent} from "./juejin-embed.block";

export * from './agent'

export interface JuejinEmbedBlockModel extends NoEditableBlockNative {
  flavour: 'juejin-embed',
  nodeType: BlockNodeType.void,
  props: {
    url: string
    width?: number
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
        height: 424
      },
      meta: {},
      children: []
    }
  },
  metadata: {
    version: 1,
    virtualization: {viewRetention: 'keep-alive'},
    label: "掘金",
    description: "嵌入并预览掘金文章",
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
