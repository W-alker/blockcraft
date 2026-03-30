import {ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, OnDestroy, OnInit, Output, ViewChild} from '@angular/core'
import {FormsModule} from "@angular/forms";
import {debounce} from "../../../global";
import {AsyncPipe} from "@angular/common";
import {FindReplaceHelper} from "../find-replace.helper";

@Component({
  selector: 'find-replace',
  templateUrl: './find-replace-dialog.html',
  styleUrls: ['./find-replace-dialog.scss'],
  standalone: true,
  imports: [
    FormsModule,
    AsyncPipe
  ],
})
export class FindReplaceDialog implements OnInit, OnDestroy {
  @Input()
  doc!: BlockCraft.Doc

  @Output()
  onClose = new EventEmitter<void>()

  @ViewChild('findInput', {read: ElementRef}) findInput!: ElementRef<HTMLInputElement>

  findText = ''
  replaceText = ''

  helper!: FindReplaceHelper

  ngOnInit() {
    this.helper = new FindReplaceHelper(this.doc)
    this.helper.listen()
  }

  ngAfterViewInit() {
    this.findInput.nativeElement.focus()
  }

  ngOnDestroy() {
    this.helper.destroy()
  }

  onFlagChange(item: typeof this.helper.regFlagList[number]) {
    this.helper.toggleFlag(item)
    this.helper.findAll(this.findText)
    this.cdr.markForCheck()
  }

  findNext() {
    this.helper.findNext()
  }

  findPrev() {
    this.helper.findPrev()
  }

  replaceOne() {
    this.helper.replaceOne(this.replaceText)
  }

  replaceAll() {
    this.helper.replaceAll(this.replaceText)
  }

  private _timer: any
  onFindTextChange = debounce(() => {
    if (this._timer) {
      clearTimeout(this._timer)
      this._timer = null
    }
    this.helper.clearAll()
    if (!this.findText) return
    if (this.findText.length < 3) {
      this._timer = setTimeout(() => {
        this.helper.findAll(this.findText)
        this.cdr.markForCheck()
      }, 1000)
    } else {
      this.helper.findAll(this.findText)
      this.cdr.markForCheck()
    }
  }, 500)

  constructor(private cdr: ChangeDetectorRef) {
  }
}
