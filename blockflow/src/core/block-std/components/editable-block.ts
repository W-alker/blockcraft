import {Component, HostBinding} from "@angular/core";
import {BaseBlock} from "@core/block-std/components/base-block";
import {DeltaInsert, DeltaOperation, IEditableBlockModel, IInlineAttrs} from "@core/types";
import {NgForOf, NgTemplateOutlet} from "@angular/common";
import {BlockflowInline, deleteContent, insertContent} from "@core/block-std";
import {ICharacterRange, setSelection} from "@core/utils";
import Y from "@core/yjs";

@Component({
  selector: '.editable-container',
  standalone: true,
  template: ``,
  imports: [
    NgForOf,
    NgTemplateOutlet
  ],
})
export class EditableBlock extends BaseBlock<IEditableBlockModel> {
  @HostBinding('attr.contenteditable')
  get contentEditable() {
    return !this.controller.readonly$.value
  }

  private yText!: Y.Text
  private update = () => {
    this.model.children = this.yText.toDelta()
  }

  public containerEle!: HTMLElement

  override ngOnInit() {
    super.ngOnInit()
    this.yText = this.controller.getEditableBlockYText(this.model.id)
    this.yText.observe(this.update)
  }

  override ngAfterViewInit() {
    super.ngAfterViewInit()
    this.containerEle = this.hostEl.nativeElement.querySelector('.editable-container') || this.hostEl.nativeElement
    this.forceRender()
  }

  getTextDelta() {
    return this.model.children = this.yText.toDelta()
  }

  getTextContent() {
    return this.yText.toString()
  }

  get textLength() {
    return this.yText.length
  }

  forceRender() {
    const delta = this.getTextDelta()
    this.model.children = delta
    this.containerEle.innerHTML = ''
    if (delta.length) {
      for (const insert of delta) {
        if (!insert.insert) continue
        this.containerEle.appendChild(BlockflowInline.createView(insert))
      }
      return
    }
  }

  format(attrs: IInlineAttrs, range: ICharacterRange, withSelection = false) {
    this.yText.format(range.start, range.end - range.start, attrs)
    // formatContent(this.containerEle, range, attrs)
    console.time('forceRender')
    this.forceRender()
    console.timeEnd('forceRender')
    withSelection && setSelection(this.containerEle, range.start, range.end)
  }

  applyDeltaToModel(deltas: DeltaOperation[]) {
    this.yText.applyDelta(deltas)
  }

  applyDeltaToView(deltas: DeltaOperation[], withSelection = false) {
    console.time('applyDeltaToView')
    // console.log('applyDeltaToView', deltas)
    let _range: ICharacterRange | undefined
    let retain = 0
    for (const delta of deltas) {
      if (delta.retain) {
        if (delta.attributes)
          this.format(delta.attributes, {start: retain, end: retain + delta.retain})
        retain += delta.retain
        withSelection && (_range = {start: retain, end: retain + delta.retain})
      } else if (delta.insert) {
        insertContent(this.containerEle, retain, delta as DeltaInsert)
        retain += delta.insert.length
        withSelection && (_range = {start: retain, end: retain})
      } else if (delta.delete) {
        deleteContent(this.containerEle, retain, delta.delete)
        withSelection && (_range = {start: retain, end: retain})
      }
    }
    if (withSelection && _range) {
      setSelection(this.containerEle, _range.start, _range.end)
    }
    console.timeEnd('applyDeltaToView')
  }

  ngOnDestroy() {
    this.yText.unobserve(this.update)
  }
}
