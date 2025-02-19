import {Component} from "@angular/core";
import {BaseBlockComponent} from "./base-block";
import {EditableBlockNative} from "../../reactive";
import * as Y from 'yjs'
import {DeltaInsert, DeltaOperation} from "../../types";
import {ORIGIN_SKIP_SYNC} from "../../doc";

@Component({
  selector: 'editable-block',
  template: ``,
  styles: [``],
  standalone: true
})
export class EditableBlockComponent<Model extends EditableBlockNative = EditableBlockNative> extends BaseBlockComponent<Model> {

  yText!: Y.Text

  override ngAfterViewInit() {
    super.ngAfterViewInit();
    this.doc.inlineManager.render(this._native.children, this.hostElement)
  }

  protected override _init() {
    super._init();
    this.yText = this.yBlock.get('children') as Y.Text
  }

  get textLength() {
    return this.yText.length
  }

  textContent() {
    return this.yText.toString()
  }

  textDeltas(): DeltaInsert[] {
    return this.yText.toDelta()
  }

  rerender() {
    this.doc.inlineManager.render(this.textDeltas(), this.hostElement)
  }

  applyDeltaOperation(delta: DeltaOperation[]) {
    this.doc.crud.transact(() => {
      this.yText.applyDelta(delta)
      this.doc.inlineManager.applyDeltaToView(delta, this.hostElement)
    }, ORIGIN_SKIP_SYNC)
  }

}
