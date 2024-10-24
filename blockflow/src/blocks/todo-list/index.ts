import {ITodoListBlockModel} from "./type";
import {EditableBlockSchema} from "../../core";
import {TodoListBlock} from "./todo-list.block";

export const TodoListSchema: EditableBlockSchema<ITodoListBlockModel['props']> = {
  flavour: 'todo-list',
  nodeType: 'editable',
  icon: 'bf_icon bf_gongzuoshixiang',
  svgIcon: 'bf_gongzuoshixiang-color',
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
