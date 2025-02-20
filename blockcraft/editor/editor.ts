import {Component, Injector, ViewChild, ViewContainerRef} from "@angular/core";
import {SchemaManager, BlockCraftDoc, EditableBlockComponent} from "../framework";
import {RootBlockSchema} from "../blocks";
import {ParagraphBlockSchema} from "../blocks/paragraph-block";
import {ConsoleLogger} from "../global";

const schemas = new SchemaManager([
  RootBlockSchema, ParagraphBlockSchema
])

@Component({
  selector: 'block-craft-editor',
  template: `
    <ng-container #container></ng-container>

    <button (click)="insert()">增加文本</button>
    <button (click)="log()">打印数据</button>
    <button (click)="undo()">undo</button>
    <button (click)="redo()">redo</button>
  `,
  styles: [`
    :host {
      ::ng-deep {
        c-element {

          &[bold="true"] {
            font-weight: bold;
          }

          ::selection {
            /*background-color: #f0f0f0;*/
          }

        }

        c-zero-text {
          user-select: text;
          padding: 0 0.5px;
          outline: none;
        }

        span[contenteditable='false'] {
          /*user-select: none;*/
          margin: 0 2px;
        }

        c-text {
          word-break: break-word;
          text-wrap: wrap;
          white-space-collapse: break-spaces;
        }
      }
    }
  `],
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
    ]
  })

  pid = ''

  ngAfterViewInit() {
    const p = this.doc.schemas.createSnapshot('paragraph', [[{insert: 'hello world '}, {
      insert: 'This is a paragraph',
      attributes: {'a:bold': true},
    },
      {
        insert: {image: 'https://raw.githubusercontent.com/toeverything/blocksuite/master/assets/logo-and-name-h.svg'}
      },
      {
        insert: {image: 'https://raw.githubusercontent.com/toeverything/blocksuite/master/assets/logo-and-name-h.svg'}
      }
    ]])
    const p2 = this.doc.schemas.createSnapshot('paragraph', [
      [{insert: 'hello world again'}, {insert: 'This is a paragraph', attributes: {'s:color': 'red'}}]
    ])
    this.pid = p.id
    const snapshot = this.doc.schemas.createSnapshot('root', [this.rootId, [p, p2]])
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
      {insert: ' bb ', attributes: {'s:color': 'red'}}, {retain: 5}, {insert: ' cc.    ', attributes: {'a:bold': true}}
    ])
  }
}
