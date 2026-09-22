import {generateId, NoEditableBlockNative} from "../../framework";
import {
  BlockNodeType,
  BlockObjectSizeProps,
  DeltaInsert,
  IBlockSchemaOptions,
} from "../../framework";
import {normalizeShapeRotation} from '../shape-block/shape.types';
import {ImageBlockComponent} from "./image.block";

export * from './agent'
import {CaptionBlockSchema} from "../caption-block";

export interface ImageBlockCreateInput {
  src: string
  wr?: number
  ar?: number
  /** 顺时针旋转角度，单位度；缺省为 0。 */
  rotation?: number
}

export interface ImageBlockModel extends NoEditableBlockNative {
  flavour: 'image',
  props: BlockObjectSizeProps & {
    src: string;
    rotation?: number;
    /** 四边拉伸后的填充意图；缺省保留原图 contain 显示。 */
    fit?: 'fill';
    align?: 'center' | 'right'
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
        ...(normalizeShapeRotation(input.rotation) ? {rotation: normalizeShapeRotation(input.rotation)} : {}),
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
