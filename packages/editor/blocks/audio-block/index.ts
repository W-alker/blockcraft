import {generateId, NoEditableBlockNative} from "../../framework";
import {BlockNodeType, IBlockSchemaOptions} from "../../framework";
import {AudioBlockComponent} from "./audio.block";

export interface AudioBlockModel extends NoEditableBlockNative {
  flavour: 'audio',
  nodeType: BlockNodeType.void,
  props: {
    url: string;
    name?: string;
    size?: number;
    sourceType: 'link' | 'local' | 'embed';
    width?: number;
  }
}

export const AudioBlockSchema: IBlockSchemaOptions<AudioBlockModel> = {
  flavour: 'audio',
  nodeType: BlockNodeType.void,
  component: AudioBlockComponent,
  createSnapshot: (params) => {
    return {
      id: generateId(),
      flavour: 'audio',
      nodeType: BlockNodeType.void,
      props: {
        url: params.url || '',
        name: params.name || '',
        sourceType: params.sourceType || 'link'
      },
      meta: {},
      children: []
    };
  },
  metadata: {
    version: 1,
    viewRetention: 'keep-alive',
    label: '音频',
    description: '插入音频，支持链接、本地上传',
    svgIcon: 'bc_yinpin',
    icon: 'bc_icon bc_yinpin'
  }
};

declare global {
  namespace BlockCraft {
    interface IBlockComponents {
      'audio': AudioBlockComponent
    }

    interface IBlockCreateParameters {
      'audio': [{
        url?: string;
        name?: string;
        size?: number;
        type?: string;
        sourceType: 'link' | 'local' | 'embed';
      }]
    }
  }
}
