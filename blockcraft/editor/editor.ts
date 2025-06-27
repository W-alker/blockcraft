import {Component, Injector, ViewChild, ViewContainerRef} from "@angular/core";
import {
  BLOCK_CREATOR_SERVICE_TOKEN,
  BlockCraftDoc,
  BlockNodeType, ClipboardDataType, DeltaInsert,
  DOC_ADAPTER_SERVICE_TOKEN,
  DOC_FILE_SERVICE_TOKEN,
  DOC_LINK_PREVIEWER_SERVICE_TOKEN,
  DOC_MESSAGE_SERVICE_TOKEN,
  DocLinkPreviewerService,
  EditableBlockComponent, EmbedConverter, generateId, IBlockSelectionJSON, IBlockSnapshot, InlineManager,
  native2YBlock,
  SchemaManager, Y_BLOCK_MAP_NAME
} from "../framework";
import {
  AttachmentBlockSchema,
  BookmarkBlockSchema,
  CalloutBlockSchema,
  CaptionBlockSchema,
  CodeBlockSchema,
  DividerBlockSchema,
  FigmaEmbedBlockSchema,
  ImageBlockSchema,
  JuejinEmbedBlockSchema,
  OrderedBlockSchema,
  ParagraphBlockSchema,
  RootBlockSchema,
  TableBlockSchema,
  TableCellBlockSchema,
  TableRowBlockSchema,
  TodoBlockSchema
} from "../blocks";
import {ConsoleLogger, getRandomDarkColor, randomColor, throttle} from "../global";
import {BulletBlockSchema} from "../blocks/bullet-block";
import {FloatTextToolbarPlugin} from "../plugins/float-text-toolbar/rich-text-toolbar";
import {BlockTransformerPlugin} from "../plugins/block-transformer";
import {BlockControllerPlugin} from "../plugins/block-controller";
import {ImgToolbarPlugin} from "../plugins/img-toolbar";
import {MyDocFileService} from "./services/doc-file-service";
import {MyDocMessageService} from "./services/doc-message.service";
import {CalloutToolbarPlugin} from "../plugins/callout-toolbar";
import {AttachmentExtensionPlugin} from "../plugins/attachment-extension";
import {MyBlockCreatorService} from "./services/block-creator.service";
import {EmbedFrameExtensionPlugin} from "../plugins/embed-frame-extension";
import {BookmarkBlockExtensionPlugin} from "../plugins/bookmark-frame-extension";
import {InlineLinkExtension} from "../plugins/inline-link-extension";
import {MatIcon} from "@angular/material/icon";
import {DocDndDataTypes} from "../framework/services/dnd.service";
import {DocExportManager} from "../tools";
import {EditorCommentPad} from "./components/comment-pad";
import {MyCommentService} from "./services/comment.service";
import {AdapterService} from "./services/adapter.service";
import {MermaidBlockSchema, MermaidTextareaBlockSchema} from "../blocks/mermaid-block";
import {applyUpdate, Doc, mergeUpdates} from "yjs";
import {BlockquoteBlockSchema} from "../blocks/blockquote-block";
import {WebsocketProvider} from 'y-websocket'
import {MentionPlugin} from "./plugins/mention";
import * as Y from 'yjs'
import {BlockCraftAwareness} from "./awa";
import {IndexeddbPersistence} from "y-indexeddb";
import {DividerExtensionPlugin} from "../plugins/divider-toolbar";
import {DividerStylePopupComponent} from "../plugins/divider-toolbar/widgets/divider-style-popup.component";
import {CodeInlineEditorBinding, TableBlockBinding, TextMarkerPlugin, OrderedBlockPlugin} from "../plugins";

const mentionRequest = async (keyword: string) => {
  if (keyword === 'a') {
    return {
      list: []
    }
  }
  const len = Math.floor(Math.random() * 10)
  const list = Array.from({length: len}).map(() => ({
    id: generateId(),
    name: keyword + Math.floor(Math.random() * 10000).toString().slice(0, 4)
  }))

  return {
    list
  }
}

const schemas = new SchemaManager([
  ParagraphBlockSchema,
  OrderedBlockSchema, BulletBlockSchema, TodoBlockSchema, CalloutBlockSchema, CodeBlockSchema,
  CalloutBlockSchema,
  DividerBlockSchema, ImageBlockSchema,
  TableBlockSchema, TableRowBlockSchema, TableCellBlockSchema, AttachmentBlockSchema, BookmarkBlockSchema,
  FigmaEmbedBlockSchema, JuejinEmbedBlockSchema,
  CaptionBlockSchema, RootBlockSchema,
  MermaidTextareaBlockSchema, MermaidBlockSchema, BlockquoteBlockSchema
])

export const OLD_LINK_EMBED_CONVERTER: EmbedConverter = {
  toView: (embed) => {
    const a = document.createElement('a');
    a.textContent = embed.insert['link'] as string;
    a.target = '_blank';
    a.href = embed.attributes?.['d:href'] as string;
    return a;
  },
  toDelta: (ele) => {
    return {
      insert: {link: ele.textContent!},
      attributes: InlineManager.getAttrs(ele)
    };
  }
};

@Component({
  selector: 'block-craft-editor',
  template: `
    <div style="width: 90vw; height: 80vh; overflow-y: auto; padding: 30px;" (mousedown)="onContainerMousedown($event)">
      <ng-container #container></ng-container>
    </div>


    <button (click)="initBySnapshot()">初始化</button>
    <button (mousedown)="$event.preventDefault(); logSelection()">当前选择</button>
    <button (click)="insert()">增加文本</button>
    <button (click)="doc.toggleReadonly(!doc.isReadonly)">切换只读</button>
    <button (click)="log()">打印数据</button>
    <button (click)="undo()">undo</button>
    <button (click)="redo()">redo</button>
    <button (click)="addData()">增加数据</button>
    <button (click)="exportPdf()">导出PDF</button>
    <button (click)="exportImg()">导出图片</button>

    <button (click)="importHTML()">从HTML导入</button>
    <button (click)="importMarkdown()">从Markdown导入</button>
    <button (click)="exportMd()">导出Markdown</button>

    <button (click)="listenUpdate()">监听数据变化</button>
    <button (click)="test()">测试</button>

    <button (click)="enterRoom()">进入协同</button>
    <button (click)="quitRoom()">退出协同</button>

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

      > i {
        display: flex;
        justify-content: center;
        align-items: center;
        font-size: inherit;
      }
    }
  }
  `],
  imports: [
    MatIcon,
    DividerStylePopupComponent
  ],
  standalone: true,
  providers: [
    {provide: DOC_FILE_SERVICE_TOKEN, useClass: MyDocFileService},
    {provide: DOC_MESSAGE_SERVICE_TOKEN, useClass: MyDocMessageService},
    {provide: BLOCK_CREATOR_SERVICE_TOKEN, useClass: MyBlockCreatorService},
    {provide: DOC_LINK_PREVIEWER_SERVICE_TOKEN, useClass: DocLinkPreviewerService},
    {provide: DOC_ADAPTER_SERVICE_TOKEN, useClass: AdapterService},
    ConsoleLogger,
    MyCommentService
  ]
})
export class EditorComponent {
  @ViewChild('container', {static: true, read: ViewContainerRef}) container!: ViewContainerRef

  constructor(
    private injector: Injector,
    private logger: ConsoleLogger
  ) {
  }

  docId = 'our-doc'
  rootId = 'root-test'

  doc = new BlockCraftDoc({
    yDoc: new Y.Doc({
      guid: this.docId
    }),
    docId: this.docId,
    schemas: schemas,
    logger: this.logger,
    injector: this.injector,
    embeds: [
      [
        'mention',
        {
          toView: (embed) => {
            const span = document.createElement('span')
            span.textContent = embed.insert['mention'] as string
            InlineManager.setAttrs(span, embed.attributes!)
            return span
          },
          toDelta: (ele) => {
            return {
              insert: {mention: ele.textContent!},
              attributes: InlineManager.getAttrs(ele)
            }
          }
        }
      ],
      [
        'link', OLD_LINK_EMBED_CONVERTER
      ]
    ],
    plugins: [new OrderedBlockPlugin(), new CodeInlineEditorBinding(), new TextMarkerPlugin(['mermaid-textarea']),
      new FloatTextToolbarPlugin(), new BlockTransformerPlugin(),
      new BlockControllerPlugin(
        [
          {
            type: 'tool',
            name: 'copyBlockLink',
            value: true,
            icon: 'bc_fuzhilianjie',
            label: '复制段落链接',
          },
        ],
        (item, block, doc) => {
          switch (item.name) {
            case 'copyBlockLink':
              this.copyBlockLink(block)
              return true
          }
          return false
        }
      ),
      new TableBlockBinding(),
      new ImgToolbarPlugin(), new CalloutToolbarPlugin(), new AttachmentExtensionPlugin(),
      new EmbedFrameExtensionPlugin(), new BookmarkBlockExtensionPlugin(),
      new InlineLinkExtension((link) => {
        if (link.startsWith('http://doc-pre.com')) {
          window.open(link.replace('http://doc-pre.com', 'http://localhost:8081/test3'), '_blank')
        }
      }),
      new MentionPlugin(mentionRequest), new DividerExtensionPlugin()
    ]
  })

  pid = ''

  copyBlockLink(block: BlockCraft.BlockComponent) {
    const url = 'http://doc-pre.com' + '?blockId=' + block.id
    this.doc.clipboard.copyText(url).then(() => {
      this.doc.messageService.success('已复制链接')
    })
  }

  ngAfterViewInit() {
    this.listenUpdate()
  }

  initBySnapshot(snapshot?: IBlockSnapshot) {
    snapshot ??= this.doc.schemas.createSnapshot('root', [this.rootId])
    this.doc.initBySnapshot(snapshot, this.container)
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

  appendParagraph() {
    if (this.doc.root.lastChildren?.flavour === 'paragraph') {
      this.doc.selection.setCursorAtBlock(this.doc.root.lastChildren, false)
      return
    }
    this.doc.crud.insertNewParagraph(this.doc.rootId, this.doc.root.childrenLength, '').then(p => {
      this.doc.selection.setCursorAtBlock(p, true)
    })
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
    new DocExportManager(this.doc).exportToPdf('blockcraft-export-test.pdf', {
      bgcolor: '#fff',
      scale: 1,
      pdfPageSize: 'A2',
      paging: true
    })
  }

  exportImg() {
    new DocExportManager(this.doc).exportToJpeg('blockcraft-export-test.png', {bgcolor: '#fff', scale: 2.0})
  }

  onContainerMousedown(evt: MouseEvent) {
    if (evt.target === evt.currentTarget && evt.eventPhase === evt.AT_TARGET) {
      evt.preventDefault()
      evt.stopPropagation()
      this.appendParagraph()
    }
  }

  test() {
    const m = mergeUpdates(this.updateList)
    console.log(this.updateList, m)
    const ydoc = new Doc()
    const ymap = ydoc.getMap()
    // ymap.set(this.rootId, native2YBlock({
    //   id: this.rootId,
    //   flavour: 'root',
    //   nodeType: BlockNodeType.root,
    //   props: {},
    //   meta: {},
    //   children: []
    // }))
    applyUpdate(ydoc, m)
    applyUpdate(ydoc, this.updateList[0])
    this.updateList.forEach(u => {
      applyUpdate(ydoc, u)
    })
    console.log(ydoc.toJSON())
  }

  updateList: Uint8Array[] = []

  listenUpdate() {
    this.doc.crud.yDoc.on('update', (u: Uint8Array, _: any) => {
      this.updateList.push(u)
    })
  }

  provider!: WebsocketProvider

  enterRoom() {
    const persistence = new IndexeddbPersistence(this.rootId, this.doc.yDoc)
    persistence.once('synced', () => {
      const yRoot = this.doc.yBlockMap.get(this.rootId)
      if (yRoot) {
        this.doc.initByYBlock(yRoot, this.container)
      }


      this.provider = new WebsocketProvider('ws://196.168.1.69:1234', this.rootId, this.doc.yDoc, {
        disableBc: true
      })
      this.provider.on('sync', (v: boolean) => {
        const yRoot = this.doc.yBlockMap.get(this.rootId)
        console.log('sync', v, yRoot)
        if (!yRoot) {
          this.initBySnapshot()
        } else {
          this.doc.initByYBlock(yRoot, this.container)
        }
      })


    })

    const uid = generateId(11)
    const awa = new BlockCraftAwareness(this.doc, this.provider.awareness)
    awa.setLocalUser({
      id: uid,
      name: uid,
    })

  }

  quitRoom() {
    this.provider.destroy()
  }

  async importMarkdown() {
    const files = await this.injector.get(DOC_FILE_SERVICE_TOKEN).inputFiles('.md', false)
    if (!files?.length) return
    const file = files[0]
    const text = await file.text()
    const mdAdapter = this.injector.get(DOC_ADAPTER_SERVICE_TOKEN).getAdapter(ClipboardDataType.RTF)
    if (!mdAdapter) return
    const snapshot = await mdAdapter.toSnapshot(text)
    if (!snapshot) return
    this.doc.crud.insertBlocks(this.doc.rootId, 0, snapshot.children as IBlockSnapshot[])
  }

  exportMd() {
    new DocExportManager(this.doc).exportToMarkdown('blockcraft-export-test.md')
  }

  async importHTML() {
    const files = await this.injector.get(DOC_FILE_SERVICE_TOKEN).inputFiles('.html', false)
    if (!files?.length) return
    const file = files[0]
    const text = await file.text()
    const mdAdapter = this.injector.get(DOC_ADAPTER_SERVICE_TOKEN).getAdapter(ClipboardDataType.HTML)
    if (!mdAdapter) return
    const snapshot = await mdAdapter.toSnapshot(text)
    if (!snapshot) return
    this.doc.crud.insertBlocks(this.doc.rootId, 0, snapshot.children as IBlockSnapshot[])
  }
}
