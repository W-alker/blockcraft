import {
  EditableBlockNative, BlockNodeType, IEditableBlockProps, IBlockSchemaOptions,
  editableBlockCreateSnapShotFn,
  EditableBlockCreateSnapshotParams
} from "../../framework";
import {TodoBlockComponent} from "./todo.block";

export * from './agent'

export interface TodoBlockModel extends EditableBlockNative {
  flavour: 'todo'
  props: {
    created: number
    checked: number
  } & IEditableBlockProps
}

export const TodoBlockSchema: IBlockSchemaOptions<TodoBlockModel> = {
  flavour: 'todo',
  nodeType: BlockNodeType.editable,
  component: TodoBlockComponent,
  createSnapshot: editableBlockCreateSnapShotFn<TodoBlockModel>('todo', {created: Date.now(), checked: 0}),
  metadata: {
    version: 1,
    label: "待办事项",
    description: "创建可勾选的任务项",
    icon: 'bc_icon bc_gongzuoshixiang-color',
    svgIcon: 'bc_gongzuoshixiang-color',
    placeholder: '待办事项',
    virtualization: {
      speculativeMount: 'safe',
    },
  }
}

declare global {
  namespace BlockCraft {
    interface IBlockComponents {
      'todo': TodoBlockComponent
    }

    interface IBlockCreateParameters {
      'todo': EditableBlockCreateSnapshotParams
    }
  }
}
