import {Component, ElementRef, Injector, Input, OnDestroy, OnInit, ViewChild} from "@angular/core";
import {
  BLOCK_CREATOR_SERVICE_TOKEN,
  BlockCraftDoc,
  DOC_ADAPTER_SERVICE_TOKEN,
  DOC_FILE_SERVICE_TOKEN,
  DOC_LINK_PREVIEWER_SERVICE_TOKEN,
  DOC_MESSAGE_SERVICE_TOKEN,
  DocLinkPreviewerService,
  generateId,
  PaginationDocumentHeaderOptions
} from "../framework";
import {ConsoleLogger} from "../global";
import {FixedTextToolbarComponent} from "../plugins/fixed-toolbar";
import {MyDocFileService} from "./services/doc-file-service";
import {MyDocMessageService} from "./services/doc-message.service";
import {MyBlockCreatorService} from "./services/block-creator.service";
import {MyCommentService} from "./services/comment.service";
import {AdapterService} from "./services/adapter.service";
import {createDefaultMentionPanel} from "../plugins/mention";
import * as Y from 'yjs'
import {MyDocTranslationService} from "./services/doc-translation.service";
import {BlockLinkNavigator} from "./block-link-navigator";
import {createBundledEditorCapabilities} from './bundled-capabilities'

const mentionRequest = async (keyword: string, _type?: string) => {
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

@Component({
  selector: "block-craft-editor",
  template: `
    <section class="editor-shell">
      @if (showFixedToolbar) {
        <bc-fixed-toolbar [doc]="doc" [stickyTop]="stickyTop"></bc-fixed-toolbar>
      }

      <div
        class="editor-container"
        #container
        (mousedown)="onContainerMousedown($event)"
      ></div>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
      }

      .editor-shell {
        position: relative;
      }

      .editor-container {
        /* Definite height so the editable root's percentage min-height resolves
           (a child's % min-height is ignored when the parent height is auto). */
        height: min(78vh, 960px);
        overflow-x: hidden;
        overflow-y: auto;
        border-radius: 24px;
        color: var(--bc-color);
        border: 1px solid var(--bc-border-color-light);
        background: linear-gradient(
          180deg,
          var(--bc-bg-elevated),
          var(--bc-bg-primary)
        );
        box-shadow: var(--bc-shadow-lg);
      }

      ::ng-deep {
        [data-bc-block-link-target="true"] {
          outline: 2px solid var(--bc-active-color);
          outline-offset: 3px;
        }

        [data-blockcraft-root="true"] {
          box-sizing: border-box;
          min-height: 100%;
          padding: 48px 56px 64px;

          span[data-mention-id] {
            padding: 0 0.15em;
            color: #4857e2;
            cursor: pointer;
            white-space: pre-wrap;
            word-break: break-all;

            &[data-mention-type="user"] {
              &::before {
                content: "@";
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
    `,
  ],
  imports: [FixedTextToolbarComponent],
  standalone: true,
  providers: [
    { provide: DOC_FILE_SERVICE_TOKEN, useClass: MyDocFileService },
    { provide: DOC_MESSAGE_SERVICE_TOKEN, useClass: MyDocMessageService },
    { provide: BLOCK_CREATOR_SERVICE_TOKEN, useClass: MyBlockCreatorService },
    {
      provide: DOC_LINK_PREVIEWER_SERVICE_TOKEN,
      useClass: DocLinkPreviewerService,
    },
    { provide: DOC_ADAPTER_SERVICE_TOKEN, useClass: AdapterService },
    ConsoleLogger,
    MyCommentService,
  ],
})
export class EditorComponent implements OnInit, OnDestroy {
  @ViewChild("container", { read: ElementRef }) container!: ElementRef;
  @Input() stickyTop = 0;
  @Input() showFixedToolbar = true;
  @Input() virtualizationEnabled = true;
  @Input() paginationSparseView = false;
  /**
   * 宿主拥有的文档头。它始终位于编辑器 root 之外，分页插件只在分页期间
   * 把同一个 DOM 节点投影到首页并测量，不会把它写进文档数据。
   */
  @Input() paginationDocumentHeader?: PaginationDocumentHeaderOptions;
  constructor(
    private injector: Injector,
    private logger: ConsoleLogger,
  ) {}

  docId = "111";
  rootId = "111";

  doc!: BlockCraftDoc;
  private blockLinkNavigator: BlockLinkNavigator | null = null;

  private createDoc(): BlockCraftDoc {
    const capabilities = createBundledEditorCapabilities({
      mention: {
        panel: createDefaultMentionPanel({
          request: mentionRequest,
        }),
      },
      translate: {
        sourceLang: "auto",
        defaultTargetLang: "chinese_simplified",
        targetLangWhenSourceIsChinese: "chinese_simplified",
        service: new MyDocTranslationService(),
      },
      blockController: {
        customTools: [
          {
            type: "tool",
            name: "copyBlockLink",
            value: true,
            icon: "bc_fuzhilianjie",
            label: "复制段落链接",
          },
        ],
        customToolHandler: (item, block) => {
          if (item.name !== "copyBlockLink") return false;
          this.copyBlockLink(block);
          return true;
        },
      },
      openLink: link => {
        if (!this.blockLinkNavigator?.openBlockLink(link)) {
          window.open(link, "_blank");
        }
      },
      pagination: {
        enabled: false,
        pageSize: 'A4',
        printShortcut: true,
        experimentalSparseView: this.paginationSparseView,
        documentHeader: this.paginationDocumentHeader,
      },
    })
    return new BlockCraftDoc({
      yDoc: new Y.Doc({
        guid: this.docId,
        gc: false,
      }),
      docId: this.docId,
      currentUserId: "demo-user",
      schemas: capabilities.schemas,
      logger: this.logger,
      injector: this.injector,
      virtualization: {
        enabled: this.virtualizationEnabled,
        overscanViewports: 1,
        segmentMergeGap: 2,
        estimatedHeights: {
          paragraph: 32,
          ordered: 32,
          bullet: 32,
          todo: 36,
          divider: 24,
          callout: 120,
          code: 160,
          table: 240,
          columns: 180,
          image: 320,
          shape: 120,
          "word-art": 96,
        },
      },
      embeds: [...capabilities.embeds],
      plugins: [...capabilities.plugins],
    });
  }

  ngOnInit() {
    this.doc = this.createDoc();
    this.blockLinkNavigator = new BlockLinkNavigator(this.doc);
    this.blockLinkNavigator.start();
  }

  ngOnDestroy() {
    this.blockLinkNavigator?.destroy();
    this.blockLinkNavigator = null;
    this.doc?.destroy();
  }

  copyBlockLink(block: BlockCraft.BlockComponent) {
    const url = this.blockLinkNavigator?.createBlockLink(block.id);
    if (!url) return;
    void this.doc.clipboard.copyText(url)
      .then(() => {
        this.doc.messageService.success("已复制链接");
      })
      .catch(() => {
        this.doc.messageService.error("复制链接失败");
      });
  }

  onContainerMousedown(evt: MouseEvent) {
    if (evt.target === evt.currentTarget && evt.eventPhase === evt.AT_TARGET) {
      // evt.preventDefault();
      // evt.stopPropagation();
      // this.appendParagraph();
    }
  }

  private appendParagraph() {
    if (this.doc.root.lastChildren?.flavour === "paragraph") {
      this.doc.selection.setCursorAtBlock(this.doc.root.lastChildren, false);
      return;
    }

    const paragraph = this.doc.schemas.createSnapshot("paragraph", [""]);
    void this.doc
      .chain()
      .insertSnapshots(this.doc.rootId, this.doc.root.childrenLength, [
        paragraph,
      ])
      .setCursorAtBlock(paragraph.id, true)
      .run();
  }
}
