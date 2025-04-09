import {generateId, NoEditableBlockNative} from "../../framework";
import {BlockNodeType} from "../../framework/types";
import {ImageBlockComponent} from "./image.block";
import {IBlockSchemaOptions} from "../../framework/schema/block-schema";
import {ParagraphBlockSchema} from "../paragraph-block";

export interface ImageBlockModel extends NoEditableBlockNative {
  flavour: 'image',
  props: {
    src: string;
    size: {
      width: number
      height: number
    }
  }
}

export const ImageBlockSchema: IBlockSchemaOptions<ImageBlockModel> = {
  flavour: "image",
  nodeType: BlockNodeType.block,
  component: ImageBlockComponent,
  createSnapshot: (src,w, h, title) => {
    return {
      id: generateId(),
      flavour: "image",
      nodeType: BlockNodeType.block,
      meta: {},
      props: {
        src,
        size: {
          width: w || 200,
          height: h || w || 200
        }
      },
      children: title ? [ParagraphBlockSchema.createSnapshot(title)] : []
    }
  },
  metadata: {
    version: 1,
    label: "图片",
    children: ['*'],
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
      image: [string, number?, number?, string?]
    }
  }
}
