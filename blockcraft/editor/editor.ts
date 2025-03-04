import {Component, Injector, ViewChild, ViewContainerRef} from "@angular/core";
import {SchemaManager, BlockCraftDoc, EditableBlockComponent} from "../framework";
import {RootBlockSchema} from "../blocks";
import {ConsoleLogger} from "../global";
import {DividerBlockSchema, CalloutBlockSchema, OrderedBlockSchema, ParagraphBlockSchema} from "../blocks";
import {AutoUpdateOrderPlugin} from "../plugins/autoUpdateOrder";

const schemas = new SchemaManager([
  RootBlockSchema, ParagraphBlockSchema, DividerBlockSchema, CalloutBlockSchema,
  OrderedBlockSchema
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
  `,
  styles: [``],
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
    plugins: [new AutoUpdateOrderPlugin()]
  })

  pid = ''

  ngAfterViewInit() {
    const p = this.doc.schemas.createSnapshot('paragraph', [[{insert: 'hello world '},
      {insert: 'This is a paragraph', attributes: {'a:bold': true}},
      {insert: {image: 'https://raw.githubusercontent.com/toeverything/blocksuite/master/assets/logo-and-name-h.svg'}},
      {insert: {image: 'https://raw.githubusercontent.com/toeverything/blocksuite/master/assets/logo-and-name-h.svg'}}
    ]])
    const p2 = this.doc.schemas.createSnapshot('paragraph', [
      [{insert: 'hello world again'}, {insert: 'This is a paragraph', attributes: {'s:color': 'red'}}]
    ])
    const p4 = this.doc.schemas.createSnapshot('divider', [])
    const p5 = this.doc.schemas.createSnapshot('divider', [])
    const p6 = this.doc.schemas.createSnapshot('divider', [])
    const p3 = this.doc.schemas.createSnapshot('ordered', [
      [{insert: 'hello world again'}, {insert: 'This is a paragraph', attributes: {'s:color': 'red'}}]
    ])
    const callout = this.doc.schemas.createSnapshot('callout', [])
    this.pid = p.id
    const snapshot = this.doc.schemas.createSnapshot('root', [this.rootId, [p, p2, callout, p4, p5, p6, p3]])
    console.log(snapshot)
    this.doc.init(snapshot, this.container)
  }

  log() {
    console.log(this.doc.crud.yBlockMap, this.doc.exportSnapshot())
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
    this.doc.crud.insertBlocks(_arr, 0, this.doc.rootId)
  }
}
