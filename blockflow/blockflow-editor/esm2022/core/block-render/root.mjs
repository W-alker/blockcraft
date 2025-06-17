import { Component, EventEmitter, HostListener, Output } from "@angular/core";
import { NgForOf, NgIf } from "@angular/common";
import { BlockWrap } from "./block-wrap";
import { BehaviorSubject } from "rxjs";
import { USER_CHANGE_SIGNAL } from "../yjs";
import { BlockSelection, } from "../modules";
import { adjustRangeEdges, characterIndex2Number, clearBreakElement, isEmbedElement } from "../utils";
import * as i0 from "@angular/core";
export class EditorRoot {
    constructor(elementRef, cdr) {
        this.elementRef = elementRef;
        this.cdr = cdr;
        this.onDestroy = new EventEmitter();
        this.activeBlock$ = new BehaviorSubject(null);
        this.ready$ = new BehaviorSubject(false);
        this._activeElement = null;
        this._activeBlock = null;
        this._selectedBlockRange = undefined;
        this.prevInput = null;
        this.compositionStatus = 'end';
    }
    ngAfterViewInit() {
        this.initBlockSelection();
        this.ready$.next(true);
    }
    get rootElement() {
        return this.elementRef.nativeElement;
    }
    get activeElement() {
        return this._activeElement;
    }
    get activeBlock() {
        return this._activeBlock;
    }
    get selectedBlockRange() {
        return this._selectedBlockRange;
    }
    setController(controller) {
        this.controller = controller;
        this.rootElement.id = controller.rootId;
        // this.controller.readonly$.pipe(takeUntil(this.onDestroy)).subscribe(readonly => {
        //   if (readonly) {
        //     this.rootElement.removeAttribute('contenteditable')
        //   } else {
        //     this.rootElement.setAttribute('contenteditable', 'false')
        //   }
        // })
    }
    initBlockSelection() {
        this.blockSelection = new BlockSelection({
            host: this.rootElement,
            document: document,
            enable: false,
            onlyLeftButton: true,
            selectable: "[bf-block-wrap]",
            selectionAreaClass: "blockflow-selection-area",
            sensitivity: 40,
            onItemSelect: (element) => {
                element.firstElementChild.classList.add('selected');
            },
            onItemUnselect: (element) => {
                element.firstElementChild.classList.remove('selected');
            }
        });
        this.blockSelection.on('end', (blocks) => {
            if (!blocks?.size)
                return;
            const blockIdxList = [...blocks].map(block => this.controller.rootModel.findIndex(b => b.id === block.getAttribute('data-block-id')));
            this._selectedBlockRange = { start: Math.min(...blockIdxList), end: Math.max(...blockIdxList) + 1 };
        });
    }
    selectBlocks(from, to) {
        document.getSelection().removeAllRanges();
        this.rootElement.focus({ preventScroll: true });
        this.clearSelectedBlockRange();
        const start = characterIndex2Number(from, this.controller.rootModel.length);
        const end = characterIndex2Number(to, this.controller.rootModel.length);
        this._selectedBlockRange = { start, end };
        for (let i = start; i < end; i++) {
            const ele = this.rootElement.children[i];
            this.blockSelection.selectElement(ele);
        }
    }
    clearSelectedBlockRange() {
        this.blockSelection.clear();
        this._selectedBlockRange = undefined;
    }
    getActiveBlockId() {
        if (!this.activeElement || this.activeElement === this.rootElement)
            return null;
        return this.activeElement.closest('[bf-node-type="editable"]')?.id;
    }
    getActiveBlockRef() {
        const bid = this.getActiveBlockId();
        if (!bid)
            return null;
        return this.controller.getBlockRef(bid);
    }
    onFocusIn(event) {
        const target = event.target;
        if (!target.isContentEditable && target !== this.rootElement) {
            this._activeElement = null;
            this.activeBlock$.next(this._activeBlock = null);
            return;
        }
        this._activeElement = target;
        this.activeBlock$.next(this._activeBlock = this.getActiveBlockRef());
        if (target.getAttribute('placeholder') && !target.textContent)
            target.classList.add('placeholder-visible');
    }
    onFocusOut(event) {
        this._activeElement = null;
        this.activeBlock$.next(this._activeBlock = null);
        const target = event.target;
        if (target === this.rootElement)
            this._selectedBlockRange && this.clearSelectedBlockRange();
        target.classList.remove('placeholder-visible');
    }
    onKeyDown(event) {
        if (this.controller.readonly$.value || event.isComposing)
            return;
        this.controller.keyEventBus.handle(event);
    }
    onCompositionStart(event) {
        this.compositionStatus = 'start';
    }
    onCompositionEnd(event) {
        this.compositionStatus = 'end';
    }
    onCompositionUpdate(event) {
        this.compositionStatus = 'update';
    }
    onBeforeInput(event) {
        // console.clear()
        // console.log('beforeinput', event, event.inputType, event.data)
        switch (event.inputType) {
            case 'insertReplacementText':
            case 'insertCompositionText':
            case 'insertText':
            case 'deleteContentForward':
            case 'deleteContentBackward':
                break;
            default:
                event.preventDefault();
                return;
        }
        const activeElement = this.activeElement;
        const sel = window.getSelection();
        const staticRange = event.getTargetRanges()[0];
        this.prevInput = this.controller.selection.normalizeStaticRange(activeElement, staticRange);
        this.prevInput.data = event.data;
        this.prevInput.inputType = event.inputType;
        // console.log(staticRange,this.prevInput)
        if (staticRange.startContainer === activeElement ||
            (staticRange.startContainer instanceof Text && (staticRange.startContainer.parentElement === activeElement || isEmbedElement(staticRange.startContainer.parentElement?.previousElementSibling))))
            this.prevInput.afterEmbed = true;
        // prevent browser behavior - hold unknown tag to insert into the text
        if (!staticRange.collapsed && this.compositionStatus !== 'start') {
            const _range = document.createRange();
            _range.setStart(staticRange.startContainer, staticRange.startOffset);
            _range.setEnd(staticRange.endContainer, staticRange.endOffset);
            const adjusted = adjustRangeEdges(activeElement, _range);
            if (adjusted) {
                event.preventDefault();
                _range.deleteContents();
                this.prevInput.afterEmbed = true;
            }
            _range.detach();
            this.handleInput(event);
            return;
        }
        if ((sel.focusNode instanceof Text && sel.focusOffset === 0 && sel.focusNode.parentElement !== activeElement) ||
            (sel.focusNode === activeElement && activeElement.className.includes('editable-container')) // at embed element before or after
        ) {
            /**
             * <p> <span></span> </p>  --> write any word in p tag --> <p> word <span></span> </p> ; it`s not expected result because the word should be in span tag
             * <p> <span>\u200B</span> </p>  --> write any word in p tag --> <p> <span>\u200Bword</span> </p> ; it`s expected result
             */
            const span = document.createElement('span');
            span.textContent = '\u200B';
            sel.focusNode instanceof Text ? sel.focusNode.parentElement.before(span) : sel.getRangeAt(0).insertNode(span);
            sel.setBaseAndExtent(span.firstChild, 0, span.firstChild, 1);
        }
        this.handleInput(event);
    }
    handleInput(e) {
        // console.log('input', e, e.inputType, e.data)
        if (!this.prevInput)
            return;
        const { start, end, afterEmbed, data, inputType } = this.prevInput;
        const ops = [];
        const bRef = this.activeBlock;
        const yText = bRef.yText;
        if (start !== end) {
            ops.push(() => yText.delete(start, end - start));
        }
        let needCheck = false;
        switch (inputType) {
            case 'insertReplacementText':
            case 'insertCompositionText':
            case 'insertText':
                data && ops.push(() => yText.insert(start, data, afterEmbed ? {} : undefined)); // avoid new text extends the attributes of previous embed element
                start === 0 && (needCheck = true);
                break;
            case 'deleteContentBackward':
                if (start === end) {
                    ops.push(() => yText.delete(start - 1, 1));
                }
                break;
            case 'deleteContentForward':
                if (start === end) {
                    ops.push(() => yText.delete(start, 1));
                }
                break;
            default:
                break;
        }
        ops.length && this.controller.transact(() => {
            ops.forEach(op => op());
            // 检查br标签
            if (needCheck && bRef.getTextContent() === data) {
                clearBreakElement(bRef.containerEle);
            }
        }, USER_CHANGE_SIGNAL);
        this.prevInput = null;
    }
    onContextMenu(event) {
        event.preventDefault();
        console.log('contextmenu', event);
    }
    ngOnDestroy() {
        this.onDestroy.emit();
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: EditorRoot, deps: [{ token: i0.ElementRef }, { token: i0.ChangeDetectorRef }], target: i0.ɵɵFactoryTarget.Component }); }
    static { this.ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "17.0.0", version: "17.3.12", type: EditorRoot, isStandalone: true, selector: "div[bf-node-type=\"root\"][lazy-load=\"false\"]", outputs: { onDestroy: "onDestroy" }, host: { listeners: { "focusin": "onFocusIn($event)", "focusout": "onFocusOut($event)", "keydown": "onKeyDown($event)", "compositionstart": "onCompositionStart($event)", "compositionend": "onCompositionEnd($event)", "compositionupdate": "onCompositionUpdate($event)", "beforeinput": "onBeforeInput($event)", "contextmenu": "onContextMenu($event)" }, properties: { "attr.tabindex": "0", "attr.contenteditable": "false" } }, ngImport: i0, template: `
    @if (controller) {
      @for (model of controller.rootModel; track model.flavour + '-' + model.id + '-' + model.meta.createdTime) {
        <div bf-block-wrap [controller]="controller" [model]="model"></div>
      }
    }
  `, isInline: true, dependencies: [{ kind: "component", type: BlockWrap, selector: "div[bf-block-wrap]", inputs: ["controller", "model"] }] }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: EditorRoot, decorators: [{
            type: Component,
            args: [{
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
                }]
        }], ctorParameters: () => [{ type: i0.ElementRef }, { type: i0.ChangeDetectorRef }], propDecorators: { onDestroy: [{
                type: Output
            }], onFocusIn: [{
                type: HostListener,
                args: ['focusin', ['$event']]
            }], onFocusOut: [{
                type: HostListener,
                args: ['focusout', ['$event']]
            }], onKeyDown: [{
                type: HostListener,
                args: ['keydown', ['$event']]
            }], onCompositionStart: [{
                type: HostListener,
                args: ['compositionstart', ['$event']]
            }], onCompositionEnd: [{
                type: HostListener,
                args: ['compositionend', ['$event']]
            }], onCompositionUpdate: [{
                type: HostListener,
                args: ['compositionupdate', ['$event']]
            }], onBeforeInput: [{
                type: HostListener,
                args: ['beforeinput', ['$event']]
            }], onContextMenu: [{
                type: HostListener,
                args: ['contextmenu', ['$event']]
            }] } });
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm9vdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uL2Jsb2NrZmxvdy9zcmMvY29yZS9ibG9jay1yZW5kZXIvcm9vdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxPQUFPLEVBQW9CLFNBQVMsRUFBYyxZQUFZLEVBQUUsWUFBWSxFQUFFLE1BQU0sRUFBQyxNQUFNLGVBQWUsQ0FBQztBQUMzRyxPQUFPLEVBQUMsT0FBTyxFQUFFLElBQUksRUFBQyxNQUFNLGlCQUFpQixDQUFDO0FBQzlDLE9BQU8sRUFBQyxTQUFTLEVBQUMsTUFBTSxjQUFjLENBQUM7QUFDdkMsT0FBTyxFQUFDLGVBQWUsRUFBQyxNQUFNLE1BQU0sQ0FBQztBQUVyQyxPQUFPLEVBQUMsa0JBQWtCLEVBQUMsTUFBTSxRQUFRLENBQUM7QUFDMUMsT0FBTyxFQUFDLGNBQWMsR0FBRSxNQUFNLFlBQVksQ0FBQztBQUMzQyxPQUFPLEVBQUMsZ0JBQWdCLEVBQUUscUJBQXFCLEVBQUUsaUJBQWlCLEVBQUUsY0FBYyxFQUFDLE1BQU0sVUFBVSxDQUFDOztBQW9CcEcsTUFBTSxPQUFPLFVBQVU7SUFHckIsWUFDa0IsVUFBbUMsRUFDbkMsR0FBc0I7UUFEdEIsZUFBVSxHQUFWLFVBQVUsQ0FBeUI7UUFDbkMsUUFBRyxHQUFILEdBQUcsQ0FBbUI7UUFKOUIsY0FBUyxHQUFHLElBQUksWUFBWSxFQUFRLENBQUE7UUFhOUIsaUJBQVksR0FBRyxJQUFJLGVBQWUsQ0FBdUIsSUFBSSxDQUFDLENBQUE7UUFDOUQsV0FBTSxHQUFHLElBQUksZUFBZSxDQUFDLEtBQUssQ0FBQyxDQUFBO1FBUTNDLG1CQUFjLEdBQXVCLElBQUksQ0FBQTtRQUt6QyxpQkFBWSxHQUF5QixJQUFJLENBQUE7UUFNekMsd0JBQW1CLEdBQWdDLFNBQVMsQ0FBQTtRQWtHcEUsY0FBUyxHQUFnRyxJQUFJLENBQUE7UUFFckcsc0JBQWlCLEdBQStCLEtBQUssQ0FBQTtJQS9IN0QsQ0FBQztJQUVE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RUFBRSxDQUFDLFFBQVEsQ0FBQztnQkFNbEMsbUJBQW1CO3NCQUQxQixZQUFZO3VCQUFDLG1CQUFtQixFQUFFLENBQUMsUUFBUSxDQUFDO2dCQU1yQyxhQUFhO3NCQURwQixZQUFZO3VCQUFDLGFBQWEsRUFBRSxDQUFDLFFBQVEsQ0FBQztnQkE2Ry9CLGFBQWE7c0JBRHBCLFlBQVk7dUJBQUMsYUFBYSxFQUFFLENBQUMsUUFBUSxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHtDaGFuZ2VEZXRlY3RvclJlZiwgQ29tcG9uZW50LCBFbGVtZW50UmVmLCBFdmVudEVtaXR0ZXIsIEhvc3RMaXN0ZW5lciwgT3V0cHV0fSBmcm9tIFwiQGFuZ3VsYXIvY29yZVwiO1xuaW1wb3J0IHtOZ0Zvck9mLCBOZ0lmfSBmcm9tIFwiQGFuZ3VsYXIvY29tbW9uXCI7XG5pbXBvcnQge0Jsb2NrV3JhcH0gZnJvbSBcIi4vYmxvY2std3JhcFwiO1xuaW1wb3J0IHtCZWhhdmlvclN1YmplY3R9IGZyb20gXCJyeGpzXCI7XG5pbXBvcnQge0NvbnRyb2xsZXJ9IGZyb20gXCIuLi9jb250cm9sbGVyXCI7XG5pbXBvcnQge1VTRVJfQ0hBTkdFX1NJR05BTH0gZnJvbSBcIi4uL3lqc1wiO1xuaW1wb3J0IHtCbG9ja1NlbGVjdGlvbix9IGZyb20gXCIuLi9tb2R1bGVzXCI7XG5pbXBvcnQge2FkanVzdFJhbmdlRWRnZXMsIGNoYXJhY3RlckluZGV4Mk51bWJlciwgY2xlYXJCcmVha0VsZW1lbnQsIGlzRW1iZWRFbGVtZW50fSBmcm9tIFwiLi4vdXRpbHNcIjtcbmltcG9ydCB7Q2hhcmFjdGVySW5kZXgsIElDaGFyYWN0ZXJSYW5nZX0gZnJvbSBcIi4uL3R5cGVzXCI7XG5pbXBvcnQge0VkaXRhYmxlQmxvY2t9IGZyb20gXCIuLi9ibG9jay1zdGRcIjtcblxuQENvbXBvbmVudCh7XG4gIHNlbGVjdG9yOiAnZGl2W2JmLW5vZGUtdHlwZT1cInJvb3RcIl1bbGF6eS1sb2FkPVwiZmFsc2VcIl0nLFxuICB0ZW1wbGF0ZTogYFxuICAgIEBpZiAoY29udHJvbGxlcikge1xuICAgICAgQGZvciAobW9kZWwgb2YgY29udHJvbGxlci5yb290TW9kZWw7IHRyYWNrIG1vZGVsLmZsYXZvdXIgKyAnLScgKyBtb2RlbC5pZCArICctJyArIG1vZGVsLm1ldGEuY3JlYXRlZFRpbWUpIHtcbiAgICAgICAgPGRpdiBiZi1ibG9jay13cmFwIFtjb250cm9sbGVyXT1cImNvbnRyb2xsZXJcIiBbbW9kZWxdPVwibW9kZWxcIj48L2Rpdj5cbiAgICAgIH1cbiAgICB9XG4gIGAsXG4gIHN0YW5kYWxvbmU6IHRydWUsXG4gIGltcG9ydHM6IFtCbG9ja1dyYXAsIE5nRm9yT2YsIE5nSWZdLFxuICBob3N0OiB7XG4gICAgJ1thdHRyLnRhYmluZGV4XSc6ICcwJyxcbiAgICAnW2F0dHIuY29udGVudGVkaXRhYmxlXSc6ICdmYWxzZScsXG4gIH1cbn0pXG5leHBvcnQgY2xhc3MgRWRpdG9yUm9vdCB7XG4gIEBPdXRwdXQoKSBvbkRlc3Ryb3kgPSBuZXcgRXZlbnRFbWl0dGVyPHZvaWQ+KClcblxuICBjb25zdHJ1Y3RvcihcbiAgICBwdWJsaWMgcmVhZG9ubHkgZWxlbWVudFJlZjogRWxlbWVudFJlZjxIVE1MRWxlbWVudD4sXG4gICAgcHVibGljIHJlYWRvbmx5IGNkcjogQ2hhbmdlRGV0ZWN0b3JSZWZcbiAgKSB7XG4gIH1cblxuICBuZ0FmdGVyVmlld0luaXQoKSB7XG4gICAgdGhpcy5pbml0QmxvY2tTZWxlY3Rpb24oKVxuICAgIHRoaXMucmVhZHkkLm5leHQodHJ1ZSlcbiAgfVxuXG4gIHB1YmxpYyByZWFkb25seSBhY3RpdmVCbG9jayQgPSBuZXcgQmVoYXZpb3JTdWJqZWN0PEVkaXRhYmxlQmxvY2sgfCBudWxsPihudWxsKVxuICBwdWJsaWMgcmVhZG9ubHkgcmVhZHkkID0gbmV3IEJlaGF2aW9yU3ViamVjdChmYWxzZSlcblxuICBwcm90ZWN0ZWQgY29udHJvbGxlciE6IENvbnRyb2xsZXJcblxuICBnZXQgcm9vdEVsZW1lbnQoKSB7XG4gICAgcmV0dXJuIHRoaXMuZWxlbWVudFJlZi5uYXRpdmVFbGVtZW50XG4gIH1cblxuICBwcml2YXRlIF9hY3RpdmVFbGVtZW50OiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsXG4gIGdldCBhY3RpdmVFbGVtZW50KCkge1xuICAgIHJldHVybiB0aGlzLl9hY3RpdmVFbGVtZW50XG4gIH1cblxuICBwcml2YXRlIF9hY3RpdmVCbG9jazogRWRpdGFibGVCbG9jayB8IG51bGwgPSBudWxsXG4gIGdldCBhY3RpdmVCbG9jaygpIHtcbiAgICByZXR1cm4gdGhpcy5fYWN0aXZlQmxvY2tcbiAgfVxuXG4gIHByaXZhdGUgYmxvY2tTZWxlY3Rpb24hOiBCbG9ja1NlbGVjdGlvblxuICBwcml2YXRlIF9zZWxlY3RlZEJsb2NrUmFuZ2U6IElDaGFyYWN0ZXJSYW5nZSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZFxuICBnZXQgc2VsZWN0ZWRCbG9ja1JhbmdlKCkge1xuICAgIHJldHVybiB0aGlzLl9zZWxlY3RlZEJsb2NrUmFuZ2VcbiAgfVxuXG4gIHNldENvbnRyb2xsZXIoY29udHJvbGxlcjogQ29udHJvbGxlcikge1xuICAgIHRoaXMuY29udHJvbGxlciA9IGNvbnRyb2xsZXJcbiAgICB0aGlzLnJvb3RFbGVtZW50LmlkID0gY29udHJvbGxlci5yb290SWRcbiAgICAvLyB0aGlzLmNvbnRyb2xsZXIucmVhZG9ubHkkLnBpcGUodGFrZVVudGlsKHRoaXMub25EZXN0cm95KSkuc3Vic2NyaWJlKHJlYWRvbmx5ID0+IHtcbiAgICAvLyAgIGlmIChyZWFkb25seSkge1xuICAgIC8vICAgICB0aGlzLnJvb3RFbGVtZW50LnJlbW92ZUF0dHJpYnV0ZSgnY29udGVudGVkaXRhYmxlJylcbiAgICAvLyAgIH0gZWxzZSB7XG4gICAgLy8gICAgIHRoaXMucm9vdEVsZW1lbnQuc2V0QXR0cmlidXRlKCdjb250ZW50ZWRpdGFibGUnLCAnZmFsc2UnKVxuICAgIC8vICAgfVxuICAgIC8vIH0pXG4gIH1cblxuICBwcml2YXRlIGluaXRCbG9ja1NlbGVjdGlvbigpIHtcbiAgICB0aGlzLmJsb2NrU2VsZWN0aW9uID0gbmV3IEJsb2NrU2VsZWN0aW9uKHtcbiAgICAgIGhvc3Q6IHRoaXMucm9vdEVsZW1lbnQsXG4gICAgICBkb2N1bWVudDogZG9jdW1lbnQsXG4gICAgICBlbmFibGU6IGZhbHNlLFxuICAgICAgb25seUxlZnRCdXR0b246IHRydWUsXG4gICAgICBzZWxlY3RhYmxlOiBcIltiZi1ibG9jay13cmFwXVwiLFxuICAgICAgc2VsZWN0aW9uQXJlYUNsYXNzOiBcImJsb2NrZmxvdy1zZWxlY3Rpb24tYXJlYVwiLFxuICAgICAgc2Vuc2l0aXZpdHk6IDQwLFxuICAgICAgb25JdGVtU2VsZWN0OiAoZWxlbWVudCkgPT4ge1xuICAgICAgICBlbGVtZW50LmZpcnN0RWxlbWVudENoaWxkIS5jbGFzc0xpc3QuYWRkKCdzZWxlY3RlZCcpXG4gICAgICB9LFxuICAgICAgb25JdGVtVW5zZWxlY3Q6IChlbGVtZW50KSA9PiB7XG4gICAgICAgIGVsZW1lbnQuZmlyc3RFbGVtZW50Q2hpbGQhLmNsYXNzTGlzdC5yZW1vdmUoJ3NlbGVjdGVkJylcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgdGhpcy5ibG9ja1NlbGVjdGlvbi5vbignZW5kJywgKGJsb2NrcykgPT4ge1xuICAgICAgaWYgKCFibG9ja3M/LnNpemUpIHJldHVyblxuICAgICAgY29uc3QgYmxvY2tJZHhMaXN0ID0gWy4uLmJsb2Nrc10ubWFwKGJsb2NrID0+IHRoaXMuY29udHJvbGxlci5yb290TW9kZWwuZmluZEluZGV4KGIgPT4gYi5pZCA9PT0gYmxvY2suZ2V0QXR0cmlidXRlKCdkYXRhLWJsb2NrLWlkJykhKSlcbiAgICAgIHRoaXMuX3NlbGVjdGVkQmxvY2tSYW5nZSA9IHtzdGFydDogTWF0aC5taW4oLi4uYmxvY2tJZHhMaXN0KSwgZW5kOiBNYXRoLm1heCguLi5ibG9ja0lkeExpc3QpICsgMX1cbiAgICB9KVxuICB9XG5cbiAgc2VsZWN0QmxvY2tzKGZyb206IENoYXJhY3RlckluZGV4LCB0bzogQ2hhcmFjdGVySW5kZXgpIHtcbiAgICBkb2N1bWVudC5nZXRTZWxlY3Rpb24oKSEucmVtb3ZlQWxsUmFuZ2VzKClcbiAgICB0aGlzLnJvb3RFbGVtZW50LmZvY3VzKHtwcmV2ZW50U2Nyb2xsOiB0cnVlfSlcbiAgICB0aGlzLmNsZWFyU2VsZWN0ZWRCbG9ja1JhbmdlKClcbiAgICBjb25zdCBzdGFydCA9IGNoYXJhY3RlckluZGV4Mk51bWJlcihmcm9tLCB0aGlzLmNvbnRyb2xsZXIucm9vdE1vZGVsLmxlbmd0aClcbiAgICBjb25zdCBlbmQgPSBjaGFyYWN0ZXJJbmRleDJOdW1iZXIodG8sIHRoaXMuY29udHJvbGxlci5yb290TW9kZWwubGVuZ3RoKVxuICAgIHRoaXMuX3NlbGVjdGVkQmxvY2tSYW5nZSA9IHtzdGFydCwgZW5kfVxuICAgIGZvciAobGV0IGkgPSBzdGFydDsgaSA8IGVuZDsgaSsrKSB7XG4gICAgICBjb25zdCBlbGUgPSB0aGlzLnJvb3RFbGVtZW50LmNoaWxkcmVuW2ldIGFzIEhUTUxFbGVtZW50XG4gICAgICB0aGlzLmJsb2NrU2VsZWN0aW9uLnNlbGVjdEVsZW1lbnQoZWxlKVxuICAgIH1cbiAgfVxuXG4gIGNsZWFyU2VsZWN0ZWRCbG9ja1JhbmdlKCkge1xuICAgIHRoaXMuYmxvY2tTZWxlY3Rpb24uY2xlYXIoKVxuICAgIHRoaXMuX3NlbGVjdGVkQmxvY2tSYW5nZSA9IHVuZGVmaW5lZFxuICB9XG5cbiAgZ2V0QWN0aXZlQmxvY2tJZCgpIHtcbiAgICBpZiAoIXRoaXMuYWN0aXZlRWxlbWVudCB8fCB0aGlzLmFjdGl2ZUVsZW1lbnQgPT09IHRoaXMucm9vdEVsZW1lbnQpIHJldHVybiBudWxsXG4gICAgcmV0dXJuIHRoaXMuYWN0aXZlRWxlbWVudC5jbG9zZXN0KCdbYmYtbm9kZS10eXBlPVwiZWRpdGFibGVcIl0nKT8uaWRcbiAgfVxuXG4gIGdldEFjdGl2ZUJsb2NrUmVmKCkge1xuICAgIGNvbnN0IGJpZCA9IHRoaXMuZ2V0QWN0aXZlQmxvY2tJZCgpXG4gICAgaWYgKCFiaWQpIHJldHVybiBudWxsXG4gICAgcmV0dXJuIHRoaXMuY29udHJvbGxlci5nZXRCbG9ja1JlZihiaWQpIGFzIEVkaXRhYmxlQmxvY2tcbiAgfVxuXG4gIEBIb3N0TGlzdGVuZXIoJ2ZvY3VzaW4nLCBbJyRldmVudCddKVxuICBwcml2YXRlIG9uRm9jdXNJbihldmVudDogRm9jdXNFdmVudCkge1xuICAgIGNvbnN0IHRhcmdldCA9IGV2ZW50LnRhcmdldCBhcyBIVE1MRWxlbWVudFxuICAgIGlmICghdGFyZ2V0LmlzQ29udGVudEVkaXRhYmxlICYmIHRhcmdldCAhPT0gdGhpcy5yb290RWxlbWVudCkge1xuICAgICAgdGhpcy5fYWN0aXZlRWxlbWVudCA9IG51bGxcbiAgICAgIHRoaXMuYWN0aXZlQmxvY2skLm5leHQodGhpcy5fYWN0aXZlQmxvY2sgPSBudWxsKVxuICAgICAgcmV0dXJuXG4gICAgfVxuICAgIHRoaXMuX2FjdGl2ZUVsZW1lbnQgPSB0YXJnZXRcbiAgICB0aGlzLmFjdGl2ZUJsb2NrJC5uZXh0KHRoaXMuX2FjdGl2ZUJsb2NrID0gdGhpcy5nZXRBY3RpdmVCbG9ja1JlZigpKVxuICAgIGlmICh0YXJnZXQuZ2V0QXR0cmlidXRlKCdwbGFjZWhvbGRlcicpICYmICF0YXJnZXQudGV4dENvbnRlbnQpIHRhcmdldC5jbGFzc0xpc3QuYWRkKCdwbGFjZWhvbGRlci12aXNpYmxlJylcbiAgfVxuXG4gIEBIb3N0TGlzdGVuZXIoJ2ZvY3Vzb3V0JywgWyckZXZlbnQnXSlcbiAgcHJpdmF0ZSBvbkZvY3VzT3V0KGV2ZW50OiBGb2N1c0V2ZW50KSB7XG4gICAgdGhpcy5fYWN0aXZlRWxlbWVudCA9IG51bGxcbiAgICB0aGlzLmFjdGl2ZUJsb2NrJC5uZXh0KHRoaXMuX2FjdGl2ZUJsb2NrID0gbnVsbClcbiAgICBjb25zdCB0YXJnZXQgPSBldmVudC50YXJnZXQgYXMgSFRNTEVsZW1lbnRcbiAgICBpZiAodGFyZ2V0ID09PSB0aGlzLnJvb3RFbGVtZW50KSB0aGlzLl9zZWxlY3RlZEJsb2NrUmFuZ2UgJiYgdGhpcy5jbGVhclNlbGVjdGVkQmxvY2tSYW5nZSgpXG4gICAgdGFyZ2V0LmNsYXNzTGlzdC5yZW1vdmUoJ3BsYWNlaG9sZGVyLXZpc2libGUnKVxuICB9XG5cbiAgQEhvc3RMaXN0ZW5lcigna2V5ZG93bicsIFsnJGV2ZW50J10pXG4gIHByaXZhdGUgb25LZXlEb3duKGV2ZW50OiBLZXlib2FyZEV2ZW50KSB7XG4gICAgaWYgKHRoaXMuY29udHJvbGxlci5yZWFkb25seSQudmFsdWUgfHwgZXZlbnQuaXNDb21wb3NpbmcpIHJldHVyblxuICAgIHRoaXMuY29udHJvbGxlci5rZXlFdmVudEJ1cy5oYW5kbGUoZXZlbnQpXG4gIH1cblxuICBwcmV2SW5wdXQ6IElDaGFyYWN0ZXJSYW5nZSAmIHsgYWZ0ZXJFbWJlZD86IGJvb2xlYW4sIGRhdGE/OiBzdHJpbmcgfCBudWxsLCBpbnB1dFR5cGU/OiBzdHJpbmcgfSB8IG51bGwgPSBudWxsXG5cbiAgcHJpdmF0ZSBjb21wb3NpdGlvblN0YXR1czogJ3N0YXJ0JyB8ICdlbmQnIHwgJ3VwZGF0ZScgPSAnZW5kJ1xuXG4gIEBIb3N0TGlzdGVuZXIoJ2NvbXBvc2l0aW9uc3RhcnQnLCBbJyRldmVudCddKVxuICBwcml2YXRlIG9uQ29tcG9zaXRpb25TdGFydChldmVudDogQ29tcG9zaXRpb25FdmVudCkge1xuICAgIHRoaXMuY29tcG9zaXRpb25TdGF0dXMgPSAnc3RhcnQnXG4gIH1cblxuICBASG9zdExpc3RlbmVyKCdjb21wb3NpdGlvbmVuZCcsIFsnJGV2ZW50J10pXG4gIHByaXZhdGUgb25Db21wb3NpdGlvbkVuZChldmVudDogQ29tcG9zaXRpb25FdmVudCkge1xuICAgIHRoaXMuY29tcG9zaXRpb25TdGF0dXMgPSAnZW5kJ1xuICB9XG5cbiAgQEhvc3RMaXN0ZW5lcignY29tcG9zaXRpb251cGRhdGUnLCBbJyRldmVudCddKVxuICBwcml2YXRlIG9uQ29tcG9zaXRpb25VcGRhdGUoZXZlbnQ6IENvbXBvc2l0aW9uRXZlbnQpIHtcbiAgICB0aGlzLmNvbXBvc2l0aW9uU3RhdHVzID0gJ3VwZGF0ZSdcbiAgfVxuXG4gIEBIb3N0TGlzdGVuZXIoJ2JlZm9yZWlucHV0JywgWyckZXZlbnQnXSlcbiAgcHJpdmF0ZSBvbkJlZm9yZUlucHV0KGV2ZW50OiBJbnB1dEV2ZW50KSB7XG4gICAgLy8gY29uc29sZS5jbGVhcigpXG4gICAgLy8gY29uc29sZS5sb2coJ2JlZm9yZWlucHV0JywgZXZlbnQsIGV2ZW50LmlucHV0VHlwZSwgZXZlbnQuZGF0YSlcbiAgICBzd2l0Y2ggKGV2ZW50LmlucHV0VHlwZSkge1xuICAgICAgY2FzZSAnaW5zZXJ0UmVwbGFjZW1lbnRUZXh0JzpcbiAgICAgIGNhc2UgJ2luc2VydENvbXBvc2l0aW9uVGV4dCc6XG4gICAgICBjYXNlICdpbnNlcnRUZXh0JzpcbiAgICAgIGNhc2UgJ2RlbGV0ZUNvbnRlbnRGb3J3YXJkJzpcbiAgICAgIGNhc2UgJ2RlbGV0ZUNvbnRlbnRCYWNrd2FyZCc6XG4gICAgICAgIGJyZWFrXG4gICAgICBkZWZhdWx0OlxuICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpXG4gICAgICAgIHJldHVyblxuICAgIH1cblxuICAgIGNvbnN0IGFjdGl2ZUVsZW1lbnQgPSB0aGlzLmFjdGl2ZUVsZW1lbnQhXG5cbiAgICBjb25zdCBzZWwgPSB3aW5kb3cuZ2V0U2VsZWN0aW9uKCkhXG4gICAgY29uc3Qgc3RhdGljUmFuZ2UgPSBldmVudC5nZXRUYXJnZXRSYW5nZXMoKVswXVxuXG4gICAgdGhpcy5wcmV2SW5wdXQgPSB0aGlzLmNvbnRyb2xsZXIuc2VsZWN0aW9uLm5vcm1hbGl6ZVN0YXRpY1JhbmdlKGFjdGl2ZUVsZW1lbnQsIHN0YXRpY1JhbmdlKVxuICAgIHRoaXMucHJldklucHV0LmRhdGEgPSBldmVudC5kYXRhXG4gICAgdGhpcy5wcmV2SW5wdXQuaW5wdXRUeXBlID0gZXZlbnQuaW5wdXRUeXBlXG5cbiAgICAvLyBjb25zb2xlLmxvZyhzdGF0aWNSYW5nZSx0aGlzLnByZXZJbnB1dClcblxuICAgIGlmIChzdGF0aWNSYW5nZS5zdGFydENvbnRhaW5lciA9PT0gYWN0aXZlRWxlbWVudCB8fFxuICAgICAgKHN0YXRpY1JhbmdlLnN0YXJ0Q29udGFpbmVyIGluc3RhbmNlb2YgVGV4dCAmJiAoc3RhdGljUmFuZ2Uuc3RhcnRDb250YWluZXIucGFyZW50RWxlbWVudCA9PT0gYWN0aXZlRWxlbWVudCB8fCBpc0VtYmVkRWxlbWVudChzdGF0aWNSYW5nZS5zdGFydENvbnRhaW5lci5wYXJlbnRFbGVtZW50Py5wcmV2aW91c0VsZW1lbnRTaWJsaW5nISkpKVxuICAgICkgdGhpcy5wcmV2SW5wdXQuYWZ0ZXJFbWJlZCA9IHRydWVcblxuICAgIC8vIHByZXZlbnQgYnJvd3NlciBiZWhhdmlvciAtIGhvbGQgdW5rbm93biB0YWcgdG8gaW5zZXJ0IGludG8gdGhlIHRleHRcbiAgICBpZiAoIXN0YXRpY1JhbmdlLmNvbGxhcHNlZCAmJiB0aGlzLmNvbXBvc2l0aW9uU3RhdHVzICE9PSAnc3RhcnQnKSB7XG4gICAgICBjb25zdCBfcmFuZ2UgPSBkb2N1bWVudC5jcmVhdGVSYW5nZSgpXG4gICAgICBfcmFuZ2Uuc2V0U3RhcnQoc3RhdGljUmFuZ2Uuc3RhcnRDb250YWluZXIsIHN0YXRpY1JhbmdlLnN0YXJ0T2Zmc2V0KVxuICAgICAgX3JhbmdlLnNldEVuZChzdGF0aWNSYW5nZS5lbmRDb250YWluZXIsIHN0YXRpY1JhbmdlLmVuZE9mZnNldClcbiAgICAgIGNvbnN0IGFkanVzdGVkID0gYWRqdXN0UmFuZ2VFZGdlcyhhY3RpdmVFbGVtZW50LCBfcmFuZ2UpXG4gICAgICBpZiAoYWRqdXN0ZWQpIHtcbiAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKVxuICAgICAgICBfcmFuZ2UuZGVsZXRlQ29udGVudHMoKVxuICAgICAgICB0aGlzLnByZXZJbnB1dC5hZnRlckVtYmVkID0gdHJ1ZVxuICAgICAgfVxuICAgICAgX3JhbmdlLmRldGFjaCgpXG4gICAgICB0aGlzLmhhbmRsZUlucHV0KGV2ZW50KVxuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgaWYgKFxuICAgICAgKHNlbC5mb2N1c05vZGUgaW5zdGFuY2VvZiBUZXh0ICYmIHNlbC5mb2N1c09mZnNldCA9PT0gMCAmJiBzZWwuZm9jdXNOb2RlLnBhcmVudEVsZW1lbnQgIT09IGFjdGl2ZUVsZW1lbnQpIHx8XG4gICAgICAoc2VsLmZvY3VzTm9kZSA9PT0gYWN0aXZlRWxlbWVudCAmJiBhY3RpdmVFbGVtZW50LmNsYXNzTmFtZS5pbmNsdWRlcygnZWRpdGFibGUtY29udGFpbmVyJykpICAvLyBhdCBlbWJlZCBlbGVtZW50IGJlZm9yZSBvciBhZnRlclxuICAgICkge1xuICAgICAgLyoqXG4gICAgICAgKiA8cD4gPHNwYW4+PC9zcGFuPiA8L3A+ICAtLT4gd3JpdGUgYW55IHdvcmQgaW4gcCB0YWcgLS0+IDxwPiB3b3JkIDxzcGFuPjwvc3Bhbj4gPC9wPiA7IGl0YHMgbm90IGV4cGVjdGVkIHJlc3VsdCBiZWNhdXNlIHRoZSB3b3JkIHNob3VsZCBiZSBpbiBzcGFuIHRhZ1xuICAgICAgICogPHA+IDxzcGFuPlxcdTIwMEI8L3NwYW4+IDwvcD4gIC0tPiB3cml0ZSBhbnkgd29yZCBpbiBwIHRhZyAtLT4gPHA+IDxzcGFuPlxcdTIwMEJ3b3JkPC9zcGFuPiA8L3A+IDsgaXRgcyBleHBlY3RlZCByZXN1bHRcbiAgICAgICAqL1xuICAgICAgY29uc3Qgc3BhbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKVxuICAgICAgc3Bhbi50ZXh0Q29udGVudCA9ICdcXHUyMDBCJ1xuICAgICAgc2VsLmZvY3VzTm9kZSBpbnN0YW5jZW9mIFRleHQgPyBzZWwuZm9jdXNOb2RlLnBhcmVudEVsZW1lbnQhLmJlZm9yZShzcGFuKSA6IHNlbC5nZXRSYW5nZUF0KDApLmluc2VydE5vZGUoc3BhbilcbiAgICAgIHNlbC5zZXRCYXNlQW5kRXh0ZW50KHNwYW4uZmlyc3RDaGlsZCEsIDAsIHNwYW4uZmlyc3RDaGlsZCEsIDEpXG4gICAgfVxuXG4gICAgdGhpcy5oYW5kbGVJbnB1dChldmVudClcbiAgfVxuXG4gIHByaXZhdGUgaGFuZGxlSW5wdXQoZTogSW5wdXRFdmVudCkge1xuICAgIC8vIGNvbnNvbGUubG9nKCdpbnB1dCcsIGUsIGUuaW5wdXRUeXBlLCBlLmRhdGEpXG4gICAgaWYgKCF0aGlzLnByZXZJbnB1dCkgcmV0dXJuXG4gICAgY29uc3Qge3N0YXJ0LCBlbmQsIGFmdGVyRW1iZWQsIGRhdGEsIGlucHV0VHlwZX0gPSB0aGlzLnByZXZJbnB1dFxuICAgIGNvbnN0IG9wczogQXJyYXk8KCkgPT4gdm9pZD4gPSBbXVxuXG4gICAgY29uc3QgYlJlZiA9IHRoaXMuYWN0aXZlQmxvY2shXG4gICAgY29uc3QgeVRleHQgPSBiUmVmLnlUZXh0XG4gICAgaWYgKHN0YXJ0ICE9PSBlbmQpIHtcbiAgICAgIG9wcy5wdXNoKCgpID0+IHlUZXh0LmRlbGV0ZShzdGFydCwgZW5kIC0gc3RhcnQpKVxuICAgIH1cblxuICAgIGxldCBuZWVkQ2hlY2sgPSBmYWxzZVxuICAgIHN3aXRjaCAoaW5wdXRUeXBlKSB7XG4gICAgICBjYXNlICdpbnNlcnRSZXBsYWNlbWVudFRleHQnOlxuICAgICAgY2FzZSAnaW5zZXJ0Q29tcG9zaXRpb25UZXh0JzpcbiAgICAgIGNhc2UgJ2luc2VydFRleHQnOlxuICAgICAgICBkYXRhICYmIG9wcy5wdXNoKCgpID0+IHlUZXh0Lmluc2VydChzdGFydCwgZGF0YSwgYWZ0ZXJFbWJlZCA/IHt9IDogdW5kZWZpbmVkKSkgIC8vIGF2b2lkIG5ldyB0ZXh0IGV4dGVuZHMgdGhlIGF0dHJpYnV0ZXMgb2YgcHJldmlvdXMgZW1iZWQgZWxlbWVudFxuICAgICAgICBzdGFydCA9PT0gMCAmJiAobmVlZENoZWNrID0gdHJ1ZSlcbiAgICAgICAgYnJlYWtcbiAgICAgIGNhc2UgJ2RlbGV0ZUNvbnRlbnRCYWNrd2FyZCc6XG4gICAgICAgIGlmIChzdGFydCA9PT0gZW5kKSB7XG4gICAgICAgICAgb3BzLnB1c2goKCkgPT4geVRleHQuZGVsZXRlKHN0YXJ0IC0gMSwgMSkpXG4gICAgICAgIH1cbiAgICAgICAgYnJlYWtcbiAgICAgIGNhc2UgJ2RlbGV0ZUNvbnRlbnRGb3J3YXJkJzpcbiAgICAgICAgaWYgKHN0YXJ0ID09PSBlbmQpIHtcbiAgICAgICAgICBvcHMucHVzaCgoKSA9PiB5VGV4dC5kZWxldGUoc3RhcnQsIDEpKVxuICAgICAgICB9XG4gICAgICAgIGJyZWFrXG4gICAgICBkZWZhdWx0OlxuICAgICAgICBicmVhaztcbiAgICB9XG4gICAgb3BzLmxlbmd0aCAmJiB0aGlzLmNvbnRyb2xsZXIudHJhbnNhY3QoKCkgPT4ge1xuICAgICAgb3BzLmZvckVhY2gob3AgPT4gb3AoKSlcblxuICAgICAgLy8g5qOA5p+lYnLmoIfnrb5cbiAgICAgIGlmIChuZWVkQ2hlY2sgJiYgYlJlZi5nZXRUZXh0Q29udGVudCgpID09PSBkYXRhKSB7XG4gICAgICAgIGNsZWFyQnJlYWtFbGVtZW50KGJSZWYuY29udGFpbmVyRWxlKVxuICAgICAgfVxuICAgIH0sIFVTRVJfQ0hBTkdFX1NJR05BTClcbiAgICB0aGlzLnByZXZJbnB1dCA9IG51bGxcbiAgfVxuXG4gIEBIb3N0TGlzdGVuZXIoJ2NvbnRleHRtZW51JywgWyckZXZlbnQnXSlcbiAgcHJpdmF0ZSBvbkNvbnRleHRNZW51KGV2ZW50OiBDbGlwYm9hcmRFdmVudCkge1xuICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KClcbiAgICBjb25zb2xlLmxvZygnY29udGV4dG1lbnUnLCBldmVudClcbiAgfVxuXG4gIG5nT25EZXN0cm95KCkge1xuICAgIHRoaXMub25EZXN0cm95LmVtaXQoKVxuICB9XG59XG4iXX0=