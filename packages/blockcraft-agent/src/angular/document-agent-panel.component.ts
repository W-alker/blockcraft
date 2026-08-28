import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild,
  computed,
  input,
  output,
  signal,
} from '@angular/core'
import type {
  DocumentAgentContext,
  DocumentAgentMarkdownRequest,
  DocumentAgentImageAttachment,
  DocumentAgentRequest,
  DocumentAgentTask,
  DocumentAgentResult,
} from '../core/agent.types'
import {
  DocumentAgentMarkdownMessageComponent,
  type DocumentAgentMarkdownViewerConfig,
} from './document-agent-markdown-message.component'

type DocumentAgentChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  tone?: 'normal' | 'error'
  kind?: 'text' | 'markdown'
  complete?: boolean
  streamed?: boolean
}

export type DocumentAgentPanelMode = 'chat' | 'edit'

export interface DocumentAgentReviewPrompt {
  readonly groupId: string
  readonly summary: string
  readonly operationCount: number
  readonly revisionCount: number
  readonly canRevertAll: boolean
}

export type DocumentAgentReviewAction = {
  readonly type: 'accept-all' | 'revert-all' | 'review' | 'dismiss'
  readonly groupId: string
}

function createDocumentAgentSessionId(): string {
  const generatedId = globalThis.crypto?.randomUUID?.()
  if (generatedId) return generatedId
  return `agent-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

@Component({
  selector: 'bc-document-agent-panel',
  standalone: true,
  imports: [DocumentAgentMarkdownMessageComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="bc-document-agent-panel" [class.bc-document-agent-panel--has-mode]="markdownChat()" role="dialog" aria-label="Document agent">
      <header class="bc-document-agent-panel__header">
        <div class="bc-document-agent-panel__identity">
          <div class="bc-document-agent-panel__avatar">AI</div>
          <div>
            <h2>文档 Agent</h2>
            <span>BlockCraft · 写作与优化助手</span>
          </div>
        </div>
        <button type="button" class="bc-document-agent-panel__close" aria-label="关闭对话" (click)="close.emit()">×</button>
      </header>

      @if (markdownChat()) {
        <div class="bc-document-agent-panel__mode" role="tablist" aria-label="Agent 模式">
          <button type="button" role="tab" [attr.aria-selected]="mode() === 'chat'" [class.active]="mode() === 'chat'" [disabled]="busy()" (click)="setMode('chat')">对话</button>
          <button type="button" role="tab" [attr.aria-selected]="mode() === 'edit'" [class.active]="mode() === 'edit'" [disabled]="busy()" (click)="setMode('edit')">编辑</button>
        </div>
      }

      @if (activeContext(); as currentContext) {
        <div class="bc-document-agent-panel__context">
          <span class="bc-document-agent-panel__context-dot"></span>
          <span>{{ currentContext.scope === 'document' ? '整篇文档' : '已锁定当前选区' }}</span>
          <span class="bc-document-agent-panel__context-count">{{ currentContext.blocks.length }} 个块</span>
          @if (liveContext()?.scope === 'selection') {
            <button
              type="button"
              class="bc-document-agent-panel__selection-send"
              [disabled]="busy()"
              (click)="sendCurrentSelection()">
              发送当前选区
            </button>
          }
        </div>
      }

      <div #messagesHost class="bc-document-agent-panel__messages" aria-live="polite">
        @for (message of messages(); track message.id) {
          <div class="bc-document-agent-panel__message" [class.bc-document-agent-panel__message--user]="message.role === 'user'" [class.bc-document-agent-panel__message--error]="message.tone === 'error'">
            <div class="bc-document-agent-panel__message-avatar">{{ message.role === 'user' ? '我' : 'AI' }}</div>
            <div class="bc-document-agent-panel__bubble" [class.bc-document-agent-panel__bubble--markdown]="message.kind === 'markdown'">
              @if (message.role === 'assistant' && message.kind === 'markdown') {
                <bc-document-agent-markdown-message
                  [markdown]="message.content"
                  [complete]="message.complete === true"
                  [config]="markdownChat()"
                  (insert)="insertMarkdown.emit($event)"
                />
              } @else {
                {{ message.content }}
              }
            </div>
          </div>
        }

        @if (busy() && !hasPendingMarkdown()) {
          <div class="bc-document-agent-panel__message">
            <div class="bc-document-agent-panel__message-avatar">AI</div>
            <div class="bc-document-agent-panel__bubble bc-document-agent-panel__typing">
              <span></span><span></span><span></span>
            </div>
          </div>
        }

        @if (mode() === 'edit' && result(); as currentResult) {
          <div class="bc-document-agent-panel__result-card">
            <div class="bc-document-agent-panel__result-label">正在生成修订 Diff</div>
            <strong>{{ currentResult.summary }}</strong>
            @if (currentResult.operations.length) {
              <span class="bc-document-agent-panel__result-meta">{{ currentResult.operations.length }} 项修改将进入文档修订审阅</span>
            }
          </div>
        }

        @if (mode() === 'edit' && review(); as currentReview) {
          <section class="bc-document-agent-panel__review-card" aria-label="审阅本次 AI 修改">
            <div class="bc-document-agent-panel__review-heading">
              <span class="bc-document-agent-panel__review-icon">✓</span>
              <div>
                <strong>已完成本次修改</strong>
                <span>{{ currentReview.operationCount }} 项操作 · {{ currentReview.revisionCount }} 条可视 Diff</span>
              </div>
            </div>
            <p>{{ currentReview.summary }}</p>
            <p class="bc-document-agent-panel__review-note">
              撤回全部会撤销同一事务中的所有修改，包括没有 Diff 样式的操作。
            </p>
            @if (!currentReview.canRevertAll) {
              <p class="bc-document-agent-panel__review-warning">
                文档在此后已有本地编辑，已停止提供整批撤回，避免误撤销用户内容。
              </p>
            }
            <div class="bc-document-agent-panel__review-actions">
              <button
                type="button"
                class="bc-document-agent-panel__review-primary"
                [disabled]="busy()"
                (click)="emitReviewAction('accept-all', currentReview.groupId)">
                接受全部
              </button>
              <button
                type="button"
                class="bc-document-agent-panel__review-danger"
                [disabled]="busy() || !currentReview.canRevertAll"
                (click)="emitReviewAction('revert-all', currentReview.groupId)">
                撤回全部
              </button>
              @if (currentReview.revisionCount > 0) {
                <button
                  type="button"
                  [disabled]="busy()"
                  (click)="emitReviewAction('review', currentReview.groupId)">
                  逐条审阅
                </button>
              }
              <button
                type="button"
                [disabled]="busy()"
                (click)="emitReviewAction('dismiss', currentReview.groupId)">
                稍后
              </button>
            </div>
          </section>
        }

      </div>

      <footer class="bc-document-agent-panel__composer">
        @if (imageAttachment(); as attachment) {
          <div class="bc-document-agent-panel__attachment">
            <img [src]="attachment.dataUrl" [alt]="attachment.name">
            <div class="bc-document-agent-panel__attachment-meta">
              <strong>{{ attachment.name }}</strong>
              <span>{{ attachment.width }} × {{ attachment.height }}</span>
            </div>
            <button type="button" aria-label="移除图片" (click)="removeImage()">×</button>
          </div>
        }
        <input
          #imageInput
          class="bc-document-agent-panel__file-input"
          type="file"
          accept="image/*"
          (change)="onImageSelected($event)"
        >
        <textarea
          #composer
          [value]="instruction()"
          (input)="onInstructionInput($event)"
          (keydown)="onComposerKeydown($event)"
          (paste)="onComposerPaste($event)"
          [disabled]="busy()"
          [placeholder]="mode() === 'chat' ? '向 AI 提问，回复会以 Markdown 只读渲染…' : '告诉我你想怎么修改文档…'"
          rows="2"
          aria-label="发送给文档 Agent 的消息"
        ></textarea>
        <div class="bc-document-agent-panel__composer-footer">
          <div class="bc-document-agent-panel__composer-tools">
            <button
              type="button"
              class="bc-document-agent-panel__upload"
              [disabled]="busy() || imageBusy()"
              (click)="openImagePicker()">
              {{ imageBusy() ? '读取中…' : '上传图片' }}
            </button>
            <span>Enter 发送 · Shift + Enter 换行</span>
          </div>
          <button
            type="button"
            class="bc-document-agent-panel__send"
            [disabled]="!canSubmit()"
            (click)="submitRequest()"
          >
            {{ busy() ? (mode() === 'chat' ? '生成中…' : '思考中…') : '发送' }}
          </button>
        </div>
      </footer>
    </section>
  `,
  styles: [`
    :host { display: block; width: min(456px, calc(100vw - 32px)); }
    .bc-document-agent-panel { display: grid; grid-template-rows: auto auto minmax(260px, 1fr) auto; max-height: min(680px, calc(100vh - 104px)); overflow: hidden; background: #fff; border: 1px solid #dce3ed; border-radius: 16px; box-shadow: 0 18px 48px rgb(23 37 61 / 20%); }
    .bc-document-agent-panel--has-mode { grid-template-rows: auto auto auto minmax(260px, 1fr) auto; }
    .bc-document-agent-panel__header { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 18px 14px; border-bottom: 1px solid #edf0f5; }
    .bc-document-agent-panel__mode { display: grid; grid-template-columns: 1fr 1fr; gap: 3px; margin: 8px 14px 0; padding: 3px; border-radius: 9px; background: #eef2f8; }
    .bc-document-agent-panel__mode button { min-height: 28px; border: 0; border-radius: 7px; color: #6f7d91; background: transparent; font-size: 11px; font-weight: 600; cursor: pointer; }
    .bc-document-agent-panel__mode button.active { color: #315cc8; background: #fff; box-shadow: 0 1px 3px rgb(32 50 78 / 12%); }
    .bc-document-agent-panel__identity { display: flex; align-items: center; gap: 10px; }
    .bc-document-agent-panel__avatar { display: grid; width: 32px; height: 32px; place-items: center; border-radius: 10px; color: #fff; background: linear-gradient(135deg, #376ee6, #7c5ce8); font-size: 11px; font-weight: 800; }
    h2 { margin: 0; color: #1b2638; font-size: 16px; line-height: 1.3; }
    .bc-document-agent-panel__identity span { display: block; margin-top: 2px; color: #7a8495; font-size: 11px; }
    .bc-document-agent-panel__close { width: 28px; height: 28px; padding: 0; border: 0; border-radius: 8px; background: transparent; color: #788396; font-size: 22px; line-height: 1; cursor: pointer; }
    .bc-document-agent-panel__close:hover { background: #f1f4f8; color: #26344a; }
    .bc-document-agent-panel__context { display: flex; align-items: center; gap: 7px; min-height: 32px; padding: 0 18px; color: #536176; background: #fafbfc; font-size: 11px; }
    .bc-document-agent-panel__context-dot { width: 6px; height: 6px; border-radius: 50%; background: #2eae72; box-shadow: 0 0 0 3px rgb(46 174 114 / 12%); }
    .bc-document-agent-panel__context-count { margin-left: auto; color: #98a2b2; }
    .bc-document-agent-panel__selection-send { min-height: 24px; padding: 0 7px; border: 1px solid #cfdcff; border-radius: 6px; color: #4166c0; background: #f5f8ff; font-size: 10px; cursor: pointer; }
    .bc-document-agent-panel__selection-send:hover:not(:disabled) { border-color: #8fa9ed; background: #edf2ff; }
    .bc-document-agent-panel__selection-send:disabled { opacity: .5; cursor: not-allowed; }
    .bc-document-agent-panel__messages { display: grid; align-content: start; gap: 14px; min-height: 0; overflow: auto; padding: 18px; background: #f7f9fc; }
    .bc-document-agent-panel__message { display: flex; align-items: flex-start; gap: 8px; max-width: 92%; }
    .bc-document-agent-panel__message--user { flex-direction: row-reverse; justify-self: end; }
    .bc-document-agent-panel__message-avatar { display: grid; flex: 0 0 24px; width: 24px; height: 24px; place-items: center; margin-top: 2px; border-radius: 8px; color: #657287; background: #e7ecf5; font-size: 10px; font-weight: 700; }
    .bc-document-agent-panel__message--user .bc-document-agent-panel__message-avatar { color: #fff; background: #5e78b6; }
    .bc-document-agent-panel__bubble { min-width: 0; padding: 10px 12px; border: 1px solid #e3e8f0; border-radius: 4px 12px 12px 12px; color: #35445a; background: #fff; font-size: 13px; line-height: 1.6; white-space: pre-wrap; overflow-wrap: anywhere; }
    .bc-document-agent-panel__bubble--markdown { width: min(360px, 72vw); white-space: normal; }
    .bc-document-agent-panel__message--user .bc-document-agent-panel__bubble { border-color: #d6e2ff; border-radius: 12px 4px 12px 12px; color: #fff; background: #4b72d5; }
    .bc-document-agent-panel__message--error .bc-document-agent-panel__bubble { border-color: #ffd6d1; color: #b42318; background: #fff5f3; }
    .bc-document-agent-panel__typing { display: flex; align-items: center; gap: 4px; min-width: 42px; padding: 13px 12px; }
    .bc-document-agent-panel__typing span { width: 5px; height: 5px; border-radius: 50%; background: #8b98ab; animation: bc-agent-bounce 1.2s infinite ease-in-out; }
    .bc-document-agent-panel__typing span:nth-child(2) { animation-delay: .15s; }
    .bc-document-agent-panel__typing span:nth-child(3) { animation-delay: .3s; }
    .bc-document-agent-panel__result-card { display: grid; gap: 7px; margin-left: 32px; padding: 12px; border: 1px solid #cfdcff; border-radius: 12px; background: #f5f8ff; color: #34425b; }
    .bc-document-agent-panel__result-label { color: #4166c0; font-size: 11px; font-weight: 700; }
    .bc-document-agent-panel__result-card strong { font-size: 13px; line-height: 1.5; }
    .bc-document-agent-panel__result-meta { color: #7b88a0; font-size: 11px; }
    .bc-document-agent-panel__review-card { display: grid; gap: 10px; margin-left: 32px; padding: 13px; border: 1px solid #cbd9ff; border-radius: 13px; background: linear-gradient(145deg, #f7f9ff, #fff); color: #34425b; box-shadow: 0 8px 22px rgb(54 85 155 / 9%); }
    .bc-document-agent-panel__review-heading { display: flex; align-items: center; gap: 9px; }
    .bc-document-agent-panel__review-heading > div { display: grid; gap: 2px; }
    .bc-document-agent-panel__review-heading strong { color: #263a67; font-size: 13px; }
    .bc-document-agent-panel__review-heading span { color: #7b88a0; font-size: 10px; }
    .bc-document-agent-panel__review-icon { display: grid; width: 27px; height: 27px; flex: 0 0 27px; place-items: center; border-radius: 9px; color: #fff !important; background: #4772db; font-size: 13px !important; font-weight: 800; }
    .bc-document-agent-panel__review-card p { margin: 0; font-size: 12px; line-height: 1.55; }
    .bc-document-agent-panel__review-note { color: #6f7e95; }
    .bc-document-agent-panel__review-warning { padding: 7px 8px; border-radius: 8px; color: #9a5a13; background: #fff6e8; }
    .bc-document-agent-panel__review-actions { display: flex; flex-wrap: wrap; gap: 7px; }
    .bc-document-agent-panel__review-actions button { min-height: 30px; padding: 0 10px; border: 1px solid #d5ddea; border-radius: 8px; color: #56647a; background: #fff; font-size: 11px; font-weight: 600; cursor: pointer; }
    .bc-document-agent-panel__review-actions button:hover:not(:disabled) { border-color: #9bb0e7; background: #f5f8ff; }
    .bc-document-agent-panel__review-actions button:disabled { opacity: .45; cursor: not-allowed; }
    .bc-document-agent-panel__review-actions .bc-document-agent-panel__review-primary { border-color: #4772db; color: #fff; background: #4772db; }
    .bc-document-agent-panel__review-actions .bc-document-agent-panel__review-primary:hover { border-color: #365fc2; background: #365fc2; }
    .bc-document-agent-panel__review-actions .bc-document-agent-panel__review-danger { border-color: #f0c5c0; color: #b33a2d; }
    .bc-document-agent-panel__composer { display: grid; gap: 8px; padding: 12px 14px 14px; border-top: 1px solid #e6eaf1; background: #fff; }
    .bc-document-agent-panel__file-input { display: none; }
    .bc-document-agent-panel__attachment { display: flex; align-items: center; gap: 8px; min-width: 0; padding: 6px 8px; border: 1px solid #dce4f1; border-radius: 9px; background: #f7f9fc; }
    .bc-document-agent-panel__attachment img { width: 42px; height: 42px; flex: 0 0 42px; object-fit: cover; border-radius: 6px; background: #e8edf5; }
    .bc-document-agent-panel__attachment-meta { display: grid; min-width: 0; gap: 2px; color: #7a879b; font-size: 10px; }
    .bc-document-agent-panel__attachment-meta strong { overflow: hidden; color: #43526a; font-size: 11px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
    .bc-document-agent-panel__attachment button { width: 24px; height: 24px; flex: 0 0 24px; margin-left: auto; padding: 0; border: 0; border-radius: 6px; color: #7a879b; background: transparent; font-size: 18px; line-height: 1; cursor: pointer; }
    .bc-document-agent-panel__attachment button:hover { color: #26344a; background: #e9eef6; }
    .bc-document-agent-panel__composer textarea { box-sizing: border-box; width: 100%; min-height: 54px; resize: none; padding: 10px 11px; border: 1px solid #d8dfeb; border-radius: 10px; outline: none; color: #26344a; background: #fff; font: inherit; font-size: 13px; line-height: 1.5; }
    .bc-document-agent-panel__composer textarea:focus { border-color: #5c7dde; box-shadow: 0 0 0 3px rgb(92 125 222 / 12%); }
    .bc-document-agent-panel__composer textarea:disabled { background: #f5f7fa; }
    .bc-document-agent-panel__composer-footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; color: #98a2b2; font-size: 10px; }
    .bc-document-agent-panel__composer-tools { display: flex; align-items: center; gap: 8px; min-width: 0; }
    .bc-document-agent-panel__upload { min-height: 28px; padding: 0 9px; border: 1px solid #d6ddea; border-radius: 7px; color: #536176; background: #fff; font-size: 11px; cursor: pointer; }
    .bc-document-agent-panel__upload:hover:not(:disabled) { border-color: #9eb3e9; color: #426bd1; background: #f7f9ff; }
    .bc-document-agent-panel__upload:disabled { opacity: .55; cursor: not-allowed; }
    .bc-document-agent-panel__send { min-width: 58px; min-height: 30px; padding: 0 12px; border: 0; border-radius: 8px; color: #fff; background: #426bd1; font-size: 12px; font-weight: 700; cursor: pointer; }
    .bc-document-agent-panel__send:disabled { opacity: .45; cursor: not-allowed; }
    @keyframes bc-agent-bounce { 0%, 60%, 100% { transform: translateY(0); opacity: .5; } 30% { transform: translateY(-3px); opacity: 1; } }
  `],
})
export class DocumentAgentPanelComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('composer') private composer?: ElementRef<HTMLTextAreaElement>
  @ViewChild('imageInput') private imageInput?: ElementRef<HTMLInputElement>
  @ViewChild('messagesHost') private messagesHost?: ElementRef<HTMLElement>

  readonly sessionId = createDocumentAgentSessionId()
  readonly context = input<DocumentAgentContext | null>(null)
  readonly liveContext = input<DocumentAgentContext | null>(null)
  readonly task = input<DocumentAgentTask>('rewrite')
  readonly markdownChat = input<DocumentAgentMarkdownViewerConfig | null>(null)
  readonly busy = input(false)
  readonly error = input<string | null>(null)
  readonly result = input<DocumentAgentResult | null>(null)
  readonly review = input<DocumentAgentReviewPrompt | null>(null)
  readonly imageAttachment = signal<DocumentAgentImageAttachment | null>(null)
  readonly imageBusy = signal(false)
  readonly activeContext = computed(() => this.context() ?? this.liveContext())
  readonly hasPendingMarkdown = computed(() => this.messages().some(
    message => message.kind === 'markdown'
      && message.complete !== true
      && message.tone !== 'error',
  ))
  readonly canSubmit = computed(() => Boolean(this.activeContext() && this.instruction().trim() && !this.busy() && !this.imageBusy()))
  readonly request = output<DocumentAgentRequest>()
  readonly chatRequest = output<DocumentAgentMarkdownRequest>()
  readonly insertMarkdown = output<string>()
  readonly reviewAction = output<DocumentAgentReviewAction>()
  readonly close = output<void>()
  /** @deprecated Revision Diff is staged by the host immediately. */
  readonly apply = output<void>()
  /** @deprecated Revision Diff is rejected from the Revision review UI. */
  readonly discard = output<void>()
  readonly instruction = signal('')
  readonly mode = signal<DocumentAgentPanelMode>('edit')
  private modeTouched = false
  private readonly pendingMarkdownDeltas = new Map<string, string>()
  private markdownFrame: number | null = null
  readonly messages = signal<readonly DocumentAgentChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: '你好，我可以帮你改写、润色、扩写或整理这份文档。你想从哪里开始？',
    },
  ])

  ngAfterViewInit(): void {
    queueMicrotask(() => this.composer?.nativeElement.focus())
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['markdownChat']?.currentValue && !this.modeTouched) {
      this.mode.set('chat')
    }
    if (!changes['review']?.currentValue) return
    queueMicrotask(() => {
      const messages = this.messagesHost?.nativeElement
      if (messages) messages.scrollTop = messages.scrollHeight
    })
  }

  ngOnDestroy(): void {
    if (this.markdownFrame !== null) cancelAnimationFrame(this.markdownFrame)
    this.markdownFrame = null
    this.pendingMarkdownDeltas.clear()
  }

  setMode(mode: DocumentAgentPanelMode): void {
    if (this.busy() || (mode === 'chat' && !this.markdownChat())) return
    this.modeTouched = true
    this.mode.set(mode)
  }

  onInstructionInput(event: Event): void {
    this.instruction.set((event.target as HTMLTextAreaElement).value)
  }

  onComposerKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' || event.shiftKey) return
    event.preventDefault()
    this.submitRequest()
  }

  onComposerPaste(event: ClipboardEvent): void {
    const file = Array.from(event.clipboardData?.items ?? [])
      .find(item => item.kind === 'file' && item.type.startsWith('image/'))
      ?.getAsFile()
    if (!file) return

    event.preventDefault()
    void this.setImageAttachment(file)
  }

  sendCurrentSelection(): void {
    const selectionContext = this.liveContext()
    if (!selectionContext || selectionContext.scope !== 'selection' || this.busy()) return
    this.emitRequest(
      selectionContext,
      this.instruction().trim() || '请基于当前选区给出可执行的文档优化建议。',
      '当前选区',
    )
  }

  openImagePicker(): void {
    if (this.busy() || this.imageBusy()) return
    this.imageInput?.nativeElement.click()
  }

  async onImageSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file) return

    await this.setImageAttachment(file)
  }

  private async setImageAttachment(file: File): Promise<void> {

    if (!file.type.startsWith('image/')) {
      this.addAssistantError('只能上传图片文件。')
      return
    }
    if (file.size > 12 * 1024 * 1024) {
      this.addAssistantError('图片不能超过 12 MB，请先压缩后再上传。')
      return
    }

    this.imageBusy.set(true)
    try {
      this.imageAttachment.set(await this.createImageAttachment(file))
    } catch (error) {
      this.addAssistantError(error instanceof Error ? error.message : '图片读取失败')
    } finally {
      this.imageBusy.set(false)
    }
  }

  removeImage(): void {
    this.imageAttachment.set(null)
  }

  submitRequest(): void {
    const context = this.activeContext()
    const instruction = this.instruction().trim()
    if (!context || !instruction || this.busy()) return

    this.emitRequest(context, instruction)
  }

  private emitRequest(
    context: DocumentAgentContext,
    instruction: string,
    contextLabel = '',
  ): void {
    if (this.busy()) return

    this.messages.update(messages => [
      ...messages,
      {
        id: createDocumentAgentSessionId(),
        role: 'user',
        content: `${contextLabel ? `[${contextLabel}] ` : ''}${instruction}${this.imageAttachment() ? '\n[已附加图片]' : ''}`,
      },
    ])
    const attachment = this.imageAttachment()
    this.instruction.set('')
    this.imageAttachment.set(null)
    if (this.mode() === 'chat' && this.markdownChat()) {
      this.chatRequest.emit({
        markdownStreamVersion: 1,
        instruction,
        context,
        sessionId: this.sessionId,
        attachments: attachment ? [attachment] : undefined,
      })
    } else {
      this.request.emit({
        task: this.task(),
        instruction,
        context,
        sessionId: this.sessionId,
        attachments: attachment ? [attachment] : undefined,
      })
    }
    this.scrollToBottom()
  }

  private async createImageAttachment(file: File): Promise<DocumentAgentImageAttachment> {
    const objectUrl = URL.createObjectURL(file)
    try {
      const image = new Image()
      image.src = objectUrl
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve()
        image.onerror = () => reject(new Error('图片无法读取，请换一张图片重试。'))
      })

      const maxDimension = 1600
      const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight))
      const width = Math.max(1, Math.round(image.naturalWidth * scale))
      const height = Math.max(1, Math.round(image.naturalHeight * scale))
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')
      if (!context) throw new Error('当前浏览器不支持图片处理。')
      context.fillStyle = '#fff'
      context.fillRect(0, 0, width, height)
      context.drawImage(image, 0, 0, width, height)

      return {
        type: 'image',
        mimeType: 'image/jpeg',
        name: file.name,
        dataUrl: canvas.toDataURL('image/jpeg', 0.82),
        width,
        height,
      }
    } finally {
      URL.revokeObjectURL(objectUrl)
    }
  }

  addAssistantResult(result: DocumentAgentResult): void {
    const draft = result.draft ? `\n\n${result.draft}` : ''
    this.messages.update(messages => [
      ...messages,
      {id: createDocumentAgentSessionId(), role: 'assistant', content: `${result.summary}${draft}`},
    ])
  }

  addAssistantError(message: string): void {
    this.messages.update(messages => [
      ...messages,
      {id: createDocumentAgentSessionId(), role: 'assistant', tone: 'error', content: message},
    ])
  }

  addAssistantNotice(message: string): void {
    this.messages.update(messages => [
      ...messages,
      {id: createDocumentAgentSessionId(), role: 'assistant', content: message},
    ])
  }

  beginAssistantMarkdown(): string {
    const id = createDocumentAgentSessionId()
    this.messages.update(messages => [
      ...messages,
      {id, role: 'assistant', kind: 'markdown', content: '', complete: false},
    ])
    this.scrollToBottom()
    return id
  }

  appendAssistantMarkdown(id: string, delta: string): void {
    if (!delta) return
    this.pendingMarkdownDeltas.set(
      id,
      (this.pendingMarkdownDeltas.get(id) ?? '') + delta,
    )
    if (this.markdownFrame !== null) return
    this.markdownFrame = requestAnimationFrame(() => {
      this.markdownFrame = null
      this.flushMarkdownDeltas()
    })
  }

  finishAssistantMarkdown(id: string, markdown: string, streamed: boolean): void {
    this.flushMarkdownDeltas(id)
    this.messages.update(messages => messages.map(message =>
      message.id === id
        ? {...message, content: markdown, complete: true, streamed}
        : message,
    ))
    this.scrollToBottom()
  }

  failAssistantMarkdown(id: string, error: string): void {
    this.flushMarkdownDeltas(id)
    let hadContent = false
    this.messages.update(messages => messages.map(message => {
      if (message.id !== id) return message
      hadContent = Boolean(message.content)
      return hadContent
        ? {...message, tone: 'error', complete: false}
        : {...message, kind: 'text', tone: 'error', content: error, complete: true}
    }))
    if (hadContent) this.addAssistantError(error)
    this.scrollToBottom()
  }

  private scrollToBottom(): void {
    queueMicrotask(() => {
      const messages = this.messagesHost?.nativeElement
      if (messages) messages.scrollTop = messages.scrollHeight
    })
  }

  private flushMarkdownDeltas(onlyId?: string): void {
    const deltas = onlyId
      ? new Map([[onlyId, this.pendingMarkdownDeltas.get(onlyId) ?? '']])
      : new Map(this.pendingMarkdownDeltas)
    if (onlyId) this.pendingMarkdownDeltas.delete(onlyId)
    else this.pendingMarkdownDeltas.clear()
    if (![...deltas.values()].some(Boolean)) return
    this.messages.update(messages => messages.map(message => {
      const delta = deltas.get(message.id)
      return delta ? {...message, content: message.content + delta} : message
    }))
    this.scrollToBottom()
  }

  emitReviewAction(type: DocumentAgentReviewAction['type'], groupId: string): void {
    this.reviewAction.emit({type, groupId})
  }
}
