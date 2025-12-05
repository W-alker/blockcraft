import {EditableBlockNative, IEditableBlockProps} from "../../framework";
import {
  BlockNodeType,
  IBlockSchemaOptions,
  editableBlockCreateSnapShotFn,
  EditableBlockCreateSnapshotParams
} from "../../framework";
import {OrderedBlockComponent} from "./ordered.block";
export * from './utils'

export interface OrderedBlockModel extends EditableBlockNative {
  flavour: 'ordered',
  props: {
    order: number
    start?: number | null
  } & IEditableBlockProps
}

export const OrderedBlockSchema: IBlockSchemaOptions<OrderedBlockModel> = {
  flavour: 'ordered',
  nodeType: BlockNodeType.editable,
  component: OrderedBlockComponent,
  createSnapshot: editableBlockCreateSnapShotFn<OrderedBlockModel>('ordered', {order: 0}),
  metadata: {
    version: 1,
    label: "有序列表",
    icon: 'bc_icon bc_youxuliebiao-color',
    svgIcon: 'bc_youxuliebiao-color'
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
