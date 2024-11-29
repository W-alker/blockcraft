import {Component, TemplateRef, ViewChild} from "@angular/core";
import {
  BlockFlowContextmenu,
  BlockFlowEditor,
  GlobalConfig,
  BlockModel,
  genUniqueID,
  IBlockModel,
  IEditableBlockModel,
  SchemaStore,
  BlockquoteSchema,
  BulletListSchema,
  CodeBlockSchema,
  DividerSchema,
  HeadingFourSchema,
  HeadingOneSchema,
  HeadingThreeSchema,
  HeadingTwoSchema,
  ImageSchema,
  MermaidBlockSchema,
  OrderedListSchema,
  ParagraphSchema,
  TableBlockSchema,
  TableCellBlockSchema,
  TableRowBlockSchema,
  TodoListSchema,
  CalloutSchema,
  LinkSchema,
  BlockControllerPlugin,
  BlockTransformPlugin,
  FloatTextToolbarPlugin,
  InlineLinkPlugin,
  MentionPlugin,
  BlockflowBinding,
  InlineImgPlugin,
  deleteContent, EditableBlock
// } from "blockflow-editor";
} from "../../../blockflow/src/public-api";

const schemaStore = new SchemaStore([ParagraphSchema, HeadingOneSchema, HeadingTwoSchema, HeadingThreeSchema, HeadingFourSchema,
  ImageSchema, BulletListSchema, OrderedListSchema, TodoListSchema, CalloutSchema, BlockquoteSchema, DividerSchema, LinkSchema, CodeBlockSchema, MermaidBlockSchema, TableBlockSchema, TableRowBlockSchema, TableCellBlockSchema])

const mentionRequest = async (keyword: string) => {
  if(keyword === 'a') {
    return {
      list: []
    }
  }
  const len = Math.floor(Math.random() * 10)
  const list = Array.from({length: len}).map(() => ({
    id: genUniqueID(),
    name: keyword + Math.floor(Math.random() * 10000).toString().slice(0, 4)
  }))

  return {
    list
  }
}

interface BlockSchemaMap {
  'paragraph': IEditableBlockModel,
  'heading-one': IEditableBlockModel
}

@Component({
  selector: 'test-page',
  template: `
    <bf-editor [config]="config" #editor style="padding: 30px; height: 80vh; width: 70vw"></bf-editor>

    <button (click)="onClickReadonly()">切换只读</button>
    <button (mousedown)="onClick3($event)">选中范围</button>
    <button (mousedown)="onClick1($event)">删除选中</button>
    <button (click)="onClick2()">打印数据</button>

    <button (click)="onClick5()">新增数据</button>
    <button (click)="onClick6()">新增图片</button>
    <button (click)="onClick7()">测试数据</button>

    <button (click)="onClick4()">开启协同</button>

    <ng-template #mentionTpl let-item>
      {{ item.name + item.id }}
    </ng-template>
  `,
  styles: [`

  `],
  imports: [
    BlockFlowEditor,
  ],
  standalone: true,
})
export class TestPage {
  // @ts-ignore
  @ViewChild('editor') editor!: BlockFlowEditor<BlockSchemaMap>
  @ViewChild('mentionTpl', {read: TemplateRef}) mentionTpl!: TemplateRef<any>

  model: IBlockModel[] = [
    {
      flavour: 'paragraph',
      nodeType: 'editable',
      id: genUniqueID(),
      children: [
        {
          insert: 'Hello, World!\n'
        },
        {
          insert: 'This is a paragraph.',
          attributes: {
            'a:bold': true,
          }
        }
      ],
      meta: {},
      props: {}
    },
    {
      flavour: 'heading-one',
      nodeType: 'editable',
      id: genUniqueID(),
      children: [
        {
          insert: 'Hello Again!'
        }
      ],
      meta: {},
      props: {
        id: '0001',
        hs: [1, 2, 3]
      }
    }
  ]
  modelLength = 101

  constructor() {
    let i = 0
    while (i < this.modelLength) {
      i++
      const id = genUniqueID()
      this.model.push({
        flavour: 'heading-one',
        nodeType: 'editable',
        id,
        children: [
          {
            insert: 'Hello Again!' + id
          }
        ],
        meta: {},
        props: {}
      })
    }
  }

  config: GlobalConfig = {
    rootId: '20241127test',
    schemas: schemaStore,
    // lazyload: {
    //   pageSize: 10,
    //   requester: async (page) => {
    //     const start = (page - 1) * this.config.lazyload!.pageSize
    //         return {
    //             totalCount: this.modelLength,
    //             data: this.model.slice(start, start + this.config.lazyload!.pageSize)
    //         }
    //   }
    // }
    plugins: [new FloatTextToolbarPlugin(
      [
        {
          item: {
            name: "|",
            value: "|",
          },
        },
        {
          item: {
            name: "task",
            icon: "bf_renwu",
            intro: "任务",
            value: true,
          },
          click: (item) => {
            console.log(item)
          }
        }
      ]
    ), new BlockControllerPlugin(BlockFlowContextmenu), new BlockTransformPlugin(), new InlineLinkPlugin(), new InlineImgPlugin()],
    localUser: {
      userId: '123',
      userName: 'chengxu'
    }
  }

  yBinding?: BlockflowBinding

  get controller() {
    return this.editor.controller
  }

  ngAfterViewInit() {
    // this.editor.controller.transact(()=>{
    // }, {name: 'init'})
    this.controller.addPlugins([
      new MentionPlugin(mentionRequest),
    ])
  }

  onClickReadonly() {
    this.editor.controller.toggleReadonly(!this.editor.controller.readonly$.value)
  }

  onClick1(e: Event) {
    e.preventDefault()
    const selection = this.controller.selection.getSelection()
    if(!selection || selection?.isAtRoot) return
    const bRef = this.controller.getBlockRef(selection.blockId) as EditableBlock
    if(!bRef) return
    console.log('11')
    deleteContent(bRef.containerEle, selection.blockRange.start, selection.blockRange.end)
  }

  onClick2() {
    console.log(this.controller.rootModel, this.controller.rootYModel, this.controller.rootYModel.toJSON())
  }

  onClick3(e: Event) {
    e.preventDefault()
    console.log(this.controller.selection.getSelection())
  }

  onClick4() {
    this.yBinding = new BlockflowBinding(this.controller, {serverUrl: 'ws://localhost:1234'})
    this.yBinding.connect()
  }

  onClick5() {
    const bm = {
      "flavour": "paragraph",
      "id": "1732785970232_98d68ec2_3d7c",
      "nodeType": "editable",
      "props": {
        "indent": 0,
        "textAlign": "left"
      },
      "meta": {
        "createdTime": 1732785970232,
        "lastModified": {
          "time": 1732785982874,
          "userId": "123",
          "userName": "chengxu"
        }
      },
      "children": [
        {
          "insert": "123"
        },
        {
          "insert": {
            "link": "https://fanyi.baidu.com/mtpe-individual/multimodal?query=decrement&lang=en2zh#/"
          },
          "attributes": {
            "d:href": "https://fanyi.baidu.com/mtpe-individual/multimodal?query=decrement&lang=en2zh#/"
          }
        },
        {
          "insert": "45678",
          "attributes": {
            "s:c": "#ff0000"
          }
        },
        {
          "insert": "789",
        }
      ]
    } as any
    this.editor.controller.insertBlocks(0, [BlockModel.fromModel(bm)])
  }

  onClick6() {
    const img: IBlockModel = {
      "flavour": "image",
      "id": genUniqueID(),
      "nodeType": "block",
      "props": {
        "src": "https://v17.angular.io/generated/images/guide/start/fork-the-project.png",
        "width": 400,
        "height": 0,
        "align": "center"
      },
      "meta": {},
      "children": [
        {
          "flavour": "paragraph",
          "id": "1726043571963-03c23813-3fbf",
          "nodeType": "editable",
          "props": {},
          "meta": {},
          "children": [
            {
              "insert": "z这是一个图片测试"
            }
          ]
        }
      ]
    }
    const bm = BlockModel.fromModel(img)
    this.editor.controller.insertBlocks(0, [bm])
  }

  onClick7() {

  }
}
