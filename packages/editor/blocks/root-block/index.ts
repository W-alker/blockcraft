import { IBlockSchemaOptions } from "../../framework/block-std/schema/block-schema";
import { RootBlockComponent } from "./root.block";
import { BlockNodeType, IBlockSnapshot, NoEditableBlockNative } from "../../framework";
import { ParagraphBlockSchema } from "../paragraph-block";

export * from './agent'

export interface RootBlockModel extends NoEditableBlockNative {
  flavour: "root",
  nodeType: BlockNodeType.root,
  props: {
    /** Compact font-family id, or a safe legacy CSS font-family stack. */
    ff?: string
    /** Document base font size in CSS pixels. */
    fs?: number
    /** Document-wide unitless line-height ratio. */
    lh?: number
    /** Default CSS text color inherited by document blocks. */
    color?: string
    /** CSS `background` shorthand persisted with the document root. */
    background?: string
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
    description: "承载整篇文档内容的根容器",
    includeChildren: ['*'],
    renderUnit: true,
    selectionScope: 'document',
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
