import {ChangeDetectionStrategy, Component, HostBinding} from "@angular/core";
import {BaseBlockComponent} from "./base-block";
import {EditableBlockNative} from "../../reactive";
import * as Y from 'yjs'
import {DeltaInsert, DeltaOperation} from "../../types";
import {INLINE_CONTAINER_CLASS} from "../../inline";

@Component({
  selector: 'editable-block',
  template: ``,
  styles: [``],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EditableBlockComponent<Model extends EditableBlockNative = EditableBlockNative> extends BaseBlockComponent<Model> {
  plainTextOnly = false

  yText!: Y.Text

  get inlineManager() {
    return this.doc.inlineManager
  }

  override ngAfterViewInit() {
    super.ngAfterViewInit();
    this._containerElement = this.hostElement.classList.contains(INLINE_CONTAINER_CLASS) ? this.hostElement : this.hostElement.querySelector(`.${INLINE_CONTAINER_CLASS}`)!
    this.rerender()
  }

  override reattach() {
    super.reattach();
    this.rerender()
  }

  protected _containerElement!: HTMLElement

  /**
   * 编辑文本的容器
   */
  get containerElement() {
    return this._containerElement
  }

  @HostBinding('style.text-align')
  get textAlign() {
    return this._native.props['textAlign']
  }

  @HostBinding('attr.data-heading')
  get heading() {
    return this.plainTextOnly ? undefined : this._native.props['heading']
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
    this.inlineManager.render(this.textDeltas(), this.containerElement)
  }

  insertText(index: number, text: string, attributes?: DeltaInsert['attributes']) {
    if (!text) return
    this.yText.insert(index, text, attributes)
  }

  deleteText(index: number, length = this.textLength - index) {
    if (!length) return
    this.yText.delete(index, length)
  }

  replaceText(index: number, length: number, text?: string | null) {
    const delta: DeltaOperation[] = []
    index > 0 && delta.push({retain: index})
    length > 0 && delta.push({delete: length})
    text && delta.push({insert: text})
    this.yText.applyDelta(delta)
  }

  formatText(index: number, length: number, attributes: DeltaInsert['attributes']) {
    this.yText.format(index, length, attributes as any)
  }

  applyDeltaOperations(delta: DeltaOperation[]) {
    this.yText.applyDelta(delta)
  }

  // deleteText(index: number, length = this.textLength - index) {
  //   if (!length) return
  //   this.applyDeltaOperation([{retain: index}, {delete: length}])
  // }
  //
  // insertText(index: number, text: string, attributes?: DeltaInsert['attributes']) {
  //   if (!text) return
  //   this.applyDeltaOperation([{retain: index}, {insert: text, attributes}])
  // }
  //
  // replaceText(index: number, length: number, text?: string | null) {
  //   const delta: DeltaOperation[] = []
  //   index > 0 && delta.push({retain: index})
  //   length > 0 && delta.push({delete: length})
  //   text && delta.push({insert: text})
  //   this.doc.crud.transact(() => {
  //     length > 0 && this.yText.delete(index, length)
  //     text && this.yText.insert(index, text)
  //     this._applyDeltaToView(delta)
  //   }, ORIGIN_SKIP_SYNC)
  // }
  //
  // insertEmbed(index: number, embed: DeltaInsertEmbed) {
  //   this.applyDeltaOperation([{retain: index}, embed])
  // }
  //
  // formatText(index: number, length: number, attributes: DeltaInsert['attributes']) {
  //   this.doc.crud.transact(() => {
  //     // @ts-expect-error
  //     this.yText.format(index, length, attributes)
  //     this._applyDeltaToView([{retain: index}, {retain: length, attributes}])
  //   }, ORIGIN_SKIP_SYNC)
  // }

  // applyDeltaOperation(delta: DeltaOperation[]) {
  //   if (this.doc.isReadonly) return
  //   this.doc.crud.transact(() => {
  //     this._applyDeltaToYText(delta)
  //     this._applyDeltaToView(delta)
  //   }, ORIGIN_SKIP_SYNC)
  // }

  protected _applyDeltaToYText(deltas: DeltaOperation[]) {
    this.yText.applyDelta(deltas)
    // let r = 0
    // for (const delta of deltas) {
    //   if (delta.insert) {
    //     if (typeof delta.insert === 'string') {
    //       this.yText.insert(r, delta.insert, delta.attributes)
    //       r += delta.insert.length
    //     } else {
    //       this.yText.insertEmbed(r, delta.insert, delta.attributes)
    //       r += 1
    //     }
    //   } else if (delta.delete) {
    //     this.yText.delete(r, delta.delete)
    //   } else if (delta.retain) {
    //     r += delta.retain
    //   }
    // }
  }

  protected _applyDeltaToView(deltas: DeltaOperation[]) {
    if (this.doc.isReadonly) return
    try {
      this.doc.inlineManager.applyDeltaToView(deltas, this.containerElement)
    } catch (e) {
      this.doc.logger.error(`Error throw when apply delta to view. Block: `, this, e)
      this.rerender()
    }
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
