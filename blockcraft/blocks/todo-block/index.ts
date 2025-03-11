import {EditableBlockNative, generateId} from "../../framework";
import {BlockNodeType, IEditableBlockProps} from "../../framework/types";
import {BlockSchemaOptions, EditableBlockCreateSnapshotParams} from "../../framework/schema/block-schema";
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
  createSnapshot: (deltas, props) => {
    return {
      id: generateId(),
      flavour: 'todo',
      nodeType: BlockNodeType.editable,
      props: {
        depth: 0,
        created: Date.now(),
        completed: 0,
        ...props
      },
      meta: {},
      children: deltas ? typeof deltas === 'string' ? [{insert: deltas}] : deltas : []
    }
  },
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
