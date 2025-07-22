import {ChangeDetectionStrategy, Component} from "@angular/core";
import {DeltaOperation, EditableBlockComponent} from "../../framework";
import {MermaidTextareaBlockModel} from "./index";
import {CodeInlineManagerService} from "../code-block/code-inlineManager.service";
import {debounce, nextTick, performanceTest} from "../../global";
import * as Y from "yjs";

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
      withLineBreak: false
    })
  }

  override ngAfterViewInit() {
    super.ngAfterViewInit()
    this.yText.observe(this._debounce_highlight)
  }

  override detach() {
    super.detach();
    this.yText.unobserve(this._debounce_highlight)
  }

  override reattach() {
    super.reattach();
    this.yText.observe(this._debounce_highlight)
  }

  private _debounce_highlight = debounce((e: Y.YTextEvent) => {
    nextTick().then(() => {
      this.inlineManager.diffHighLight(e.delta as DeltaOperation[])
    })
  }, 200)

  @performanceTest('mermaid textarea block render')
  override rerender() {
    this.inlineManager.renderCode()
  }
}
