import {generateId, NoEditableBlockNative} from "../../framework";
import {BlockNodeType, DeltaInsert} from "../../framework/types";
import {ImageBlockComponent} from "./image.block";
import {IBlockSchemaOptions} from "../../framework/schema/block-schema";
import {CaptionBlockSchema} from "../caption-block";

export interface ImageBlockModel extends NoEditableBlockNative {
  flavour: 'image',
  props: {
    src: string;
    size: {
      width: number
      height?: number
    },
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
        size: {
          width: w || 200,
          height: h || undefined
        }
      },
      children: title ? [CaptionBlockSchema.createSnapshot(title)] : []
    }
  },
  metadata: {
    version: 1,
    label: "图片",
    includeChildren: ['image-title'],
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
