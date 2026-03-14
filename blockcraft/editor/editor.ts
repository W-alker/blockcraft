import {Component, ElementRef, Injector, ViewChild, ViewContainerRef} from "@angular/core";
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
  ColumnsBlockSchema,
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
import {ConsoleLogger, getRandomDarkColor, nextTick, randomColor, throttle} from "../global";
import {BulletBlockSchema} from "../blocks/bullet-block";
import {FormulaBlockSchema} from "../blocks/formula-block";
import {FixedTextToolbarComponent} from "../plugins/fixed-toolbar";
import {BlockTransformerPlugin} from "../plugins/block-transformer";
import {BlockControllerPlugin, mergeBlockControllerOptions} from "../plugins/block-controller";
import {ImgToolbarPlugin} from "../plugins/img-toolbar";
import {MyDocFileService} from "./services/doc-file-service";
import {MyDocMessageService} from "./services/doc-message.service";
import {CalloutToolbarPlugin} from "../plugins/callout-toolbar";
import {AttachmentExtensionPlugin} from "../plugins/attachment-extension";
import {MyBlockCreatorService} from "./services/block-creator.service";
import {EmbedFrameExtensionPlugin} from "../plugins/embed-frame-extension";
import {BookmarkBlockExtensionPlugin} from "../plugins/bookmark-frame-extension";
import {FormulaBlockExtensionPlugin} from "../plugins/formula-extension";
import {InlineLinkExtension} from "../plugins/inline-link-extension";
import {MatIcon} from "@angular/material/icon";
import {DocDndDataTypes} from "../framework/services/dnd.service";
import {DocExportManager} from "../tools";
import {MyCommentService} from "./services/comment.service";
import {AdapterService} from "./services/adapter.service";
import {MermaidBlockSchema, MermaidTextareaBlockSchema} from "../blocks/mermaid-block";
import {applyUpdate, Doc, mergeUpdates} from "yjs";
import {BlockquoteBlockSchema} from "../blocks/blockquote-block";
// @ts-ignore
import {WebsocketProvider} from './ws'
import katex from 'katex'
import {MentionPlugin} from "./plugins/mention";
import * as Y from 'yjs'
import {BlockCraftAwareness} from "./awa";
import {IndexeddbPersistence} from "y-indexeddb";
import {DividerExtensionPlugin} from "../plugins/divider-toolbar";
import {DividerStylePopupComponent} from "../plugins/divider-toolbar/widgets/divider-style-popup.component";
import {
  CodeInlineEditorBinding,
  FloatTextToolbarPlugin,
  TableBlockBinding,
  TextMarkerPlugin,
  OrderedBlockPlugin,
  PresentationController
} from "../plugins";
import {FindReplacePlugin} from "../plugins/findReplace/findReplace";
import {debugTableMerge, fixTable} from "../blocks/table-block/callback";
import {ColumnBlockSchema} from "../blocks/columns-block";
import {demoJSON} from "./demo.data";
import {DemoPresentationPlugin} from "../plugins/demo-presentation";
import {TranslatePlugin} from "../plugins/translate";
import {MyDocTranslationService} from "./services/doc-translation.service";
import {MarkdownStreamRenderer} from "./markdown-stream-renderer";

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
  MermaidTextareaBlockSchema, MermaidBlockSchema, BlockquoteBlockSchema,
  ColumnsBlockSchema, ColumnBlockSchema,
  FormulaBlockSchema
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
    <bc-fixed-toolbar [doc]="doc" [stickyTop]="0"></bc-fixed-toolbar>

    <div style="padding: 60px; max-width: 90vw; height: 80vh; overflow-x: hidden; overflow-y: auto;" #container
         (mousedown)="onContainerMousedown($event)">
    </div>

    <button (click)="initBySnapshot()">初始化</button>
    <button (click)="toggleDark()">黑夜模式</button>
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
    <button (click)="startMarkdownStreamTest()">测试Markdown流</button>
    <button (click)="logTable()">打印表格情况</button>
    <button (click)="fixTable()">修复表格</button>

    <button (click)="enterRoom()">进入协同</button>
    <button (click)="quitRoom()">退出协同</button>

    <button (click)="startDemo()">演示模式</button>
  `,
  styles: [`:host {
    margin: 20px;
    display: block;
    overflow-y: auto;
    height: 90vh;
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

  ::ng-deep {
    [data-blockcraft-root="true"] {

      span[data-mention-id] {
        padding: 0 .15em;
        color: #4857E2;
        cursor: pointer;
        white-space: pre-wrap;
        word-break: break-all;

        &[data-mention-type="user"] {
          &::before {
            content: '@';
          }
        }

        &[data-mention-type="doc"] {
          &::before {
            content: "\\e6c8";
            font-family: "bc_icon" !important;
            font-size: 1em;
            font-style: normal;
          }
        }

        &:hover {
          background-color: rgba(72, 87, 226, 0.1);
          border-radius: 4px;
          text-decoration: underline;
        }
      }

    }

  }
  `],
  imports: [
    MatIcon,
    DividerStylePopupComponent,
    FixedTextToolbarComponent
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

  @ViewChild('container', {read: ElementRef}) container!: ElementRef;

  constructor(
    private injector: Injector,
    private logger: ConsoleLogger
  ) {
  }

  private _markdownStreamRenderer?: MarkdownStreamRenderer;
  private _markdownTestTimer: number | null = null;

  docId = '689ac2b31a9abe3ae8a6788d'
  rootId = '689ac2b31a9abe3ae8a6788d'

  private readonly translatePlugin = new TranslatePlugin({
    sourceLang: 'auto',
    defaultTargetLang: 'chinese_simplified',
    targetLangWhenSourceIsChinese: 'english',
    service: new MyDocTranslationService(),
  })

  private readonly blockControllerPlugin = new BlockControllerPlugin(
    mergeBlockControllerOptions(
      {
        customTools: [
          {
            type: 'tool',
            name: 'copyBlockLink',
            value: true,
            icon: 'bc_fuzhilianjie',
            label: '复制段落链接',
          },
        ],
        customToolHandler: (item, block) => {
          switch (item.name) {
            case 'copyBlockLink':
              this.copyBlockLink(block)
              return true
          }
          return false
        }
      },
      this.translatePlugin.createBlockControllerOptions()
    )
  )

  doc = new BlockCraftDoc({
    yDoc: new Y.Doc({
      guid: this.docId,
      gc: false,
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
            // InlineManager.setAttrs(span, embed.attributes!)
            span.setAttribute('data-mention-id', (embed.attributes!['mentionId'] || embed.attributes!['d:mentionId']) as string)
            span.setAttribute('data-mention-type', (embed.attributes!['mentionType'] || embed.attributes!['d:mentionType']) as string)
            return span
          },
          toDelta: (ele) => {
            return {
              insert: {mention: ele.textContent!},
              attributes: {
                'mentionId': ele.getAttribute('data-mention-id')!,
                'mentionType': ele.getAttribute('data-mention-type')
              }
            }
          }
        }
      ],
      [
        'link', OLD_LINK_EMBED_CONVERTER
      ],
      [
        'latex', {
        toView: (embed) => {
          const span = document.createElement('span')
          span.classList.add('inline-formula')
          const latex = (embed.insert['latex'] || '') as string
          span.setAttribute('data-latex', latex)
          try {
            katex.render(latex, span, {output: 'mathml', throwOnError: false})
          } catch {
            span.textContent = latex
          }
          return span
        },
        toDelta: (ele) => {
          return {
            insert: {latex: ele.getAttribute('data-latex') || ele.textContent || ''},
            attributes: InlineManager.getAttrs(ele)
          }
        }
      }
      ],
    ],
    plugins: [new OrderedBlockPlugin(), new CodeInlineEditorBinding(),
      new FloatTextToolbarPlugin(),
      new BlockTransformerPlugin(),
      this.blockControllerPlugin,
      new TableBlockBinding(),
      new ImgToolbarPlugin(), new CalloutToolbarPlugin(), new AttachmentExtensionPlugin(),
      new EmbedFrameExtensionPlugin(), new BookmarkBlockExtensionPlugin(),
      new FormulaBlockExtensionPlugin(),
      new InlineLinkExtension((link) => {
        if (link.startsWith('http://doc-pre.com')) {
          window.open(link.replace('http://doc-pre.com', 'http://localhost:8081/test3'), '_blank')
        } else window.open(link, '_blank')
      }),
      new MentionPlugin(mentionRequest), new DividerExtensionPlugin(),
      new FindReplacePlugin(),
      this.translatePlugin
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
    // this.enterRoom()

    this.listenUpdate()
    this.doc.event.add('selectStart', e => {
      console.log('selectStart', e)
    })
    this.doc.event.add('selectEnd', e => {
      console.log('selectEnd', e)
    })
    this.doc.event.add('selectionChange', e => {
      console.log('selectionChange', e)
    })
  }

  ngOnDestroy() {
    this.stopMarkdownStreamTest()
    this._markdownStreamRenderer?.destroy()
  }

  get markdownStreamValue() {
    return this.markdownStreamRenderer.value
  }

  async renderMarkdown(markdown: string) {
    this.ensureMarkdownRenderReady()
    await this.markdownStreamRenderer.replace(markdown, {
      immediate: true
    })
  }

  appendMarkdownChunk(chunk: string) {
    this.ensureMarkdownRenderReady()
    return this.markdownStreamRenderer.append(chunk)
  }

  flushMarkdownStream() {
    this.ensureMarkdownRenderReady()
    return this.markdownStreamRenderer.flush()
  }

  clearMarkdownStream() {
    this.ensureMarkdownRenderReady()
    return this.markdownStreamRenderer.clear({
      immediate: true
    })
  }

  initBySnapshot(snapshot?: IBlockSnapshot) {
    const data = demoJSON as IBlockSnapshot
    // snapshot ??= this.doc.schemas.createSnapshot('root', [this.rootId, [this.doc.schemas.createSnapshot('paragraph', [])]])
    this.doc.initBySnapshot(data, this.container.nativeElement)
  }

  log() {
    // @ts-ignore
    console.log(this.doc.crud.yBlockMap.toJSON(), this.doc.vm.store)
    console.log(this.doc.exportSnapshot())
  }

  undo() {
    this.doc.crud.undoManager.undo()
  }

  redo() {
    this.doc.crud.undoManager.redo()
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
    const paragraph = this.doc.schemas.createSnapshot('paragraph', [''])
    void this.doc.chain()
      .insertSnapshots(this.doc.rootId, this.doc.root.childrenLength, [paragraph])
      .setCursorAtBlock(paragraph.id, true)
      .run()
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

  onDragStart(evt: DragEvent, flavour: string, props?: any) {
    this.doc.dndService.startDrag(evt, [{
      dragDataType: DocDndDataTypes.newBlock,
      dragData: flavour
    }, {dragDataType: DocDndDataTypes.newBlockProps, dragData: props ? JSON.stringify(props) : ''}])
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
    // --------------------------
    // 1. 创建文档并写入数据
    // --------------------------
    const doc = new Y.Doc({
      gc: false
    });
    const text = doc.getText('t');
    text.insert(0, 'Hello');

    // 做一个 snapshot
    const snapshot = Y.snapshot(doc);

    // 再写点新内容（干扰用）
    text.insert(5, ' World');

    // --------------------------
    // 2. 保存“完整更新”（模拟你存 DB）
    // --------------------------
    const fullUpdate = Y.encodeStateAsUpdate(doc);

    // --------------------------
    // 3. 恢复：重新创建 ydoc
    // --------------------------
    const restoredBase = new Y.Doc({
      gc: false
    });
    Y.applyUpdate(restoredBase, fullUpdate);

    // 根据 snapshot 截取当时的文档状态
    const restoredSnapshotDoc = Y.createDocFromSnapshot(restoredBase, snapshot);

    // --------------------------
    // 4. 验证内容
    // --------------------------
    console.log('当前文档完整内容:', doc.getText('t').toString());
    console.log(
      '从 snapshot 恢复内容:',
      restoredSnapshotDoc.getText('t').toString()
    );

    // --------------------------
    // 应有输出：
    // 当前文档完整内容: Hello World
    // 从 snapshot 恢复内容: Hello
    // --------------------------
  }

  startMarkdownStreamTest() {
    this.stopMarkdownStreamTest()
    void this.clearMarkdownStream()

    const markdown = `# BlockCraft Markdown Stream Test

这是第一段，模拟 AI 持续输出内容。

## 列表
- 第一项
- 第二项
- 第三项

## 任务列表
- [x] 已完成事项
- [ ] 待处理事项

## 嵌套列表
1. 第一层
   1. 第二层 A
   2. 第二层 B
2. 另一项

## 代码块

\`\`\`ts
const message = "hello blockcraft";
console.log(message);
\`\`\`

## 表格

| 功能 | 状态 | 说明 |
| --- | --- | --- |
| Markdown 流 | 已接入 | 逐块写入 |
| Diff 渲染 | 已接入 | 块级与文本级 |
| 表格 | 测试中 | 覆盖 GFM table |

## 引用
> 差异渲染应该只更新变化的部分。

---

## 公式

$$
E = mc^2
$$

最后一段：**加粗**、\`inline code\`、以及普通文本。
`
    const chunkSize = 4
    const chars = Array.from(markdown)
    const chunks = Array.from(
      {length: Math.ceil(chars.length / chunkSize)},
      (_, index) => chars.slice(index * chunkSize, (index + 1) * chunkSize).join('')
    )

    let cursor = 0
    const tick = () => {
      if (cursor >= chunks.length) {
        this._markdownTestTimer = null
        void this.flushMarkdownStream()
        return
      }

      void this.appendMarkdownChunk(chunks[cursor]!)
      cursor += 1
      this._markdownTestTimer = window.setTimeout(tick, 90)
    }

    tick()
  }

  private stopMarkdownStreamTest() {
    if (this._markdownTestTimer === null) {
      return
    }

    clearTimeout(this._markdownTestTimer)
    this._markdownTestTimer = null
  }

  updateList: Uint8Array[] = []

  listenUpdate() {
    this.doc.crud.yDoc.on('update', (u: Uint8Array, _: any) => {
      this.updateList.push(u)
    })
  }

  provider!: WebsocketProvider

  enterRoom() {
    // const persistence = new IndexeddbPersistence(this.rootId, this.doc.yDoc)
    // persistence.once('synced', () => {
    //   const yRoot = this.doc.yBlockMap.get(this.rootId)
    //   if (yRoot) {
    //     this.doc.initByYBlock(yRoot, this.container)
    //   }

    const initFn = () => {
      console.log('initFn', this.doc.yBlockMap)
      const yRoot = this.doc.yBlockMap?.get(this.docId)
      if (yRoot) {
        this.doc.initByYBlock(yRoot, this.container.nativeElement)
        this.doc.yDoc.off('update', initFn)
        console.log('-------', this.doc.yBlockMap.toJSON())
        // let map = new Map()
        // const childrenIds = new Set<string>()
        // this.doc.yBlockMap.forEach((v, k) => {
        //   map.set(k, v)
        //   if (v.get('nodeType') !== BlockNodeType.editable) {
        //     v.get('children').forEach(id => {
        //       childrenIds.add(id)
        //     })
        //   }
        // })
        //
        // const rootLevelBlock = [...map.values()].filter(v => {
        //   return !childrenIds.has(v.get('id')) && (v.get('id') !== this.rootId)
        // })
        // const yRootChildren = this.doc.yBlockMap.get(this.rootId)!.get('children')
        // yRootChildren.delete(0, yRootChildren.length)
        // yRootChildren.insert(0, rootLevelBlock.map(v => v.get('id')))
      }


    }

    this.doc.yDoc.on('update', initFn)

    this.provider = new WebsocketProvider(
      // 'ws://localhost:1234',
      'ws://196.168.1.153:1234',
      // 'ws://ws-doc.cses7.com',
      // 'ws://ws-doc-pre.cses7.com',
      // 'ws://193.168.2.100:30204/collaborate',
      this.docId,
      this.doc.yDoc, {
        disableBc: false
      })

    const uid = generateId(11)
    const awa = new BlockCraftAwareness(this.doc, this.provider.awareness)
    awa.setLocalUser({
      id: uid,
      name: uid,
    })

    // })

  }


  quitRoom() {
    this.provider.destroy()
  }

  async importMarkdown() {
    const files = await this.injector.get(DOC_FILE_SERVICE_TOKEN).inputFiles('.md', false)
    if (!files?.length) return
    const file = files[0]
    const text = await file.text()
    await this.renderMarkdown(text)
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

  fixTable() {
    const curTable = this.doc.selection.value?.from.block.hostElement.closest('.table-block')
    const id = curTable?.getAttribute('data-block-id')
    if (id) {
      const table = this.doc.getBlockById(id)!
      fixTable.call(table as any)
      // const b2 = this.doc.getBlockById('vmgZeYkw0IjG9VQxEt')
      // fixTable.call(table as any)
    }
  }

  logTable() {
    const curTable = this.doc.selection.value?.from.block.hostElement.closest('.table-block')
    const id = curTable?.getAttribute('data-block-id')
    if (id) {
      const table = this.doc.getBlockById(id)!
      debugTableMerge.call(table as any)
      // const b2 = this.doc.getBlockById('vmgZeYkw0IjG9VQxEt')
      // fixTable.call(table as any)
    }
  }

  toggleDark() {
    this.doc.toggleTheme(this.doc.theme === 'dark' ? 'light' : 'dark')
    document.body.style.backgroundColor = 'var(--bc-bg-primary)'
  }

  private get markdownStreamRenderer() {
    const adapter = this.injector
      .get(DOC_ADAPTER_SERVICE_TOKEN)
      .getAdapter(ClipboardDataType.RTF)

    if (!adapter) {
      throw new Error('Markdown adapter is not registered.')
    }

    return this._markdownStreamRenderer ??= new MarkdownStreamRenderer(this.doc, adapter)
  }

  private ensureMarkdownRenderReady() {
    if (!this.container?.nativeElement) {
      throw new Error('Editor container is not ready yet.')
    }

    if (!this.doc.isInitialized) {
      const rootSnapshot = this.doc.schemas.createSnapshot('root', [
        this.rootId,
        [this.doc.schemas.createSnapshot('paragraph', [])]
      ])
      this.doc.initBySnapshot(rootSnapshot, this.container.nativeElement)
    }
  }

  private _demoController: PresentationController | null = null

  startDemo(doc: BlockCraft.Doc = this.doc) {
    if (this._demoController) {
      this._demoController.destroy();
      this._demoController = null;
    }
    this._demoController ??= new PresentationController(doc, {
      cover: {
        banner: {
          url: 'https://picsum.photos/1920/1080?random'
        },
        author: {
          name: 'Demo Author',
          avatar: 'https://picsum.photos/200/300?random',
          info: 'Demo Author Description'
        },
        title: 'Demo Presentation'
      }
    });
    this._demoController.start();
  }
}
