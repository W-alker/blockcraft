import {generateId, NoEditableBlockNative, IBlockSchemaOptions, BlockNodeType} from "../../../framework";
import {EmbedBlockComponent} from "./embed.block";

export interface EmbedBlockModel extends NoEditableBlockNative {
  flavour: 'embed',
  nodeType: BlockNodeType.void,
  props: {
    url: string
    width: number | null
    height: number
  }
}

export const EmbedBlockSchema: IBlockSchemaOptions<EmbedBlockModel> = {
  flavour: 'embed',
  nodeType: BlockNodeType.void,
  component: EmbedBlockComponent,
  createSnapshot: (url) => {
    return {
      id: generateId(),
      flavour: 'embed',
      nodeType: BlockNodeType.void,
      props: {
        url,
        width: null,
        height: 424
      },
      meta: {},
      children: []
    }
  },
  metadata: {
    version: 1,
    label: "网页嵌入",
    svgIcon: "bc_Figma",
    icon: "bc_icon bc_Figma"
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
