import {DocAttachmentInfo, generateId, NoEditableBlockNative} from "../../framework";
import {BlockNodeType} from "../../framework/types";
import {AttachmentBlockComponent} from "./attachment.block";
import {FileExtensionType} from "../../global";
import {IBlockSchemaOptions} from "../../framework/schema/block-schema";
import {getAttachmentIcon} from "./icons";

export interface AttachmentBlockModel extends NoEditableBlockNative {
  flavour: 'attachment',
  nodeType: BlockNodeType.void,
  props: {
    name: string
    url: string
    type: FileExtensionType
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
