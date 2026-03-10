import { ChangeDetectionStrategy, Component, HostBinding } from "@angular/core";
import { BaseBlockComponent } from "./base-block";
import { EditableBlockNative } from "../../reactive";
import * as Y from 'yjs'
import { DeltaInsert, DeltaOperation } from "../../types";
import { INLINE_CONTAINER_CLASS } from "../../inline";
import { Subject } from "rxjs";
import Delta from "quill-delta";

const composeDelta = (current: DeltaInsert[], operations: DeltaOperation[]) => {
  return new Delta(current as never).compose(new Delta(operations as never)).ops as DeltaInsert[];
};

@Component({
  selector: 'editable-block',
  template: ``,
  styles: [``],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EditableBlockComponent<Model extends EditableBlockNative = EditableBlockNative> extends BaseBlockComponent<Model> {
  plainTextOnly = false
  protected _snapshotDelta: DeltaInsert[] = []

  private _yText!: Y.Text
  get yText() {
    return this._yText ||= this.yBlock.get('children') as Y.Text
  }

  get inlineManager() {
    return this.getDocRuntime().inlineManager
  }

  onTextChange = new Subject<{ op: DeltaOperation[]; tr: Y.Transaction; }>();

  override ngAfterViewInit() {
    super.ngAfterViewInit();
    this._containerElement = this.hostElement.classList.contains(INLINE_CONTAINER_CLASS) ? this.hostElement : this.hostElement.querySelector(`.${INLINE_CONTAINER_CLASS}`)!
    this.rerender()
  }

  override reattach() {
    super.reattach();
    this.rerender()
  }

  protected override _initSnapshotState() {
    super._initSnapshotState();
    this._snapshotDelta = this.snapshot?.nodeType === 'editable'
      ? [...this.snapshot.children]
      : [];
  }

  protected override onRenderStateUpdated() {
    if (this._containerElement) {
      this.rerender()
    }
  }

  protected override onRenderContextUpdated() {
    if (this._containerElement && !this.hasReactiveState()) {
      this.rerender()
    }
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

  get textLength() {
    return this.textDeltas().reduce((acc, cur) => {
      return acc + (typeof cur.insert === 'string' ? cur.insert.length : 1)
    }, 0)
  }

  override textContent() {
    return this.textDeltas().reduce((acc, cur) => {
      return acc + (typeof cur.insert === 'string' ? cur.insert : cur.insert['break'] ? '\n' : '')
    }, '')
  }

  textDeltas(): DeltaInsert[] {
    if (this.hasReactiveState()) {
      return this.yText.toDelta()
    }
    return [...this._snapshotDelta]
  }

  rerender() {
    if (this.renderContext) {
      this.renderContext.renderInline(this.textDeltas(), this.containerElement)
      return
    }
    this.inlineManager.render(this.textDeltas(), this.containerElement)
  }

  insertText(index: number, text: string, attributes?: DeltaInsert['attributes']) {
    if (!text) return
    if (this.hasReactiveState()) {
      this.yText.insert(index, text, attributes)
      return
    }
    this.applyDeltaOperations([{retain: index}, {insert: text, attributes}])
  }

  deleteText(index: number, length = this.textLength - index) {
    if (!length) return
    if (this.hasReactiveState()) {
      this.yText.delete(index, length)
      return
    }
    this.applyDeltaOperations([{retain: index}, {delete: length}])
  }

  replaceText(index: number, length: number, text?: string | null, attributes?: DeltaInsert['attributes']) {
    const delta: DeltaOperation[] = []
    index > 0 && delta.push({ retain: index })
    length > 0 && delta.push({ delete: length })
    text && delta.push({ insert: text, attributes })
    this.applyDeltaOperations(delta)
  }

  formatText(index: number, length: number, attributes: DeltaInsert['attributes']) {
    if (this.hasReactiveState()) {
      this.yText.format(index, length, attributes as any)
      return
    }
    const delta: DeltaOperation[] = []
    index > 0 && delta.push({retain: index})
    length > 0 && delta.push({retain: length, attributes})
    this.applyDeltaOperations(delta)
  }

  applyDeltaOperations(delta: DeltaOperation[]) {
    if (this.hasReactiveState()) {
      this.yText.applyDelta(delta)
      return
    }

    this._snapshotDelta = composeDelta(this._snapshotDelta, delta)
    if (this.snapshot?.nodeType === 'editable') {
      this.snapshot.children = [...this._snapshotDelta]
    }
    this._native.children = [...this._snapshotDelta] as Model['children']
    this._applyDeltaToView(delta)
    this.changeDetectorRef.markForCheck()
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
    if (!this.hasReactiveState()) {
      this._snapshotDelta = composeDelta(this._snapshotDelta, deltas)
      if (this.snapshot?.nodeType === 'editable') {
        this.snapshot.children = [...this._snapshotDelta]
      }
      this._native.children = [...this._snapshotDelta] as Model['children']
      return
    }
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
    if ((this.doc as BlockCraft.Doc | undefined)?.isReadonly) return
    if (this.renderContext) {
      try {
        this.renderContext.patchInline(deltas, this.containerElement)
      } catch (e) {
        this.rerender()
      }
      return
    }
    try {
      this.getDocRuntime().inlineManager.applyDeltaToView(deltas, this.containerElement)
    } catch (e) {
      this.getDocRuntime().logger.error(`Error throw when apply delta to view. Block: `, this, e)
      this.rerender()
    }
  }

  setInlineRange(index: number, length = 0) {
    return this.getDocRuntime().selection.setSelection({
      index,
      length,
      type: 'text',
      blockId: this.id
    })
  }

}
