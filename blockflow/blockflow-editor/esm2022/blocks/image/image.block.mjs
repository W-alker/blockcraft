import { Component, ElementRef, ViewChild } from "@angular/core";
import { AsyncPipe, NgForOf, NgIf } from "@angular/common";
import { BehaviorSubject, fromEvent, take, takeUntil, throttleTime } from "rxjs";
import Viewer from 'viewerjs';
import { FloatToolbar } from "../../components";
import { BaseBlock } from "../../core";
import { ParagraphBlock } from "../paragraph/paragraph.block";
import { OverlayModule } from "@angular/cdk/overlay";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import * as i0 from "@angular/core";
const COPIED_MENU = {
    id: 'copied',
    name: 'copied',
    icon: 'bf_icon bf_xuanzhong',
    title: '已复制',
    text: '已复制'
};
const IMAGE_BLOCK_TOOLBAR_LIST = [
    {
        id: 'caption',
        name: 'caption',
        icon: 'bf_icon bf_tianjiamiaoshu',
        title: '添加图片标题',
        divide: true
    },
    {
        id: 'align-left',
        name: 'align',
        icon: 'bf_icon bf_tupianjuzuo',
        value: 'left',
        title: '居左'
    },
    {
        id: 'align-center',
        name: 'align',
        icon: 'bf_icon bf_tupianjuzhong',
        value: 'center',
        title: '居中'
    },
    {
        id: 'align-right',
        name: 'align',
        icon: 'bf_icon bf_tupianjuyou',
        value: 'right',
        title: '居右',
        divide: true
    },
    {
        id: 'copy-link',
        name: 'copy-link',
        icon: 'bf_icon bf_tupianlianjie',
        title: '复制图片链接'
    },
    {
        id: 'download',
        name: 'download',
        icon: 'bf_icon bf_xiazai-2',
        title: '下载图片'
    }
];
export class ImageBlock extends BaseBlock {
    constructor(_cdr) {
        super();
        this._cdr = _cdr;
        this.TOOLBAR_LIST = [...IMAGE_BLOCK_TOOLBAR_LIST];
        this.imgLoadState = 'loading';
        this._showWidth = 100;
        this._align = 'left';
        this.isFocusing$ = new BehaviorSubject(false);
        this._viewer = null;
    }
    ngOnInit() {
        super.ngOnInit();
        this._showWidth = this.model.props.width;
        this.model.update$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(e => {
            if (e.type === 'props') {
                this.setAlign();
                this._showWidth !== this.props.width && (this._showWidth = this.props.width);
            }
        });
    }
    ngAfterViewInit() {
        super.ngAfterViewInit();
        this.setAlign();
        const img = this.img.nativeElement;
        if (img.complete && img.naturalHeight !== 0) {
            this.imgLoadState = 'loaded';
            return;
        }
        const errorSub = fromEvent(img, 'error').pipe(take(1)).subscribe(() => {
            this.imgLoadState = 'error';
            this._cdr.detectChanges();
            loadSub.unsubscribe();
        });
        const loadSub = fromEvent(img, 'load').pipe(take(1)).subscribe(() => {
            this.imgLoadState = 'loaded';
            this._cdr.detectChanges();
            errorSub.unsubscribe();
        });
    }
    onKeydown(e) {
        if (e.isComposing || e.eventPhase !== 2)
            return;
        console.log(e);
        switch (e.key) {
            case 'Delete':
            case 'Backspace':
                e.stopPropagation();
                e.preventDefault();
                this.destroySelf();
                break;
            case 'Enter':
                e.stopPropagation();
                e.preventDefault();
                const { parentId, index } = this.getPosition();
                if (parentId !== this.controller.rootId)
                    break;
                const np = this.controller.createBlock('paragraph');
                this.controller.insertBlocks(index + 1, [np], parentId).then(() => {
                    this.controller.selection.setSelection(np.id, 'start');
                });
                break;
            case 'c':
                if (!e.ctrlKey && !e.metaKey)
                    break;
                e.stopPropagation();
                e.preventDefault();
                this.controller.clipboard.writeData([{ type: 'text/uri-list', data: this.props.src }]);
                break;
            case 'x':
                if (this.controller.readonly$.value || (!e.ctrlKey && !e.metaKey))
                    break;
                e.stopPropagation();
                e.preventDefault();
                this.controller.clipboard.writeData([{ type: 'text/uri-list', data: this.props.src }]);
                this.destroySelf();
                break;
        }
    }
    setAlign() {
        if (this._align === this.props.align)
            return;
        this._align = this.props.align;
        this.hostEl.nativeElement.setAttribute('data-align', this._align);
    }
    setToolbarActive() {
        const set = new Set();
        if (this.model.children.length)
            set.add('caption');
        set.add('align-' + this.props.align);
        this.activeMenu = set;
    }
    onImgFocus(event) {
        event.stopPropagation();
        event.preventDefault();
        this.setToolbarActive();
        this.isFocusing$.next(true);
    }
    onImgBlur(event) {
        event.stopPropagation();
        this.isFocusing$.next(false);
    }
    onImgClick(event) {
        event.preventDefault();
        event.stopPropagation();
        if (this.controller.readonly$.value) {
            this.previewImg();
            return;
        }
        if (!this.isFocusing$.value)
            return;
        this.previewImg();
    }
    previewImg() {
        this._viewer ??= new Viewer(this.img.nativeElement, { inline: false, zIndex: 999999 });
        this._viewer.show();
    }
    onResizeHandleMouseDown(event, direction) {
        event.stopPropagation();
        event.preventDefault();
        this.mouseMove$?.unsubscribe();
        this.startPoint = { x: event.clientX, y: event.clientY, direction };
        this.mouseMove$ = fromEvent(document, 'mousemove')
            .pipe(throttleTime(60))
            .subscribe((e) => {
            const movePx = e.clientX - this.startPoint.x;
            if (this.startPoint.direction === 'left')
                this._showWidth -= movePx;
            else
                this._showWidth += movePx;
            this.startPoint.x = e.clientX;
        });
        fromEvent(document, 'mouseup').pipe(take(1)).subscribe((e) => {
            this.startPoint = undefined;
            this.mouseMove$?.unsubscribe();
            this._showWidth !== this.props.width && this.setProp('width', this._showWidth);
        });
    }
    onToolbarItemClick(e) {
        const item = e.item;
        switch (item.name) {
            case 'caption':
                if (this.model.children.length) {
                    this.model.deleteChildren(0, 1);
                }
                else {
                    const paragraph = this.controller.createBlock('paragraph');
                    this.controller.insertBlocks(0, [paragraph], this.id).then(() => {
                        this.controller.selection.setSelection(paragraph.id, 0);
                    });
                }
                this.setToolbarActive();
                break;
            case 'align':
                if (this.props.align === item.value)
                    return;
                this.setProp('align', item.value);
                this.setToolbarActive();
                break;
            case 'copy-link':
                this.controller.clipboard.writeText(this.props.src).then(() => {
                    const idx = this.TOOLBAR_LIST.findIndex(item => item.name === 'copy-link');
                    this.TOOLBAR_LIST.splice(idx, 1, COPIED_MENU);
                    this.activeMenu?.add(COPIED_MENU.id);
                    this.TOOLBAR_LIST = [...this.TOOLBAR_LIST];
                    setTimeout(() => {
                        this.TOOLBAR_LIST.splice(idx, 1, item);
                        this.TOOLBAR_LIST = [...this.TOOLBAR_LIST];
                    }, 2000);
                });
                break;
            case 'download':
                this.download(this.props.src);
                break;
        }
    }
    download(src, caption) {
        let a = document.createElement('a');
        a.href = src;
        a.download = caption || src;
        a.target = '_blank';
        a.dispatchEvent(new MouseEvent('click'));
        a = null;
    }
    onDragStart(e) {
        const target = e.target;
        e.stopPropagation();
        e.dataTransfer?.clearData();
        e.dataTransfer?.setData('text/plain', this.props.src);
        e.dataTransfer?.setData('@bf/image', this.props.src);
        e.dataTransfer?.setDragImage(this.img.nativeElement, 0, 0);
        fromEvent(this.controller.rootElement, 'drop').pipe(takeUntil(fromEvent(target, 'dragend'))).subscribe(e => {
            e.preventDefault();
            e.stopPropagation();
            if (!e.dataTransfer?.getData('@bf/image'))
                return;
            const range = document.caretRangeFromPoint(e.clientX, e.clientY);
            if (!range)
                return;
            const blockId = (range.startContainer instanceof HTMLElement ? range.startContainer : range.startContainer.parentElement)?.closest('[bf-node-type="editable"]')?.id;
            if (!blockId || blockId === this.id)
                return;
            const bRef = this.controller.getBlockRef(blockId);
            if (!bRef || !this.controller.isEditableBlock(bRef))
                return;
            const parentId = bRef.getParentId();
            // 根级直接移动block
            if (parentId === this.controller.rootId) {
                // 计算放置的位置在目标元素的上方还是下方
                const target = e.target;
                const rect = target.getBoundingClientRect();
                const y = e.clientY - rect.top;
                this.controller.moveBlock(this.id, blockId, y < rect.height / 2 ? 'before' : 'after');
                return;
            }
            const nativeRange = this.controller.selection.normalizeStaticRange(bRef.containerEle, range);
            if (bRef.containerEle.classList.contains('bf-plain-text-only') || !bRef.containerEle.classList.contains('bf-multi-line'))
                return;
            const deltas = [];
            if (nativeRange.start > 0) {
                deltas.push({ retain: nativeRange.start });
            }
            deltas.push({ insert: { image: this.props.src } });
            bRef.applyDelta(deltas);
            this.destroySelf();
        });
    }
    ngOnDestroy() {
        super.ngOnDestroy();
        this._viewer?.destroy();
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: ImageBlock, deps: [{ token: i0.ChangeDetectorRef }], target: i0.ɵɵFactoryTarget.Component }); }
    static { this.ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "17.0.0", version: "17.3.12", type: ImageBlock, isStandalone: true, selector: "div.image-block", host: { properties: { "attr.contenteditable": "false" } }, viewQueries: [{ propertyName: "img", first: true, predicate: ["img"], descendants: true, read: ElementRef, static: true }], usesInheritance: true, ngImport: i0, template: `
    <div class="img-block__container" [style.width.px]="_showWidth"
         [attr.tabindex]=" (controller.readonly$ | async) ? null : 0 " (keydown)="onKeydown($event)"
         (focus)="onImgFocus($event)" (blur)="onImgBlur($event)">

      <div [class]="['img-default-skeleton', imgLoadState]" *ngIf="imgLoadState !== 'loaded'">
        <span class="img-default-skeleton__icon bf_icon bf_jiazai" *ngIf="imgLoadState === 'loading'"></span>
        <span class="img-default-skeleton__error" *ngIf="imgLoadState === 'error'">加载失败!</span>
      </div>

      @if (imgLoadState === 'loaded') {
        <div class="bf-float-toolbar img-block__toolbar" *ngIf="isFocusing$ | async"
             [toolbarList]="TOOLBAR_LIST" [activeMenu]="activeMenu" (click)="$event.stopPropagation();"
             (itemClick)="onToolbarItemClick($event)">
        </div>
      }

      <img [src]="model.props.src" [class.focusing]="isFocusing$ | async"
           draggable="false" (click)="onImgClick($event)" #img>

      <ng-container *ngIf="imgLoadState === 'loaded'">
        <p class="img-block__caption editable-container" *ngFor="let item of children"
           [controller]="controller" [model]="item" [placeholder]="'添加标题'"
           (click)="$event.stopPropagation()" (mousemove)="$event.stopPropagation()"></p>
      </ng-container>

      <div class="img-resizer" *ngIf="isFocusing$ | async" (click)="onImgClick($event)" draggable="true"
           (dragstart)="onDragStart($event)">
        <div class="img-resizer__handle img-resizer__handle__line img-resizer__handle--left"
             (click)="$event.stopPropagation()"
             (mousedown)="onResizeHandleMouseDown($event, 'left')"></div>
        <div class="img-resizer__handle img-resizer__handle__line  img-resizer__handle--right"
             (click)="$event.stopPropagation()"
             (mousedown)="onResizeHandleMouseDown($event, 'right')"></div>
        <div class="img-resizer__handle img-resizer__handle__point img-resizer__handle--tl"
             (click)="$event.stopPropagation()"
             (mousedown)="onResizeHandleMouseDown($event, 'left')"></div>
        <div class="img-resizer__handle img-resizer__handle__point img-resizer__handle--tr"
             (click)="$event.stopPropagation()"
             (mousedown)="onResizeHandleMouseDown($event, 'right')"></div>
        <div class="img-resizer__handle img-resizer__handle__point img-resizer__handle--bl"
             (click)="$event.stopPropagation()"
             (mousedown)="onResizeHandleMouseDown($event, 'left')"></div>
        <div class="img-resizer__handle img-resizer__handle__point img-resizer__handle--br"
             (click)="$event.stopPropagation()"
             (mousedown)="onResizeHandleMouseDown($event, 'right')"></div>
      </div>

    </div>
  `, isInline: true, styles: [".img-block__toolbar{z-index:100;position:absolute;top:-40px;right:50%;transform:translate(50%)}:host{display:flex;width:fit-content;max-width:100%}:host[data-align=left]{margin-left:0}:host[data-align=right]{margin-left:100%;transform:translate(-100%)}:host[data-align=center]{margin:0 auto}:host.selected .img-block__container{outline:2px solid var(--bf-selected-border)}.img-block__container{position:relative;max-width:100%;min-width:150px}.img-block__container img{display:block;width:100%}.img-default-skeleton{position:absolute;top:0;left:0;width:100%;height:100%;background-color:#f3f3f380}.img-default-skeleton.loading,.img-default-skeleton.error{min-height:200px;width:100%;display:flex;justify-content:center;align-items:center}.img-default-skeleton__icon{font-size:40px;color:#5089b2;transform-origin:center center;animation:bf_img_loading 1s linear infinite}@keyframes bf_img_loading{to{transform:rotate(360deg)}}.img-default-skeleton__error{color:red}.img-block__caption{z-index:1;position:absolute;margin:0;width:100%;bottom:0;left:0;padding:8px;font-size:14px;color:#fff;background:linear-gradient(180deg,transparent 0%,rgba(0,0,0,.4) 100%);box-sizing:border-box}.img-resizer{position:absolute;top:0;left:0;width:100%;height:100%;border:2px solid #4857E2;outline:2px solid #B9C0FF;cursor:zoom-in;box-shadow:0 0 5px 2px #e8e8e8}.img-resizer__handle{z-index:1;position:absolute}.img-resizer__handle__point{width:14px;height:14px;background-color:#4857e2;border:2px solid #fff;border-radius:50%}.img-resizer__handle--tl{top:-7px;left:-7px;cursor:nwse-resize}.img-resizer__handle--tr{top:-7px;right:-7px;cursor:nesw-resize}.img-resizer__handle--bl{bottom:-7px;left:-7px;cursor:nesw-resize}.img-resizer__handle--br{bottom:-7px;right:-7px;cursor:nwse-resize}.img-resizer__handle--left,.img-resizer__handle--right{top:0;width:4px;height:100%;cursor:w-resize}.img-resizer__handle--left{left:-2px}.img-resizer__handle--right{right:-2px}\n"], dependencies: [{ kind: "directive", type: NgIf, selector: "[ngIf]", inputs: ["ngIf", "ngIfThen", "ngIfElse"] }, { kind: "component", type: ParagraphBlock, selector: "p.editable-container" }, { kind: "directive", type: NgForOf, selector: "[ngFor][ngForOf]", inputs: ["ngForOf", "ngForTrackBy", "ngForTemplate"] }, { kind: "component", type: FloatToolbar, selector: "div.bf-float-toolbar", inputs: ["activeMenu", "toolbarList"], outputs: ["itemClick"] }, { kind: "ngmodule", type: OverlayModule }, { kind: "pipe", type: AsyncPipe, name: "async" }] }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: ImageBlock, decorators: [{
            type: Component,
            args: [{ selector: 'div.image-block', standalone: true, template: `
    <div class="img-block__container" [style.width.px]="_showWidth"
         [attr.tabindex]=" (controller.readonly$ | async) ? null : 0 " (keydown)="onKeydown($event)"
         (focus)="onImgFocus($event)" (blur)="onImgBlur($event)">

      <div [class]="['img-default-skeleton', imgLoadState]" *ngIf="imgLoadState !== 'loaded'">
        <span class="img-default-skeleton__icon bf_icon bf_jiazai" *ngIf="imgLoadState === 'loading'"></span>
        <span class="img-default-skeleton__error" *ngIf="imgLoadState === 'error'">加载失败!</span>
      </div>

      @if (imgLoadState === 'loaded') {
        <div class="bf-float-toolbar img-block__toolbar" *ngIf="isFocusing$ | async"
             [toolbarList]="TOOLBAR_LIST" [activeMenu]="activeMenu" (click)="$event.stopPropagation();"
             (itemClick)="onToolbarItemClick($event)">
        </div>
      }

      <img [src]="model.props.src" [class.focusing]="isFocusing$ | async"
           draggable="false" (click)="onImgClick($event)" #img>

      <ng-container *ngIf="imgLoadState === 'loaded'">
        <p class="img-block__caption editable-container" *ngFor="let item of children"
           [controller]="controller" [model]="item" [placeholder]="'添加标题'"
           (click)="$event.stopPropagation()" (mousemove)="$event.stopPropagation()"></p>
      </ng-container>

      <div class="img-resizer" *ngIf="isFocusing$ | async" (click)="onImgClick($event)" draggable="true"
           (dragstart)="onDragStart($event)">
        <div class="img-resizer__handle img-resizer__handle__line img-resizer__handle--left"
             (click)="$event.stopPropagation()"
             (mousedown)="onResizeHandleMouseDown($event, 'left')"></div>
        <div class="img-resizer__handle img-resizer__handle__line  img-resizer__handle--right"
             (click)="$event.stopPropagation()"
             (mousedown)="onResizeHandleMouseDown($event, 'right')"></div>
        <div class="img-resizer__handle img-resizer__handle__point img-resizer__handle--tl"
             (click)="$event.stopPropagation()"
             (mousedown)="onResizeHandleMouseDown($event, 'left')"></div>
        <div class="img-resizer__handle img-resizer__handle__point img-resizer__handle--tr"
             (click)="$event.stopPropagation()"
             (mousedown)="onResizeHandleMouseDown($event, 'right')"></div>
        <div class="img-resizer__handle img-resizer__handle__point img-resizer__handle--bl"
             (click)="$event.stopPropagation()"
             (mousedown)="onResizeHandleMouseDown($event, 'left')"></div>
        <div class="img-resizer__handle img-resizer__handle__point img-resizer__handle--br"
             (click)="$event.stopPropagation()"
             (mousedown)="onResizeHandleMouseDown($event, 'right')"></div>
      </div>

    </div>
  `, imports: [
                        NgIf, ParagraphBlock, NgForOf, FloatToolbar, OverlayModule, AsyncPipe
                    ], host: {
                        '[attr.contenteditable]': 'false',
                    }, styles: [".img-block__toolbar{z-index:100;position:absolute;top:-40px;right:50%;transform:translate(50%)}:host{display:flex;width:fit-content;max-width:100%}:host[data-align=left]{margin-left:0}:host[data-align=right]{margin-left:100%;transform:translate(-100%)}:host[data-align=center]{margin:0 auto}:host.selected .img-block__container{outline:2px solid var(--bf-selected-border)}.img-block__container{position:relative;max-width:100%;min-width:150px}.img-block__container img{display:block;width:100%}.img-default-skeleton{position:absolute;top:0;left:0;width:100%;height:100%;background-color:#f3f3f380}.img-default-skeleton.loading,.img-default-skeleton.error{min-height:200px;width:100%;display:flex;justify-content:center;align-items:center}.img-default-skeleton__icon{font-size:40px;color:#5089b2;transform-origin:center center;animation:bf_img_loading 1s linear infinite}@keyframes bf_img_loading{to{transform:rotate(360deg)}}.img-default-skeleton__error{color:red}.img-block__caption{z-index:1;position:absolute;margin:0;width:100%;bottom:0;left:0;padding:8px;font-size:14px;color:#fff;background:linear-gradient(180deg,transparent 0%,rgba(0,0,0,.4) 100%);box-sizing:border-box}.img-resizer{position:absolute;top:0;left:0;width:100%;height:100%;border:2px solid #4857E2;outline:2px solid #B9C0FF;cursor:zoom-in;box-shadow:0 0 5px 2px #e8e8e8}.img-resizer__handle{z-index:1;position:absolute}.img-resizer__handle__point{width:14px;height:14px;background-color:#4857e2;border:2px solid #fff;border-radius:50%}.img-resizer__handle--tl{top:-7px;left:-7px;cursor:nwse-resize}.img-resizer__handle--tr{top:-7px;right:-7px;cursor:nesw-resize}.img-resizer__handle--bl{bottom:-7px;left:-7px;cursor:nesw-resize}.img-resizer__handle--br{bottom:-7px;right:-7px;cursor:nwse-resize}.img-resizer__handle--left,.img-resizer__handle--right{top:0;width:4px;height:100%;cursor:w-resize}.img-resizer__handle--left{left:-2px}.img-resizer__handle--right{right:-2px}\n"] }]
        }], ctorParameters: () => [{ type: i0.ChangeDetectorRef }], propDecorators: { img: [{
                type: ViewChild,
                args: ['img', { static: true, read: ElementRef }]
            }] } });
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW1hZ2UuYmxvY2suanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi9ibG9ja2Zsb3cvc3JjL2Jsb2Nrcy9pbWFnZS9pbWFnZS5ibG9jay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxPQUFPLEVBRUwsU0FBUyxFQUNULFVBQVUsRUFDVixTQUFTLEVBQ1YsTUFBTSxlQUFlLENBQUM7QUFDdkIsT0FBTyxFQUFDLFNBQVMsRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFDLE1BQU0saUJBQWlCLENBQUM7QUFDekQsT0FBTyxFQUFDLGVBQWUsRUFBRSxTQUFTLEVBQWdCLElBQUksRUFBRSxTQUFTLEVBQUUsWUFBWSxFQUFDLE1BQU0sTUFBTSxDQUFDO0FBQzdGLE9BQU8sTUFBTSxNQUFNLFVBQVUsQ0FBQztBQUM5QixPQUFPLEVBQUMsWUFBWSxFQUFlLE1BQU0sa0JBQWtCLENBQUM7QUFFNUQsT0FBTyxFQUFDLFNBQVMsRUFBZ0MsTUFBTSxZQUFZLENBQUM7QUFDcEUsT0FBTyxFQUFDLGNBQWMsRUFBQyxNQUFNLDhCQUE4QixDQUFDO0FBQzVELE9BQU8sRUFBQyxhQUFhLEVBQUMsTUFBTSxzQkFBc0IsQ0FBQztBQUNuRCxPQUFPLEVBQUMsa0JBQWtCLEVBQUMsTUFBTSw0QkFBNEIsQ0FBQzs7QUFFOUQsTUFBTSxXQUFXLEdBQWlCO0lBQ2hDLEVBQUUsRUFBRSxRQUFRO0lBQ1osSUFBSSxFQUFFLFFBQVE7SUFDZCxJQUFJLEVBQUUsc0JBQXNCO0lBQzVCLEtBQUssRUFBRSxLQUFLO0lBQ1osSUFBSSxFQUFFLEtBQUs7Q0FDWixDQUFBO0FBRUQsTUFBTSx3QkFBd0IsR0FBbUI7SUFDL0M7UUFDRSxFQUFFLEVBQUUsU0FBUztRQUNiLElBQUksRUFBRSxTQUFTO1FBQ2YsSUFBSSxFQUFFLDJCQUEyQjtRQUNqQyxLQUFLLEVBQUUsUUFBUTtRQUNmLE1BQU0sRUFBRSxJQUFJO0tBQ2I7SUFDRDtRQUNFLEVBQUUsRUFBRSxZQUFZO1FB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QVUsNk1BQ2tCLFVBQVUsa0VBNUR2Qzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztHQWlEVCxrK0RBR0MsSUFBSSw2RkFBRSxjQUFjLGlFQUFFLE9BQU8sbUhBQUUsWUFBWSwrSEFBRSxhQUFhLDBCQUFFLFNBQVM7OzRGQU81RCxVQUFVO2tCQTlEdEIsU0FBUzsrQkFDRSxpQkFBaUIsY0FDZixJQUFJLFlBQ047Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7R0FpRFQsV0FFUTt3QkFDUCxJQUFJLEVBQUUsY0FBYyxFQUFFLE9BQU8sRUFBRSxZQUFZLEVBQUUsYUFBYSxFQUFFLFNBQVM7cUJBQ3RFLFFBRUs7d0JBQ0osd0JBQXdCLEVBQUUsT0FBTztxQkFDbEM7c0ZBR21ELEdBQUc7c0JBQXRELFNBQVM7dUJBQUMsS0FBSyxFQUFFLEVBQUMsTUFBTSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsVUFBVSxFQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHtcbiAgQ2hhbmdlRGV0ZWN0b3JSZWYsXG4gIENvbXBvbmVudCxcbiAgRWxlbWVudFJlZixcbiAgVmlld0NoaWxkXG59IGZyb20gXCJAYW5ndWxhci9jb3JlXCI7XG5pbXBvcnQge0FzeW5jUGlwZSwgTmdGb3JPZiwgTmdJZn0gZnJvbSBcIkBhbmd1bGFyL2NvbW1vblwiO1xuaW1wb3J0IHtCZWhhdmlvclN1YmplY3QsIGZyb21FdmVudCwgU3Vic2NyaXB0aW9uLCB0YWtlLCB0YWtlVW50aWwsIHRocm90dGxlVGltZX0gZnJvbSBcInJ4anNcIjtcbmltcG9ydCBWaWV3ZXIgZnJvbSAndmlld2VyanMnO1xuaW1wb3J0IHtGbG9hdFRvb2xiYXIsIElUb29sYmFySXRlbX0gZnJvbSBcIi4uLy4uL2NvbXBvbmVudHNcIjtcbmltcG9ydCB7SUltYWdlQmxvY2tQcm9wcywgSUltZ0Jsb2NrTW9kZWx9IGZyb20gXCIuL3R5cGVcIjtcbmltcG9ydCB7QmFzZUJsb2NrLCBEZWx0YU9wZXJhdGlvbiwgRWRpdGFibGVCbG9ja30gZnJvbSBcIi4uLy4uL2NvcmVcIjtcbmltcG9ydCB7UGFyYWdyYXBoQmxvY2t9IGZyb20gXCIuLi9wYXJhZ3JhcGgvcGFyYWdyYXBoLmJsb2NrXCI7XG5pbXBvcnQge092ZXJsYXlNb2R1bGV9IGZyb20gXCJAYW5ndWxhci9jZGsvb3ZlcmxheVwiO1xuaW1wb3J0IHt0YWtlVW50aWxEZXN0cm95ZWR9IGZyb20gXCJAYW5ndWxhci9jb3JlL3J4anMtaW50ZXJvcFwiO1xuXG5jb25zdCBDT1BJRURfTUVOVTogSVRvb2xiYXJJdGVtID0ge1xuICBpZDogJ2NvcGllZCcsXG4gIG5hbWU6ICdjb3BpZWQnLFxuICBpY29uOiAnYmZfaWNvbiBiZl94dWFuemhvbmcnLFxuICB0aXRsZTogJ+W3suWkjeWIticsXG4gIHRleHQ6ICflt7LlpI3liLYnXG59XG5cbmNvbnN0IElNQUdFX0JMT0NLX1RPT0xCQVJfTElTVDogSVRvb2xiYXJJdGVtW10gPSBbXG4gIHtcbiAgICBpZDogJ2NhcHRpb24nLFxuICAgIG5hbWU6ICdjYXB0aW9uJyxcbiAgICBpY29uOiAnYmZfaWNvbiBiZl90aWFuamlhbWlhb3NodScsXG4gICAgdGl0bGU6ICfmt7vliqDlm77niYfmoIfpopgnLFxuICAgIGRpdmlkZTogdHJ1ZVxuICB9LFxuICB7XG4gICAgaWQ6ICdhbGlnbi1sZWZ0JyxcbiAgICBuYW1lOiAnYWxpZ24nLFxuICAgIGljb246ICdiZl9pY29uIGJmX3R1cGlhbmp1enVvJyxcbiAgICB2YWx1ZTogJ2xlZnQnLFxuICAgIHRpdGxlOiAn5bGF5bemJ1xuICB9LFxuICB7XG4gICAgaWQ6ICdhbGlnbi1jZW50ZXInLFxuICAgIG5hbWU6ICdhbGlnbicsXG4gICAgaWNvbjogJ2JmX2ljb24gYmZfdHVwaWFuanV6aG9uZycsXG4gICAgdmFsdWU6ICdjZW50ZXInLFxuICAgIHRpdGxlOiAn5bGF5LitJ1xuICB9LFxuICB7XG4gICAgaWQ6ICdhbGlnbi1yaWdodCcsXG4gICAgbmFtZTogJ2FsaWduJyxcbiAgICBpY29uOiAnYmZfaWNvbiBiZl90dXBpYW5qdXlvdScsXG4gICAgdmFsdWU6ICdyaWdodCcsXG4gICAgdGl0bGU6ICflsYXlj7MnLFxuICAgIGRpdmlkZTogdHJ1ZVxuICB9LFxuICB7XG4gICAgaWQ6ICdjb3B5LWxpbmsnLFxuICAgIG5hbWU6ICdjb3B5LWxpbmsnLFxuICAgIGljb246ICdiZl9pY29uIGJmX3R1cGlhbmxpYW5qaWUnLFxuICAgIHRpdGxlOiAn5aSN5Yi25Zu+54mH6ZO+5o6lJ1xuICB9LFxuICB7XG4gICAgaWQ6ICdkb3dubG9hZCcsXG4gICAgbmFtZTogJ2Rvd25sb2FkJyxcbiAgICBpY29uOiAnYmZfaWNvbiBiZl94aWF6YWktMicsXG4gICAgdGl0bGU6ICfkuIvovb3lm77niYcnXG4gIH1cbl1cblxuQENvbXBvbmVudCh7XG4gIHNlbGVjdG9yOiAnZGl2LmltYWdlLWJsb2NrJyxcbiAgc3RhbmRhbG9uZTogdHJ1ZSxcbiAgdGVtcGxhdGU6IGBcbiAgICA8ZGl2IGNsYXNzPVwiaW1nLWJsb2NrX19jb250YWluZXJcIiBbc3R5bGUud2lkdGgucHhdPVwiX3Nob3dXaWR0aFwiXG4gICAgICAgICBbYXR0ci50YWJpbmRleF09XCIgKGNvbnRyb2xsZXIucmVhZG9ubHkkIHwgYXN5bmMpID8gbnVsbCA6IDAgXCIgKGtleWRvd24pPVwib25LZXlkb3duKCRldmVudClcIlxuICAgICAgICAgKGZvY3VzKT1cIm9uSW1nRm9jdXMoJGV2ZW50KVwiIChibHVyKT1cIm9uSW1nQmx1cigkZXZlbnQpXCI+XG5cbiAgICAgIDxkaXYgW2NsYXNzXT1cIlsnaW1nLWRlZmF1bHQtc2tlbGV0b24nLCBpbWdMb2FkU3RhdGVdXCIgKm5nSWY9XCJpbWdMb2FkU3RhdGUgIT09ICdsb2FkZWQnXCI+XG4gICAgICAgIDxzcGFuIGNsYXNzPVwiaW1nLWRlZmF1bHQtc2tlbGV0b25fX2ljb24gYmZfaWNvbiBiZl9qaWF6YWlcIiAqbmdJZj1cImltZ0xvYWRTdGF0ZSA9PT0gJ2xvYWRpbmcnXCI+PC9zcGFuPlxuICAgICAgICA8c3BhbiBjbGFzcz1cImltZy1kZWZhdWx0LXNrZWxldG9uX19lcnJvclwiICpuZ0lmPVwiaW1nTG9hZFN0YXRlID09PSAnZXJyb3InXCI+5Yqg6L295aSx6LSlITwvc3Bhbj5cbiAgICAgIDwvZGl2PlxuXG4gICAgICBAaWYgKGltZ0xvYWRTdGF0ZSA9PT0gJ2xvYWRlZCcpIHtcbiAgICAgICAgPGRpdiBjbGFzcz1cImJmLWZsb2F0LXRvb2xiYXIgaW1nLWJsb2NrX190b29sYmFyXCIgKm5nSWY9XCJpc0ZvY3VzaW5nJCB8IGFzeW5jXCJcbiAgICAgICAgICAgICBbdG9vbGJhckxpc3RdPVwiVE9PTEJBUl9MSVNUXCIgW2FjdGl2ZU1lbnVdPVwiYWN0aXZlTWVudVwiIChjbGljayk9XCIkZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XCJcbiAgICAgICAgICAgICAoaXRlbUNsaWNrKT1cIm9uVG9vbGJhckl0ZW1DbGljaygkZXZlbnQpXCI+XG4gICAgICAgIDwvZGl2PlxuICAgICAgfVxuXG4gICAgICA8aW1nIFtzcmNdPVwibW9kZWwucHJvcHMuc3JjXCIgW2NsYXNzLmZvY3VzaW5nXT1cImlzRm9jdXNpbmckIHwgYXN5bmNcIlxuICAgICAgICAgICBkcmFnZ2FibGU9XCJmYWxzZVwiIChjbGljayk9XCJvbkltZ0NsaWNrKCRldmVudClcIiAjaW1nPlxuXG4gICAgICA8bmctY29udGFpbmVyICpuZ0lmPVwiaW1nTG9hZFN0YXRlID09PSAnbG9hZGVkJ1wiPlxuICAgICAgICA8cCBjbGFzcz1cImltZy1ibG9ja19fY2FwdGlvbiBlZGl0YWJsZS1jb250YWluZXJcIiAqbmdGb3I9XCJsZXQgaXRlbSBvZiBjaGlsZHJlblwiXG4gICAgICAgICAgIFtjb250cm9sbGVyXT1cImNvbnRyb2xsZXJcIiBbbW9kZWxdPVwiaXRlbVwiIFtwbGFjZWhvbGRlcl09XCIn5re75Yqg5qCH6aKYJ1wiXG4gICAgICAgICAgIChjbGljayk9XCIkZXZlbnQuc3RvcFByb3BhZ2F0aW9uKClcIiAobW91c2Vtb3ZlKT1cIiRldmVudC5zdG9wUHJvcGFnYXRpb24oKVwiPjwvcD5cbiAgICAgIDwvbmctY29udGFpbmVyPlxuXG4gICAgICA8ZGl2IGNsYXNzPVwiaW1nLXJlc2l6ZXJcIiAqbmdJZj1cImlzRm9jdXNpbmckIHwgYXN5bmNcIiAoY2xpY2spPVwib25JbWdDbGljaygkZXZlbnQpXCIgZHJhZ2dhYmxlPVwidHJ1ZVwiXG4gICAgICAgICAgIChkcmFnc3RhcnQpPVwib25EcmFnU3RhcnQoJGV2ZW50KVwiPlxuICAgICAgICA8ZGl2IGNsYXNzPVwiaW1nLXJlc2l6ZXJfX2hhbmRsZSBpbWctcmVzaXplcl9faGFuZGxlX19saW5lIGltZy1yZXNpemVyX19oYW5kbGUtLWxlZnRcIlxuICAgICAgICAgICAgIChjbGljayk9XCIkZXZlbnQuc3RvcFByb3BhZ2F0aW9uKClcIlxuICAgICAgICAgICAgIChtb3VzZWRvd24pPVwib25SZXNpemVIYW5kbGVNb3VzZURvd24oJGV2ZW50LCAnbGVmdCcpXCI+PC9kaXY+XG4gICAgICAgIDxkaXYgY2xhc3M9XCJpbWctcmVzaXplcl9faGFuZGxlIGltZy1yZXNpemVyX19oYW5kbGVfX2xpbmUgIGltZy1yZXNpemVyX19oYW5kbGUtLXJpZ2h0XCJcbiAgICAgICAgICAgICAoY2xpY2spPVwiJGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpXCJcbiAgICAgICAgICAgICAobW91c2Vkb3duKT1cIm9uUmVzaXplSGFuZGxlTW91c2VEb3duKCRldmVudCwgJ3JpZ2h0JylcIj48L2Rpdj5cbiAgICAgICAgPGRpdiBjbGFzcz1cImltZy1yZXNpemVyX19oYW5kbGUgaW1nLXJlc2l6ZXJfX2hhbmRsZV9fcG9pbnQgaW1nLXJlc2l6ZXJfX2hhbmRsZS0tdGxcIlxuICAgICAgICAgICAgIChjbGljayk9XCIkZXZlbnQuc3RvcFByb3BhZ2F0aW9uKClcIlxuICAgICAgICAgICAgIChtb3VzZWRvd24pPVwib25SZXNpemVIYW5kbGVNb3VzZURvd24oJGV2ZW50LCAnbGVmdCcpXCI+PC9kaXY+XG4gICAgICAgIDxkaXYgY2xhc3M9XCJpbWctcmVzaXplcl9faGFuZGxlIGltZy1yZXNpemVyX19oYW5kbGVfX3BvaW50IGltZy1yZXNpemVyX19oYW5kbGUtLXRyXCJcbiAgICAgICAgICAgICAoY2xpY2spPVwiJGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpXCJcbiAgICAgICAgICAgICAobW91c2Vkb3duKT1cIm9uUmVzaXplSGFuZGxlTW91c2VEb3duKCRldmVudCwgJ3JpZ2h0JylcIj48L2Rpdj5cbiAgICAgICAgPGRpdiBjbGFzcz1cImltZy1yZXNpemVyX19oYW5kbGUgaW1nLXJlc2l6ZXJfX2hhbmRsZV9fcG9pbnQgaW1nLXJlc2l6ZXJfX2hhbmRsZS0tYmxcIlxuICAgICAgICAgICAgIChjbGljayk9XCIkZXZlbnQuc3RvcFByb3BhZ2F0aW9uKClcIlxuICAgICAgICAgICAgIChtb3VzZWRvd24pPVwib25SZXNpemVIYW5kbGVNb3VzZURvd24oJGV2ZW50LCAnbGVmdCcpXCI+PC9kaXY+XG4gICAgICAgIDxkaXYgY2xhc3M9XCJpbWctcmVzaXplcl9faGFuZGxlIGltZy1yZXNpemVyX19oYW5kbGVfX3BvaW50IGltZy1yZXNpemVyX19oYW5kbGUtLWJyXCJcbiAgICAgICAgICAgICAoY2xpY2spPVwiJGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpXCJcbiAgICAgICAgICAgICAobW91c2Vkb3duKT1cIm9uUmVzaXplSGFuZGxlTW91c2VEb3duKCRldmVudCwgJ3JpZ2h0JylcIj48L2Rpdj5cbiAgICAgIDwvZGl2PlxuXG4gICAgPC9kaXY+XG4gIGAsXG4gIHN0eWxlVXJsczogWydpbWFnZS5ibG9jay5zY3NzJ10sXG4gIGltcG9ydHM6IFtcbiAgICBOZ0lmLCBQYXJhZ3JhcGhCbG9jaywgTmdGb3JPZiwgRmxvYXRUb29sYmFyLCBPdmVybGF5TW9kdWxlLCBBc3luY1BpcGVcbiAgXSxcbiAgLy8gY2hhbmdlRGV0ZWN0aW9uOiBDaGFuZ2VEZXRlY3Rpb25TdHJhdGVneS5PblB1c2gsXG4gIGhvc3Q6IHtcbiAgICAnW2F0dHIuY29udGVudGVkaXRhYmxlXSc6ICdmYWxzZScsXG4gIH1cbn0pXG5leHBvcnQgY2xhc3MgSW1hZ2VCbG9jayBleHRlbmRzIEJhc2VCbG9jazxJSW1nQmxvY2tNb2RlbD4ge1xuICBAVmlld0NoaWxkKCdpbWcnLCB7c3RhdGljOiB0cnVlLCByZWFkOiBFbGVtZW50UmVmfSkgaW1nITogRWxlbWVudFJlZjxIVE1MSW1hZ2VFbGVtZW50PlxuXG4gIGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgX2NkcjogQ2hhbmdlRGV0ZWN0b3JSZWYpIHtcbiAgICBzdXBlcigpO1xuICB9XG5cbiAgcHJvdGVjdGVkIFRPT0xCQVJfTElTVCA9IFsuLi5JTUFHRV9CTE9DS19UT09MQkFSX0xJU1RdXG4gIHByb3RlY3RlZCBhY3RpdmVNZW51PzogU2V0PHN0cmluZz5cblxuICBwcm90ZWN0ZWQgaW1nTG9hZFN0YXRlOiAnbG9hZGluZycgfCAnbG9hZGVkJyB8ICdlcnJvcicgPSAnbG9hZGluZydcbiAgcHJvdGVjdGVkIF9zaG93V2lkdGggPSAxMDBcbiAgcHJvdGVjdGVkIF9hbGlnbiA9ICdsZWZ0J1xuXG4gIHByb3RlY3RlZCBpc0ZvY3VzaW5nJCA9IG5ldyBCZWhhdmlvclN1YmplY3QoZmFsc2UpXG5cbiAgcHJpdmF0ZSBfdmlld2VyOiBWaWV3ZXIgfCBudWxsID0gbnVsbFxuXG4gIG92ZXJyaWRlIG5nT25Jbml0KCkge1xuICAgIHN1cGVyLm5nT25Jbml0KCk7XG4gICAgdGhpcy5fc2hvd1dpZHRoID0gdGhpcy5tb2RlbC5wcm9wcy53aWR0aFxuICAgIHRoaXMubW9kZWwudXBkYXRlJC5waXBlKHRha2VVbnRpbERlc3Ryb3llZCh0aGlzLmRlc3Ryb3lSZWYpKS5zdWJzY3JpYmUoZSA9PiB7XG4gICAgICBpZiAoZS50eXBlID09PSAncHJvcHMnKSB7XG4gICAgICAgIHRoaXMuc2V0QWxpZ24oKVxuICAgICAgICB0aGlzLl9zaG93V2lkdGggIT09IHRoaXMucHJvcHMud2lkdGggJiYgKHRoaXMuX3Nob3dXaWR0aCA9IHRoaXMucHJvcHMud2lkdGgpXG4gICAgICB9XG4gICAgfSlcbiAgfVxuXG4gIG92ZXJyaWRlIG5nQWZ0ZXJWaWV3SW5pdCgpIHtcbiAgICBzdXBlci5uZ0FmdGVyVmlld0luaXQoKTtcbiAgICB0aGlzLnNldEFsaWduKClcbiAgICBjb25zdCBpbWcgPSB0aGlzLmltZy5uYXRpdmVFbGVtZW50XG4gICAgaWYgKGltZy5jb21wbGV0ZSAmJiBpbWcubmF0dXJhbEhlaWdodCAhPT0gMCkge1xuICAgICAgdGhpcy5pbWdMb2FkU3RhdGUgPSAnbG9hZGVkJ1xuICAgICAgcmV0dXJuXG4gICAgfVxuICAgIGNvbnN0IGVycm9yU3ViID0gZnJvbUV2ZW50KGltZywgJ2Vycm9yJykucGlwZSh0YWtlKDEpKS5zdWJzY3JpYmUoKCkgPT4ge1xuICAgICAgdGhpcy5pbWdMb2FkU3RhdGUgPSAnZXJyb3InXG4gICAgICB0aGlzLl9jZHIuZGV0ZWN0Q2hhbmdlcygpXG4gICAgICBsb2FkU3ViLnVuc3Vic2NyaWJlKClcbiAgICB9KVxuICAgIGNvbnN0IGxvYWRTdWIgPSBmcm9tRXZlbnQoaW1nLCAnbG9hZCcpLnBpcGUodGFrZSgxKSkuc3Vic2NyaWJlKCgpID0+IHtcbiAgICAgIHRoaXMuaW1nTG9hZFN0YXRlID0gJ2xvYWRlZCdcbiAgICAgIHRoaXMuX2Nkci5kZXRlY3RDaGFuZ2VzKClcbiAgICAgIGVycm9yU3ViLnVuc3Vic2NyaWJlKClcbiAgICB9KVxuICB9XG5cbiAgb25LZXlkb3duKGU6IEtleWJvYXJkRXZlbnQpIHtcbiAgICBpZiAoZS5pc0NvbXBvc2luZyB8fCBlLmV2ZW50UGhhc2UgIT09IDIpIHJldHVyblxuICAgIGNvbnNvbGUubG9nKGUpXG4gICAgc3dpdGNoIChlLmtleSkge1xuICAgICAgY2FzZSAnRGVsZXRlJzpcbiAgICAgIGNhc2UgJ0JhY2tzcGFjZSc6XG4gICAgICAgIGUuc3RvcFByb3BhZ2F0aW9uKClcbiAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpXG4gICAgICAgIHRoaXMuZGVzdHJveVNlbGYoKVxuICAgICAgICBicmVha1xuICAgICAgY2FzZSAnRW50ZXInOlxuICAgICAgICBlLnN0b3BQcm9wYWdhdGlvbigpXG4gICAgICAgIGUucHJldmVudERlZmF1bHQoKVxuICAgICAgICBjb25zdCB7cGFyZW50SWQsIGluZGV4fSA9IHRoaXMuZ2V0UG9zaXRpb24oKVxuICAgICAgICBpZiAocGFyZW50SWQgIT09IHRoaXMuY29udHJvbGxlci5yb290SWQpIGJyZWFrXG4gICAgICAgIGNvbnN0IG5wID0gdGhpcy5jb250cm9sbGVyLmNyZWF0ZUJsb2NrKCdwYXJhZ3JhcGgnKVxuICAgICAgICB0aGlzLmNvbnRyb2xsZXIuaW5zZXJ0QmxvY2tzKGluZGV4ICsgMSwgW25wXSwgcGFyZW50SWQpLnRoZW4oKCkgPT4ge1xuICAgICAgICAgIHRoaXMuY29udHJvbGxlci5zZWxlY3Rpb24uc2V0U2VsZWN0aW9uKG5wLmlkLCAnc3RhcnQnKVxuICAgICAgICB9KVxuICAgICAgICBicmVha1xuICAgICAgY2FzZSAnYyc6XG4gICAgICAgIGlmICghZS5jdHJsS2V5ICYmICFlLm1ldGFLZXkpIGJyZWFrXG4gICAgICAgIGUuc3RvcFByb3BhZ2F0aW9uKClcbiAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpXG4gICAgICAgIHRoaXMuY29udHJvbGxlci5jbGlwYm9hcmQud3JpdGVEYXRhKFt7dHlwZTogJ3RleHQvdXJpLWxpc3QnLCBkYXRhOiB0aGlzLnByb3BzLnNyY31dKVxuICAgICAgICBicmVha1xuICAgICAgY2FzZSAneCc6XG4gICAgICAgIGlmICh0aGlzLmNvbnRyb2xsZXIucmVhZG9ubHkkLnZhbHVlIHx8ICghZS5jdHJsS2V5ICYmICFlLm1ldGFLZXkpKSBicmVha1xuICAgICAgICBlLnN0b3BQcm9wYWdhdGlvbigpXG4gICAgICAgIGUucHJldmVudERlZmF1bHQoKVxuICAgICAgICB0aGlzLmNvbnRyb2xsZXIuY2xpcGJvYXJkLndyaXRlRGF0YShbe3R5cGU6ICd0ZXh0L3VyaS1saXN0JywgZGF0YTogdGhpcy5wcm9wcy5zcmN9XSlcbiAgICAgICAgdGhpcy5kZXN0cm95U2VsZigpXG4gICAgICAgIGJyZWFrXG4gICAgfVxuICB9XG5cbiAgc2V0QWxpZ24oKSB7XG4gICAgaWYgKHRoaXMuX2FsaWduID09PSB0aGlzLnByb3BzLmFsaWduKSByZXR1cm5cbiAgICB0aGlzLl9hbGlnbiA9IHRoaXMucHJvcHMuYWxpZ25cbiAgICB0aGlzLmhvc3RFbC5uYXRpdmVFbGVtZW50LnNldEF0dHJpYnV0ZSgnZGF0YS1hbGlnbicsIHRoaXMuX2FsaWduKVxuICB9XG5cbiAgc2V0VG9vbGJhckFjdGl2ZSgpIHtcbiAgICBjb25zdCBzZXQgPSBuZXcgU2V0PHN0cmluZz4oKVxuICAgIGlmICh0aGlzLm1vZGVsLmNoaWxkcmVuLmxlbmd0aCkgc2V0LmFkZCgnY2FwdGlvbicpXG4gICAgc2V0LmFkZCgnYWxpZ24tJyArIHRoaXMucHJvcHMuYWxpZ24pXG4gICAgdGhpcy5hY3RpdmVNZW51ID0gc2V0XG4gIH1cblxuICBvbkltZ0ZvY3VzKGV2ZW50OiBGb2N1c0V2ZW50KSB7XG4gICAgZXZlbnQuc3RvcFByb3BhZ2F0aW9uKClcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpXG4gICAgdGhpcy5zZXRUb29sYmFyQWN0aXZlKClcbiAgICB0aGlzLmlzRm9jdXNpbmckLm5leHQodHJ1ZSlcbiAgfVxuXG4gIG9uSW1nQmx1cihldmVudDogRm9jdXNFdmVudCkge1xuICAgIGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpXG4gICAgdGhpcy5pc0ZvY3VzaW5nJC5uZXh0KGZhbHNlKVxuICB9XG5cbiAgb25JbWdDbGljayhldmVudDogTW91c2VFdmVudCkge1xuICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KClcbiAgICBldmVudC5zdG9wUHJvcGFnYXRpb24oKVxuICAgIGlmICh0aGlzLmNvbnRyb2xsZXIucmVhZG9ubHkkLnZhbHVlKSB7XG4gICAgICB0aGlzLnByZXZpZXdJbWcoKVxuICAgICAgcmV0dXJuXG4gICAgfVxuICAgIGlmICghdGhpcy5pc0ZvY3VzaW5nJC52YWx1ZSkgcmV0dXJuXG4gICAgdGhpcy5wcmV2aWV3SW1nKClcbiAgfVxuXG4gIHByZXZpZXdJbWcoKSB7XG4gICAgdGhpcy5fdmlld2VyID8/PSBuZXcgVmlld2VyKHRoaXMuaW1nLm5hdGl2ZUVsZW1lbnQsIHtpbmxpbmU6IGZhbHNlLCB6SW5kZXg6IDk5OTk5OX0pXG4gICAgdGhpcy5fdmlld2VyLnNob3coKVxuICB9XG5cbiAgcHJpdmF0ZSBzdGFydFBvaW50PzogeyB4OiBudW1iZXIsIHk6IG51bWJlciwgZGlyZWN0aW9uOiAnbGVmdCcgfCAncmlnaHQnIH1cbiAgcHJpdmF0ZSBtb3VzZU1vdmUkPzogU3Vic2NyaXB0aW9uXG5cbiAgb25SZXNpemVIYW5kbGVNb3VzZURvd24oZXZlbnQ6IE1vdXNlRXZlbnQsIGRpcmVjdGlvbjogJ2xlZnQnIHwgJ3JpZ2h0Jykge1xuICAgIGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpXG4gICAgZXZlbnQucHJldmVudERlZmF1bHQoKVxuICAgIHRoaXMubW91c2VNb3ZlJD8udW5zdWJzY3JpYmUoKVxuICAgIHRoaXMuc3RhcnRQb2ludCA9IHt4OiBldmVudC5jbGllbnRYLCB5OiBldmVudC5jbGllbnRZLCBkaXJlY3Rpb259XG5cbiAgICB0aGlzLm1vdXNlTW92ZSQgPSBmcm9tRXZlbnQ8TW91c2VFdmVudD4oZG9jdW1lbnQsICdtb3VzZW1vdmUnKVxuICAgICAgLnBpcGUodGhyb3R0bGVUaW1lKDYwKSlcbiAgICAgIC5zdWJzY3JpYmUoKGUpID0+IHtcbiAgICAgICAgY29uc3QgbW92ZVB4ID0gZS5jbGllbnRYIC0gdGhpcy5zdGFydFBvaW50IS54XG4gICAgICAgIGlmICh0aGlzLnN0YXJ0UG9pbnQhLmRpcmVjdGlvbiA9PT0gJ2xlZnQnKSB0aGlzLl9zaG93V2lkdGggLT0gbW92ZVB4XG4gICAgICAgIGVsc2UgdGhpcy5fc2hvd1dpZHRoICs9IG1vdmVQeFxuICAgICAgICB0aGlzLnN0YXJ0UG9pbnQhLnggPSBlLmNsaWVudFhcbiAgICAgIH0pXG5cbiAgICBmcm9tRXZlbnQ8TW91c2VFdmVudD4oZG9jdW1lbnQsICdtb3VzZXVwJykucGlwZSh0YWtlKDEpKS5zdWJzY3JpYmUoKGUpID0+IHtcbiAgICAgIHRoaXMuc3RhcnRQb2ludCA9IHVuZGVmaW5lZFxuICAgICAgdGhpcy5tb3VzZU1vdmUkPy51bnN1YnNjcmliZSgpXG4gICAgICB0aGlzLl9zaG93V2lkdGggIT09IHRoaXMucHJvcHMud2lkdGggJiYgdGhpcy5zZXRQcm9wKCd3aWR0aCcsIHRoaXMuX3Nob3dXaWR0aClcbiAgICB9KVxuICB9XG5cbiAgb25Ub29sYmFySXRlbUNsaWNrKGU6IHsgaXRlbTogSVRvb2xiYXJJdGVtIH0pIHtcbiAgICBjb25zdCBpdGVtID0gZS5pdGVtXG4gICAgc3dpdGNoIChpdGVtLm5hbWUpIHtcbiAgICAgIGNhc2UgJ2NhcHRpb24nOlxuICAgICAgICBpZiAodGhpcy5tb2RlbC5jaGlsZHJlbi5sZW5ndGgpIHtcbiAgICAgICAgICB0aGlzLm1vZGVsLmRlbGV0ZUNoaWxkcmVuKDAsIDEpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgY29uc3QgcGFyYWdyYXBoID0gdGhpcy5jb250cm9sbGVyLmNyZWF0ZUJsb2NrKCdwYXJhZ3JhcGgnKVxuICAgICAgICAgIHRoaXMuY29udHJvbGxlci5pbnNlcnRCbG9ja3MoMCwgW3BhcmFncmFwaF0sIHRoaXMuaWQpLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgdGhpcy5jb250cm9sbGVyLnNlbGVjdGlvbi5zZXRTZWxlY3Rpb24ocGFyYWdyYXBoLmlkLCAwKVxuICAgICAgICAgIH0pXG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5zZXRUb29sYmFyQWN0aXZlKClcbiAgICAgICAgYnJlYWtcbiAgICAgIGNhc2UgJ2FsaWduJzpcbiAgICAgICAgaWYgKHRoaXMucHJvcHMuYWxpZ24gPT09IGl0ZW0udmFsdWUpIHJldHVyblxuICAgICAgICB0aGlzLnNldFByb3AoJ2FsaWduJywgaXRlbS52YWx1ZSBhcyBJSW1hZ2VCbG9ja1Byb3BzWydhbGlnbiddKVxuICAgICAgICB0aGlzLnNldFRvb2xiYXJBY3RpdmUoKVxuICAgICAgICBicmVha1xuICAgICAgY2FzZSAnY29weS1saW5rJzpcbiAgICAgICAgdGhpcy5jb250cm9sbGVyLmNsaXBib2FyZC53cml0ZVRleHQodGhpcy5wcm9wcy5zcmMpLnRoZW4oKCkgPT4ge1xuICAgICAgICAgIGNvbnN0IGlkeCA9IHRoaXMuVE9PTEJBUl9MSVNULmZpbmRJbmRleChpdGVtID0+IGl0ZW0ubmFtZSA9PT0gJ2NvcHktbGluaycpXG4gICAgICAgICAgdGhpcy5UT09MQkFSX0xJU1Quc3BsaWNlKGlkeCwgMSwgQ09QSUVEX01FTlUpXG4gICAgICAgICAgdGhpcy5hY3RpdmVNZW51Py5hZGQoQ09QSUVEX01FTlUuaWQpXG4gICAgICAgICAgdGhpcy5UT09MQkFSX0xJU1QgPSBbLi4udGhpcy5UT09MQkFSX0xJU1RdXG4gICAgICAgICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgICAgICB0aGlzLlRPT0xCQVJfTElTVC5zcGxpY2UoaWR4LCAxLCBpdGVtKVxuICAgICAgICAgICAgdGhpcy5UT09MQkFSX0xJU1QgPSBbLi4udGhpcy5UT09MQkFSX0xJU1RdXG4gICAgICAgICAgfSwgMjAwMClcbiAgICAgICAgfSlcbiAgICAgICAgYnJlYWtcbiAgICAgIGNhc2UgJ2Rvd25sb2FkJzpcbiAgICAgICAgdGhpcy5kb3dubG9hZCh0aGlzLnByb3BzLnNyYylcbiAgICAgICAgYnJlYWtcbiAgICB9XG4gIH1cblxuICBkb3dubG9hZChzcmM6IHN0cmluZywgY2FwdGlvbj86IHN0cmluZykge1xuICAgIGxldCBhOiBIVE1MQW5jaG9yRWxlbWVudCB8IG51bGwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhJylcbiAgICBhLmhyZWYgPSBzcmNcbiAgICBhLmRvd25sb2FkID0gY2FwdGlvbiB8fCBzcmNcbiAgICBhLnRhcmdldCA9ICdfYmxhbmsnXG4gICAgYS5kaXNwYXRjaEV2ZW50KG5ldyBNb3VzZUV2ZW50KCdjbGljaycpKVxuICAgIGEgPSBudWxsXG4gIH1cblxuICBvbkRyYWdTdGFydChlOiBEcmFnRXZlbnQpIHtcbiAgICBjb25zdCB0YXJnZXQgPSBlLnRhcmdldCBhcyBIVE1MRWxlbWVudFxuICAgIGUuc3RvcFByb3BhZ2F0aW9uKClcbiAgICBlLmRhdGFUcmFuc2Zlcj8uY2xlYXJEYXRhKClcbiAgICBlLmRhdGFUcmFuc2Zlcj8uc2V0RGF0YSgndGV4dC9wbGFpbicsIHRoaXMucHJvcHMuc3JjKVxuICAgIGUuZGF0YVRyYW5zZmVyPy5zZXREYXRhKCdAYmYvaW1hZ2UnLCB0aGlzLnByb3BzLnNyYylcbiAgICBlLmRhdGFUcmFuc2Zlcj8uc2V0RHJhZ0ltYWdlKHRoaXMuaW1nLm5hdGl2ZUVsZW1lbnQsIDAsIDApXG5cbiAgICBmcm9tRXZlbnQ8RHJhZ0V2ZW50Pih0aGlzLmNvbnRyb2xsZXIucm9vdEVsZW1lbnQsICdkcm9wJykucGlwZSh0YWtlVW50aWwoZnJvbUV2ZW50KHRhcmdldCwgJ2RyYWdlbmQnKSkpLnN1YnNjcmliZShlID0+IHtcbiAgICAgIGUucHJldmVudERlZmF1bHQoKVxuICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKVxuICAgICAgaWYgKCFlLmRhdGFUcmFuc2Zlcj8uZ2V0RGF0YSgnQGJmL2ltYWdlJykpIHJldHVyblxuICAgICAgY29uc3QgcmFuZ2UgPSBkb2N1bWVudC5jYXJldFJhbmdlRnJvbVBvaW50KGUuY2xpZW50WCwgZS5jbGllbnRZKSFcbiAgICAgIGlmICghcmFuZ2UpIHJldHVybjtcblxuICAgICAgY29uc3QgYmxvY2tJZCA9IChyYW5nZS5zdGFydENvbnRhaW5lciBpbnN0YW5jZW9mIEhUTUxFbGVtZW50ID8gcmFuZ2Uuc3RhcnRDb250YWluZXIgOiByYW5nZS5zdGFydENvbnRhaW5lci5wYXJlbnRFbGVtZW50KT8uY2xvc2VzdCgnW2JmLW5vZGUtdHlwZT1cImVkaXRhYmxlXCJdJyk/LmlkXG4gICAgICBpZiAoIWJsb2NrSWQgfHwgYmxvY2tJZCA9PT0gdGhpcy5pZCkgcmV0dXJuXG4gICAgICBjb25zdCBiUmVmID0gdGhpcy5jb250cm9sbGVyLmdldEJsb2NrUmVmKGJsb2NrSWQpXG4gICAgICBpZiAoIWJSZWYgfHwgIXRoaXMuY29udHJvbGxlci5pc0VkaXRhYmxlQmxvY2soYlJlZikpIHJldHVyblxuXG4gICAgICBjb25zdCBwYXJlbnRJZCA9IGJSZWYuZ2V0UGFyZW50SWQoKVxuICAgICAgLy8g5qC557qn55u05o6l56e75YqoYmxvY2tcbiAgICAgIGlmIChwYXJlbnRJZCA9PT0gdGhpcy5jb250cm9sbGVyLnJvb3RJZCkge1xuICAgICAgICAvLyDorqHnrpfmlL7nva7nmoTkvY3nva7lnKjnm67moIflhYPntKDnmoTkuIrmlrnov5jmmK/kuIvmlrlcbiAgICAgICAgY29uc3QgdGFyZ2V0ID0gZS50YXJnZXQgYXMgSFRNTEVsZW1lbnRcbiAgICAgICAgY29uc3QgcmVjdCA9IHRhcmdldC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKVxuICAgICAgICBjb25zdCB5ID0gZS5jbGllbnRZIC0gcmVjdC50b3BcbiAgICAgICAgdGhpcy5jb250cm9sbGVyLm1vdmVCbG9jayh0aGlzLmlkLCBibG9ja0lkLCB5IDwgcmVjdC5oZWlnaHQgLyAyID8gJ2JlZm9yZScgOiAnYWZ0ZXInKVxuICAgICAgICByZXR1cm5cbiAgICAgIH1cblxuICAgICAgY29uc3QgbmF0aXZlUmFuZ2UgPSB0aGlzLmNvbnRyb2xsZXIuc2VsZWN0aW9uLm5vcm1hbGl6ZVN0YXRpY1JhbmdlKGJSZWYuY29udGFpbmVyRWxlLCByYW5nZSlcbiAgICAgIGlmIChiUmVmLmNvbnRhaW5lckVsZS5jbGFzc0xpc3QuY29udGFpbnMoJ2JmLXBsYWluLXRleHQtb25seScpIHx8ICFiUmVmLmNvbnRhaW5lckVsZS5jbGFzc0xpc3QuY29udGFpbnMoJ2JmLW11bHRpLWxpbmUnKSkgcmV0dXJuO1xuICAgICAgY29uc3QgZGVsdGFzOiBEZWx0YU9wZXJhdGlvbltdID0gW11cbiAgICAgIGlmIChuYXRpdmVSYW5nZS5zdGFydCA+IDApIHtcbiAgICAgICAgZGVsdGFzLnB1c2goe3JldGFpbjogbmF0aXZlUmFuZ2Uuc3RhcnR9KVxuICAgICAgfVxuICAgICAgZGVsdGFzLnB1c2goe2luc2VydDoge2ltYWdlOiB0aGlzLnByb3BzLnNyY319KVxuICAgICAgYlJlZi5hcHBseURlbHRhKGRlbHRhcylcbiAgICAgIHRoaXMuZGVzdHJveVNlbGYoKVxuICAgIH0pXG4gIH1cblxuICBvdmVycmlkZSBuZ09uRGVzdHJveSgpIHtcbiAgICBzdXBlci5uZ09uRGVzdHJveSgpO1xuICAgIHRoaXMuX3ZpZXdlcj8uZGVzdHJveSgpXG4gIH1cbn1cbiJdfQ==