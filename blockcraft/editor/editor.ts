import {Component, Injector, ViewChild, ViewContainerRef} from "@angular/core";
import {
  SchemaManager,
  BlockCraftDoc,
  EditableBlockComponent,
  DOC_FILE_SERVICE_TOKEN,
  DOC_MESSAGE_SERVICE_TOKEN,
  BLOCK_CREATOR_SERVICE_TOKEN,
  DOC_LINK_PREVIEWER_SERVICE_TOKEN, DocLinkPreviewerService
} from "../framework";
import {
  HeadingFourBlockSchema,
  HeadingOneBlockSchema,
  HeadingTwoBlockSchema,
  ImageBlockSchema,
  RootBlockSchema,
  TodoBlockSchema,
  CodeBlockSchema,
  TableBlockSchema,
  TableRowBlockSchema,
  TableCellBlockSchema,
  HeadingThreeBlockSchema, AttachmentBlockSchema, CaptionBlockSchema,
  FigmaEmbedBlockSchema, BookmarkBlockSchema, JuejinEmbedBlockSchema
} from "../blocks";
import {ConsoleLogger} from "../global";
import {DividerBlockSchema, CalloutBlockSchema, OrderedBlockSchema, ParagraphBlockSchema} from "../blocks";
import {AutoUpdateOrderPlugin} from "../plugins/autoUpdateOrder";
import {BulletBlockSchema} from "../blocks/bullet-block";
import {CodeBlocKeyBinding} from "../plugins/codeBlocKeyBinding";
import {TableBlockBinding} from "../plugins/tableBlockBinding";
import {FloatTextToolbarPlugin} from "../plugins/float-text-toolbar";
import {BlockTransformerPlugin} from "../plugins/block-transformer";
import {BlockControllerPlugin} from "../plugins/block-controller";
import {ImgToolbarPlugin} from "../plugins/img-toolbar";
import {MyDocFileService} from "./doc-file-service";
import {MyDocMessageService} from "./doc-message.service";
import {CalloutToolbarPlugin} from "../plugins/callout-toolbar";
import {AttachmentExtensionPlugin} from "../plugins/attachment-extension";
import {MyBlockCreatorService} from "./block-creator.service";
import {EmbedFrameExtensionPlugin} from "../plugins/embed-frame-extension";
import {BookmarkBlockExtensionPlugin} from "../plugins/bookmark-frame-extension";
import {InlineLinkExtension} from "../plugins/inline-link-extension";
import {MatIcon} from "@angular/material/icon";
import {DocDndDataTypes} from "../framework/services/dnd.service";
import {DocExportManager} from "../tools";
// import {Code2BlockSchema, CodeLineBlockSchema} from "../blocks/code2-block";

const schemas = new SchemaManager([
  ParagraphBlockSchema,
  HeadingOneBlockSchema, HeadingTwoBlockSchema, HeadingThreeBlockSchema, HeadingFourBlockSchema,
  OrderedBlockSchema, BulletBlockSchema, TodoBlockSchema, CalloutBlockSchema, CodeBlockSchema,
  CalloutBlockSchema,
  DividerBlockSchema, ImageBlockSchema,
  TableBlockSchema, TableRowBlockSchema, TableCellBlockSchema, AttachmentBlockSchema, BookmarkBlockSchema,
  FigmaEmbedBlockSchema, JuejinEmbedBlockSchema,
  CaptionBlockSchema, RootBlockSchema,
])

@Component({
  selector: 'block-craft-editor',
  template: `
    <div style="width: 90vw; height: 80vh; overflow-y: auto;">
      <ng-container #container></ng-container>
    </div>

    <button (mousedown)="$event.preventDefault(); logSelection()">当前选择</button>
    <button (click)="insert()">增加文本</button>
    <button (click)="log()">打印数据</button>
    <button (click)="undo()">undo</button>
    <button (click)="redo()">redo</button>
    <button (click)="addData()">增加数据</button>
    <button (click)="exportPdf()">导出PDF</button>
    <button (click)="exportImg()">导出图片</button>
    <button (click)="ast()">HTML AST</button>

    <div class="block-area">
      <div draggable="true" (dragstart)="onDragStart($event, 'heading-one')">
        <i class="bc_icon bc_biaoti_1"></i>
      </div>
      <div draggable="true" (dragstart)="onDragStart($event, 'divider')">
        <mat-icon svgIcon="bc_fengexian"></mat-icon>
      </div>
      <div draggable="true" (dragstart)="onDragStart($event, 'attachment')">
        <mat-icon svgIcon="bc_wenjian-color"></mat-icon>
      </div>
      <div draggable="true" (dragstart)="onDragStart($event, 'figma-embed')">
        <mat-icon svgIcon="bc_Figma"></mat-icon>
      </div>
    </div>
  `,
  styles: [`:host {
    margin: 20px;
    display: block;
  }
  .block-area {
    margin-top: 10px;
    display: flex;
    gap: 8px;

    > div {
      min-width: 120px;
      height: 120px;
      font-size: 80px;
      border: 2px solid #ddd;
      display: flex;
      justify-content: center;
      align-items: center;

      > mat-icon, i {
        width: 80px;
        height: 80px;
      }

      >i {
        display: flex;
        justify-content: center;
        align-items: center;
        font-size: inherit;
      }
    }
  }
  `],
  imports: [
    MatIcon
  ],
  standalone: true,
  providers: [
    {provide: DOC_FILE_SERVICE_TOKEN, useClass: MyDocFileService},
    {provide: DOC_MESSAGE_SERVICE_TOKEN, useClass: MyDocMessageService},
    {provide: BLOCK_CREATOR_SERVICE_TOKEN, useClass: MyBlockCreatorService},
    {provide: DOC_LINK_PREVIEWER_SERVICE_TOKEN, useClass: DocLinkPreviewerService},
    ConsoleLogger
  ]
})
export class EditorComponent {
  @ViewChild('container', {static: true, read: ViewContainerRef}) container!: ViewContainerRef

  constructor(
    private injector: Injector,
    private logger: ConsoleLogger
  ) {
  }

  rootId = 'root-demo'

  doc = new BlockCraftDoc({
    rootId: this.rootId,
    docId: 'our-doc',
    schemas: schemas,
    logger: this.logger,
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
    plugins: [new AutoUpdateOrderPlugin(), new CodeBlocKeyBinding(), new TableBlockBinding(),
      new FloatTextToolbarPlugin(), new BlockTransformerPlugin(), new BlockControllerPlugin(),
      new ImgToolbarPlugin(), new CalloutToolbarPlugin(), new AttachmentExtensionPlugin(),
      new EmbedFrameExtensionPlugin(), new BookmarkBlockExtensionPlugin(), new InlineLinkExtension()
    ]
  })

  pid = ''

  ngAfterViewInit() {
    const p = this.doc.schemas.createSnapshot('paragraph', [[{insert: 'hello\n'},
      {insert: 'world', attributes: {'a:bold': true}},
      {insert: {image: 'https://raw.githubusercontent.com/toeverything/blocksuite/master/assets/logo-and-name-h.svg'}},
      {insert: 'This is a paragraph', attributes: {'a:link': 'https://zhuanlan.zhihu.com/p/617505961'}}
    ]])
    const p2 = this.doc.schemas.createSnapshot('heading-two', [
      [{insert: 'hello world again'}, {insert: 'This is a paragraph', attributes: {'s:color': 'red'}}]
    ])
    const d1 = this.doc.schemas.createSnapshot('divider', [])
    const d2 = this.doc.schemas.createSnapshot('divider', [])
    const d3 = this.doc.schemas.createSnapshot('divider', [])
    const p3 = this.doc.schemas.createSnapshot('ordered', [
      [{insert: 'hello world again'}, {insert: 'This is a paragraph', attributes: {'s:color': 'red'}}]
    ])
    const callout = this.doc.schemas.createSnapshot('callout', [])
    const img = this.doc.schemas.createSnapshot('image', ['https://raw.githubusercontent.com/toeverything/blocksuite/master/assets/logo-and-name-h.svg', undefined, undefined, 'Image'])
    const todo = this.doc.schemas.createSnapshot('todo', ['this is a todo'])
    const code = this.doc.schemas.createSnapshot('code', ['const c = 1;\n\nfunction a()\n{ console.log(c) }'])
    const table = this.doc.schemas.createSnapshot('table', [6, 6])
    const attachment = this.doc.schemas.createSnapshot('attachment', [{
      url: 'https://raw.githubusercontent.com/toeverything/blocksuite/master/assets/logo-and-name-h.svg',
      name: 'template.zip',
      type: 'zip',
      size: 553409,
    }])
    const figma = this.doc.schemas.createSnapshot('figma-embed', ['https://www.figma.com/design/zaZvxd72WGI6jKitm2IL6g/%E5%AE%9A%E7%A8%BF2?node-id=755-15316&p=f&t=U9xZyjY1GwAjzTXy-0'])

    this.pid = p.id
    const snapshot = this.doc.schemas.createSnapshot('root',
      [this.rootId, [p, d1, p2, callout, d2, attachment, d3, p3, img, code, table, todo]])
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

  onDragStart(evt: DragEvent, flavour: string) {
    this.doc.dndService.startDrag(evt, DocDndDataTypes.newBlock, flavour)
  }

  exportPdf() {
    new DocExportManager(this.doc).exportToPdf('blockcraft-export-test.pdf', {bgcolor: '#fff', scale: 1, pdfPageSize: 'A2'})
  }

  exportImg() {
    new DocExportManager(this.doc).exportToJpeg('blockcraft-export-test.png',{bgcolor: '#fff', scale: 2.0})
  }

  ast() {
    const treeWalker = document.createTreeWalker(this.doc.root.hostElement, NodeFilter.SHOW_ELEMENT, (node) => {
      return (node instanceof HTMLElement && node.getAttribute('data-block-id')) ? NodeFilter.SHOW_ELEMENT : NodeFilter.FILTER_REJECT
    })
    console.log(treeWalker)
    treeWalker.nextNode()
    console.log(treeWalker)
  }
}
