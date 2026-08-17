import {EditableBlockNative, IEditableBlockProps} from "../../framework";
import {
  BlockNodeType,
  IBlockSchemaOptions,
  editableBlockCreateSnapShotFn,
  EditableBlockCreateSnapshotParams
} from "../../framework";
import {OrderedBlockComponent} from "./ordered.block";
import {isOrderedMarkerStyleId, OrderedMarkerStyleId} from "./utils";
export * from './utils'

export interface OrderedBlockModel extends EditableBlockNative {
  flavour: 'ordered',
  props: {
    order: number
    start?: number | null
    /** Word-like marker preset. Missing/null keeps the historical depth cycle. */
    ms?: OrderedMarkerStyleId | null
  } & IEditableBlockProps
}

const createEditableOrderedSnapshot = editableBlockCreateSnapShotFn<OrderedBlockModel>(
  'ordered',
  {order: 0},
)

const createOrderedSnapshot = (...args: EditableBlockCreateSnapshotParams) => {
  const snapshot = createEditableOrderedSnapshot(...args)
  const markerStyle = args[1]?.['ms']
  if (isOrderedMarkerStyleId(markerStyle)) {
    snapshot.props['ms'] = markerStyle
  }
  return snapshot
}

export const OrderedBlockSchema: IBlockSchemaOptions<OrderedBlockModel> = {
  flavour: 'ordered',
  nodeType: BlockNodeType.editable,
  component: OrderedBlockComponent,
  createSnapshot: createOrderedSnapshot,
  metadata: {
    version: 1,
    label: "有序列表",
    description: "创建按顺序编号的列表",
    icon: 'bc_icon bc_youxuliebiao-color',
    svgIcon: 'bc_youxuliebiao-color',
    placeholder: '列表项',
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
