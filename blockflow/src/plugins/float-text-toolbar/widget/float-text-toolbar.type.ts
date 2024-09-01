import {IInlineAttrs} from "@core";

export interface IToolbarMenuItem {
  name: string
  icon: string
  attr: IInlineAttrs,
  intro?: string
  children?: IToolbarMenuItem[]
}

export const TOOLBAR_MENU_LIST: IToolbarMenuItem[] = [
  {
    name: "加粗",
    icon: "editor-bold01",
    intro: "加粗",
    attr: {
      'a:bold': true
    }
  },
  {
    name: "删除线",
    icon: "editor-xuqiuwendang_shanchuxian",
    intro: "删除线",
    attr: {
      'a:strike': true
    }
  },
  {
    name: "下划线",
    icon: "editor-xiahuaxian2",
    intro: "下划线",
    attr: {
      'a:underline': true
    }
  },
  {
    name: "斜体",
    icon: "editor-xieti",
    intro: "斜体",
    attr: {
      'a:italic': true
    }
  },
  {
    name: "代码",
    icon: "editor-code_block",
    intro: "代码",
    attr: {
      'a:code': true
    }
  },
  {
    name: "记号笔",
    icon: "editor-marker_pen",
    intro: "记号笔",
    attr: {
      's:bc': 'yellow'
    },
    children: [
      {
        name: "记号笔",
        icon: "editor-marker_pen",
        intro: "红色",
        attr: {
          's:bc': 'red'
        }
      },
      {
        name: "记号笔",
        icon: "editor-marker_pen",
        intro: "黄色",
        attr: {
          's:bc': 'yellow'
        }
      }
    ]
  },
  // {
  //   name: "|",
  // },
  // {
  //   name: "主标题",
  //   value: "h1",
  //   icon: "editor-xuqiuwendang_zhubiaoti",
  // },
  // {
  //   name: "次标题",
  //   value: "h2",
  //   icon: "editor-xuqiuwendang_cibiaoti",
  // },
  // {
  //   name: "三级标题",
  //   value: "h3",
  //   icon: "editor-subtitle",
  // },
  // {
  //   name: "|",
  // },
  // {
  //   name: "连接",
  //   value: "link",
  //   icon: "editor-link",
  // },
]
