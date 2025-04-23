import {generateId, NoEditableBlockNative} from "../../../framework";
import {BlockNodeType} from "../../../framework/types";
import {FigmaEmbedBlockComponent} from "./figma-embed.block";
import {IBlockSchemaOptions} from "../../../framework/schema/block-schema";
import {BlockCraftError, ErrorCode, isFigmaUrl} from "../../../global";

export interface FigmaEmbedBlockModel extends NoEditableBlockNative {
  flavour: 'figma-embed',
  nodeType: BlockNodeType.void,
  props: {
    url: string
    width: number | null
    height: number
  }
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
        width: null,
        height: 424
      },
      meta: {},
      children: []
    }
  },
  metadata: {
    version: 1,
    label: "Figma",
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
