import {Component, Injector, ViewChild, ViewContainerRef} from "@angular/core";
import {SchemaManager, BlockCraftDoc, EditableBlockComponent} from "../framework";
import {
  HeadingFourBlockSchema,
  HeadingOneBlockSchema,
  HeadingTwoBlockSchema,
  ImageBlockSchema,
  RootBlockSchema, TodoBlockSchema, CodeBlockSchema, TableBlockSchema, TableRowBlockSchema, TableCellBlockSchema
} from "../blocks";
import {ConsoleLogger} from "../global";
import {DividerBlockSchema, CalloutBlockSchema, OrderedBlockSchema, ParagraphBlockSchema} from "../blocks";
import {AutoUpdateOrderPlugin} from "../plugins/autoUpdateOrder";
import {BulletBlockSchema} from "../blocks/bullet-block";
import {CodeBlocKeyBinding} from "../plugins/codeBlocKeyBinding";
import {TableBlockBinding} from "../plugins/tableBlockBinding";
import {BcFloatToolbarComponent} from "../components/float-toolbar/float-toolbar";
import {BcFloatToolbarItemComponent} from "../components/float-toolbar/float-toolbar-item";
import {
  BcOverlayTriggerDirective
} from "../components/float-toolbar/float-binding.directive";

const schemas = new SchemaManager([
  RootBlockSchema, ParagraphBlockSchema, DividerBlockSchema, CalloutBlockSchema, BulletBlockSchema,
  OrderedBlockSchema, ImageBlockSchema, HeadingOneBlockSchema, HeadingTwoBlockSchema, HeadingFourBlockSchema, TodoBlockSchema,
  CodeBlockSchema, TableBlockSchema, TableRowBlockSchema, TableCellBlockSchema
])

@Component({
  selector: 'block-craft-editor',
  template: `
    <ng-container #container></ng-container>

    <button (mousedown)="$event.preventDefault(); logSelection()">当前选择</button>
    <button (click)="insert()">增加文本</button>
    <button (click)="log()">打印数据</button>
    <button (click)="undo()">undo</button>
    <button (click)="redo()">redo</button>
    <button (click)="addData()">增加数据</button>

    <ng-template #overlayContent>
      <!-- 浮动层内容 -->
      <bc-float-toolbar>
        <bc-float-toolbar-item>
          Item 1
          <ng-template>
            <!-- 子工具栏内容 -->
          </ng-template>
        </bc-float-toolbar-item>
        <bc-float-toolbar-item [bcOverlayTrigger]="childContent" [position]="'right-center'">
          Item 2
        </bc-float-toolbar-item>
      </bc-float-toolbar>
    </ng-template>

    <ng-template #childContent2>
      <bc-float-toolbar>
        <bc-float-toolbar-item>
          Item children
          <ng-template>
            <!-- 子工具栏内容 -->
          </ng-template>
        </bc-float-toolbar-item>
      </bc-float-toolbar>
    </ng-template>

    <ng-template #childContent>
      <bc-float-toolbar>
        <bc-float-toolbar-item>
          Item children
            <!-- 子工具栏内容 -->
            <button [bcOverlayTrigger]="childContent2" [position]="'right-center'">hover me</button>
        </bc-float-toolbar-item>
      </bc-float-toolbar>
    </ng-template>

    <div [bcOverlayTrigger]="overlayContent">
      <!-- 触发元素内容 -->
      <button>鼠标悬停显示浮动层</button>
    </div>
  `,
  styles: [``],
  imports: [
    BcFloatToolbarComponent,
    BcFloatToolbarComponent,
    BcFloatToolbarItemComponent,
    BcOverlayTriggerDirective
  ],
  standalone: true
})
export class EditorComponent {
  @ViewChild('container', {static: true, read: ViewContainerRef}) container!: ViewContainerRef

  constructor(
    private injector: Injector
  ) {
  }

  rootId = 'root-demo'

  doc = new BlockCraftDoc({
    rootId: this.rootId,
    docId: 'our-doc',
    schemas: schemas,
    logger: new ConsoleLogger(),
    injector: this.injector,
    embeds: [
      ['image', {
        toDelta: (ele) => ({
          // @ts-ignore
          insert: {image: ele['src']},
          attributes: {}
        }),
        toView: (delta) => {
          const img = document.createElement('img')
          img.src = delta.insert['image'] as string
          img.style.width = '100px'
          return img
        }
      }]
    ],
    plugins: [AutoUpdateOrderPlugin, CodeBlocKeyBinding, TableBlockBinding]
  })

  pid = ''

  ngAfterViewInit() {
    const p = this.doc.schemas.createSnapshot('paragraph', [[{insert: 'hello\n'},
      {insert: 'world', attributes: {'a:bold': true}},
      {insert: {image: 'https://raw.githubusercontent.com/toeverything/blocksuite/master/assets/logo-and-name-h.svg'}}
    ]])
    const p2 = this.doc.schemas.createSnapshot('heading-two', [
      [{insert: 'hello world again'}, {insert: 'This is a paragraph', attributes: {'s:color': 'red'}}]
    ])
    const p4 = this.doc.schemas.createSnapshot('divider', [])
    const p5 = this.doc.schemas.createSnapshot('divider', [])
    const p6 = this.doc.schemas.createSnapshot('divider', [])
    const p3 = this.doc.schemas.createSnapshot('ordered', [
      [{insert: 'hello world again'}, {insert: 'This is a paragraph', attributes: {'s:color': 'red'}}]
    ])
    const callout = this.doc.schemas.createSnapshot('callout', [])
    const img = this.doc.schemas.createSnapshot('image', ['https://raw.githubusercontent.com/toeverything/blocksuite/master/assets/logo-and-name-h.svg', 200, 100])
    const todo = this.doc.schemas.createSnapshot('todo', ['this is a todo'])
    const code = this.doc.schemas.createSnapshot('code', ['const c = 1;\n\nfunction a()\n{ console.log(c) }'])
    const table = this.doc.schemas.createSnapshot('table', [6, 6])
    this.pid = p.id
    const snapshot = this.doc.schemas.createSnapshot('root', [this.rootId, [p, p2, callout, p4, p5, p6, p3, img, todo, code, table]])
    console.log(snapshot)
    this.doc.init(snapshot, this.container)
  }

  log() {
    // @ts-ignore
    console.log(this.doc.crud.yBlockMap.toJSON(), this.doc.vm.store)
    console.log(this.doc.exportSnapshot())
  }

  undo() {
    this.doc.crud.undo()
  }

  redo() {
    this.doc.crud.redo()
  }

  insert() {
    (this.doc.getBlockById(this.pid) as EditableBlockComponent).yText.applyDelta([{insert: 'aa '}, {retain: 5},
      {
        retain: 6,
        attributes: {'s:color': 'red'}
      },
      {insert: ' bb ', attributes: {'s:color': 'red'}}, {retain: 5}, {
        insert: ' cc.    ',
        attributes: {'a:bold': true}
      }
    ])
  }

  logSelection() {
    console.log(this.doc.selection.value, document.getSelection()!.getRangeAt(0))
  }

  addData() {
    const _arr = []
    for (let i = 0; i < 100; i++) {
      _arr.push(
        this.doc.schemas.createSnapshot('paragraph', [
          [{insert: `hello {${i}}`}]
        ])
      )
    }
    this.doc.crud.insertBlocks(this.doc.rootId, 0, _arr)
  }
}
