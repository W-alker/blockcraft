import {Component, ViewChild} from '@angular/core';
import {
  BlockflowBinding,
  BlockFlowEditor, FloatTextToolbarPlugin,
  GlobalConfig,
  HeadingOneSchema, IBlockModel,
  IEditableBlockModel,
  ParagraphSchema,
  SchemaStore,
} from "@blockflow";
import {genUniqueID} from "@core/utils";

const schemaStore = new SchemaStore([ParagraphSchema, HeadingOneSchema])

interface BlockSchemaMap {
  'paragraph': IEditableBlockModel,
  'heading-one': IEditableBlockModel
}

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  // @ts-ignore
  @ViewChild('editor') editor!: BlockFlowEditor<BlockSchemaMap>

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
    rootId: 'root-demo',
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
    plugins: [new FloatTextToolbarPlugin()]
  }

  yBinding?: BlockflowBinding

  get controller() {
    return this.editor.controller
  }

  ngAfterViewInit() {
    // this.editor.controller.transact(()=>{
    // }, {name: 'init'})
  }

  onClickReadonly() {
    this.editor.controller.toggleReadonly(!this.editor.controller.readonly$.value)
  }

  onClick1() {
    console.log(this.controller.rootModel)
    this.controller.deleteBlockById(this.controller.rootModel[1].id)
  }

  onClick2() {
    console.log(this.controller.rootModel, this.controller.docManager.rootYModel.toJSON())
  }

  onClick3(e: Event) {
    e.preventDefault()
    console.log(this.controller.getSelection())
  }

  onClick4() {
    this.yBinding =  new BlockflowBinding(this.controller)
    this.yBinding.connect()
  }

  onClick5() {
    const block = {
      flavour: 'paragraph',
      nodeType: 'editable',
      id: genUniqueID(),
      children: [
        {
          insert: 'This is a paragraph.',
          attributes: {
            'a:bold': true,
          }
        },
        {
          insert: 'Hello, World!\n'
        },
      ],
      meta: {},
      props: {}
    } as IBlockModel
    this.editor.controller.insertBlocks(0, [block], this.controller.rootId)
  }

  ngOnDestroy() {
  }

}
