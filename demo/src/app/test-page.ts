import {Component, ElementRef, TemplateRef, ViewChild} from "@angular/core";
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
import {NzCheckboxComponent, NzCheckboxWrapperComponent} from "ng-zorro-antd/checkbox";
import {NzColDirective, NzRowDirective} from "ng-zorro-antd/grid";
import {FormsModule} from "@angular/forms";
import {DatePipe, NgForOf} from "@angular/common";
import {NzButtonComponent} from "ng-zorro-antd/button";
import Y from '../../../blockflow/src/core/yjs'
import {Transaction} from "yjs";

const schemaStore = new SchemaStore([ParagraphSchema, HeadingOneSchema, HeadingTwoSchema, HeadingThreeSchema, HeadingFourSchema,
  ImageSchema, BulletListSchema, OrderedListSchema, TodoListSchema, CalloutSchema, BlockquoteSchema, DividerSchema, LinkSchema, CodeBlockSchema, MermaidBlockSchema, TableBlockSchema, TableRowBlockSchema, TableCellBlockSchema])

const mentionRequest = async (keyword: string) => {
  if (keyword === 'a') {
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

    <nz-checkbox-wrapper style="width: 100%;" (nzOnChange)="selectedData = $event">
      <div>
        <label nz-checkbox [nzValue]="item.time" *ngFor="let item of updateDataList">
          {{ item.time | date:'HH:mm:ss' }}
        </label>
      </div>
    </nz-checkbox-wrapper>
    <div>
      <button (click)="onClick7()">保存变化</button>
      <button nz-button (click)="onClick8()">合并选中数据</button>

      <pre #preElement style="width: 50vw;overflow-y: visible;"></pre>
    </div>

    <button (click)="onClickReadonly()">切换只读</button>
    <button (mousedown)="onClick3($event)">选中范围</button>
    <button (mousedown)="onClick1($event)">删除选中</button>
    <button (click)="onClick2()">打印数据</button>

    <button (click)="onClick5()">新增数据</button>
    <button (click)="onClick6()">新增图片</button>

    <button (click)="onClick4()">开启协同</button>

    <ng-template #mentionTpl let-item>
      {{ item.name + item.id }}
    </ng-template>
  `,
  styles: [`

  `],
  imports: [
    BlockFlowEditor,
    NzCheckboxWrapperComponent,
    NzRowDirective,
    NzColDirective,
    NzCheckboxComponent,
    FormsModule,
    NgForOf,
    NzButtonComponent,
    DatePipe,
  ],
  standalone: true,
})
export class TestPage {
  // @ts-ignore
  @ViewChild('editor') editor!: BlockFlowEditor<BlockSchemaMap>
  @ViewChild('mentionTpl', {read: TemplateRef}) mentionTpl!: TemplateRef<any>
  @ViewChild('preElement') preElement!: ElementRef

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
    },
    {
      "flavour": "mermaid",
      "id": "1733137356861_99958dde_cc24",
      "nodeType": "editable",
      "props": {
        "view": "graph",
        "indent": 0,
        "textAlign": "left"
      },
      "meta": {
        "createdTime": 1733137356861,
        "lastModified": {
          "time": 1733137359067,
          "userId": "123",
          "userName": "chengxu"
        }
      },
      "children": [
        {
          "insert": "sequenceDiagram\n    Alice->>John: Hello John, how are you?\n    John-->>Alice: Great!\n    Alice-)John: See you later!\n"
        }
      ]
    }
  ]
  modelLength = 101

  updateDataList: { data: Uint8Array, time: number }[] = []
  selectedData: number[] = []

  constructor() {
    let i = 0
    // this.model = []
    // while (i < this.modelLength) {
    //   i++
    //   const id = genUniqueID()
    //   this.model.push({
    //     flavour: 'heading-one',
    //     nodeType: 'editable',
    //     id,
    //     children: [
    //       {
    //         insert: 'Hello Again!' + id
    //       }
    //     ],
    //     meta: {},
    //     props: {}
    //   })
    // }
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
    // },
    plugins: [new FloatTextToolbarPlugin(
      [
        {
          name: "task",
          icon: "bf_renwu",
          intro: "任务",
          value: true,
          divide: true,
          children: [
            {
              name: 'task',
              label: '普通任务',
              value: 'normal',
              click: () => {
                console.log('normal')
              }
            },
            {
              name: 'task',
              label: '问题任务',
              value: 'issue',
              intro: '问题任务',
              click: () => {
                console.log('issue')
              }
            }
          ],
          click: (item) => {
            console.log('')
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

    this.controller.selection.activeBlock$.subscribe((v: any) => {
      console.log('activeBlock', v)
    })
    // this.controller.selection.selectionChange$.subscribe((v: any) => {
    //   console.log('selectionChange', v?.blockRange)
    // })
  }

  onClickReadonly() {
    this.editor.controller.toggleReadonly(!this.editor.controller.readonly$.value)
  }

  onClick1(e: Event) {
    e.preventDefault()
    const selection = this.controller.selection.getSelection()
    if (!selection || selection?.isAtRoot) return
    const bRef = this.controller.getBlockRef(selection.blockId) as EditableBlock
    if (!bRef) return
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
    // const bm = {
    //   "flavour": "paragraph",
    //   "id": "1732785970232_98d68ec2_3d7c",
    //   "nodeType": "editable",
    //   "props": {
    //     "indent": 0,
    //     "textAlign": "left"
    //   },
    //   "meta": {
    //     "createdTime": 1732785970232,
    //     "lastModified": {
    //       "time": 1732785982874,
    //       "userId": "123",
    //       "userName": "chengxu"
    //     }
    //   },
    //   "children": [
    //     {
    //       "insert": "123"
    //     },
    //     {
    //       "insert": {
    //         "link": "https://fanyi.baidu.com/mtpe-individual/multimodal?query=decrement&lang=en2zh#/"
    //       },
    //       "attributes": {
    //         "d:href": "https://fanyi.baidu.com/mtpe-individual/multimodal?query=decrement&lang=en2zh#/"
    //       }
    //     },
    //     {
    //       "insert": "45678",
    //       "attributes": {
    //         "s:c": "#ff0000"
    //       }
    //     },
    //     {
    //       "insert": "789",
    //     }
    //   ]
    // } as any
    // this.editor.controller.insertBlocks(0, [BlockModel.fromModel(bm)])
    this.editor.controller.insertBlocks(0, this.model.map(BlockModel.fromModel))
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


  resetFlag = false

  onClick7() {
    this.controller.yDoc.on('update', (u: Uint8Array, _: any, t: Transaction) => {
      if (this.resetFlag) return
      Y.logUpdate(u)
      // 将 Uint8Array 转换为 Base64 字符串
      // const base64String = btoa(String.fromCharCode(...u));
      this.updateDataList.push({
        time: Date.now(),
        data: u,
      })
    })
  }

  onClick8() {
    const selected = this.selectedData.map(n => {
      return this.updateDataList.find(v => n === v.time)!.data
    })

    const update = Y.mergeUpdates(selected)

    // console.log(update)
    // this.controller.deleteBlocks(0, this.controller.blockLength)
    this.resetFlag = true
    const yDocCombined = new Y.Doc();
    yDocCombined.getArray(this.controller.rootId)
    Y.applyUpdate(yDocCombined, update)
    const json = yDocCombined.toJSON()
    console.log(json)
    const m = json[this.controller.rootId]
    this.controller.deleteBlocks(0, this.controller.blockLength)
    this.controller.insertBlocks(0, m.map(BlockModel.fromModel)).then(() => {
      this.resetFlag = false
    })
    // this.preElement.nativeElement.innerHTML = JSON.stringify(yDocCombined.toJSON())
  }


}
