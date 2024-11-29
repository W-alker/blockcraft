import {IToolbarItem} from "../../components";

const ALIGN_MENUS: IToolbarItem[] = [
  {
    id: 'align-left',
    name: "align",
    title: "左对齐",
    value: "left",
    icon: "bf_icon bf_zuoduiqi"
  },
  {
    id: 'align-center',
    name: "align",
    title: "居中对齐",
    value: "center",
    icon: "bf_icon bf_juzhongduiqi"
  },
  {
    id: 'align-right',
    name: "align",
    title: "右对齐",
    value: "right",
    icon: "bf_icon bf_youduiqi",
    divide: true
  },
]

export const SET_ROW_HEADER: IToolbarItem = {
  id: 'setHeadRow',
  name: "setHeadRow",
  title: "设置为标题行",
  value: "row",
  icon: "bf_icon bf_biaotihang",
  divide: true
}

export const SET_COL_HEADER: IToolbarItem = {
  id: 'setHeadCol',
  name: "setHeadCol",
  title: "设置为标题列",
  value: "col",
  icon: "bf_icon bf_biaotilie",
  divide: true
}


export const TableRolControlMenu: IToolbarItem[] = [
  ...ALIGN_MENUS,
  {
    id: 'insert-top',
    name: "insert",
    title: "向上插入一行",
    value: "top",
    icon: "bf_icon bf_shangjiantou-jia"
  },
  {
    id: 'insert-bottom',
    name: "insert",
    title: "向下插入一行",
    value: "bottom",
    icon: "bf_icon bf_xiajiantou-jia",
    divide: true
  },
  {
    id: 'delete',
    name: 'delete',
    title: '删除当前行',
    value: 'delete',
    icon: 'bf_icon bf_shanchu-2'
  }
]

export const TableColControlMenu: IToolbarItem[] = [
  ...ALIGN_MENUS,
  {
    id: 'insert-left',
    name: "insert",
    title: "向左插入一列",
    value: "left",
    icon: "bf_icon bf_zuojiantou-jia"
  },
  {
    id: 'insert-right',
    name: "insert",
    title: "向右插入一列",
    value: "right",
    icon: "bf_icon bf_youjiantou-jia",
    divide: true
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
    id: 'delete',
    name: 'delete',
    title: '删除当前列',
    value: 'delete',
    icon: 'bf_icon bf_shanchu-2'
  }
]
