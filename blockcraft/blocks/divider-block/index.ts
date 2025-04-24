import {generateId, NoEditableBlockNative} from "../../framework";
import {BlockNodeType} from "../../framework/block-std/types";
import {DividerBlockComponent} from "./divider.block";
import {IBlockSchemaOptions} from "../../framework/block-std/schema/block-schema";

export interface DividerBlockModel extends NoEditableBlockNative {
  flavour: 'divider',
  nodeType: BlockNodeType.void
}

export const DividerBlockSchema: IBlockSchemaOptions<DividerBlockModel> = {
  flavour: 'divider',
  nodeType: BlockNodeType.void,
  component: DividerBlockComponent,
  createSnapshot: () => {
    return {
      id: generateId(),
      flavour: 'divider',
      nodeType: BlockNodeType.void,
      props: {},
      meta: {},
      children: []
    }
  },
  metadata: {
    version: 1,
    label: "分割线",
    svgIcon: "bc_fengexian-color",
    icon: "bc_icon bc_fengexian-color"
  }
}

declare global {
  namespace BlockCraft {
    interface IBlockComponents {
      divider: DividerBlockComponent
    }

    interface IBlockCreateParameters {
      divider: []
    }
  }
}
