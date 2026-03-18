import { ChangeDetectionStrategy, Component } from "@angular/core";
import { DeltaOperation, EditableBlockComponent } from "../../framework";
import { MermaidTextareaBlockModel } from "./index";
import { CodeInlineRuntime } from "../code-block/code-inline-runtime";
import { debounce, nextTick } from "../../global";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";

@Component({
  selector: "div.mermaid-textarea",
  template: ``,
  host: {
    '[class.edit-container]': 'true'
  },
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MermaidTextareaBlockComponent extends EditableBlockComponent<MermaidTextareaBlockModel> {
  override plainTextOnly = true;

  private _codeRuntime!: CodeInlineRuntime

  protected override _initRuntime() {
    const embedConverters = new Map(this.doc.config.embeds || [])
    this._codeRuntime = new CodeInlineRuntime(this._containerElement, embedConverters, {
      lang: 'mermaid',
      withLineBreak: false,
      theme: this.doc.theme.includes('light') ? 'github-light' : 'github-dark',
    })
    this._runtime = this._codeRuntime
  }

  override _init() {
    super._init();
    this.doc.themeChange$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this._codeRuntime.setTheme(this.doc.theme.includes('light') ? 'github-light' : 'github-dark')
      this.rerender()
    })
  }

  override ngAfterViewInit(): void {
    super.ngAfterViewInit();
    this.onTextChange.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(e => {
      this._debounce_highlight(e.op)
    })
  }

  private _debounce_highlight = debounce((op: DeltaOperation[]) => {
    nextTick().then(() => {
      this._codeRuntime.diffHighLight(op, {
        block: this,
        selectionValue: this.doc.selection.value,
        normalizeRange: (range: Range) => this.doc.selection.normalizeRange(range)
      })
    })
  }, 200)

  override rerender() {
    super.rerender()
    this._codeRuntime.renderCode(() => this.textContent())
  }
}
