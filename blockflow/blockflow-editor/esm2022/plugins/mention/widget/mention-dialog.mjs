import { ChangeDetectionStrategy, Component, EventEmitter, HostBinding, HostListener, Input, Output } from "@angular/core";
import { NgForOf, NgIf, NgTemplateOutlet } from "@angular/common";
import { NzEmptyModule } from "ng-zorro-antd/empty";
import { NzTabsModule } from "ng-zorro-antd/tabs";
import { NzButtonComponent } from "ng-zorro-antd/button";
import * as i0 from "@angular/core";
import * as i1 from "ng-zorro-antd/empty";
const MENTION_TABS = [
    {
        label: '人员',
        type: 'user'
    },
    {
        label: '文档',
        type: 'doc'
    }
];
export class MentionDialog {
    mousedown(event) {
        event.stopPropagation();
        event.preventDefault();
    }
    constructor(elementRef, cdr) {
        this.elementRef = elementRef;
        this.cdr = cdr;
        this.top = 0;
        this.left = 0;
        this.list = [];
        this.tabChange = new EventEmitter();
        this.itemSelect = new EventEmitter();
        this.close = new EventEmitter();
        this.MENTION_TABS = MENTION_TABS;
        this.activeTabIndex = 0;
        this.selectIndex = 0;
    }
    moveSelect(direction) {
        if (direction === 'up') {
            this.selectIndex = Math.max(0, this.selectIndex - 1);
        }
        else {
            this.selectIndex = Math.min(this.list.length - 1, this.selectIndex + 1);
        }
        this.elementRef.nativeElement.querySelector('.mention-dialog__content__item.active')?.scrollIntoView({ block: 'center' });
        this.cdr.detectChanges();
    }
    ngOnInit() {
        this.onTabChange(0);
    }
    ngAfterViewInit() {
        // 确保元素在视口内
        const rect = this.elementRef.nativeElement.getBoundingClientRect();
        const { innerHeight, innerWidth } = window;
        if (rect.bottom > innerHeight) {
            this.top = innerHeight - rect.height - 10;
        }
        if (rect.right > innerWidth) {
            this.left = innerWidth - rect.width - 10;
        }
    }
    onItemClick(e, item) {
        e.preventDefault();
        e.stopPropagation();
        this.itemSelect.emit(item);
    }
    onSure() {
        if (!this.list.length)
            return;
        this.itemSelect.emit(this.list[this.selectIndex]);
    }
    onTabChange(index) {
        this.activeTabIndex = index;
        this.selectIndex = 0;
        this.tabChange.emit(MENTION_TABS[index].type);
    }
    ngOnDestroy() {
        this.close.emit(true);
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: MentionDialog, deps: [{ token: i0.ElementRef }, { token: i0.ChangeDetectorRef }], target: i0.ɵɵFactoryTarget.Component }); }
    static { this.ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "14.0.0", version: "17.3.12", type: MentionDialog, isStandalone: true, selector: "mention-dialog", inputs: { top: "top", left: "left", template: "template", list: "list" }, outputs: { tabChange: "tabChange", itemSelect: "itemSelect", close: "close" }, host: { listeners: { "mousedown": "mousedown($event)" }, properties: { "style.top.px": "this.top", "style.left.px": "this.left" } }, ngImport: i0, template: "<div class=\"mention-dialog__header\">\n  <ul class=\"tab-btn-list\">\n    <li class=\"tab-btn-list__item\" [class.active]=\"activeTabIndex === idx\"\n        *ngFor=\"let item of MENTION_TABS; index as idx\" (mousedown)=\"onTabChange(idx)\">\n      <span>{{ item.label }}</span>\n    </li>\n  </ul>\n</div>\n<div class=\"mention-dialog__content\">\n  <ng-container *ngIf=\"!list.length\">\n    <nz-empty nzNotFoundImage=\"simple\"></nz-empty>\n  </ng-container>\n\n  <ng-container *ngFor=\"let item of list; index as idx\">\n    <div class=\"mention-dialog__content__item\"\n         [class.active]=\"idx === selectIndex\" (mousedown)=\"onItemClick($event, item)\">\n      <ng-container *ngTemplateOutlet=\"template || simpleTpl; context: { $implicit: item, item, type: activeTabIndex === 0  ? 'user' : 'doc'}\"></ng-container>\n    </div>\n  </ng-container>\n</div>\n<div class=\"mention-dialog__footer\">\n  <div class=\"mention-dialog__footer__button\" (click)=\"onSure()\">\u786E\u5B9A</div>\n</div>\n\n<ng-template #simpleTpl let-item let-type='type'>\n  {{ item.name + type }}\n</ng-template>\n\n\n<!--<div class=\"mention-dialog__content\">-->\n<!--  <ng-container *ngFor=\"let item of list; index as idx\">-->\n<!--    <div class=\"mention-dialog__content__item\"-->\n<!--         [class.active]=\"idx === selectIndex\" (mouseenter)=\"selectIndex = idx\"-->\n<!--         (mousedown)=\"onItemClick($event, item)\">-->\n<!--      <ng-container *ngTemplateOutlet=\"template || simpleTpl; context: { $implicit: item}\"></ng-container>-->\n\n<!--      <ng-template #simpleTpl let-item>-->\n<!--        {{ item.name }}-->\n<!--      </ng-template>-->\n<!--    </div>-->\n<!--  </ng-container>-->\n\n<!--  <ng-container *ngIf=\"!list.length\">-->\n<!--    <nz-empty nzNotFoundImage=\"simple\"></nz-empty>-->\n<!--  </ng-container>-->\n<!--</div>-->\n\n", styles: [":host{display:block;width:400px;border-radius:4px;border:1px solid #E6E6E6;background:#fff;box-shadow:0 0 20px #0000001a;max-height:50vh;overflow-y:auto}:host .mention-dialog__header{border-bottom:1px solid #E6E6E6}:host .mention-dialog__header .tab-btn-list{display:flex;padding:0 8px;font-size:14px;color:#999;list-style:none;margin:0}:host .mention-dialog__header .tab-btn-list__item{padding:0 12px;cursor:pointer;margin:0}:host .mention-dialog__header .tab-btn-list__item>span{display:inline-block;height:40px;line-height:40px}:host .mention-dialog__header .tab-btn-list__item:hover{color:#4857e2}:host .mention-dialog__header .tab-btn-list__item.active{font-weight:700;color:#4857e2}:host .mention-dialog__header .tab-btn-list__item.active>span{position:relative}:host .mention-dialog__header .tab-btn-list__item.active>span:before{position:absolute;content:\"\";width:100%;height:3px;background:#4857e2;bottom:-2px;left:0;border-radius:10px}:host .mention-dialog__content{padding:8px;max-height:360px;overflow-y:auto}:host .mention-dialog__content__item{width:100%;cursor:pointer}:host .mention-dialog__content__item.active,:host .mention-dialog__content__item:hover{background:#f9f9f9}:host .mention-dialog__footer{margin-top:16px;padding:0 16px;border-top:1px solid #E6E6E6}:host .mention-dialog__footer__button{padding:8px 16px;cursor:pointer;font-size:14px;color:#4857e2;text-align:center}:host .mention-dialog__footer__button:hover{background:#f9f9f9}\n"], dependencies: [{ kind: "directive", type: NgForOf, selector: "[ngFor][ngForOf]", inputs: ["ngForOf", "ngForTrackBy", "ngForTemplate"] }, { kind: "directive", type: NgIf, selector: "[ngIf]", inputs: ["ngIf", "ngIfThen", "ngIfElse"] }, { kind: "directive", type: NgTemplateOutlet, selector: "[ngTemplateOutlet]", inputs: ["ngTemplateOutletContext", "ngTemplateOutlet", "ngTemplateOutletInjector"] }, { kind: "ngmodule", type: NzEmptyModule }, { kind: "component", type: i1.NzEmptyComponent, selector: "nz-empty", inputs: ["nzNotFoundImage", "nzNotFoundContent", "nzNotFoundFooter"], exportAs: ["nzEmpty"] }, { kind: "ngmodule", type: NzTabsModule }], changeDetection: i0.ChangeDetectionStrategy.OnPush }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: MentionDialog, decorators: [{
            type: Component,
            args: [{ selector: 'mention-dialog', standalone: true, imports: [
                        NgForOf,
                        NgIf,
                        NgTemplateOutlet,
                        NzEmptyModule,
                        NzTabsModule,
                        NzButtonComponent
                    ], changeDetection: ChangeDetectionStrategy.OnPush, template: "<div class=\"mention-dialog__header\">\n  <ul class=\"tab-btn-list\">\n    <li class=\"tab-btn-list__item\" [class.active]=\"activeTabIndex === idx\"\n        *ngFor=\"let item of MENTION_TABS; index as idx\" (mousedown)=\"onTabChange(idx)\">\n      <span>{{ item.label }}</span>\n    </li>\n  </ul>\n</div>\n<div class=\"mention-dialog__content\">\n  <ng-container *ngIf=\"!list.length\">\n    <nz-empty nzNotFoundImage=\"simple\"></nz-empty>\n  </ng-container>\n\n  <ng-container *ngFor=\"let item of list; index as idx\">\n    <div class=\"mention-dialog__content__item\"\n         [class.active]=\"idx === selectIndex\" (mousedown)=\"onItemClick($event, item)\">\n      <ng-container *ngTemplateOutlet=\"template || simpleTpl; context: { $implicit: item, item, type: activeTabIndex === 0  ? 'user' : 'doc'}\"></ng-container>\n    </div>\n  </ng-container>\n</div>\n<div class=\"mention-dialog__footer\">\n  <div class=\"mention-dialog__footer__button\" (click)=\"onSure()\">\u786E\u5B9A</div>\n</div>\n\n<ng-template #simpleTpl let-item let-type='type'>\n  {{ item.name + type }}\n</ng-template>\n\n\n<!--<div class=\"mention-dialog__content\">-->\n<!--  <ng-container *ngFor=\"let item of list; index as idx\">-->\n<!--    <div class=\"mention-dialog__content__item\"-->\n<!--         [class.active]=\"idx === selectIndex\" (mouseenter)=\"selectIndex = idx\"-->\n<!--         (mousedown)=\"onItemClick($event, item)\">-->\n<!--      <ng-container *ngTemplateOutlet=\"template || simpleTpl; context: { $implicit: item}\"></ng-container>-->\n\n<!--      <ng-template #simpleTpl let-item>-->\n<!--        {{ item.name }}-->\n<!--      </ng-template>-->\n<!--    </div>-->\n<!--  </ng-container>-->\n\n<!--  <ng-container *ngIf=\"!list.length\">-->\n<!--    <nz-empty nzNotFoundImage=\"simple\"></nz-empty>-->\n<!--  </ng-container>-->\n<!--</div>-->\n\n", styles: [":host{display:block;width:400px;border-radius:4px;border:1px solid #E6E6E6;background:#fff;box-shadow:0 0 20px #0000001a;max-height:50vh;overflow-y:auto}:host .mention-dialog__header{border-bottom:1px solid #E6E6E6}:host .mention-dialog__header .tab-btn-list{display:flex;padding:0 8px;font-size:14px;color:#999;list-style:none;margin:0}:host .mention-dialog__header .tab-btn-list__item{padding:0 12px;cursor:pointer;margin:0}:host .mention-dialog__header .tab-btn-list__item>span{display:inline-block;height:40px;line-height:40px}:host .mention-dialog__header .tab-btn-list__item:hover{color:#4857e2}:host .mention-dialog__header .tab-btn-list__item.active{font-weight:700;color:#4857e2}:host .mention-dialog__header .tab-btn-list__item.active>span{position:relative}:host .mention-dialog__header .tab-btn-list__item.active>span:before{position:absolute;content:\"\";width:100%;height:3px;background:#4857e2;bottom:-2px;left:0;border-radius:10px}:host .mention-dialog__content{padding:8px;max-height:360px;overflow-y:auto}:host .mention-dialog__content__item{width:100%;cursor:pointer}:host .mention-dialog__content__item.active,:host .mention-dialog__content__item:hover{background:#f9f9f9}:host .mention-dialog__footer{margin-top:16px;padding:0 16px;border-top:1px solid #E6E6E6}:host .mention-dialog__footer__button{padding:8px 16px;cursor:pointer;font-size:14px;color:#4857e2;text-align:center}:host .mention-dialog__footer__button:hover{background:#f9f9f9}\n"] }]
        }], ctorParameters: () => [{ type: i0.ElementRef }, { type: i0.ChangeDetectorRef }], propDecorators: { top: [{
                type: HostBinding,
                args: ['style.top.px']
            }, {
                type: Input
            }], left: [{
                type: HostBinding,
                args: ['style.left.px']
            }, {
                type: Input
            }], template: [{
                type: Input
            }], list: [{
                type: Input
            }], tabChange: [{
                type: Output
            }], itemSelect: [{
                type: Output
            }], close: [{
                type: Output
            }], mousedown: [{
                type: HostListener,
                args: ['mousedown', ['$event']]
            }] } });
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWVudGlvbi1kaWFsb2cuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi9ibG9ja2Zsb3cvc3JjL3BsdWdpbnMvbWVudGlvbi93aWRnZXQvbWVudGlvbi1kaWFsb2cudHMiLCIuLi8uLi8uLi8uLi8uLi8uLi9ibG9ja2Zsb3cvc3JjL3BsdWdpbnMvbWVudGlvbi93aWRnZXQvbWVudGlvbi1kaWFsb2cuaHRtbCJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxPQUFPLEVBQ0wsdUJBQXVCLEVBQ3ZCLFNBQVMsRUFFVCxZQUFZLEVBQ1osV0FBVyxFQUNYLFlBQVksRUFDWixLQUFLLEVBQ0wsTUFBTSxFQUNQLE1BQU0sZUFBZSxDQUFDO0FBQ3ZCLE9BQU8sRUFBQyxPQUFPLEVBQUUsSUFBSSxFQUFFLGdCQUFnQixFQUFDLE1BQU0saUJBQWlCLENBQUM7QUFFaEUsT0FBTyxFQUFDLGFBQWEsRUFBQyxNQUFNLHFCQUFxQixDQUFDO0FBQ2xELE9BQU8sRUFBQyxZQUFZLEVBQUMsTUFBTSxvQkFBb0IsQ0FBQztBQUNoRCxPQUFPLEVBQUMsaUJBQWlCLEVBQUMsTUFBTSxzQkFBc0IsQ0FBQzs7O0FBRXZELE1BQU0sWUFBWSxHQUdaO0lBQ0o7UUFDRSxLQUFLLEVBQUUsSUFBSTtRQUNYLElBQUksRUFBRSxNQUFNO0tBQ2I7SUFDRDtRQUNFLEtBQUssRUFBRSxJQUFJO1FBQ1gsSUFBSSxFQUFFLEtBQUs7S0FDWjtDQUNGLENBQUE7QUFnQkQsTUFBTSxPQUFPLGFBQWE7SUF1QnhCLFNBQVMsQ0FBQyxLQUFpQjtRQUN6QixLQUFLLENBQUMsZUFBZSxFQUFFLENBQUE7UUFDdkIsS0FBSyxDQUFDLGNBQWMsRUFBRSxDQUFBO0lBQ3hCLENBQUM7SUFFRCxZQUNVLFVBQW1DLEVBQzNCLEdBQXNCO1FBRDlCLGVBQVUsR0FBVixVQUFVLENBQXlCO1FBQzNCLFFBQUcsR0FBSCxHQUFHLENBQW1CO1FBMUJ4QyxRQUFHLEdBQUcsQ0FBQyxDQUFB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LG1KQUNoQixhQUFhLG1NQUNiLFlBQVk7OzRGQUtILGFBQWE7a0JBZnpCLFNBQVM7K0JBQ0UsZ0JBQWdCLGNBR2QsSUFBSSxXQUNQO3dCQUNQLE9BQU87d0JBQ1AsSUFBSTt3QkFDSixnQkFBZ0I7d0JBQ2hCLGFBQWE7d0JBQ2IsWUFBWTt3QkFDWixpQkFBaUI7cUJBQ2xCLG1CQUNnQix1QkFBdUIsQ0FBQyxNQUFNOytHQU0vQyxHQUFHO3NCQUZGLFdBQVc7dUJBQUMsY0FBYzs7c0JBQzFCLEtBQUs7Z0JBS04sSUFBSTtzQkFGSCxXQUFXO3VCQUFDLGVBQWU7O3NCQUMzQixLQUFLO2dCQUlOLFFBQVE7c0JBRFAsS0FBSztnQkFJTixJQUFJO3NCQURILEtBQUs7Z0JBR0ksU0FBUztzQkFBbEIsTUFBTTtnQkFDRyxVQUFVO3NCQUFuQixNQUFNO2dCQUNHLEtBQUs7c0JBQWQsTUFBTTtnQkFLUCxTQUFTO3NCQURSLFlBQVk7dUJBQUMsV0FBVyxFQUFFLENBQUMsUUFBUSxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHtcbiAgQ2hhbmdlRGV0ZWN0aW9uU3RyYXRlZ3ksIENoYW5nZURldGVjdG9yUmVmLFxuICBDb21wb25lbnQsXG4gIEVsZW1lbnRSZWYsXG4gIEV2ZW50RW1pdHRlcixcbiAgSG9zdEJpbmRpbmcsXG4gIEhvc3RMaXN0ZW5lcixcbiAgSW5wdXQsXG4gIE91dHB1dCwgVGVtcGxhdGVSZWZcbn0gZnJvbSBcIkBhbmd1bGFyL2NvcmVcIjtcbmltcG9ydCB7TmdGb3JPZiwgTmdJZiwgTmdUZW1wbGF0ZU91dGxldH0gZnJvbSBcIkBhbmd1bGFyL2NvbW1vblwiO1xuaW1wb3J0IHtJTWVudGlvbkRhdGEsIE1lbnRpb25UeXBlfSBmcm9tIFwiLi4vaW5kZXhcIjtcbmltcG9ydCB7TnpFbXB0eU1vZHVsZX0gZnJvbSBcIm5nLXpvcnJvLWFudGQvZW1wdHlcIjtcbmltcG9ydCB7TnpUYWJzTW9kdWxlfSBmcm9tIFwibmctem9ycm8tYW50ZC90YWJzXCI7XG5pbXBvcnQge056QnV0dG9uQ29tcG9uZW50fSBmcm9tIFwibmctem9ycm8tYW50ZC9idXR0b25cIjtcblxuY29uc3QgTUVOVElPTl9UQUJTOiB7XG4gIGxhYmVsOiBzdHJpbmcsXG4gIHR5cGU6IE1lbnRpb25UeXBlXG59W10gPSBbXG4gIHtcbiAgICBsYWJlbDogJ+S6uuWRmCcsXG4gICAgdHlwZTogJ3VzZXInXG4gIH0sXG4gIHtcbiAgICBsYWJlbDogJ+aWh+ahoycsXG4gICAgdHlwZTogJ2RvYydcbiAgfVxuXVxuQENvbXBvbmVudCh7XG4gIHNlbGVjdG9yOiAnbWVudGlvbi1kaWFsb2cnLFxuICB0ZW1wbGF0ZVVybDogJy4vbWVudGlvbi1kaWFsb2cuaHRtbCcsXG4gIHN0eWxlVXJsczogWycuL21lbnRpb24tZGlhbG9nLnNjc3MnXSxcbiAgc3RhbmRhbG9uZTogdHJ1ZSxcbiAgaW1wb3J0czogW1xuICAgIE5nRm9yT2YsXG4gICAgTmdJZixcbiAgICBOZ1RlbXBsYXRlT3V0bGV0LFxuICAgIE56RW1wdHlNb2R1bGUsXG4gICAgTnpUYWJzTW9kdWxlLFxuICAgIE56QnV0dG9uQ29tcG9uZW50XG4gIF0sXG4gIGNoYW5nZURldGVjdGlvbjogQ2hhbmdlRGV0ZWN0aW9uU3RyYXRlZ3kuT25QdXNoXG59KVxuZXhwb3J0IGNsYXNzIE1lbnRpb25EaWFsb2cge1xuXG4gIEBIb3N0QmluZGluZygnc3R5bGUudG9wLnB4JylcbiAgQElucHV0KClcbiAgdG9wID0gMFxuXG4gIEBIb3N0QmluZGluZygnc3R5bGUubGVmdC5weCcpXG4gIEBJbnB1dCgpXG4gIGxlZnQgPSAwXG5cbiAgQElucHV0KClcbiAgdGVtcGxhdGU/OiBUZW1wbGF0ZVJlZjx7aXRlbTogSU1lbnRpb25EYXRhLCB0eXBlOiBNZW50aW9uVHlwZX0+XG5cbiAgQElucHV0KClcbiAgbGlzdDogSU1lbnRpb25EYXRhW10gPSBbXVxuXG4gIEBPdXRwdXQoKSB0YWJDaGFuZ2UgPSBuZXcgRXZlbnRFbWl0dGVyPE1lbnRpb25UeXBlPigpXG4gIEBPdXRwdXQoKSBpdGVtU2VsZWN0ID0gbmV3IEV2ZW50RW1pdHRlcjxJTWVudGlvbkRhdGE+KClcbiAgQE91dHB1dCgpIGNsb3NlID0gbmV3IEV2ZW50RW1pdHRlcjxib29sZWFuPigpXG5cbiAgcHJvdGVjdGVkIHJlYWRvbmx5IE1FTlRJT05fVEFCUyA9IE1FTlRJT05fVEFCU1xuXG4gIEBIb3N0TGlzdGVuZXIoJ21vdXNlZG93bicsIFsnJGV2ZW50J10pXG4gIG1vdXNlZG93bihldmVudDogTW91c2VFdmVudCkge1xuICAgIGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpXG4gICAgZXZlbnQucHJldmVudERlZmF1bHQoKVxuICB9XG5cbiAgY29uc3RydWN0b3IoXG4gICAgcHJpdmF0ZSBlbGVtZW50UmVmOiBFbGVtZW50UmVmPEhUTUxFbGVtZW50PixcbiAgICBwdWJsaWMgcmVhZG9ubHkgY2RyOiBDaGFuZ2VEZXRlY3RvclJlZlxuICApIHtcbiAgfVxuXG4gIGFjdGl2ZVRhYkluZGV4ID0gMFxuICBwcm90ZWN0ZWQgc2VsZWN0SW5kZXggPSAwXG5cbiAgbW92ZVNlbGVjdChkaXJlY3Rpb246ICd1cCcgfCAnZG93bicpIHtcbiAgICBpZiAoZGlyZWN0aW9uID09PSAndXAnKSB7XG4gICAgICB0aGlzLnNlbGVjdEluZGV4ID0gTWF0aC5tYXgoMCwgdGhpcy5zZWxlY3RJbmRleCAtIDEpXG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuc2VsZWN0SW5kZXggPSBNYXRoLm1pbih0aGlzLmxpc3QubGVuZ3RoIC0gMSwgdGhpcy5zZWxlY3RJbmRleCArIDEpXG4gICAgfVxuICAgIHRoaXMuZWxlbWVudFJlZi5uYXRpdmVFbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJy5tZW50aW9uLWRpYWxvZ19fY29udGVudF9faXRlbS5hY3RpdmUnKT8uc2Nyb2xsSW50b1ZpZXcoe2Jsb2NrOiAnY2VudGVyJ30pXG4gICAgdGhpcy5jZHIuZGV0ZWN0Q2hhbmdlcygpXG4gIH1cblxuICBuZ09uSW5pdCgpIHtcbiAgICB0aGlzLm9uVGFiQ2hhbmdlKDApXG4gIH1cblxuICBuZ0FmdGVyVmlld0luaXQoKSB7XG4gICAgLy8g56Gu5L+d5YWD57Sg5Zyo6KeG5Y+j5YaFXG4gICAgY29uc3QgcmVjdCA9IHRoaXMuZWxlbWVudFJlZi5uYXRpdmVFbGVtZW50LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpXG4gICAgY29uc3Qge2lubmVySGVpZ2h0LCBpbm5lcldpZHRofSA9IHdpbmRvd1xuICAgIGlmIChyZWN0LmJvdHRvbSA+IGlubmVySGVpZ2h0KSB7XG4gICAgICB0aGlzLnRvcCA9IGlubmVySGVpZ2h0IC0gcmVjdC5oZWlnaHQgLSAxMFxuICAgIH1cbiAgICBpZiAocmVjdC5yaWdodCA+IGlubmVyV2lkdGgpIHtcbiAgICAgIHRoaXMubGVmdCA9IGlubmVyV2lkdGggLSByZWN0LndpZHRoIC0gMTBcbiAgICB9XG4gIH1cblxuICBvbkl0ZW1DbGljayhlOiBFdmVudCwgaXRlbTogSU1lbnRpb25EYXRhKSB7XG4gICAgZS5wcmV2ZW50RGVmYXVsdCgpXG4gICAgZS5zdG9wUHJvcGFnYXRpb24oKVxuICAgIHRoaXMuaXRlbVNlbGVjdC5lbWl0KGl0ZW0pXG4gIH1cblxuICBvblN1cmUoKSB7XG4gICAgaWYoIXRoaXMubGlzdC5sZW5ndGgpIHJldHVyblxuICAgIHRoaXMuaXRlbVNlbGVjdC5lbWl0KHRoaXMubGlzdFt0aGlzLnNlbGVjdEluZGV4XSlcbiAgfVxuXG4gIG9uVGFiQ2hhbmdlKGluZGV4OiBudW1iZXIpIHtcbiAgICB0aGlzLmFjdGl2ZVRhYkluZGV4ID0gaW5kZXhcbiAgICB0aGlzLnNlbGVjdEluZGV4ID0gMFxuICAgIHRoaXMudGFiQ2hhbmdlLmVtaXQoTUVOVElPTl9UQUJTW2luZGV4XS50eXBlKVxuICB9XG5cbiAgbmdPbkRlc3Ryb3koKSB7XG4gICAgdGhpcy5jbG9zZS5lbWl0KHRydWUpXG4gIH1cblxufVxuIiwiPGRpdiBjbGFzcz1cIm1lbnRpb24tZGlhbG9nX19oZWFkZXJcIj5cbiAgPHVsIGNsYXNzPVwidGFiLWJ0bi1saXN0XCI+XG4gICAgPGxpIGNsYXNzPVwidGFiLWJ0bi1saXN0X19pdGVtXCIgW2NsYXNzLmFjdGl2ZV09XCJhY3RpdmVUYWJJbmRleCA9PT0gaWR4XCJcbiAgICAgICAgKm5nRm9yPVwibGV0IGl0ZW0gb2YgTUVOVElPTl9UQUJTOyBpbmRleCBhcyBpZHhcIiAobW91c2Vkb3duKT1cIm9uVGFiQ2hhbmdlKGlkeClcIj5cbiAgICAgIDxzcGFuPnt7IGl0ZW0ubGFiZWwgfX08L3NwYW4+XG4gICAgPC9saT5cbiAgPC91bD5cbjwvZGl2PlxuPGRpdiBjbGFzcz1cIm1lbnRpb24tZGlhbG9nX19jb250ZW50XCI+XG4gIDxuZy1jb250YWluZXIgKm5nSWY9XCIhbGlzdC5sZW5ndGhcIj5cbiAgICA8bnotZW1wdHkgbnpOb3RGb3VuZEltYWdlPVwic2ltcGxlXCI+PC9uei1lbXB0eT5cbiAgPC9uZy1jb250YWluZXI+XG5cbiAgPG5nLWNvbnRhaW5lciAqbmdGb3I9XCJsZXQgaXRlbSBvZiBsaXN0OyBpbmRleCBhcyBpZHhcIj5cbiAgICA8ZGl2IGNsYXNzPVwibWVudGlvbi1kaWFsb2dfX2NvbnRlbnRfX2l0ZW1cIlxuICAgICAgICAgW2NsYXNzLmFjdGl2ZV09XCJpZHggPT09IHNlbGVjdEluZGV4XCIgKG1vdXNlZG93bik9XCJvbkl0ZW1DbGljaygkZXZlbnQsIGl0ZW0pXCI+XG4gICAgICA8bmctY29udGFpbmVyICpuZ1RlbXBsYXRlT3V0bGV0PVwidGVtcGxhdGUgfHwgc2ltcGxlVHBsOyBjb250ZXh0OiB7ICRpbXBsaWNpdDogaXRlbSwgaXRlbSwgdHlwZTogYWN0aXZlVGFiSW5kZXggPT09IDAgID8gJ3VzZXInIDogJ2RvYyd9XCI+PC9uZy1jb250YWluZXI+XG4gICAgPC9kaXY+XG4gIDwvbmctY29udGFpbmVyPlxuPC9kaXY+XG48ZGl2IGNsYXNzPVwibWVudGlvbi1kaWFsb2dfX2Zvb3RlclwiPlxuICA8ZGl2IGNsYXNzPVwibWVudGlvbi1kaWFsb2dfX2Zvb3Rlcl9fYnV0dG9uXCIgKGNsaWNrKT1cIm9uU3VyZSgpXCI+56Gu5a6aPC9kaXY+XG48L2Rpdj5cblxuPG5nLXRlbXBsYXRlICNzaW1wbGVUcGwgbGV0LWl0ZW0gbGV0LXR5cGU9J3R5cGUnPlxuICB7eyBpdGVtLm5hbWUgKyB0eXBlIH19XG48L25nLXRlbXBsYXRlPlxuXG5cbjwhLS08ZGl2IGNsYXNzPVwibWVudGlvbi1kaWFsb2dfX2NvbnRlbnRcIj4tLT5cbjwhLS0gIDxuZy1jb250YWluZXIgKm5nRm9yPVwibGV0IGl0ZW0gb2YgbGlzdDsgaW5kZXggYXMgaWR4XCI+LS0+XG48IS0tICAgIDxkaXYgY2xhc3M9XCJtZW50aW9uLWRpYWxvZ19fY29udGVudF9faXRlbVwiLS0+XG48IS0tICAgICAgICAgW2NsYXNzLmFjdGl2ZV09XCJpZHggPT09IHNlbGVjdEluZGV4XCIgKG1vdXNlZW50ZXIpPVwic2VsZWN0SW5kZXggPSBpZHhcIi0tPlxuPCEtLSAgICAgICAgIChtb3VzZWRvd24pPVwib25JdGVtQ2xpY2soJGV2ZW50LCBpdGVtKVwiPi0tPlxuPCEtLSAgICAgIDxuZy1jb250YWluZXIgKm5nVGVtcGxhdGVPdXRsZXQ9XCJ0ZW1wbGF0ZSB8fCBzaW1wbGVUcGw7IGNvbnRleHQ6IHsgJGltcGxpY2l0OiBpdGVtfVwiPjwvbmctY29udGFpbmVyPi0tPlxuXG48IS0tICAgICAgPG5nLXRlbXBsYXRlICNzaW1wbGVUcGwgbGV0LWl0ZW0+LS0+XG48IS0tICAgICAgICB7eyBpdGVtLm5hbWUgfX0tLT5cbjwhLS0gICAgICA8L25nLXRlbXBsYXRlPi0tPlxuPCEtLSAgICA8L2Rpdj4tLT5cbjwhLS0gIDwvbmctY29udGFpbmVyPi0tPlxuXG48IS0tICA8bmctY29udGFpbmVyICpuZ0lmPVwiIWxpc3QubGVuZ3RoXCI+LS0+XG48IS0tICAgIDxuei1lbXB0eSBuek5vdEZvdW5kSW1hZ2U9XCJzaW1wbGVcIj48L256LWVtcHR5Pi0tPlxuPCEtLSAgPC9uZy1jb250YWluZXI+LS0+XG48IS0tPC9kaXY+LS0+XG5cbiJdfQ==