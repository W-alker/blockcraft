import {NoEditableBlockNative} from "../../framework";
import {BlockNodeType} from "../../framework/block-std/types";
import {BlockSchemaOptions} from "../../framework/block-std/schema/block-schema";
import {nanoid} from "nanoid";
import {FrameBlockComponent} from "./frame.block";

export interface FrameBlockModel extends NoEditableBlockNative {
  flavour: 'frame',
  nodeType: BlockNodeType.block
  props: {
    deep: number
  }
}

export const FrameBlockSchema: BlockSchemaOptions<FrameBlockModel> = {
  flavour: 'frame',
  nodeType: BlockNodeType.block,
  component: FrameBlockComponent,
  createSnapshot: () => {
    return {
      id: nanoid(),
      flavour: 'frame',
      nodeType: BlockNodeType.block,
      props: {
        deep: 0
      },
      meta: {},
      children: []
    }
  },
  metadata: {
    version: 1,
    label: "自由块"
  }
}

declare global {
  namespace BlockCraft {
    interface IBlockComponents {
      frame: FrameBlockComponent
    }

    interface IBlockCreateParameters {
      frame: []
    }
  }
}
