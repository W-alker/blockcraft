import {generateId, NoEditableBlockNative} from "../../framework";
import {
  BlockNodeType,
  BlockObjectSizeProps,
  IBlockSchemaOptions,
} from "../../framework";
import {VideoBlockComponent} from "./video.block";

export * from './agent'

export interface VideoBlockModel extends NoEditableBlockNative {
  flavour: 'video',
  nodeType: BlockNodeType.void,
  props: BlockObjectSizeProps & {
    url: string;
    name?: string;
    type?: string;
    size?: number;
    sourceType: 'link' | 'local' | 'embed';
    poster?: string;
  }
}

export const VideoBlockSchema: IBlockSchemaOptions<VideoBlockModel> = {
  flavour: 'video',
  nodeType: BlockNodeType.void,
  component: VideoBlockComponent,
  createSnapshot: (params) => {
    const hasLegacyWidth =
      Number.isFinite(params.width) && Number(params.width) > 0
    return {
      id: generateId(),
      flavour: 'video',
      nodeType: BlockNodeType.void,
      props: {
        url: params.url || '',
        sourceType: params.sourceType || 'link',
        type: params.type || '',
        ...(hasLegacyWidth ? {width: params.width} : {wr: params.wr ?? 100}),
        ...(Number.isFinite(params.ar) && Number(params.ar) > 0
          ? {ar: params.ar}
          : {}),
      },
      meta: {},
      children: []
    };
  },
  metadata: {
    version: 1,
    virtualization: {viewRetention: 'keep-alive'},
    label: '视频',
    description: '插入视频，支持链接、本地上传',
    svgIcon: 'bc_shipin',
    icon: 'bc_icon bc_shipin',
    objectSizing: {
      defaultWr: 100,
      defaultAr: 16 / 9,
    },
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
        wr?: number;
        ar?: number;
        poster?: string;
      }]
    }
  }
}
