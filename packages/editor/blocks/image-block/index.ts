import {generateId, NoEditableBlockNative} from "../../framework";
import {BlockNodeType, DeltaInsert, IBlockSchemaOptions} from "../../framework";
import {ImageBlockComponent} from "./image.block";
import {CaptionBlockSchema} from "../caption-block";

export interface ImageBlockModel extends NoEditableBlockNative {
  flavour: 'image',
  props: {
    src: string;
    width?: number | null;
    height?: number | null;
    align?: 'center' | 'right'
  }
}

export const ImageBlockSchema: IBlockSchemaOptions<ImageBlockModel> = {
  flavour: "image",
  nodeType: BlockNodeType.block,
  component: ImageBlockComponent,
  createSnapshot: (src, w, h, title) => {
    return {
      id: generateId(),
      flavour: "image",
      nodeType: BlockNodeType.block,
      meta: {},
      props: {
        src,
        width: w,
        height: h,
      },
      children: title ? [CaptionBlockSchema.createSnapshot(title)] : []
    }
  },
  metadata: {
    version: 1,
    label: "图片",
    includeChildren: ['caption'],
    icon: 'bc_icon bc_tupian-color',
    svgIcon: 'bc_tupian-color'
  }
}

declare global {
  namespace BlockCraft {
    interface IBlockComponents {
      image: ImageBlockComponent
    }

    interface IBlockCreateParameters {
      image: [string, number?, number?, (string | DeltaInsert[])?]
    }
  }
}
