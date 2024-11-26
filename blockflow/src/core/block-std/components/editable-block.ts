import {Component, HostBinding, Input} from "@angular/core";
import {takeUntilDestroyed} from "@angular/core/rxjs-interop";
import {CharacterIndex, DeltaInsert, DeltaOperation, ICharacterRange, IEditableBlockModel} from "../../types";
import {BaseBlock} from "./base-block";
import {USER_CHANGE_SIGNAL} from "../../yjs";
import {deleteContent, insertContent} from "../utils";
import Y from '../../yjs'
import {setCharacterRange} from "../../utils";

@Component({
  selector: '.editable-container',
  template: ``,
  imports: [],
  standalone: true,
})
export class EditableBlock<Model extends IEditableBlockModel = IEditableBlockModel> extends BaseBlock<Model> {
  @Input() placeholder: string = ''

  @HostBinding('style.text-align')
  protected _textAlign: string = 'left'

  @HostBinding('style.text-indent')
  protected _textIndent: string = '0'

  public yText!: Y.Text
  public containerEle!: HTMLElement

  override ngOnInit() {
    super.ngOnInit()
    this.yText = this.model.getYText()
    this.oldHasContent = !!this.textLength
    this._textIndent = (this.props.indent || 0) * 2 + 'em'
    this.cdr.markForCheck()

    this.model.update$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(v => {
      if (v.type === 'props') {
        // @ts-ignore
        this._textAlign !== this.props.textAlign && (this._textAlign = this.props.textAlign)
        parseInt(this._textIndent) / 2 !== this.props.indent && (this._textIndent = (this.props.indent || 0) * 2 + 'em')
        this.cdr.markForCheck()
      }
    })

    this.yText.observe((event, tr) => {
      this.setPlaceholder()

      if (tr.origin === USER_CHANGE_SIGNAL) return
      this.applyDeltaToView(event.changes.delta as DeltaOperation[]
        // , this.controller.undoRedo$.value
      )
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
    setCharacterRange(this.containerEle, start, end ?? start);
  }

  forceRender() {
    const delta = this.getTextDelta()
    this.containerEle.innerHTML = ''
    const fragment = document.createDocumentFragment()
    if (delta.length) {
      for (const insert of delta) {
        if (!insert.insert) continue
        fragment.appendChild(this.controller.inlineManger.createView(insert))
      }
      this.containerEle.appendChild(fragment)
    }
  }

  applyDelta(deltas: DeltaOperation[], setSelection = true) {
    // console.log('applyDeltaToView', deltas)
    this.controller.transact(() => {
      this.yText.applyDelta(deltas)
      this.applyDeltaToView(deltas, setSelection)
    }, USER_CHANGE_SIGNAL)
  }

  applyDeltaToModel(deltas: DeltaOperation[]) {
    // console.log('applyDeltaToModel', deltas)
    this.yText.applyDelta(deltas)
  }

  applyDeltaToView(deltas: DeltaOperation[], withSelection = false, containerEle = this.containerEle) {
    let _range: ICharacterRange | undefined
    // console.log('applyDeltaToModel', deltas)

    let retain = 0
    for (const delta of deltas) {
      if (delta.retain) {
        if (delta.attributes) this.forceRender()
        withSelection && (_range = {start: retain, end: retain + delta.retain})
        retain += delta.retain
      } else if (delta.insert) {
        insertContent(containerEle, retain, delta as DeltaInsert, this.controller.inlineManger.createView.bind(this.controller.inlineManger))
        retain += typeof delta.insert === 'string' ? delta.insert.length : 1
        withSelection && (_range = {start: retain, end: retain})
      } else if (delta.delete) {
        deleteContent(containerEle, retain, delta.delete)
        withSelection && (_range = {start: retain, end: retain})
      }
    }

    if (withSelection && _range) {
      // console.log('setSelection', _range)
      setCharacterRange(containerEle, _range.start, _range.end)
    }
  }

}
