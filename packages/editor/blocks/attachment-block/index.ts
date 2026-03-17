import {DocAttachmentInfo, generateId, NoEditableBlockNative, BlockNodeType, IBlockSchemaOptions} from "../../framework";
import {AttachmentBlockComponent} from "./attachment.block";
import {getAttachmentIcon} from "./icons";

export interface AttachmentBlockModel extends NoEditableBlockNative {
  flavour: 'attachment',
  nodeType: BlockNodeType.void,
  props: {
    name: string
    url: string
    type: string
    size: number
    icon: string
  }
}

export const AttachmentBlockSchema: IBlockSchemaOptions<AttachmentBlockModel> = {
  flavour: 'attachment',
  nodeType: BlockNodeType.void,
  component: AttachmentBlockComponent,
  createSnapshot: (params) => {
    return {
      id: generateId(),
      flavour: 'attachment',
      nodeType: BlockNodeType.void,
      props: {
        name: params.name || '',
        url: params.url,
        type: params.type,
        size: params.size,
        icon: getAttachmentIcon(params.type),
      },
      meta: {},
      children: []
    }
  },
  metadata: {
    version: 1,
    label: '附件',
    svgIcon: 'bc_wenjian-color',
    icon: 'bc_wenjian-color'
  }
}

declare global {
  namespace BlockCraft {
    interface IBlockComponents {
      attachment: AttachmentBlockComponent
    }

    interface IBlockCreateParameters {
      attachment: [DocAttachmentInfo]
    }
  }
}
