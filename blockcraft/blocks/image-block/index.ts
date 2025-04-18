import {EditableBlockNative, generateId, NoEditableBlockNative} from "../../framework";
import {BlockNodeType} from "../../framework/types";
import {ImageBlockComponent} from "./image.block";
import {editableBlockCreateSnapShotFn, IBlockSchemaOptions} from "../../framework/schema/block-schema";
import {ImageTitleBlockComponent} from "./image-title.block";
import {DeltaInsert} from "blockflow-editor";

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

export interface ImageTitleBlockModel extends EditableBlockNative {
  flavour: 'image-title'
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
      children: title ? [ImageTitleBlockSchema.createSnapshot(title)] : []
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

export const ImageTitleBlockSchema: IBlockSchemaOptions<ImageTitleBlockModel> = {
  flavour: "image-title",
  nodeType: BlockNodeType.editable,
  component: ImageTitleBlockComponent,
  createSnapshot: editableBlockCreateSnapShotFn<ImageTitleBlockModel>('image-title', {textAlign: 'center'}),
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
      'image-title': ImageTitleBlockComponent
    }

    interface IBlockCreateParameters {
      image: [string, number?, number?, (string | DeltaInsert[])?]
      imageTitle: [(string | DeltaInsert[])?]
    }
  }
}
