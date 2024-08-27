import {Component, ViewChild} from "@angular/core";
import {BlockFlowEditor, GlobalConfig} from "@editor";
import {genUniqueID, IBlockModel, SchemaStore} from "@core";
import {HeadingOneSchema, ParagraphSchema} from "@blocks";

@Component({
  selector: 'app-root3',
  template: `
    <bf-editor [config]="config" #editor></bf-editor>
    <button (click)="onClick1()">删除第二个</button>
    <button (mousedown)="onClick3($event)">选中范围</button>
    <button (click)="onClick2()">打印数据</button>

    <button (click)="onClick5()">新增数据</button>
    <button (click)="onClick4()">开启协同</button>
  `,
  imports: [
    BlockFlowEditor
  ],
  standalone: true
})
export class App3Component {

  @ViewChild('editor') editor!: BlockFlowEditor

  model: IBlockModel[] = []

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
    rootId: 'root-demo',
    schemas: new SchemaStore([ParagraphSchema, HeadingOneSchema]),
    initModel:
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
      [
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
  }

  get controller() {
    return this.editor.controller
  }

  ngAfterViewInit() {
    // this.editor.controller.insertBlocks(0, this.config.initModel as IBlockModel[])
  }

  onClick1() {
    console.log(this.controller.rootModel)
    this.controller.deleteBlockById(this.controller.rootModel[1].id)
  }

  onClick2() {
    console.log(this.controller.rootModel)
  }

  onClick3(e: Event) {
    e.preventDefault()
    console.log(this.controller.getCurrentRange())
  }

  onClick5() {
    this.editor.controller.insertBlocks(0, this.model.slice(0,1))
  }

  onClick4() {
    // new BlockflowBinding(this.controller)
  }
}
