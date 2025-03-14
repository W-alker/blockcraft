import {ChangeDetectionStrategy, Component, HostBinding} from "@angular/core";
import {BaseBlockComponent} from "./base-block";
import {EditableBlockNative} from "../../reactive";
import * as Y from 'yjs'
import {DeltaInsert, DeltaInsertEmbed, DeltaOperation} from "../../types";
import {ORIGIN_SKIP_SYNC} from "../../doc";
import {INLINE_CONTAINER_CLASS} from "../../inline";

@Component({
  selector: 'editable-block',
  template: ``,
  styles: [``],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EditableBlockComponent<Model extends EditableBlockNative = EditableBlockNative> extends BaseBlockComponent<Model> {

  yText!: Y.Text

  override ngAfterViewInit() {
    super.ngAfterViewInit();
    this._containerElement = this.hostElement.classList.contains(INLINE_CONTAINER_CLASS) ? this.hostElement : this.hostElement.querySelector(`.${INLINE_CONTAINER_CLASS}`)!
    this.doc.inlineManager.render(this._native.children, this.containerElement)
  }

  protected _containerElement!: HTMLElement

  /**
   * 编辑文本的容器
   */
  get containerElement() {
    return this._containerElement
  }

  @HostBinding('style.margin-left')
  get marginLeft() {
    return `${(this._native.props.depth || 0) * 2}em`
  }

  protected override _init() {
    super._init();
    this.yText = this.yBlock.get('children') as Y.Text
  }

  get textLength() {
    return this.yText.length
  }

  override textContent() {
    return (this.yText.toDelta() as DeltaInsert[]).reduce((acc, cur) => {
      return acc + (typeof cur.insert === 'string' ? cur.insert : cur.insert['break'] ? '\n' : '')
    }, '')
  }

  textDeltas(): DeltaInsert[] {
    return this.yText.toDelta()
  }

  rerender() {
    this.doc.inlineManager.render(this.textDeltas(), this.containerElement)
  }

  deleteText(index: number, length = this.textLength - index) {
    if (!length) return
    this.applyDeltaOperation([{retain: index}, {delete: length}])
  }

  insertText(index: number, text: string) {
    if (!text) return
    this.applyDeltaOperation([{retain: index}, {insert: text}])
  }

  replaceText(index: number, length: number, text?: string | null) {
    const delta: DeltaOperation[] = []
    index > 0 && delta.push({retain: index})
    length > 0 && delta.push({delete: length})
    text && delta.push({insert: text})
    this.doc.crud.transact(() => {
      length > 0 && this.yText.delete(index, length)
      text && this.yText.insert(index, text)
      this.doc.inlineManager.applyDeltaToView(delta, this.containerElement)
    }, ORIGIN_SKIP_SYNC)
  }

  insertEmbed(index: number, embed: DeltaInsertEmbed) {
    this.applyDeltaOperation([{retain: index}, embed])
  }

  applyDeltaOperation(delta: DeltaOperation[]) {
    this.doc.crud.transact(() => {
      this.yText.applyDelta(delta)
      this.doc.inlineManager.applyDeltaToView(delta, this.containerElement)
    }, ORIGIN_SKIP_SYNC)
  }

  setInlineRange(index: number, length = 0) {
    this.doc.selection.setSelection({
      index,
      length,
      type: 'text',
      blockId: this.id
    })
  }

}
