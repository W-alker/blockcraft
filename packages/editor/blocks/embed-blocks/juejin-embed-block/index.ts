import type {BlockObjectSizeProps} from '../../../framework/modules/object/block-object-sizing.manager';
import {EMBED_OBJECT_SIZING, estimateEmbedFrameHeight} from '../components/embed-sizing';
import {generateId, NoEditableBlockNative, IBlockSchemaOptions, BlockNodeType} from "../../../framework";
import {JuejinEmbedBlockComponent} from "./juejin-embed.block";

export * from './agent'

export interface JuejinEmbedBlockModel extends NoEditableBlockNative {
  flavour: 'juejin-embed',
  nodeType: BlockNodeType.void,
  props: BlockObjectSizeProps & {url: string}
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
        wr: EMBED_OBJECT_SIZING.defaultWr,
        ar: EMBED_OBJECT_SIZING.defaultAr
      },
      meta: {},
      children: []
    }
  },
  metadata: {
    version: 1,
    hideInInsertMenu: true,
    objectSizing: EMBED_OBJECT_SIZING,
    selectionInteraction: {frame: 'selectable'},
    virtualization: {
      viewRetention: 'keep-alive',
      estimateHeight: ({props, rootContentWidth}) => estimateEmbedFrameHeight(props, rootContentWidth),
    },
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
