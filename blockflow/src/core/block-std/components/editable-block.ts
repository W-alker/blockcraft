import {Component, DestroyRef, HostBinding, inject, Input} from "@angular/core";
import {BaseBlock} from "@core/block-std/components/base-block";
import {DeltaInsert, DeltaOperation, IEditableBlockModel} from "@core/types";
import {NgForOf, NgTemplateOutlet} from "@angular/common";
import {BlockflowInline, deleteContent, insertContent} from "@core/block-std";
import {ICharacterRange, setSelection} from "@core/utils";
import Y from "@core/yjs";
import {takeUntilDestroyed} from "@angular/core/rxjs-interop";

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
  @Input() placeholder: string = ''

  @HostBinding('style.text-align')
  get textAlign() {
    return this.props['textAlign']
  }

  private yText!: Y.Text
  public containerEle!: HTMLElement
  protected destroyRef = inject(DestroyRef)

  override ngOnInit() {
    super.ngOnInit()
    this.yText = this.controller.getEditableBlockYText(this.model.id)
    this.yText.observe(event => {
      Promise.resolve().then(() => {
        this.model.children = this.yText.toDelta()
      })
      this.setPlaceholder()
    })
  }

  private setPlaceholder() {
    if(!this.textLength && this.placeholder) return this.containerEle.setAttribute('placeholder', this.placeholder)
    this.containerEle.removeAttribute('placeholder')
  }

  override ngAfterViewInit() {
    super.ngAfterViewInit()
    this.containerEle = this.hostEl.nativeElement.querySelector('.editable-container') || this.hostEl.nativeElement
    this.forceRender()

    this.setPlaceholder()
    this.controller.readonly$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(readonly => {
      if (readonly) this.containerEle.removeAttribute('contenteditable')
      else this.containerEle.setAttribute('contenteditable', 'true')
    })
  }

  getTextDelta() {
    return this.model.children = this.yText.toDelta() as DeltaInsert[]
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

  applyDeltaToModel(deltas: DeltaOperation[]) {
    this.yText.applyDelta(deltas)
  }

  applyDeltaToView(deltas: DeltaOperation[], withSelection = false) {
    // console.time('applyDeltaToView')
    console.log('applyDeltaToView', deltas)
    let _range: ICharacterRange | undefined = {
      start: 0,
      end: 0
    }

    let retain = 0
    for (const delta of deltas) {
      if (delta.retain) {
        if (delta.attributes) this.forceRender()
        withSelection && (_range = {start: retain, end: retain + delta.retain})
        retain += delta.retain
      } else if (delta.insert) {
        insertContent(this.containerEle, retain, delta as DeltaInsert)
        retain += typeof delta.insert === 'string' ? delta.insert.length : 1
        withSelection && (_range = {start: retain, end: retain})
      } else if (delta.delete) {
        deleteContent(this.containerEle, retain, delta.delete)
        if (withSelection) {
          _range = {start: retain, end: retain}
        }
      }
    }

    if (withSelection && _range) {
      // console.log('setSelection', _range)
      setSelection(this.containerEle, _range!.start, _range!.end)
    }
    // console.timeEnd('applyDeltaToView')
  }

}
