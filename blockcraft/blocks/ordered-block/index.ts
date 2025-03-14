import {EditableBlockNative} from "../../framework";
import {BlockNodeType} from "../../framework/types";
import {
  BlockSchemaOptions,
  editableBlockCreateSnapShotFn,
  EditableBlockCreateSnapshotParams
} from "../../framework/schema/block-schema";
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
    createSnapshot: editableBlockCreateSnapShotFn<OrderedBlockModel>('ordered', {order: 0}),
  metadata: {
    version: 1,
    label: "有序列表"
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
