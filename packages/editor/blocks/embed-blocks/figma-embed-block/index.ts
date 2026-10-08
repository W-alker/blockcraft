import type {BlockObjectSizeProps} from '../../../framework/modules/object/block-object-sizing.manager';
import {EMBED_OBJECT_SIZING, estimateEmbedFrameHeight} from '../components/embed-sizing';
import {generateId, NoEditableBlockNative, IBlockSchemaOptions, BlockNodeType} from "../../../framework";
import {FigmaEmbedBlockComponent} from "./figma-embed.block";

export * from './agent'
import {BlockCraftError, ErrorCode, isFigmaUrl} from "../../../global";

export interface FigmaEmbedBlockModel extends NoEditableBlockNative {
  flavour: 'figma-embed',
  nodeType: BlockNodeType.void,
  props: BlockObjectSizeProps & {url: string}
}

export const FigmaEmbedBlockSchema: IBlockSchemaOptions<FigmaEmbedBlockModel> = {
  flavour: 'figma-embed',
  nodeType: BlockNodeType.void,
  component: FigmaEmbedBlockComponent,
  createSnapshot: (url) => {
    if(!isFigmaUrl(url)) {
      throw new BlockCraftError(ErrorCode.SchemaValidateError, 'url is not a figma url')
    }
    return {
      id: generateId(),
      flavour: 'figma-embed',
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
    label: "Figma",
    description: "嵌入并预览 Figma 设计内容",
    svgIcon: "bc_Figma",
    icon: "bc_icon bc_Figma"
  }
}

declare global {
  namespace BlockCraft {
    interface IBlockComponents {
      'figma-embed': FigmaEmbedBlockComponent
    }

    interface IBlockCreateParameters {
      'figma-embed': [string]
    }
  }
}
