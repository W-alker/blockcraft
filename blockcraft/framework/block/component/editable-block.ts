import {Component} from "@angular/core";
import {BaseBlockComponent} from "./base-block";
import {EditableBlockNative} from "../../reactive";
import * as Y from 'yjs'
import {DeltaInsert, DeltaInsertEmbed, DeltaOperation} from "../../types";
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

  deleteText(index: number, length: number) {
    if(!length) return
    this.applyDeltaOperation([{retain: index}, {delete: length}])
  }

  insertText(index: number, text: string) {
    if(!text) return
    this.applyDeltaOperation([{retain: index}, {insert: text}])
  }

  replaceText(index: number, length: number, text?: string | null) {
    const delta: DeltaOperation[] = [{delete: length}]
    index > 0 && delta.unshift({retain: index})
    text && delta.push({insert: text})
    this.applyDeltaOperation(delta)
  }

  insertEmbed(index: number, embed: DeltaInsertEmbed) {
    this.applyDeltaOperation([{retain: index}, embed])
  }

  applyDeltaOperation(delta: DeltaOperation[]) {
    console.log('applyDeltaOperation', delta)
    this.doc.crud.transact(() => {
      this.yText.applyDelta(delta)
      this.doc.inlineManager.applyDeltaToView(delta, this.hostElement)
    }, ORIGIN_SKIP_SYNC)
  }

}
