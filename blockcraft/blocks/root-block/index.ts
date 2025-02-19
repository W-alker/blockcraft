import {BlockSchemaOptions} from "../../framework/schema/block-schema";
import {RootBlockComponent} from "./root.block";
import {NoEditableBlockNative} from "../../framework";
import {BlockNodeType, IBlockSnapshot} from "../../framework/types";

export interface RootBlockModel extends NoEditableBlockNative {
  flavour: "root",
  nodeType: BlockNodeType.block
}

export const RootBlockSchema: BlockSchemaOptions<RootBlockModel> = {
  flavour: "root",
  nodeType: BlockNodeType.block,
  component: RootBlockComponent,
  createSnapshot: (id, children) => {
    return {
      id,
      flavour: "root",
      nodeType: BlockNodeType.block,
      meta: {
        createdTime: Date.now(),
        lastModified: {
          time: Date.now(),
          user: null
        }
      },
      props: {},
      children: children || []
    }
  },
  metadata: {
    version: 1,
    label: "Root",
    children: ['*']
  }
}

declare global {
  namespace BlockCraft {
    interface IBlockComponents {
      root: RootBlockComponent
    }

    interface IBlockCreateParameters {
      root: [string, IBlockSnapshot[]?]
    }
  }
}
