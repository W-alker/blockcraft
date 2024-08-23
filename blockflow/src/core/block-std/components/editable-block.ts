import {Component, ElementRef, HostBinding, ViewChild} from "@angular/core";
import {BaseBlock} from "@core/block-std/components/base-block";
import {DeltaInsert, DeltaOperation, IEditableBlockModel, IInlineAttrs} from "@core/types";
import {NgForOf, NgTemplateOutlet} from "@angular/common";
import {createInlineView} from "@core/block-std";
import {ICharacterRange, replaceSelectionInView, setRange} from "@core/utils";
import Y from "@core/yjs";

@Component({
  selector: '[bf-editable-block]',
  standalone: true,
  template: ``,
  imports: [
    NgForOf,
    NgTemplateOutlet
  ]
})
export class EditableBlock extends BaseBlock<IEditableBlockModel> {
  @ViewChild('editableContainer', {read: ElementRef}) container!: ElementRef

  @HostBinding('attr.contenteditable')
  get contenteditable() {
    return !this.controller.readonly$.value
  }

  yText!: Y.Text

  get containerEle() {
    return this.container?.nativeElement || this.hostEl.nativeElement as HTMLElement
  }

  override ngOnInit() {
    super.ngOnInit()
    this.yText = this.yModel!.get('children') as Y.Text
    this.yText.observe(event => {
      // console.log('yText change ==================>>>', this.yText.toDelta())
      this.model.children = this.yText.toDelta()
    })
  }

  forceRender() {
    this.containerEle.innerHTML = ''
    const delta = this.yText.toDelta()
    if (delta.length) {
      for (const insert of this.children) {
        if(!insert.insert) continue
        this.containerEle.appendChild(createInlineView(insert))
      }
      return
    }
    /**
     * if there is no word
     * <p> <span></span> </p>  --> write any word in p tag --> <p> word <span></span> </p> ; it`s not expected result because the word should be in span tag
     * <p> <span>&#xFEFF;</span> </p>  --> write any word in p tag --> <p> <span>word&#xFEFF;</span> </p> ; it`s expected result
     */
    const span = this.DOCUMENT.createElement('span')
    span.innerHTML = '&#xFEFF;'
    this.containerEle.appendChild(span)
  }

  getTextContent() {
    return this.containerEle.textContent
  }

  override ngAfterViewInit() {
    this.forceRender()
    super.ngAfterViewInit()
  }

  format(attrs: IInlineAttrs, range: ICharacterRange) {
    // const r = formatWithAttrs(this.containerEle, range, attrs)
    this.yText.format(range.start, range.end - range.start, attrs)
    this.forceRender()
    return setRange(range, this.containerEle)
  }

  applyDeltaToView(deltas: DeltaOperation[], withRange = false) {
    console.log('applyDeltaToView', deltas)
    let retain = 0
    let _range: Range = this.DOCUMENT.createRange()

    for (const delta of deltas) {
      if (delta.retain) {
        if (delta.attributes)
          _range = this.format(delta.attributes, {start: retain, end: retain + delta.retain})
        retain += delta.retain
      } else if (delta.insert) {
        setRange({start: retain, end: retain}, this.containerEle, _range)
        _range.insertNode(createInlineView(delta as DeltaInsert))
        retain += delta.insert.length
      } else if (delta.delete) {
        setRange({start: retain, end: retain + delta.delete}, this.containerEle, _range)
        _range.deleteContents()
      }
    }

    requestAnimationFrame(() => {
      withRange ? replaceSelectionInView(_range) : _range.detach()
    })
  }

}
