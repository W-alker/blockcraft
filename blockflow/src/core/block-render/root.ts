import {ChangeDetectorRef, Component, ElementRef, EventEmitter, HostListener, Output} from "@angular/core";
import {NgForOf, NgIf} from "@angular/common";
import {BlockWrap} from "./block-wrap";
import {BehaviorSubject} from "rxjs";
import {Controller} from "../controller";
import {USER_CHANGE_SIGNAL} from "../yjs";
import {BlockSelection,} from "../modules";
import {adjustRangeEdges, characterIndex2Number, clearBreakElement, isEmbedElement} from "../utils";
import {CharacterIndex, ICharacterRange} from "../types";
import {EditableBlock} from "../block-std";

@Component({
  selector: 'div[bf-node-type="root"][lazy-load="false"]',
  template: `
    @if (controller) {
      @for (model of controller.rootModel; track model.flavour + '-' + model.id + '-' + model.meta.createdTime) {
        <div bf-block-wrap [controller]="controller" [model]="model"></div>
      }
    }
  `,
  standalone: true,
  imports: [BlockWrap, NgForOf, NgIf],
  host: {
    '[attr.tabindex]': '0',
    '[attr.contenteditable]': 'false',
  }
})
export class EditorRoot {
  @Output() onDestroy = new EventEmitter<void>()

  constructor(
    public readonly elementRef: ElementRef<HTMLElement>,
    public readonly cdr: ChangeDetectorRef
  ) {
  }

  ngAfterViewInit() {
    this.initBlockSelection()
    this.ready$.next(true)
  }

  public readonly activeBlock$ = new BehaviorSubject<EditableBlock | null>(null)
  public readonly ready$ = new BehaviorSubject(false)

  protected controller!: Controller

  get rootElement() {
    return this.elementRef.nativeElement
  }

  private _activeElement: HTMLElement | null = null
  get activeElement() {
    return this._activeElement
  }

  private _activeBlock: EditableBlock | null = null
  get activeBlock() {
    return this._activeBlock
  }

  private blockSelection!: BlockSelection
  private _selectedBlockRange: ICharacterRange | undefined = undefined
  get selectedBlockRange() {
    return this._selectedBlockRange
  }

  setController(controller: Controller) {
    this.controller = controller
    this.rootElement.id = controller.rootId
    // this.controller.readonly$.pipe(takeUntil(this.onDestroy)).subscribe(readonly => {
    //   if (readonly) {
    //     this.rootElement.removeAttribute('contenteditable')
    //   } else {
    //     this.rootElement.setAttribute('contenteditable', 'false')
    //   }
    // })
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
        element.firstElementChild!.classList.add('selected')
      },
      onItemUnselect: (element) => {
        element.firstElementChild!.classList.remove('selected')
      }
    })

    this.blockSelection.on('end', (blocks) => {
      if (!blocks?.size) return
      const blockIdxList = [...blocks].map(block => this.controller.rootModel.findIndex(b => b.id === block.getAttribute('data-block-id')!))
      this._selectedBlockRange = {start: Math.min(...blockIdxList), end: Math.max(...blockIdxList) + 1}
    })
  }

  selectBlocks(from: CharacterIndex, to: CharacterIndex) {
    document.getSelection()!.removeAllRanges()
    this.rootElement.focus({preventScroll: true})
    this.clearSelectedBlockRange()
    const start = characterIndex2Number(from, this.controller.rootModel.length)
    const end = characterIndex2Number(to, this.controller.rootModel.length)
    this._selectedBlockRange = {start, end}
    for (let i = start; i < end; i++) {
      const ele = this.rootElement.children[i] as HTMLElement
      this.blockSelection.selectElement(ele)
    }
  }

  clearSelectedBlockRange() {
    this.blockSelection.clear()
    this._selectedBlockRange = undefined
  }

  getActiveBlockId() {
    if (!this.activeElement || this.activeElement === this.rootElement) return null
    return this.activeElement.closest('[bf-node-type="editable"]')?.id
  }

  getActiveBlockRef() {
    const bid = this.getActiveBlockId()
    if (!bid) return null
    return this.controller.getBlockRef(bid) as EditableBlock
  }

  @HostListener('focusin', ['$event'])
  private onFocusIn(event: FocusEvent) {
    const target = event.target as HTMLElement
    if (!target.isContentEditable && target !== this.rootElement) {
      this._activeElement = null
      this.activeBlock$.next(this._activeBlock = null)
      return
    }
    this._activeElement = target
    this.activeBlock$.next(this._activeBlock = this.getActiveBlockRef())
    if (target.getAttribute('placeholder') && !target.textContent) target.classList.add('placeholder-visible')
  }

  @HostListener('focusout', ['$event'])
  private onFocusOut(event: FocusEvent) {
    this._activeElement = null
    this.activeBlock$.next(this._activeBlock = null)
    const target = event.target as HTMLElement
    if (target === this.rootElement) this._selectedBlockRange && this.clearSelectedBlockRange()
    target.classList.remove('placeholder-visible')
  }

  @HostListener('keydown', ['$event'])
  private onKeyDown(event: KeyboardEvent) {
    if (this.controller.readonly$.value || event.isComposing) return
    this.controller.keyEventBus.handle(event)
  }

  prevInput: ICharacterRange & { afterEmbed?: boolean, data?: string | null, inputType?: string } | null = null

  private compositionStatus: 'start' | 'end' | 'update' = 'end'

  @HostListener('compositionstart', ['$event'])
  private onCompositionStart(event: CompositionEvent) {
    this.compositionStatus = 'start'
  }

  @HostListener('compositionend', ['$event'])
  private onCompositionEnd(event: CompositionEvent) {
    this.compositionStatus = 'end'
  }

  @HostListener('compositionupdate', ['$event'])
  private onCompositionUpdate(event: CompositionEvent) {
    this.compositionStatus = 'update'
  }

  @HostListener('beforeinput', ['$event'])
  private onBeforeInput(event: InputEvent) {
    // console.clear()
    // console.log('beforeinput', event, event.inputType, event.data)
    switch (event.inputType) {
      case 'insertReplacementText':
      case 'insertCompositionText':
      case 'insertText':
        break
      default:
        event.preventDefault()
        return
    }

    const activeElement = this.activeElement!

    const sel = window.getSelection()!
    const range = sel.getRangeAt(0)

    this.prevInput = this.controller.selection.normalizeStaticRange(activeElement, range)
    this.prevInput.data = event.data
    this.prevInput.inputType = event.inputType

    if (range.startContainer === activeElement ||
      (range.startContainer instanceof Text && (range.startContainer.parentElement === activeElement || isEmbedElement(range.startContainer.parentElement?.previousElementSibling!)))
    ) this.prevInput.afterEmbed = true

    // prevent browser behavior - hold any tags to insert into the text
    if (!range.collapsed && this.compositionStatus !== 'start') {
      const adjusted = adjustRangeEdges(activeElement, range)
      if (adjusted) {
        range.deleteContents()
        this.prevInput.afterEmbed = true
      }
      return
    }

    if (
      (sel.focusNode instanceof Text && sel.focusOffset === 0 && sel.focusNode.parentElement !== activeElement) ||
      (sel.focusNode === activeElement && activeElement.className.includes('editable-container'))  // at embed element before or after
    ) {
      /**
       * <p> <span></span> </p>  --> write any word in p tag --> <p> word <span></span> </p> ; it`s not expected result because the word should be in span tag
       * <p> <span>\u200B</span> </p>  --> write any word in p tag --> <p> <span>\u200Bword</span> </p> ; it`s expected result
       */
      const span = document.createElement('span')
      span.textContent = '\u200B'
      sel.focusNode instanceof Text ? sel.focusNode.parentElement!.before(span) : sel.getRangeAt(0).insertNode(span)
      sel.setBaseAndExtent(span.firstChild!, 0, span.firstChild!, 1)
    }
  }

  @HostListener('input', ['$event'])
  private handleInput(e: InputEvent) {
    // console.log('input', e, e.inputType, e.data)
    if (!this.prevInput) return
    const {start, end, afterEmbed, data, inputType} = this.prevInput
    const ops: Array<() => void> = []

    const bRef = this.activeBlock!
    const yText = bRef.yText
    if (start !== end) {
      ops.push(() => yText.delete(start, end - start))
    }

    let needCheck = false
    switch (inputType) {
      case 'insertReplacementText':
      case 'insertCompositionText':
      case 'insertText':
        data && ops.push(() => yText.insert(start, data, afterEmbed ? {} : undefined))  // avoid new text extends the attributes of previous embed element
        start === 0 && (needCheck = true)
        break
      // case 'deleteContentBackward':
      //   if (start === end) {
      //     ops.push(() => yText.delete(start - 1, 1))
      //   } else {
      //     ops.push(() => yText.delete(start, end - start))
      //   }
      //   break
      // case 'deleteContentForward':
      //   if (start === end) {
      //     ops.push(() => yText.delete(start, 1))
      //   } else {
      //     ops.push(() => yText.delete(start, end - start))
      //   }
      //   break
      default:
        break;
    }
    ops.length && this.controller.transact(() => {
      ops.forEach(op => op())

      // 检查br标签
      if (needCheck && bRef.getTextContent() === data) {
        clearBreakElement(bRef.containerEle)
      }
    }, USER_CHANGE_SIGNAL)
    this.prevInput = null
  }

  @HostListener('contextmenu', ['$event'])
  private onContextMenu(event: ClipboardEvent) {
    event.preventDefault()
    console.log('contextmenu', event)
  }

  ngOnDestroy() {
    this.onDestroy.emit()
  }
}
