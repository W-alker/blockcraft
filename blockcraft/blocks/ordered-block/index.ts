import {EditableBlockNative, generateId} from "../../framework";
import {BlockNodeType} from "../../framework/types";
import {BlockSchemaOptions, EditableBlockCreateSnapshotParams} from "../../framework/schema/block-schema";
import {OrderedBlockComponent} from "./ordered.block";

export interface OrderedBlockModel extends EditableBlockNative {
  flavour: 'ordered',
  props: {
    order: number
    depth: number
  }
}

export const OrderedBlockSchema: BlockSchemaOptions<OrderedBlockModel> = {
  flavour: 'ordered',
  nodeType: BlockNodeType.editable,
  component: OrderedBlockComponent,
  createSnapshot: (deltas, props) => {
    return {
      id: generateId(),
      flavour: 'ordered',
      nodeType: BlockNodeType.editable,
      props: {
        order: 0,
        depth: 0,
        ...props
      },
      meta: {},
      children: deltas ? typeof deltas === 'string' ? [{insert: deltas}] : deltas : []
    }
  },
  metadata: {
    version: 1,
    label: "有序列表子项",
    isLeaf: true
  }
}

declare global {
  namespace BlockCraft {
    interface IBlockComponents {
      'ordered': OrderedBlockComponent
    }

    interface IBlockCreateParameters {
      'ordered': EditableBlockCreateSnapshotParams
    }
  }
}
