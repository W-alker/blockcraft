import {EditableBlockSchema} from "@core";
import {ITodoListBlockModel} from "@blocks/todo-list/type";
import {TodoListBlock} from "@blocks/todo-list/todo-list.block";

export const TodoListSchema: EditableBlockSchema<ITodoListBlockModel['props']> = {
  flavour: 'todo-list',
  nodeType: 'editable',
  icon: 'bf_icon bf_gongzuoshixiang',
  label: '工作事项',
  render: TodoListBlock,
  onCreate: (deltas, props) => {
    return {
      props: () => ({
        checked: false,
        indent: props.indent || 0
      }),
      children: deltas
    }
  }
}
