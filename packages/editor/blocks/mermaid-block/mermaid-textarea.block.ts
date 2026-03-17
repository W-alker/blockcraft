import { ChangeDetectionStrategy, Component, DestroyRef } from "@angular/core";
import { DeltaOperation, EditableBlockComponent } from "../../framework";
import { MermaidTextareaBlockModel } from "./index";
import { CodeInlineManagerService } from "../code-block/code-inlineManager.service";
import { debounce, nextTick, performanceTest } from "../../global";
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

  private _inlineManager!: CodeInlineManagerService

  override get inlineManager() {
    return this._inlineManager
  }

  override _init() {
    super._init();
    this._inlineManager = new CodeInlineManagerService(this.doc, this, {
      lang: 'mermaid',
      withLineBreak: false,
      theme: this.doc.theme.includes('light') ? 'github-light' : 'github-dark',
    })
    this.doc.themeChange$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(v => {
      this.inlineManager.setTheme(this.doc.theme.includes('light') ? 'github-light' : 'github-dark')
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
      this.inlineManager.diffHighLight(op)
    })
  }, 200)

  override rerender() {
    this.inlineManager.renderCode()
  }
}

