import { ChangeDetectionStrategy, Component } from "@angular/core";
import { DeltaOperation, EditableBlockComponent, normalizeRange, ORIGIN_SKIP_SYNC } from "../../framework";
import { MermaidTextareaBlockModel } from "./index";
import { CodeInlineRuntime } from "../code-block/code-inline-runtime";
import { debounce, nextTick } from "../../global";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { isFormatOnlyDelta } from "../code-block/color-merge";

@Component({
  selector: "div.mermaid-textarea",
  template: ``,
  host: {
    '[class.edit-container]': 'true'
  },
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
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
      if (e.tr.origin === ORIGIN_SKIP_SYNC) return
      // 纯格式变更（如选区染色）不改变文本/语法高亮；跳过重渲，避免 diffHighLight 把选区塌缩成光标
      if (isFormatOnlyDelta(e.op)) return
      this._debounce_highlight(e.op)
    })
  }

  private _debounce_highlight = debounce((op: DeltaOperation[]) => {
    if (this.doc.event.status.isComposing) return
    nextTick().then(() => {
      this._codeRuntime.diffHighLight(op, {
        block: this,
        selectionValue: this.doc.selection.value,
        normalizeRange: (range: Range) => normalizeRange(
          range,
          id => this.doc.getBlockById(id) as any,
        )
      })
    })
  }, 200)

  override rerender() {
    super.rerender()
    queueMicrotask(() => {
      this._codeRuntime.renderCode(() => this.textContent(), () => this.textDeltas())
    })
  }
}
