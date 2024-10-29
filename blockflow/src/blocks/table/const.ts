import {IToolbarItem} from "../../components";

export const TableRolControlMenu: IToolbarItem[] = [
  {
    name: "insert",
    title: "向上插入一行",
    value: "top",
    icon: "bf_icon bf_shangjiantou-jia"
  },
  {
    name: "insert",
    title: "向下插入一行",
    value: "bottom",
    icon: "bf_icon bf_xiajiantou-jia"
  },
  {
    name: '|'
  },
  {
    name: 'delete',
    title: '删除当前行',
    value: 'delete',
    icon: 'bf_icon bf_shanchu-2'
  }
]

export const TableColControlMenu: IToolbarItem[] = [
  {
    name: "align",
    title: "左对齐",
    value: "left",
    icon: "bf_icon bf_zuoduiqi"
  },
  {
    name: "align",
    title: "居中对齐",
    value: "center",
    icon: "bf_icon bf_juzhongduiqi"
  },
  {
    name: "align",
    title: "右对齐",
    value: "right",
    icon: "bf_icon bf_youduiqi"
  },
  {
    name: '|'
  },
  {
    name: "insert",
    title: "向左插入一列",
    value: "left",
    icon: "bf_icon bf_zuojiantou-jia"
  },
  {
    name: "insert",
    title: "向右插入一列",
    value: "right",
    icon: "bf_icon bf_youjiantou-jia"
  },
  // {
  //   name: "复制当前列",
  //   value: "copy",
  //   icon: "editor-xuqiuwendang_fuzhi"
  // },
  // {
  //   name: "清除内容",
  //   value: "clear",
  //   icon: "editor-delete_02"
  // },
  {
    name: '|'
  },
  {
    name: 'delete',
    title: '删除当前列',
    value: 'delete',
    icon: 'bf_icon bf_shanchu-2'
  }
]
