import {EditableBlockNative} from "../../framework";
import {BlockNodeType, IEditableBlockProps} from "../../framework/types";
import {
  BlockSchemaOptions,
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

export const TodoBlockSchema: BlockSchemaOptions<TodoBlockModel> = {
  flavour: 'todo',
  nodeType: BlockNodeType.editable,
  component: TodoBlockComponent,
  createSnapshot: editableBlockCreateSnapShotFn<TodoBlockModel>('todo', {created: Date.now(), completed: 0}),
  metadata: {
    version: 1,
    label: "待办事项"
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
