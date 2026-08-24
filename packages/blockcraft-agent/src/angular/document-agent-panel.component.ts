import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
  signal,
} from '@angular/core'
import type {
  DocumentAgentContext,
  DocumentAgentRequest,
  DocumentAgentTask,
  DocumentAgentResult,
} from '../core/agent.types'

@Component({
  selector: 'bc-document-agent-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="bc-document-agent-panel" role="dialog" aria-label="Document agent">
      <header class="bc-document-agent-panel__header">
        <div>
          <h2>文档 Agent</h2>
          <span>{{ context()?.scope === 'document' ? '已锁定整篇文档' : context() ? '已锁定发起请求时的选区' : '正在准备文档上下文' }}</span>
        </div>
        <button type="button" class="bc-document-agent-panel__close" aria-label="关闭" (click)="close.emit()">×</button>
      </header>

      @if (context(); as currentContext) {
        <div class="bc-document-agent-panel__selection">
          {{ currentContext.scope === 'document' ? '整篇文档' : currentContext.selectedText || '当前为结构选区' }}
        </div>
      }

      <textarea
        [value]="instruction()"
        (input)="onInstructionInput($event)"
        placeholder="例如：改得更专业一些"
        rows="4"
      ></textarea>

      <button
        type="button"
        [disabled]="!context() || !instruction().trim() || busy()"
        (click)="submitRequest()"
      >
        {{ busy() ? '正在生成…' : '生成修改建议' }}
      </button>

      @if (error(); as message) {
        <div class="bc-document-agent-panel__error">{{ message }}</div>
      }

      @if (result(); as currentResult) {
        <div class="bc-document-agent-panel__result">
          <span>修改预览</span>
          <strong>{{ currentResult.summary }}</strong>
          @if (currentResult.draft) {
            <pre>{{ currentResult.draft }}</pre>
          }
          <div class="bc-document-agent-panel__actions">
            <button type="button" (click)="apply.emit()">应用</button>
            <button type="button" (click)="discard.emit()">丢弃</button>
          </div>
        </div>
      }
    </section>
  `,
  styles: [`
    :host { display: block; width: min(420px, calc(100vw - 32px)); }
    .bc-document-agent-panel { display: grid; gap: 12px; padding: 18px; background: #fff; border: 1px solid #dce3ed; border-radius: 14px; box-shadow: 0 18px 48px rgb(23 37 61 / 18%); }
    .bc-document-agent-panel__header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
    h2 { margin: 0; font-size: 16px; }
    .bc-document-agent-panel__header > div { display: grid; gap: 4px; }
    .bc-document-agent-panel__header span { color: #687386; font-size: 12px; }
    .bc-document-agent-panel__close { width: 28px; height: 28px; padding: 0; border: 0; background: transparent; color: #687386; font-size: 22px; line-height: 1; cursor: pointer; }
    .bc-document-agent-panel__selection { overflow: hidden; padding: 10px 12px; border-radius: 8px; background: #f4f7fb; color: #39465a; font-size: 12px; line-height: 1.5; text-overflow: ellipsis; white-space: nowrap; }
    textarea { box-sizing: border-box; width: 100%; resize: vertical; }
    button { justify-self: start; }
    .bc-document-agent-panel__error { color: #b42318; font-size: 12px; line-height: 1.5; }
    .bc-document-agent-panel__result { display: grid; gap: 8px; padding-top: 4px; border-top: 1px solid #e7ebf1; }
    .bc-document-agent-panel__result > span { color: #687386; font-size: 12px; }
    .bc-document-agent-panel__result strong { line-height: 1.5; }
    .bc-document-agent-panel__result pre { max-height: 180px; margin: 0; overflow: auto; padding: 10px; border-radius: 8px; background: #f7f9fc; white-space: pre-wrap; }
    .bc-document-agent-panel__actions { display: flex; gap: 8px; }
  `],
})
export class DocumentAgentPanelComponent {
  readonly context = input<DocumentAgentContext | null>(null)
  readonly task = input<DocumentAgentTask>('rewrite')
  readonly busy = input(false)
  readonly error = input<string | null>(null)
  readonly result = input<DocumentAgentResult | null>(null)
  readonly request = output<DocumentAgentRequest>()
  readonly close = output<void>()
  readonly apply = output<void>()
  readonly discard = output<void>()
  readonly instruction = signal('')

  onInstructionInput(event: Event): void {
    this.instruction.set((event.target as HTMLTextAreaElement).value)
  }

  submitRequest(): void {
    const context = this.context()
    const instruction = this.instruction().trim()
    if (!context || !instruction) return

    this.request.emit({
      task: this.task(),
      instruction,
      context,
    })
  }
}
