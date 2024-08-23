import {
    ChangeDetectorRef,
    Component, ElementRef,
    HostBinding,
    HostListener,
    ViewContainerRef,
} from "@angular/core";
import {NgForOf, NgIf} from "@angular/common";
import {Controller, DeltaOperation, IBlockModel, IBlockModelMap, pasteHandler} from "@core";
import {getRange} from "@core/utils";
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
    ]
})
export class EditorRoot<BMap extends IBlockModelMap = IBlockModelMap> {
    protected controller!: Controller<BMap>

    ready$ = new BehaviorSubject(false)

    @HostBinding('attr.tabindex')
    private readonly tabindex = '0'

    protected trackBy = (index: number, item: IBlockModel) => {
        return `${item.flavour}-${item.id}`
    }

    constructor(
        public readonly elementRef: ElementRef,
        protected cdr: ChangeDetectorRef,
        private vcr: ViewContainerRef
    ) {
    }

    setController(controller: Controller<BMap>) {
        this.controller = controller
        this.elementRef.nativeElement.id = controller.rootId
    }

    ngAfterViewInit() {
        this.ready$.next(true)
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

    @HostListener('blur', ['$event'])
    private onBlur(event: FocusEvent) {
        this.controller.clearSelectedBlocks()
    }

    @HostListener('mousedown', ['$event'])
    private onMouseDown(event: MouseEvent) {
        // clear selected blocks, the opportunity must be before the default behavior
        if (this.controller.selectedBlocksRange) {
            this.controller.clearSelectedBlocks()
        }
    }

    @HostListener('click', ['$event'])
    private onClick(event: MouseEvent) {
        console.log('click', event.target)
    }

    @HostListener('keydown', ['$event'])
    private onKeyDown(event: KeyboardEvent) {
        console.log('keydown', event)
        this.controller.keyEventBus.handle(event)
    }

    @HostListener('beforeinput', ['$event'])
    private onBeforeInput(event: InputEvent) {
        console.log('beforeinput', event, getRange())
        const {start, end} = getRange()
        const bRef = this.controller.getFocusingBlockRef()!
        const deltas: DeltaOperation[] = [
            {retain: start},
        ]
        switch (event.inputType) {
            case 'insertText':
                start !== end && deltas.push({delete: end - start})
                deltas.push({insert: event.data!})
                break
            case 'deleteContentBackward':
                if (start === end) {
                    deltas[0].retain = start - 1
                    deltas.push({delete: 1})
                } else {
                    deltas.push({delete: end - start})
                }
                break
            case 'deleteContentForward':
                start === end ? deltas.push({delete: 1}) : deltas.push({delete: end - start})
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
            case 'insertCompositionText':
            case 'insertReplacementText':
            case 'deleteByCut':
            default:
                event.preventDefault()
                break;
        }
        this.controller.transact(() => {
            bRef.yText.applyDelta(deltas)
        })
    }

    @HostListener('input', ['$event'])
    private onInput(event: InputEvent) {
    }

    @HostListener('compositionstart', ['$event'])
    private onCompositionStart(event: CompositionEvent) {
        console.log('compositionstart', event, getRange())
        const {start, end} = getRange()
        if (start !== end) {
            this.controller.transact(() => {
                const bRef = this.controller.getFocusingBlockRef()!
                bRef.yText.delete(start, end - start)
            })
        }
    }

    @HostListener('compositionend', ['$event'])
    private onCompositionend(event: CompositionEvent) {
        console.log('compositionend', event, getRange())
        const {start, end} = getRange()
        const bRef = this.controller.getFocusingBlockRef()!
        this.controller.transact(() => {
            start !== end && bRef.yText.delete(start, end - start)
            bRef.yText.insert(start - event.data!.length, event.data!)
            console.log('compositionend', bRef.yText.toDelta())
        })
    }

    @HostListener('paste', ['$event'])
    private onPaste(event: ClipboardEvent) {
        pasteHandler(event, this.controller)
    }

    @HostListener('cut', ['$event'])
    @HostListener('copy', ['$event'])
    private onPreventDefault(event: ClipboardEvent) {
        event.preventDefault()
    }

}
