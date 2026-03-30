import {generateId, NoEditableBlockNative} from "../../framework";
import {BlockNodeType, IBlockSchemaOptions} from "../../framework";
import {VideoBlockComponent} from "./video.block";

export interface VideoBlockModel extends NoEditableBlockNative {
  flavour: 'video',
  nodeType: BlockNodeType.void,
  props: {
    url: string;
    name?: string;
    type?: string;
    size?: number;
    sourceType: 'link' | 'local' | 'embed';
    width?: number;
    poster?: string;
  }
}

export const VideoBlockSchema: IBlockSchemaOptions<VideoBlockModel> = {
  flavour: 'video',
  nodeType: BlockNodeType.void,
  component: VideoBlockComponent,
  createSnapshot: (params) => {
    return {
      id: generateId(),
      flavour: 'video',
      nodeType: BlockNodeType.void,
      props: {
        url: params.url || '',
        sourceType: params.sourceType || 'link',
        type: params.type || '',
        width: params.width || 0,
      },
      meta: {},
      children: []
    };
  },
  metadata: {
    version: 1,
    label: '视频',
    description: '插入视频，支持链接、本地上传',
    svgIcon: 'bc_shipin',
    icon: 'bc_icon bc_shipin'
  }
};

declare global {
  namespace BlockCraft {
    interface IBlockComponents {
      'video': VideoBlockComponent
    }

    interface IBlockCreateParameters {
      'video': [{
        url?: string;
        name?: string;
        size?: number;
        type?: string;
        sourceType: 'link' | 'local' | 'embed';
        width?: number;
        poster?: string;
      }]
    }
  }
}
