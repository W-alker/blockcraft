import {EditableBlockNative} from "../../framework";
import {BlockNodeType, IEditableBlockProps} from "../../framework/types";
import {
  IBlockSchemaOptions,
  editableBlockCreateSnapShotFn,
  EditableBlockCreateSnapshotParams
} from "../../framework/schema/block-schema";
import {TodoBlockComponent} from "./todo.block";

export interface TodoBlockModel extends EditableBlockNative {
  flavour: 'todo'
  props: {
    created: number
    completed: number
  } & IEditableBlockProps
}

export const TodoBlockSchema: IBlockSchemaOptions<TodoBlockModel> = {
  flavour: 'todo',
  nodeType: BlockNodeType.editable,
  component: TodoBlockComponent,
  createSnapshot: editableBlockCreateSnapShotFn<TodoBlockModel>('todo', {created: Date.now(), completed: 0}),
  metadata: {
    version: 1,
    label: "待办事项",
    icon: 'bc_icon bc_gongzuoshixiang-color',
    svgIcon: 'bc_gongzuoshixiang-color'
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
