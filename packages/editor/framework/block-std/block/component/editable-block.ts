import { ChangeDetectionStrategy, Component, HostBinding } from "@angular/core";
import { BaseBlockComponent } from "./base-block";
import { EditableBlockNative } from "../../reactive";
import * as Y from 'yjs'
import { DeltaInsert, DeltaOperation } from "../../types";
import { INLINE_CONTAINER_CLASS, TextBlot, BlotType } from "../../inline";
import { InlineRuntime } from "../../inline/runtime/inline-runtime";
import { Subject } from "rxjs";

@Component({
  selector: 'editable-block',
  template: ``,
  styles: [``],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EditableBlockComponent<Model extends EditableBlockNative = EditableBlockNative> extends BaseBlockComponent<Model> {
  plainTextOnly = false

  private _yText!: Y.Text
  get yText() {
    return this._yText ||= this.yBlock.get('children') as Y.Text
  }

  protected _runtime!: InlineRuntime

  /**
   * Per-block InlineRuntime: owns ScrollBlot tree + InlinePositionMapper.
   * Subclasses (e.g. CodeBlockComponent) can override runtime creation.
   */
  get runtime(): InlineRuntime {
    return this._runtime
  }

  onTextChange = new Subject<{ op: DeltaOperation[]; tr: Y.Transaction; }>();

  override ngAfterViewInit() {
    super.ngAfterViewInit();
    this._containerElement = this.hostElement.classList.contains(INLINE_CONTAINER_CLASS) ? this.hostElement : this.hostElement.querySelector(`.${INLINE_CONTAINER_CLASS}`)!

    this._initRuntime()
    this.rerender()
  }

  /**
   * Initialize the InlineRuntime for this block.
   * Called once in ngAfterViewInit. Subclasses can override to use a custom runtime.
   */
  protected _initRuntime() {
    const embedConverters = new Map(this.doc.config.embeds || [])
    this._runtime = new InlineRuntime(this._containerElement, embedConverters)
  }

  override reattach() {
    super.reattach();
    this.rerender()
  }

  protected _containerElement!: HTMLElement

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
    this._runtime.render(this.textDeltas())
  }

  insertText(index: number, text: string, attributes?: DeltaInsert['attributes']) {
    if (!text) return
    this.yText.insert(index, text, attributes)
  }

  deleteText(index: number, length = this.textLength - index) {
    if (!length) return
    this.yText.delete(index, length)
  }

  replaceText(index: number, length: number, text?: string | null, attributes?: DeltaInsert['attributes']) {
    const delta: DeltaOperation[] = []
    index > 0 && delta.push({ retain: index })
    length > 0 && delta.push({ delete: length })
    text && delta.push({ insert: text, attributes })
    this.yText.applyDelta(delta)
  }

  formatText(index: number, length: number, attributes: DeltaInsert['attributes']) {
    this.yText.format(index, length, attributes as any)
  }

  applyDeltaOperations(delta: DeltaOperation[]) {
    this.yText.applyDelta(delta)
  }

  protected _applyDeltaToYText(deltas: DeltaOperation[]) {
    this.yText.applyDelta(deltas)
  }

  /**
   * Apply delta operations to the view via the blot tree (InlineRuntime).
   * Called by crud.ts when Y.Text changes arrive from remote or local transactions.
   */
  protected _applyDeltaToView(deltas: DeltaOperation[]) {
    if (this.doc.isReadonly) return
    try {
      this._runtime.applyDelta(deltas)
      if (!this._verifyBlotConsistency()) {
        this.rerender()
      }
    } catch {
      this.rerender()
    }
  }

  /**
   * Verify that the blot tree content matches the Yjs delta model.
   * Returns true if consistent, false if mismatch detected.
   *
   * Uses fast O(1) length comparison. Falls back to full text comparison
   * only when length matches but content might differ (rare edge case).
   */
  private _verifyBlotConsistency(): boolean {
    // Fast path: O(1) length comparison covers >99% of real mismatches
    if (this.yText.length !== this._runtime.scrollBlot.textLength) {
      return false
    }

    // Full path: compare text content to catch same-length divergences
    const deltas = this.yText.toDelta() as DeltaInsert[]
    const leaves = this._runtime.scrollBlot.leaves

    let expectedText = ''
    for (const d of deltas) {
      expectedText += typeof d.insert === 'string' ? d.insert : '\ufffc'
    }

    let actualText = ''
    for (const leaf of leaves) {
      if (leaf.type === BlotType.Text) {
        actualText += (leaf as TextBlot).text
      } else if (leaf.type === BlotType.Embed) {
        actualText += '\ufffc'
      }
    }

    return expectedText === actualText
  }

  setInlineRange(index: number, length = 0) {
    return this.doc.selection.setSelection({
      index,
      length,
      type: 'text',
      blockId: this.id
    })
  }

}
