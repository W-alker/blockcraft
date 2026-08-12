import {generateId, NoEditableBlockNative} from "../../framework";
import {
  BlockNodeType,
  BlockObjectSizeProps,
  BlockPositionState,
  DeltaInsert,
  IBlockSchemaOptions,
} from "../../framework";
import {ImageBlockComponent} from "./image.block";
import {CaptionBlockSchema} from "../caption-block";

export interface ImageBlockCreateInput {
  src: string
  wr?: number
  ar?: number
}

export interface ImageBlockModel extends NoEditableBlockNative {
  flavour: 'image',
  props: BlockObjectSizeProps & {
    src: string;
    align?: 'center' | 'right'
    placement?: BlockPositionState
  }
}

export const ImageBlockSchema: IBlockSchemaOptions<ImageBlockModel> = {
  flavour: "image",
  nodeType: BlockNodeType.block,
  component: ImageBlockComponent,
  createSnapshot: (source, w, h, title) => {
    const input: ImageBlockCreateInput = typeof source === 'string'
      ? {src: source}
      : source
    const hasLegacyWidth = Number.isFinite(w) && Number(w) > 0
    const hasLegacyHeight = Number.isFinite(h) && Number(h) > 0
    const wr = Number.isFinite(input.wr) && Number(input.wr) > 0
      ? Number(input.wr)
      : 100
    const ar = Number.isFinite(input.ar) && Number(input.ar) > 0
      ? Number(input.ar)
      : null
    return {
      id: generateId(),
      flavour: "image",
      nodeType: BlockNodeType.block,
      meta: {},
      props: {
        src: input.src,
        ...(hasLegacyWidth
          ? {
              width: w,
              ...(hasLegacyHeight ? {height: h} : {}),
            }
          : {
              wr,
              ...(ar == null ? {} : {ar}),
            }),
      },
      children: title ? [CaptionBlockSchema.createSnapshot(title)] : []
    }
  },
  metadata: {
    version: 1,
    label: "图片",
    description: "上传或通过链接插入图片",
    includeChildren: ['caption'],
    icon: 'bc_icon bc_tupian-color',
    svgIcon: 'bc_tupian-color',
    objectSizing: {
      defaultWr: 100,
      defaultAr: 4 / 3,
    },
    placement: {modes: ['relative', 'absolute']}
  }
}

declare global {
  namespace BlockCraft {
    interface IBlockComponents {
      image: ImageBlockComponent
    }

    interface IBlockCreateParameters {
      image: [string | ImageBlockCreateInput, number?, number?, (string | DeltaInsert[])?]
    }
  }
}
