import {
  ChangeDetectorRef,
  Component, ElementRef,
  HostBinding,
  HostListener,
  ViewContainerRef,
} from "@angular/core";
import {NgForOf, NgIf} from "@angular/common";
import {
  Controller, deleteContent,
  getCurrentCharacterRange,
  IBlockModel,
  ICharacterRange,
  pasteHandler
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
  @HostBinding('attr.tabindex') private readonly tabindex = '0'

  @HostBinding('class.readonly')
  get readonly() {
    return this.controller?.readonly$.value
  }

  protected controller!: Controller

  ready$ = new BehaviorSubject(false)

  protected trackBy = (index: number, item: IBlockModel) => {
    return `${item.flavour}-${item.id}`
  }

  constructor(
    public readonly elementRef: ElementRef,
    protected cdr: ChangeDetectorRef,
    private vcr: ViewContainerRef
  ) {
  }

  ngAfterViewInit() {
    this.ready$.next(true)
  }

  setController(controller: Controller) {
    this.controller = controller
    this.elementRef.nativeElement.id = controller.rootId
  }

  // insertBlocks(index: number, model: IBlockModel[]) {
  //     const cprStore: ComponentRef<BaseBlock>[] = []
  //     model.forEach(block => {
  //         const cpr = this.createBlockView(block)
  //         this.container.insert(cpr.hostView, index)
  //         cprStore.push(cpr)
  //     })
  //     return cprStore
  // }
  //
  // createBlockView(block: IBlockModel) {
  //     const schema = this.schemaStore.get(block.flavour)
  //     if (!schema) throw new Error(`Schema not found for flavour ${block.flavour}`)
  //     const cpr = this.vcr.createComponent(schema.render)
  //     cpr.setInput('model', block)
  //     cpr.setInput('controller', this.controller)
  //     return cpr
  // }
  //
  // removeBlocks(index: number, count: number) {
  //     for (let i = 0; i < count; i++) {
  //         this.container.remove(index)
  //     }
  // }
  //
  // detachBlocksView(index: number, count: number) {
  //     if (count <= 0) return []
  //     const views: ViewRef[] = []
  //     if (index < 0 && count > this.container.length) throw new Error('detachBlocksView error: index out of range')
  //     if (count <= 0) return views
  //     for (let i = 0; i < count; i++) {
  //         views.push(this.container.detach(index)!)
  //     }
  //     return views
  // }
  //
  // insertBlocksView(index: number, views: ViewRef[]) {
  //     if (index < 0 || index > this.container.length) throw new Error('insertBlocksView error: index out of range')
  //     views.forEach((view, i) => {
  //         this.container.insert(view, index + i)
  //     })
  // }

  // @HostListener('focusin', ['$event'])
  // private onFocus(event: FocusEvent) {
  //     console.log('focus', event.target)
  // }
  //
  // @HostListener('focusout', ['$event'])
  // private onBlur(event: FocusEvent) {
  //     console.log('blur', event.target)
  // }

  @HostListener('document:selectionchange', ['$event'])
  private onSelectionChange(event: Event) {
    // console.log('selectionchange', event)
    if (this.controller.selectedBlocksRange && document.activeElement !== this.elementRef.nativeElement) {
      this.controller.clearSelectedBlocks()
    }
  }

  // @HostListener('mousedown', ['$event'])
  // private onMouseDown(event: MouseEvent) {
  // }
  //
  // @HostListener('mouseup', ['$event'])
  // private onMouseUp(event: MouseEvent) {
  // }

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
      requestAnimationFrame(() => {
        (span.firstChild as Text).deleteData(0, 1)
      })
    }
  }

  @HostListener('input', ['$event'])
  private onInput(event: InputEvent) {
    const sel = document.getSelection()!
    const {start, end} = this.prevRange!
    // if (sel.focusNode instanceof Text && sel.isCollapsed && sel.focusOffset === 2 && sel.focusNode!.nodeValue!.charCodeAt(0) === 8203) {
    //     console.log('delete zero width space')
    //     sel.focusNode.deleteData(0, 1)
    // }
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
      case 'formatBold':
      case 'formatItalic':
      case 'formatUnderline':
      case 'formatStrikeThrough':
      case 'formatSuperscript':
      case 'formatSubscript':
      case 'insertParagraph':
      case 'insertFromPaste':
      case 'insertFromDrop':
      case 'insertLineBreak':
      case 'deleteByCut':
      default:
        event.preventDefault()
        break;
    }
    this.controller.transact(() => {
      ops.forEach(op => op())
    })
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
}
