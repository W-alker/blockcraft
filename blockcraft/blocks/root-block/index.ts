import { IBlockSchemaOptions } from "../../framework/block-std/schema/block-schema";
import { RootBlockComponent } from "./root.block";
import { BlockNodeType, IBlockSnapshot, NoEditableBlockNative } from "../../framework";
import { ParagraphBlockSchema } from "../paragraph-block";

export interface RootBlockModel extends NoEditableBlockNative {
  flavour: "root",
  nodeType: BlockNodeType.root,
  props: {
    ff?: string
  }
}

export const RootBlockSchema: IBlockSchemaOptions<RootBlockModel> = {
  flavour: "root",
  nodeType: BlockNodeType.root,
  component: RootBlockComponent,
  createSnapshot: (id, children) => {
    return {
      id,
      flavour: "root",
      nodeType: BlockNodeType.root,
      meta: {
        createdTime: Date.now(),
        lastModified: {
          time: Date.now(),
          user: null
        }
      },
      props: {},
      children: children?.length ? children : []
    }
  },
  metadata: {
    version: 1,
    label: "Root",
    includeChildren: ['*'],
    renderUnit: true,
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
