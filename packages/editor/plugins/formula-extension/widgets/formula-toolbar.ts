import {
  AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component,
  ElementRef, EventEmitter, Input, Output, ViewChild,
} from "@angular/core";
// @ts-ignore
import katex from 'katex';

@Component({
  selector: "div.formula-toolbar",
  template: `
    <div class="ft-container">
      <div class="ft-preview" #preview></div>
      <div class="ft-editor">
        <textarea #latexInput class="ft-input" [value]="latex"
          (input)="onInput($event)" (keydown.meta.enter)="onConfirm()"
          (keydown.control.enter)="onConfirm()"
          placeholder="输入 LaTeX 公式，如 E = mc^2" rows="3"></textarea>
        <div class="ft-footer">
          <span class="ft-hint">Ctrl + Enter 确认</span>
          <button class="ft-btn" (click)="onConfirm()">确定</button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .ft-container {
      width: 400px;
      background: var(--bc-bg-primary);
      border-radius: 8px;
      border: 1px solid var(--bc-border-color);
      box-shadow: var(--bc-shadow-md);
      overflow: hidden;
    }
    .ft-preview {
      padding: 16px 20px;
      min-height: 48px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-bottom: 1px solid var(--bc-border-color);
    }
    .ft-preview:empty::after {
      content: '公式预览';
      color: var(--bc-color-lighter);
      font-size: 13px;
      font-style: italic;
    }
    .ft-editor {
      background: var(--bc-bg-secondary);
    }
    .ft-input {
      display: block;
      width: 100%;
      padding: 10px 14px;
      border: none;
      outline: none;
      resize: none;
      background: transparent;
      color: var(--bc-color);
      font-family: Consolas, Monaco, 'Andale Mono', monospace;
      font-size: 13px;
      line-height: 1.6;
      box-sizing: border-box;
    }
    .ft-input::placeholder {
      color: var(--bc-color-lighter);
    }
    .ft-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 12px;
    }
    .ft-hint {
      font-size: 11px;
      color: var(--bc-color-lighter);
    }
    .ft-btn {
      padding: 4px 20px;
      border: none;
      border-radius: 4px;
      background: var(--bc-active-color);
      color: #fff;
      font-size: 13px;
      cursor: pointer;
    }
    .ft-btn:hover { opacity: 0.85; }
  `],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FormulaBlockToolbar implements AfterViewInit {
  @Input() block!: BlockCraft.IBlockComponents['formula'];
  @Input() doc!: BlockCraft.Doc;
  @Input() initialLatex = '';
  @Output() confirm = new EventEmitter<string>();

  @ViewChild('preview') preview!: ElementRef<HTMLElement>;
  @ViewChild('latexInput') latexInput!: ElementRef<HTMLTextAreaElement>;

  latex = '';

  constructor(private cdr: ChangeDetectorRef) {}

  ngAfterViewInit() {
    this.latex = this.initialLatex || this.block?.props?.latex || '';
    this.cdr.detectChanges();
    this.renderPreview();
    setTimeout(() => {
      this.latexInput?.nativeElement.focus();
      const len = this.latexInput?.nativeElement.value.length || 0;
      this.latexInput?.nativeElement.setSelectionRange(len, len);
    });
  }

  onInput(event: Event) {
    this.latex = (event.target as HTMLTextAreaElement).value;
    this.renderPreview();
  }

  onConfirm() {
    this.confirm.emit(this.latex);
  }

  private renderPreview() {
    if (!this.preview?.nativeElement) return;
    const el = this.preview.nativeElement;
    if (!this.latex) { el.innerHTML = ''; return; }
    try {
      katex.render(this.latex, el, { displayMode: true, throwOnError: false, output: 'mathml' });
    } catch { el.textContent = this.latex; }
  }
}
