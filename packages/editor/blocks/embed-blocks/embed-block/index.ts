import type {BlockObjectSizeProps} from '../../../framework/modules/object/block-object-sizing.manager';
import {EMBED_OBJECT_SIZING, estimateEmbedFrameHeight} from '../components/embed-sizing';
import {generateId, NoEditableBlockNative, IBlockSchemaOptions, BlockNodeType} from "../../../framework";
import {EmbedBlockComponent} from "./embed.block";
import {normalizeEmbedUrl} from './source';
export {EmbedBlockComponent} from './embed.block';
export * from './source';
export * from './agent';

export interface EmbedBlockModel extends NoEditableBlockNative {
  flavour: 'embed',
  nodeType: BlockNodeType.void,
  props: BlockObjectSizeProps & {url: string}
}

export const EmbedBlockSchema: IBlockSchemaOptions<EmbedBlockModel> = {
  flavour: 'embed',
  nodeType: BlockNodeType.void,
  component: EmbedBlockComponent,
  createSnapshot: (source) => {
    const url = normalizeEmbedUrl(source)
    if (!url) throw new Error('请输入有效的 HTTP 或 HTTPS 网页地址')
    return {
      id: generateId(),
      flavour: 'embed',
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
    objectSizing: EMBED_OBJECT_SIZING,
    selectionInteraction: {frame: 'selectable'},
    virtualization: {
      viewRetention: 'keep-alive',
      estimateHeight: ({props, rootContentWidth}) => estimateEmbedFrameHeight(props, rootContentWidth),
    },
    label: "嵌入",
    description: "嵌入网页、平台内容或 HTML 文件链接",
    icon: "bc_icon bc_wangluo"
  }
}

declare global {
  namespace BlockCraft {
    interface IBlockComponents {
      'embed': EmbedBlockComponent
    }

    interface IBlockCreateParameters {
      'embed': [string]
    }
  }
}
