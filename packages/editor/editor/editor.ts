import {Component, ElementRef, Injector, Input, OnDestroy, ViewChild, signal} from "@angular/core";
import {
  BLOCK_CREATOR_SERVICE_TOKEN,
  BlockCraftDoc,
  DOC_ADAPTER_SERVICE_TOKEN,
  DOC_FILE_SERVICE_TOKEN,
  DOC_LINK_PREVIEWER_SERVICE_TOKEN,
  DOC_MESSAGE_SERVICE_TOKEN,
  DocLinkPreviewerService,
  EmbedConverter,
  InlineManager,
  SchemaManager,
  generateId
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
import {ConsoleLogger} from "../global";
import {BulletBlockSchema} from "../blocks/bullet-block";
import {FormulaBlockSchema} from "../blocks/formula-block";
import {FixedTextToolbarComponent, IFixedToolbarExtensionActionContext} from "../plugins/fixed-toolbar";
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
import {MyCommentService} from "./services/comment.service";
import {AdapterService} from "./services/adapter.service";
import {MermaidBlockSchema, MermaidTextareaBlockSchema} from "../blocks/mermaid-block";
import {BlockquoteBlockSchema} from "../blocks/blockquote-block";
import katex from 'katex'
import {MentionPlugin} from "./plugins/mention";
import * as Y from 'yjs'
import {DividerExtensionPlugin} from "../plugins/divider-toolbar";
import {
  CodeInlineEditorBinding,
  FloatTextToolbarPlugin,
  TableBlockBinding,
  OrderedBlockPlugin
} from "../plugins";
import {FindReplacePlugin} from "../plugins/findReplace/findReplace";
import {ColumnBlockSchema} from "../blocks/columns-block";
import {TranslatePlugin} from "../plugins/translate";
import {MyDocTranslationService} from "./services/doc-translation.service";
import {VoiceTranscriptionPlugin} from "../plugins/voice-transcription";
import {resolveSpeechTranscriptionService} from "./services/speech-transcription.service";
import {Subscription} from "rxjs";

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
    <section class="editor-shell">
      <bc-fixed-toolbar
        [doc]="doc"
        [stickyTop]="stickyTop"
        [extensionActions]="voiceToolbarActions()"
        (extensionAction)="onToolbarExtensionAction($event)"></bc-fixed-toolbar>

      <div class="editor-container" #container (mousedown)="onContainerMousedown($event)"></div>
    </section>
  `,
  styles: [`:host {
    display: block;
    min-width: 0;
  }

  .editor-shell {
    position: relative;
  }

  .editor-container {
    min-height: min(78vh, 960px);
    max-height: min(78vh, 960px);
    overflow-x: hidden;
    overflow-y: auto;
    padding: 48px 56px 64px;
    border-radius: 24px;
    color: var(--bc-color);
    border: 1px solid var(--bc-border-color-light);
    background:
      linear-gradient(180deg, var(--bc-bg-elevated), var(--bc-bg-primary));
    box-shadow: var(--bc-shadow-lg);
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
export class EditorComponent implements OnDestroy {

  @ViewChild('container', {read: ElementRef}) container!: ElementRef;
  @Input() stickyTop = 0;
  readonly voiceToolbarActions = signal<ReturnType<VoiceTranscriptionPlugin['createToolbarActions']>>([])
  private readonly sub = new Subscription()

  constructor(
    private injector: Injector,
    private logger: ConsoleLogger
  ) {
    this.voiceToolbarActions.set(this.voiceTranscriptionPlugin.createToolbarActions())
    this.sub.add(this.voiceTranscriptionPlugin.state$.subscribe(() => {
      this.voiceToolbarActions.set(this.voiceTranscriptionPlugin.createToolbarActions())
    }))
  }

  docId = '689ac2b31a9abe3ae8a6788d'
  rootId = '689ac2b31a9abe3ae8a6788d'

  private readonly translatePlugin = new TranslatePlugin({
    sourceLang: 'auto',
    defaultTargetLang: 'chinese_simplified',
    targetLangWhenSourceIsChinese: 'chinese_simplified',
    service: new MyDocTranslationService(),
  })

  private readonly voiceTranscriptionPlugin = new VoiceTranscriptionPlugin({
    service: resolveSpeechTranscriptionService(this.injector)
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
      this.translatePlugin,
      this.voiceTranscriptionPlugin
    ]
  })

  ngOnDestroy() {
    this.sub.unsubscribe()
  }

  onToolbarExtensionAction(context: IFixedToolbarExtensionActionContext) {
    void this.voiceTranscriptionPlugin.handleToolbarAction(context)
  }

  copyBlockLink(block: BlockCraft.BlockComponent) {
    const url = 'http://doc-pre.com' + '?blockId=' + block.id
    this.doc.clipboard.copyText(url).then(() => {
      this.doc.messageService.success('已复制链接')
    })
  }

  onContainerMousedown(evt: MouseEvent) {
    if (evt.target === evt.currentTarget && evt.eventPhase === evt.AT_TARGET) {
      evt.preventDefault()
      evt.stopPropagation()
      this.appendParagraph()
    }
  }

  private appendParagraph() {
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
}
