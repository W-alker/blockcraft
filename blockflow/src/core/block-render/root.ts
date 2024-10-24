import {
    ChangeDetectorRef,
    Component, ElementRef, EventEmitter,
    HostListener, Output,
} from "@angular/core";
import {NgForOf, NgIf} from "@angular/common";
import {BlockWrap} from "./block-wrap";
import {BehaviorSubject} from "rxjs";
import {Controller} from "../controller";
import {BlockModel, USER_CHANGE_SIGNAL} from "../yjs";
import {BlockSelection} from "../modules";
import {
    CharacterIndex,
    characterIndex2Number,
    getCurrentCharacterRange,
    ICharacterRange,
    isEmbedElement
} from "../utils";
import {EditableBlock} from "../block-std";
import {pasteHandler} from "../helpers";

@Component({
    selector: 'div[bf-node-type="root"][lazy-load="false"]',
    template: `
        <ng-container *ngIf="controller">
            <ng-container *ngFor="let model of controller.rootModel; trackBy: trackBy">
                <div bf-block-wrap [controller]="controller" [model]="model"></div>
            </ng-container>
        </ng-container>
    `,
    standalone: true,
    imports: [
        BlockWrap,
        NgForOf,
        NgIf,
    ],
    host: {
        '[attr.tabindex]': '0'
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

    public readonly ready$ = new BehaviorSubject(false)

    protected controller!: Controller

    get rootElement() {
        return this.elementRef.nativeElement
    }

    private _activeElement: HTMLElement | null = null

    get activeElement() {
        return this._activeElement
    }

    protected trackBy = (index: number, item: BlockModel) => {
        return `${item.flavour}-${item.id}-${item.meta.createdTime}`
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
            // console.log('selectedBlockRange', this.selectedBlockRange, this.blockSelection.selectedElements)
        })
    }

    selectBlocks(from: CharacterIndex, to: CharacterIndex) {
        document.getSelection()!.removeAllRanges()
        this.rootElement.focus({preventScroll: true})
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
        const target = event.target as HTMLElement
        this._activeElement = target
        if (target.getAttribute('placeholder') && !target.textContent) target.classList.add('placeholder-visible')
    }

    @HostListener('focusout', ['$event'])
    private onFocusOut(event: FocusEvent) {
        this._activeElement = null
        const target = event.target as HTMLElement
        if (target === this.rootElement) this.selectedBlockRange && this.clearSelectedBlocks()
        target.classList.remove('placeholder-visible')
    }

    // @HostListener('click', ['$event'])
    // private onClick(event: MouseEvent) {
    //   const target = event.target as HTMLElement
    //   if (target.getAttribute('bf-embed') !== 'link') return
    // }

    @HostListener('keydown', ['$event'])
    private onKeyDown(event: KeyboardEvent) {
        if (event.isComposing || this.controller.readonly$.value) return
        // console.log('keydown', event)
        this.controller.keyEventBus.handle(event)
    }

    private prevRange: ICharacterRange & { afterEmbed?: boolean } | null = null

    @HostListener('beforeinput', ['$event'])
    private onBeforeInput(event: InputEvent) {
        // console.log('beforeinput', event)
        const sel = document.getSelection()!
        const activeElement = document.activeElement as HTMLElement
        this.prevRange = getCurrentCharacterRange()
        // if (!sel.isCollapsed) {
        //   sel.modify('move', 'forward', 'character')
        //   deleteContent(activeElement, this.prevRange!.start, this.prevRange!.end - this.prevRange!.start)
        // }
        if (
            (sel.focusNode instanceof Text && sel.focusOffset === 0) ||  // at zero width space
            (sel.focusNode === activeElement && activeElement.className.includes('editable-container'))  // at embed element before or after
        ) {
            if (sel.focusNode === activeElement ||
                (sel.focusNode instanceof Text && isEmbedElement(sel.focusNode.parentElement?.previousElementSibling!))
            ) this.prevRange.afterEmbed = true
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
    private onInput(event: InputEvent) {
        // const sel = document.getSelection()!
        const {start, end, afterEmbed} = this.prevRange!
        const ops: Array<() => void> = []
        // if (sel.focusNode instanceof Text && sel.isCollapsed && sel.focusOffset === 2 && sel.focusNode!.nodeValue!.charCodeAt(0) === 8203) {
        //     sel.focusNode.deleteData(0, 1)
        // }
        const bid = this.controller.getFocusingBlockId()!
        const yText = (this.controller.getBlockRef(bid) as EditableBlock).yText
        start !== end && ops.push(() => yText.delete(start, end - start))
        const text = event.data === ' ' ? '\u00A0' : event.data!

        switch (event.inputType) {
            case 'insertReplacementText':
            case 'insertCompositionText':
            case 'insertText':
                ops.push(() => yText.insert(start, text, afterEmbed ? {} : undefined))  // avoid new text extends the attributes of previous embed element
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
        }, USER_CHANGE_SIGNAL)
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

    @HostListener('contextmenu', ['$event'])
    private onContextMenu(event: ClipboardEvent) {
        event.preventDefault()
        console.log('contextmenu', event)
    }

    ngOnDestroy() {
        this.onDestroy.emit()
    }
}
