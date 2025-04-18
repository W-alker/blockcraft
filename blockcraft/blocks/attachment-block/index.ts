import {generateId, NoEditableBlockNative} from "../../framework";
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
  createSnapshot: (name, url, type) => {
    return {
      id: generateId(),
      flavour: 'attachment',
      nodeType: BlockNodeType.void,
      props: {
        name: name || '',
        url,
        type,
        size: 0,
        icon: getAttachmentIcon(type)
      },
      meta: {},
      children: []
    }
  },
  metadata: {
    version: 1,
    label: '附件'
  }
}

declare global {
  namespace BlockCraft {
    interface IBlockComponents {
      attachment: AttachmentBlockComponent
    }

    interface IBlockCreateParameters {
      attachment: [name: string | undefined, url: string, type: FileExtensionType]
    }
  }
}
