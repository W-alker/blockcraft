import {generateId, NoEditableBlockNative} from "../../framework";
import {BlockNodeType} from "../../framework/types";
import {DividerBlockComponent} from "./divider.block";
import {BlockSchemaOptions} from "../../framework/schema/block-schema";

export interface DividerBlockModel extends NoEditableBlockNative {
  flavour: 'divider',
  nodeType: BlockNodeType.void
}

export const DividerBlockSchema: BlockSchemaOptions<DividerBlockModel> = {
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
    label: "分割线"
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
