import {Component, DestroyRef, HostBinding, inject, Input} from "@angular/core";
import {BaseBlock} from "@core/block-std/components/base-block";
import {DeltaInsert, DeltaOperation, IEditableBlockModel} from "@core/types";
import {NgForOf, NgTemplateOutlet} from "@angular/common";
import {BlockflowInline, deleteContent, insertContent} from "@core/block-std";
import {CharacterIndex, ICharacterRange, setSelection} from "@core/utils";
import Y, {USER_CHANGE_SIGNAL} from "@core/yjs";
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
export class EditableBlock<Model extends IEditableBlockModel = IEditableBlockModel> extends BaseBlock<Model> {
  @Input() placeholder: string = ''

  @HostBinding('style.text-align')
  protected _textAlign: string = 'left'

  @HostBinding('style.text-indent')
  protected _textIndent: string = '0'

  public yText!: Y.Text
  public containerEle!: HTMLElement
  protected destroyRef = inject(DestroyRef)

  override ngOnInit() {
    super.ngOnInit()
    this.yText = this.model.getYText()

    this.oldHasContent = !!this.textLength

    this.model.update$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(v => {
      if(v.type === 'props') {
        console.log('EditableBlock.update$', v, this.props, this._textAlign)
        // @ts-ignore
        this._textAlign !== this.props.textAlign && (this._textAlign = this.props.textAlign)
        parseInt(this._textIndent) !== this.props.indent && (this._textIndent = (this.props.indent || 0) * 2 + 'em')
      }
    })
    this.yText.observe((ev, tr) => {
      this.setPlaceholder()
      if (tr.origin === USER_CHANGE_SIGNAL) return
      // console.log('yText.observe', ev.changes.delta)
      this.applyDeltaToView(ev.changes.delta as DeltaOperation[], this.controller.undoRedo$.value)
      // this.model.children.splice(0, this.model.children.length, ...this.yText.toDelta())
    })
  }

  private oldHasContent = false

  private setPlaceholder() {
    if (!this.placeholder || (this.textLength && this.oldHasContent) || (!this.textLength && !this.oldHasContent)) return
    this.oldHasContent = !!this.textLength
    if (this.textLength) this.containerEle.classList.remove('placeholder-visible')
    else this.containerEle.classList.add('placeholder-visible')
  }

  override ngAfterViewInit() {
    super.ngAfterViewInit()
    this.containerEle = this.hostEl.nativeElement.querySelector('.editable-container') || this.hostEl.nativeElement
    this.placeholder && this.containerEle.setAttribute('placeholder', this.placeholder)

    this.forceRender()

    this.setPlaceholder()
    this.controller.readonly$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(readonly => {
      if (readonly) this.containerEle.removeAttribute('contenteditable')
      else this.containerEle.setAttribute('contenteditable', 'true')
    })
  }

  getTextDelta() {
    return this.yText.toDelta()
  }

  getTextContent() {
    return this.yText.toString()
  }

  get textLength() {
    return this.yText.length
  }

  setSelection(start: CharacterIndex, end?: CharacterIndex) {
    setSelection(this.containerEle, start, end ?? start)
  }

  forceRender() {
    const delta = this.getTextDelta()
    this.containerEle.innerHTML = ''
    if (delta.length) {
      for (const insert of delta) {
        if (!insert.insert) continue
        this.containerEle.appendChild(BlockflowInline.createView(insert))
      }
      return
    }
  }

  applyDelta(deltas: DeltaOperation[], setSelection = true) {
    console.log('applyDeltaToView', deltas)
    this.controller.transact(() => {
      this.yText.applyDelta(deltas)
      this.applyDeltaToView(deltas, setSelection)
    }, USER_CHANGE_SIGNAL)
  }

  private applyDeltaToModel(deltas: DeltaOperation[]) {
    this.yText.applyDelta(deltas)
  }

  private applyDeltaToView(deltas: DeltaOperation[], withSelection = false) {
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
  }

}
