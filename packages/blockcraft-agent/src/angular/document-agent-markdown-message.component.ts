import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core'
import {
  createMarkdownStreamViewer,
  type AdapterRegistry,
  type MarkdownAdapterProfile,
  type MarkdownStreamViewer,
  type SnapshotViewerOptions,
} from '@ccc/blockcraft'

export interface DocumentAgentMarkdownViewerConfig {
  readonly adapterRegistry: AdapterRegistry
  readonly markdownProfile?: MarkdownAdapterProfile
  readonly viewerOptions?: SnapshotViewerOptions
}

@Component({
  selector: 'bc-document-agent-markdown-message',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!complete && !markdown) {
      <div class="bc-document-agent-markdown-message__status">正在生成 Markdown…</div>
    }
    <div #host class="bc-document-agent-markdown-message__content"></div>
    @if (complete && markdown) {
      <div class="bc-document-agent-markdown-message__actions">
        <button type="button" (click)="copyMarkdown()">复制 Markdown</button>
        <button type="button" class="primary" (click)="insert.emit(markdown)">插入到文档</button>
      </div>
    }
  `,
  styles: [`
    :host { display: grid; min-width: 0; gap: 8px; }
    .bc-document-agent-markdown-message__status { color: #7a8699; font-size: 11px; }
    .bc-document-agent-markdown-message__content { --bc-fs: 14px; min-width: 0; overflow-wrap: anywhere; font-size: var(--bc-fs); }
    .bc-document-agent-markdown-message__actions { display: flex; flex-wrap: wrap; gap: 6px; padding-top: 2px; }
    button { min-height: 26px; padding: 0 8px; border: 1px solid #d5ddea; border-radius: 7px; color: #56647a; background: #fff; font-size: 10px; cursor: pointer; }
    button:hover { border-color: #9bb0e7; background: #f5f8ff; }
    button.primary { border-color: #4772db; color: #fff; background: #4772db; }
  `],
})
export class DocumentAgentMarkdownMessageComponent
implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('host') private host?: ElementRef<HTMLElement>

  @Input() markdown = ''
  @Input() complete = false
  @Input() config: DocumentAgentMarkdownViewerConfig | null = null
  @Output() readonly insert = new EventEmitter<string>()

  private viewer?: MarkdownStreamViewer

  ngAfterViewInit(): void {
    this.syncViewer()
  }

  ngOnChanges(_changes: SimpleChanges): void {
    this.syncViewer()
  }

  ngOnDestroy(): void {
    this.viewer?.destroy()
    this.viewer = undefined
  }

  async copyMarkdown(): Promise<void> {
    if (!this.markdown || !globalThis.navigator?.clipboard?.writeText) return
    await globalThis.navigator.clipboard.writeText(this.markdown)
  }

  private syncViewer(): void {
    const host = this.host?.nativeElement
    if (!host) return
    if (!this.viewer) {
      this.viewer = createMarkdownStreamViewer({
        container: host,
        ...(this.config?.adapterRegistry
          ? {adapterRegistry: this.config.adapterRegistry}
          : {}),
        ...(this.config?.markdownProfile
          ? {markdownProfile: this.config.markdownProfile}
          : {}),
        viewerOptions: {
          resourcePolicy: 'visible',
          ...this.config?.viewerOptions,
        },
      })
    }
    this.viewer.replace(this.markdown)
    if (this.complete) this.viewer.finish()
  }
}
