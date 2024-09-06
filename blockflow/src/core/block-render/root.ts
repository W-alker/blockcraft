import {
  ChangeDetectorRef,
  Component, ElementRef, EventEmitter,
  HostBinding,
  HostListener, Output,
  ViewContainerRef,
} from "@angular/core";
import {NgForOf, NgIf} from "@angular/common";
import {
  BlockSelection, CharacterIndex, characterIndex2Number,
  Controller, deleteContent,
  getCurrentCharacterRange,
  IBlockModel,
  ICharacterRange,
  pasteHandler, USER_INPUT_ORIGIN
} from "@core";
import {BlockWrap} from "./block-wrap";
import {BehaviorSubject} from "rxjs";

@Component({
  selector: 'div[bf-node-type="root"][lazy-load="false"]',
  template: `
    <ng-container *ngIf="controller">
      <ng-container *ngFor="let block of controller.rootModel; trackBy:trackBy">
        <div bf-block-wrap [controller]="controller" [model]="block"></div>
      </ng-container>
    </ng-container>
  `,
  standalone: true,
  imports: [
    BlockWrap,
    NgForOf,
    NgIf,
  ],
})
export class EditorRoot {
  // @HostBinding('style.fontSize.px')
  @HostBinding('attr.tabindex') private readonly tabindex = '0'
  @Output() onDestroy = new EventEmitter<void>()

  constructor(
    public readonly elementRef: ElementRef<HTMLElement>,
    protected cdr: ChangeDetectorRef,
    private vcr: ViewContainerRef
  ) {
  }

  ngAfterViewInit() {
    this.initBlockSelection()
    this.ready$.next(true)
  }

  public readonly ready$ = new BehaviorSubject(false)

  protected controller!: Controller

  get rootElement() {
    return this.elementRef.nativeElement
  }

  private _activeElement: HTMLElement | null = null

  get activeElement() {
    return this._activeElement
  }

  protected trackBy = (index: number, item: IBlockModel) => {
    return `${item.flavour}-${item.id}`
  }

  private blockSelection!: BlockSelection
  private _selectedBlockRange: ICharacterRange | undefined = undefined
  get selectedBlockRange() {
    return this._selectedBlockRange
  }

  setController(controller: Controller) {
    this.controller = controller
    this.rootElement.id = controller.rootId
  }

  private initBlockSelection() {
    this.blockSelection = new BlockSelection({
      host: this.rootElement,
      document: document,
      enable: false,
      onlyLeftButton: true,
      selectable: "[bf-block-wrap]",
      selectionAreaClass: "blockflow-selection-area",
      sensitivity: 40,
      onItemSelect: (element) => {
        element.classList.add('bf-block-selected')
      },
      onItemUnselect: (element) => {
        element.classList.remove('bf-block-selected')
      }
    })

    this.blockSelection.on('end', (blocks) => {
      if (!blocks?.size) return
      const blockIdxList = [...blocks].map(block => this.controller.rootModel.findIndex(b => b.id === block.getAttribute('data-block-id')!))
      this._selectedBlockRange = {start: Math.min(...blockIdxList), end: Math.max(...blockIdxList)}
      console.log('selectedBlockRange', this.selectedBlockRange, this.blockSelection.selectedElements)
    })
  }

  selectBlocks(from: CharacterIndex, to: CharacterIndex) {
    document.getSelection()!.removeAllRanges()
    this.rootElement.focus()
    this.clearSelectedBlocks()
    const start = characterIndex2Number(from, this.controller.rootModel.length)
    const end = characterIndex2Number(to, this.controller.rootModel.length)
    this._selectedBlockRange = {start, end}
    for (let i = start; i <= end; i++) {
      const ele = this.rootElement.children[i] as HTMLElement
      this.blockSelection.selectElement(ele)
    }
  }

  clearSelectedBlocks() {
    this.blockSelection.storeSize && this.blockSelection.selectedElements.forEach(ele => ele.classList.remove('bf-block-selected'))
    this._selectedBlockRange = undefined
  }

  getActiveBlockId() {
    if (!this.activeElement || this.activeElement === this.rootElement) return null
    return this.activeElement.closest('[bf-node-type="editable"]')?.id
  }

  @HostListener('focusin', ['$event'])
  private onFocusIn(event: FocusEvent) {
    this._activeElement = event.target as HTMLElement
  }

  @HostListener('focusout', ['$event'])
  private onFocusOut(event: FocusEvent) {
    this._activeElement = null
    const target = event.target as HTMLElement
    if (target === this.rootElement) {
      this.selectedBlockRange && this.clearSelectedBlocks()
    }
  }

  @HostListener('click', ['$event'])
  private onClick(event: MouseEvent) {
    console.log('click', event.target)
  }

  @HostListener('keydown', ['$event'])
  private onKeyDown(event: KeyboardEvent) {
    if (event.isComposing || this.controller.readonly$.value) return
    // console.log('keydown', event)
    this.controller.keyEventBus.handle(event)
  }

  private prevRange: ICharacterRange | null = null

  @HostListener('beforeinput', ['$event'])
  private onBeforeInput(event: InputEvent) {
    // console.log('beforeinput', event)
    const sel = document.getSelection()!
    this.prevRange = getCurrentCharacterRange()
    if (!sel.isCollapsed) {
      sel.modify('move', 'forward', 'character')
      deleteContent(document.activeElement as HTMLElement, this.prevRange!.start, this.prevRange!.end - this.prevRange!.start)
    }
    if (!document.activeElement!.childElementCount || (this.prevRange.start === 0 && this.prevRange.end === 0)) {
      /**
       * <p> <span></span> </p>  --> write any word in p tag --> <p> word <span></span> </p> ; it`s not expected result because the word should be in span tag
       * <p> <span>\u200B</span> </p>  --> write any word in p tag --> <p> <span>\u200Bword</span> </p> ; it`s expected result
       */
      const span = document.createElement('span')
      span.textContent = '\u200B'
      document.activeElement!.prepend(span)
      sel.setPosition(span, 1)
      // requestAnimationFrame(() => {
      //   (span.firstChild as Text).deleteData(0, 1)
      //   sel.modify('move', 'forward', 'character')
      // })
    }
  }

  @HostListener('input', ['$event'])
  private onInput(event: InputEvent) {
    const sel = document.getSelection()!
    const {start, end} = this.prevRange!

    if (sel.focusNode instanceof Text && sel.isCollapsed && sel.focusOffset === 2 && sel.focusNode!.nodeValue!.charCodeAt(0) === 8203) {
      // console.log('delete zero width space')
      sel.focusNode.deleteData(0, 1)
    }

    const bid = this.controller.getFocusingBlockId()!
    const yText = this.controller.getEditableBlockYText(bid)
    const ops: Array<() => void> = []
    start !== end && ops.push(() => yText.delete(start, end - start))
    const text = event.data === ' ' ? '\u00A0' : event.data!

    switch (event.inputType) {
      case 'insertReplacementText':
      case 'insertCompositionText':
      case 'insertText':
        ops.push(() => yText.insert(start, text))
        break
      case 'deleteContentBackward':
        start === end && ops.push(() => yText.delete(start - 1, 1))
        break
      case 'deleteContentForward':
        start === end && ops.push(() => yText.delete(start, 1))
        break
      case 'deleteByDrag':
        break
      case 'insertFromDrop':
        break
      case 'formatBold':
      case 'formatItalic':
      case 'formatUnderline':
      case 'formatStrikeThrough':
      case 'formatSuperscript':
      case 'formatSubscript':
      case 'insertParagraph':
      case 'insertFromPaste':
      case 'insertLineBreak':
      case 'deleteByCut':
      default:
        event.preventDefault()
        break;
    }
    this.controller.transact(() => {
      ops.forEach(op => op())
    }, USER_INPUT_ORIGIN)
  }

  @HostListener('drop', ['$event'])
  private onDrop(event: ClipboardEvent) {
    event.preventDefault()
    console.log('ondrop', event)
  }

  @HostListener('paste', ['$event'])
  private onPaste(event: ClipboardEvent) {
    event.preventDefault()
    pasteHandler(event, this.controller)
  }

  @HostListener('cut', ['$event'])
  @HostListener('copy', ['$event'])
  private onPreventDefault(event: ClipboardEvent) {
    event.preventDefault()
  }

  ngOnDestroy() {
    this.onDestroy.emit()
  }
}
