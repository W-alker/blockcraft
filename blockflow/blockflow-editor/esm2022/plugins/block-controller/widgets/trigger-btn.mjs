import { ChangeDetectionStrategy, Component, HostBinding, HostListener, Input, } from "@angular/core";
import { NgIf, NgTemplateOutlet } from "@angular/common";
import { filter, fromEvent, merge, take, takeUntil } from "rxjs";
import { ComponentPortal } from "@angular/cdk/portal";
import { EditableBlock } from "../../../core";
import * as i0 from "@angular/core";
import * as i1 from "@angular/cdk/overlay";
export class TriggerBtn {
    set contextmenu(c) {
        this.contextmenuPortal = new ComponentPortal(c);
    }
    constructor(host, cdr, overlay) {
        this.host = host;
        this.cdr = cdr;
        this.overlay = overlay;
        this.display = 'none';
        this.hasContent = false;
        this.top = 0;
        this.left = 0;
    }
    set activeBlockWrap(val) {
        if (this._activeBlockWrap === val)
            return;
        this.closeContextMenu();
        this._activeBlockWrap = val;
        this._onDestroySub?.unsubscribe();
        if (!val) {
            this.close();
            return;
        }
        this.activeBlock = this.controller.getBlockRef(val.getAttribute('data-block-id'));
        this.hasContent = this.activeBlock instanceof EditableBlock ? !!this._activeBlockWrap.textContent : true;
        this._onDestroySub = this.activeBlock.onDestroy.pipe(take(1)).subscribe(() => {
            this.close();
        });
        const { top, left } = this.calcPos();
        this.top = top;
        this.left = left;
        this.display = 'block';
        this.cdr.markForCheck();
    }
    calcPos() {
        const rootRect = this.controller.rootElement.getBoundingClientRect();
        const wrapRect = this.activeBlock.hostEl.nativeElement.getBoundingClientRect();
        const left = wrapRect.left - rootRect.left - 28;
        if (this.activeBlock instanceof EditableBlock && this.activeBlock.containerEle === this.activeBlock.hostEl.nativeElement) {
            const container = this.activeBlock.containerEle;
            const rect = container.getBoundingClientRect();
            return {
                top: rect.top - rootRect.top + this.calcLineHeight(container) / 2 - 11,
                left,
            };
        }
        return {
            top: wrapRect.top - rootRect.top,
            left
        };
    }
    calcLineHeight(ele) {
        const style = window.getComputedStyle(ele);
        const lineHeight = style.lineHeight;
        if (lineHeight === 'normal') {
            const fontSize = style.fontSize;
            return parseFloat(fontSize) * 1.2;
        }
        return parseFloat(lineHeight);
    }
    onClick(event) {
        event.stopPropagation();
    }
    onMouse(event) {
        event.stopPropagation();
        // event.preventDefault()  // If open this line, the btn can't be dragged
    }
    onMouseEnter(e) {
        e.stopPropagation();
        this.hasContent = this.activeBlock instanceof EditableBlock ? !!this._activeBlockWrap.textContent : true;
        this.display = 'block';
        this.cdr.markForCheck();
        this.showContextMenu();
    }
    showContextMenu() {
        if (this.ovr)
            return;
        const positionStrategy = this.overlay.position().flexibleConnectedTo(this.host)
            .withPositions([
            { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top' },
            { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom' },
        ])
            .withPush(true);
        this.ovr = this.overlay.create({ positionStrategy });
        const cpr = this.ovr.attach(this.contextmenuPortal);
        cpr.setInput('activeBlock', this.activeBlock);
        cpr.setInput('controller', this.controller);
        merge(fromEvent(document, 'click').pipe(take(1)), fromEvent(document, 'selectionchange').pipe(take(1)), fromEvent(cpr.location.nativeElement, 'mouseleave').pipe(filter(e => !e.relatedTarget.closest('.cdk-overlay-pane'))), fromEvent(this.host.nativeElement, 'mouseleave').pipe(filter(e => !e.relatedTarget.closest('.cdk-overlay-pane')))).pipe(takeUntil(cpr.instance.destroy)).subscribe(() => {
            this.ovr?.dispose();
            this.ovr = undefined;
        });
    }
    closeContextMenu() {
        this.ovr?.dispose();
        this.ovr = undefined;
    }
    close() {
        this.display = 'none';
        this.activeBlock = undefined;
        this._activeBlockWrap = undefined;
        this.closeContextMenu();
        this.cdr.markForCheck();
        // check after NG100
        requestAnimationFrame(() => {
        });
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: TriggerBtn, deps: [{ token: i0.ElementRef }, { token: i0.ChangeDetectorRef }, { token: i1.Overlay }], target: i0.ɵɵFactoryTarget.Component }); }
    static { this.ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "14.0.0", version: "17.3.12", type: TriggerBtn, isStandalone: true, selector: "div.trigger-btn", inputs: { contextmenu: "contextmenu", controller: "controller", activeBlockWrap: "activeBlockWrap" }, host: { listeners: { "click": "onClick($event)", "mousedown": "onMouse($event)", "mouseenter": "onMouseEnter($event)" }, properties: { "attr.contenteditable": "false", "style.display": "display", "style.top.px": "this.top", "style.left.px": "this.left" } }, ngImport: i0, template: `
    <div class="btn">
      <i [class]="['bf_icon', hasContent ? 'bf_yidong' : 'bf_tianjia-2']"></i>
    </div>
  `, isInline: true, styles: [":host{z-index:100;position:absolute;padding-right:8px}.btn{background-color:#fff;box-shadow:0 0 2px #999;border-radius:4px;overflow:hidden;cursor:pointer;text-align:center;color:#999;font-size:16px;width:22px;height:22px;line-height:22px}.btn:hover{background-color:#e6e6e6}\n"], changeDetection: i0.ChangeDetectionStrategy.OnPush }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: TriggerBtn, decorators: [{
            type: Component,
            args: [{ selector: 'div.trigger-btn', standalone: true, template: `
    <div class="btn">
      <i [class]="['bf_icon', hasContent ? 'bf_yidong' : 'bf_tianjia-2']"></i>
    </div>
  `, imports: [NgIf, NgTemplateOutlet], changeDetection: ChangeDetectionStrategy.OnPush, host: {
                        '[attr.contenteditable]': 'false',
                        '[style.display]': 'display',
                    }, styles: [":host{z-index:100;position:absolute;padding-right:8px}.btn{background-color:#fff;box-shadow:0 0 2px #999;border-radius:4px;overflow:hidden;cursor:pointer;text-align:center;color:#999;font-size:16px;width:22px;height:22px;line-height:22px}.btn:hover{background-color:#e6e6e6}\n"] }]
        }], ctorParameters: () => [{ type: i0.ElementRef }, { type: i0.ChangeDetectorRef }, { type: i1.Overlay }], propDecorators: { contextmenu: [{
                type: Input,
                args: [{ required: true }]
            }], controller: [{
                type: Input
            }], activeBlockWrap: [{
                type: Input
            }], top: [{
                type: HostBinding,
                args: ['style.top.px']
            }], left: [{
                type: HostBinding,
                args: ['style.left.px']
            }], onClick: [{
                type: HostListener,
                args: ['click', ['$event']]
            }], onMouse: [{
                type: HostListener,
                args: ['mousedown', ['$event']]
            }], onMouseEnter: [{
                type: HostListener,
                args: ['mouseenter', ['$event']]
            }] } });
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHJpZ2dlci1idG4uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi9ibG9ja2Zsb3cvc3JjL3BsdWdpbnMvYmxvY2stY29udHJvbGxlci93aWRnZXRzL3RyaWdnZXItYnRuLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLE9BQU8sRUFDTCx1QkFBdUIsRUFDdkIsU0FBUyxFQUFjLFdBQVcsRUFDbEMsWUFBWSxFQUNaLEtBQUssR0FDTixNQUFNLGVBQWUsQ0FBQztBQUN2QixPQUFPLEVBQUMsSUFBSSxFQUFFLGdCQUFnQixFQUFDLE1BQU0saUJBQWlCLENBQUM7QUFDdkQsT0FBTyxFQUFDLE1BQU0sRUFBRSxTQUFTLEVBQUUsS0FBSyxFQUFnQixJQUFJLEVBQUUsU0FBUyxFQUFDLE1BQU0sTUFBTSxDQUFDO0FBRTdFLE9BQU8sRUFBQyxlQUFlLEVBQUMsTUFBTSxxQkFBcUIsQ0FBQztBQUVwRCxPQUFPLEVBQXdCLGFBQWEsRUFBQyxNQUFNLGVBQWUsQ0FBQzs7O0FBMENuRSxNQUFNLE9BQU8sVUFBVTtJQUNyQixJQUNJLFdBQVcsQ0FBQyxDQUF3QjtRQUN0QyxJQUFJLENBQUMsaUJBQWlCLEdBQUcsSUFBSSxlQUFlLENBQUMsQ0FBQyxDQUFDLENBQUE7SUFDakQsQ0FBQztJQUlELFlBQ1UsSUFBNkIsRUFDOUIsR0FBc0IsRUFDckIsT0FBZ0I7UUFGaEIsU0FBSSxHQUFKLElBQUksQ0FBeUI7UUFDOUIsUUFBRyxHQUFILEdBQUcsQ0FBbUI7UUFDckIsWUFBTyxHQUFQLE9BQU8sQ0FBUztRQUloQixZQUFPLEdBQUcsTUFBTSxDQUFBO1FBQ2hCLGVBQVUsR0FBRyxLQUFLLENBQUE7UUFrRXBCLFFBQUcsR0FBRyxDQUFDLENBQUE7UUFHUCxTQUFJLEdBQUcsQ0FBQyxDQUFBO0lBeEVoQixDQUFDO0lBU0QsSUFDSSxlQUFlLENBQUMsR0FBZ0I7UUFDbEMsSUFBSSxJQUFJLENBQUMsZ0JBQWdCLEtBQUssR0FBRztZQUFF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bXBvcnQge1xuICBDaGFuZ2VEZXRlY3Rpb25TdHJhdGVneSwgQ2hhbmdlRGV0ZWN0b3JSZWYsXG4gIENvbXBvbmVudCwgRWxlbWVudFJlZiwgSG9zdEJpbmRpbmcsXG4gIEhvc3RMaXN0ZW5lcixcbiAgSW5wdXQsXG59IGZyb20gXCJAYW5ndWxhci9jb3JlXCI7XG5pbXBvcnQge05nSWYsIE5nVGVtcGxhdGVPdXRsZXR9IGZyb20gXCJAYW5ndWxhci9jb21tb25cIjtcbmltcG9ydCB7ZmlsdGVyLCBmcm9tRXZlbnQsIG1lcmdlLCBTdWJzY3JpcHRpb24sIHRha2UsIHRha2VVbnRpbH0gZnJvbSBcInJ4anNcIjtcbmltcG9ydCB7T3ZlcmxheSwgT3ZlcmxheVJlZn0gZnJvbSBcIkBhbmd1bGFyL2Nkay9vdmVybGF5XCI7XG5pbXBvcnQge0NvbXBvbmVudFBvcnRhbH0gZnJvbSBcIkBhbmd1bGFyL2Nkay9wb3J0YWxcIjtcbmltcG9ydCB7QmxvY2tGbG93Q29udGV4dG1lbnUsIElDb250ZXh0TWVudUNvbXBvbmVudH0gZnJvbSBcIi4uLy4uLy4uL2VkaXRvclwiO1xuaW1wb3J0IHtCYXNlQmxvY2ssIENvbnRyb2xsZXIsIEVkaXRhYmxlQmxvY2t9IGZyb20gXCIuLi8uLi8uLi9jb3JlXCI7XG5cbkBDb21wb25lbnQoe1xuICBzZWxlY3RvcjogJ2Rpdi50cmlnZ2VyLWJ0bicsXG4gIHN0YW5kYWxvbmU6IHRydWUsXG4gIHRlbXBsYXRlOiBgXG4gICAgPGRpdiBjbGFzcz1cImJ0blwiPlxuICAgICAgPGkgW2NsYXNzXT1cIlsnYmZfaWNvbicsIGhhc0NvbnRlbnQgPyAnYmZfeWlkb25nJyA6ICdiZl90aWFuamlhLTInXVwiPjwvaT5cbiAgICA8L2Rpdj5cbiAgYCxcbiAgc3R5bGVzOiBbYFxuICAgIDpob3N0IHtcbiAgICAgIHotaW5kZXg6IDEwMDtcbiAgICAgIHBvc2l0aW9uOiBhYnNvbHV0ZTtcbiAgICAgIHBhZGRpbmctcmlnaHQ6IDhweDtcbiAgICB9XG5cbiAgICAuYnRuIHtcbiAgICAgIGJhY2tncm91bmQtY29sb3I6ICNmZmY7XG4gICAgICBib3gtc2hhZG93OiAwIDAgMnB4IDAgIzk5OTtcbiAgICAgIGJvcmRlci1yYWRpdXM6IDRweDtcbiAgICAgIG92ZXJmbG93OiBoaWRkZW47XG4gICAgICBjdXJzb3I6IHBvaW50ZXI7XG4gICAgICB0ZXh0LWFsaWduOiBjZW50ZXI7XG4gICAgICBjb2xvcjogIzk5OTtcbiAgICAgIGZvbnQtc2l6ZTogMTZweDtcbiAgICAgIHdpZHRoOiAyMnB4O1xuICAgICAgaGVpZ2h0OiAyMnB4O1xuICAgICAgbGluZS1oZWlnaHQ6IDIycHg7XG4gICAgfVxuXG4gICAgLmJ0bjpob3ZlciB7XG4gICAgICBiYWNrZ3JvdW5kLWNvbG9yOiAjRTZFNkU2O1xuICAgIH1cbiAgYF0sXG4gIGltcG9ydHM6IFtOZ0lmLCBOZ1RlbXBsYXRlT3V0bGV0XSxcbiAgY2hhbmdlRGV0ZWN0aW9uOiBDaGFuZ2VEZXRlY3Rpb25TdHJhdGVneS5PblB1c2gsXG4gIGhvc3Q6IHtcbiAgICAnW2F0dHIuY29udGVudGVkaXRhYmxlXSc6ICdmYWxzZScsXG4gICAgJ1tzdHlsZS5kaXNwbGF5XSc6ICdkaXNwbGF5JyxcbiAgfVxufSlcbmV4cG9ydCBjbGFzcyBUcmlnZ2VyQnRuIHtcbiAgQElucHV0KHtyZXF1aXJlZDogdHJ1ZX0pXG4gIHNldCBjb250ZXh0bWVudShjOiBJQ29udGV4dE1lbnVDb21wb25lbnQpIHtcbiAgICB0aGlzLmNvbnRleHRtZW51UG9ydGFsID0gbmV3IENvbXBvbmVudFBvcnRhbChjKVxuICB9XG5cbiAgQElucHV0KCkgY29udHJvbGxlciE6IENvbnRyb2xsZXJcblxuICBjb25zdHJ1Y3RvcihcbiAgICBwcml2YXRlIGhvc3Q6IEVsZW1lbnRSZWY8SFRNTEVsZW1lbnQ+LFxuICAgIHB1YmxpYyBjZHI6IENoYW5nZURldGVjdG9yUmVmLFxuICAgIHByaXZhdGUgb3ZlcmxheTogT3ZlcmxheSxcbiAgKSB7XG4gIH1cblxuICBwcm90ZWN0ZWQgZGlzcGxheSA9ICdub25lJ1xuICBwcm90ZWN0ZWQgaGFzQ29udGVudCA9IGZhbHNlXG4gIHByb3RlY3RlZCBhY3RpdmVCbG9jaz86IEJhc2VCbG9jazxhbnk+XG5cbiAgcHJpdmF0ZSBfb25EZXN0cm95U3ViPzogU3Vic2NyaXB0aW9uXG5cbiAgcHJvdGVjdGVkIF9hY3RpdmVCbG9ja1dyYXA/OiBIVE1MRWxlbWVudFxuICBASW5wdXQoKVxuICBzZXQgYWN0aXZlQmxvY2tXcmFwKHZhbDogSFRNTEVsZW1lbnQpIHtcbiAgICBpZiAodGhpcy5fYWN0aXZlQmxvY2tXcmFwID09PSB2YWwpIHJldHVyblxuICAgIHRoaXMuY2xvc2VDb250ZXh0TWVudSgpXG4gICAgdGhpcy5fYWN0aXZlQmxvY2tXcmFwID0gdmFsXG4gICAgdGhpcy5fb25EZXN0cm95U3ViPy51bnN1YnNjcmliZSgpXG4gICAgaWYgKCF2YWwpIHtcbiAgICAgIHRoaXMuY2xvc2UoKVxuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgdGhpcy5hY3RpdmVCbG9jayA9IHRoaXMuY29udHJvbGxlci5nZXRCbG9ja1JlZih2YWwuZ2V0QXR0cmlidXRlKCdkYXRhLWJsb2NrLWlkJykhKSFcbiAgICB0aGlzLmhhc0NvbnRlbnQgPSB0aGlzLmFjdGl2ZUJsb2NrIGluc3RhbmNlb2YgRWRpdGFibGVCbG9jayA/ICEhdGhpcy5fYWN0aXZlQmxvY2tXcmFwLnRleHRDb250ZW50IDogdHJ1ZVxuXG4gICAgdGhpcy5fb25EZXN0cm95U3ViID0gdGhpcy5hY3RpdmVCbG9jay5vbkRlc3Ryb3kucGlwZSh0YWtlKDEpKS5zdWJzY3JpYmUoKCkgPT4ge1xuICAgICAgdGhpcy5jbG9zZSgpXG4gICAgfSlcblxuICAgIGNvbnN0IHt0b3AsIGxlZnR9ID0gdGhpcy5jYWxjUG9zKClcbiAgICB0aGlzLnRvcCA9IHRvcFxuICAgIHRoaXMubGVmdCA9IGxlZnRcbiAgICB0aGlzLmRpc3BsYXkgPSAnYmxvY2snXG4gICAgdGhpcy5jZHIubWFya0ZvckNoZWNrKClcbiAgfVxuXG4gIHByaXZhdGUgY29udGV4dG1lbnVQb3J0YWwhOiBDb21wb25lbnRQb3J0YWw8QmxvY2tGbG93Q29udGV4dG1lbnU+XG4gIHByaXZhdGUgb3ZyOiBPdmVybGF5UmVmIHwgdW5kZWZpbmVkXG5cbiAgcHJpdmF0ZSBjYWxjUG9zKCkge1xuICAgIGNvbnN0IHJvb3RSZWN0ID0gdGhpcy5jb250cm9sbGVyLnJvb3RFbGVtZW50LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpXG4gICAgY29uc3Qgd3JhcFJlY3QgPSB0aGlzLmFjdGl2ZUJsb2NrIS5ob3N0RWwubmF0aXZlRWxlbWVudC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKVxuXG4gICAgY29uc3QgbGVmdCA9IHdyYXBSZWN0LmxlZnQgLSByb290UmVjdC5sZWZ0IC0gMjhcblxuICAgIGlmICh0aGlzLmFjdGl2ZUJsb2NrIGluc3RhbmNlb2YgRWRpdGFibGVCbG9jayAmJiB0aGlzLmFjdGl2ZUJsb2NrLmNvbnRhaW5lckVsZSA9PT0gdGhpcy5hY3RpdmVCbG9jay5ob3N0RWwubmF0aXZlRWxlbWVudCkge1xuICAgICAgY29uc3QgY29udGFpbmVyID0gdGhpcy5hY3RpdmVCbG9jay5jb250YWluZXJFbGVcbiAgICAgIGNvbnN0IHJlY3QgPSBjb250YWluZXIuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KClcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHRvcDogcmVjdC50b3AgLSByb290UmVjdC50b3AgKyB0aGlzLmNhbGNMaW5lSGVpZ2h0KGNvbnRhaW5lcikgLyAyIC0gMTEsXG4gICAgICAgIGxlZnQsXG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIHRvcDogd3JhcFJlY3QudG9wIC0gcm9vdFJlY3QudG9wLFxuICAgICAgbGVmdFxuICAgIH1cbiAgfVxuXG4gIGNhbGNMaW5lSGVpZ2h0KGVsZTogSFRNTEVsZW1lbnQpIHtcbiAgICBjb25zdCBzdHlsZSA9IHdpbmRvdy5nZXRDb21wdXRlZFN0eWxlKGVsZSlcbiAgICBjb25zdCBsaW5lSGVpZ2h0ID0gc3R5bGUubGluZUhlaWdodFxuICAgIGlmIChsaW5lSGVpZ2h0ID09PSAnbm9ybWFsJykge1xuICAgICAgY29uc3QgZm9udFNpemUgPSBzdHlsZS5mb250U2l6ZVxuICAgICAgcmV0dXJuIHBhcnNlRmxvYXQoZm9udFNpemUpICogMS4yXG4gICAgfVxuICAgIHJldHVybiBwYXJzZUZsb2F0KGxpbmVIZWlnaHQpXG4gIH1cblxuICBASG9zdEJpbmRpbmcoJ3N0eWxlLnRvcC5weCcpXG4gIHByaXZhdGUgdG9wID0gMFxuXG4gIEBIb3N0QmluZGluZygnc3R5bGUubGVmdC5weCcpXG4gIHByaXZhdGUgbGVmdCA9IDBcblxuICBASG9zdExpc3RlbmVyKCdjbGljaycsIFsnJGV2ZW50J10pXG4gIG9uQ2xpY2soZXZlbnQ6IE1vdXNlRXZlbnQpIHtcbiAgICBldmVudC5zdG9wUHJvcGFnYXRpb24oKVxuICB9XG5cbiAgQEhvc3RMaXN0ZW5lcignbW91c2Vkb3duJywgWyckZXZlbnQnXSlcbiAgb25Nb3VzZShldmVudDogTW91c2VFdmVudCkge1xuICAgIGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpXG4gICAgLy8gZXZlbnQucHJldmVudERlZmF1bHQoKSAgLy8gSWYgb3BlbiB0aGlzIGxpbmUsIHRoZSBidG4gY2FuJ3QgYmUgZHJhZ2dlZFxuICB9XG5cbiAgQEhvc3RMaXN0ZW5lcignbW91c2VlbnRlcicsIFsnJGV2ZW50J10pXG4gIG9uTW91c2VFbnRlcihlOiBFdmVudCkge1xuICAgIGUuc3RvcFByb3BhZ2F0aW9uKClcbiAgICB0aGlzLmhhc0NvbnRlbnQgPSB0aGlzLmFjdGl2ZUJsb2NrIGluc3RhbmNlb2YgRWRpdGFibGVCbG9jayA/ICEhdGhpcy5fYWN0aXZlQmxvY2tXcmFwIS50ZXh0Q29udGVudCA6IHRydWVcbiAgICB0aGlzLmRpc3BsYXkgPSAnYmxvY2snXG4gICAgdGhpcy5jZHIubWFya0ZvckNoZWNrKClcbiAgICB0aGlzLnNob3dDb250ZXh0TWVudSgpXG4gIH1cblxuICBzaG93Q29udGV4dE1lbnUoKSB7XG4gICAgaWYgKHRoaXMub3ZyKSByZXR1cm5cbiAgICBjb25zdCBwb3NpdGlvblN0cmF0ZWd5ID0gdGhpcy5vdmVybGF5LnBvc2l0aW9uKCkuZmxleGlibGVDb25uZWN0ZWRUbyh0aGlzLmhvc3QpXG4gICAgICAud2l0aFBvc2l0aW9ucyhbXG4gICAgICAgIHtvcmlnaW5YOiAnc3RhcnQnLCBvcmlnaW5ZOiAnYm90dG9tJywgb3ZlcmxheVg6ICdzdGFydCcsIG92ZXJsYXlZOiAndG9wJ30sXG4gICAgICAgIHtvcmlnaW5YOiAnc3RhcnQnLCBvcmlnaW5ZOiAndG9wJywgb3ZlcmxheVg6ICdzdGFydCcsIG92ZXJsYXlZOiAnYm90dG9tJ30sXG4gICAgICBdKVxuICAgICAgLndpdGhQdXNoKHRydWUpXG4gICAgdGhpcy5vdnIgPSB0aGlzLm92ZXJsYXkuY3JlYXRlKHtwb3NpdGlvblN0cmF0ZWd5fSlcbiAgICBjb25zdCBjcHIgPSB0aGlzLm92ci5hdHRhY2godGhpcy5jb250ZXh0bWVudVBvcnRhbClcbiAgICBjcHIuc2V0SW5wdXQoJ2FjdGl2ZUJsb2NrJywgdGhpcy5hY3RpdmVCbG9jaylcbiAgICBjcHIuc2V0SW5wdXQoJ2NvbnRyb2xsZXInLCB0aGlzLmNvbnRyb2xsZXIpXG5cbiAgICBtZXJnZShcbiAgICAgIGZyb21FdmVudChkb2N1bWVudCwgJ2NsaWNrJykucGlwZSh0YWtlKDEpKSxcbiAgICAgIGZyb21FdmVudChkb2N1bWVudCwgJ3NlbGVjdGlvbmNoYW5nZScpLnBpcGUodGFrZSgxKSksXG4gICAgICBmcm9tRXZlbnQ8TW91c2VFdmVudD4oY3ByLmxvY2F0aW9uLm5hdGl2ZUVsZW1lbnQsICdtb3VzZWxlYXZlJykucGlwZShmaWx0ZXIoZSA9PiAhKGUucmVsYXRlZFRhcmdldCBhcyBIVE1MRWxlbWVudCkuY2xvc2VzdCgnLmNkay1vdmVybGF5LXBhbmUnKSkpLFxuICAgICAgZnJvbUV2ZW50PE1vdXNlRXZlbnQ+KHRoaXMuaG9zdC5uYXRpdmVFbGVtZW50LCAnbW91c2VsZWF2ZScpLnBpcGUoZmlsdGVyKGUgPT4gIShlLnJlbGF0ZWRUYXJnZXQgYXMgSFRNTEVsZW1lbnQpLmNsb3Nlc3QoJy5jZGstb3ZlcmxheS1wYW5lJykpKVxuICAgICkucGlwZSh0YWtlVW50aWwoY3ByLmluc3RhbmNlLmRlc3Ryb3kpKS5zdWJzY3JpYmUoKCkgPT4ge1xuICAgICAgdGhpcy5vdnI/LmRpc3Bvc2UoKVxuICAgICAgdGhpcy5vdnIgPSB1bmRlZmluZWRcbiAgICB9KVxuICB9XG5cbiAgY2xvc2VDb250ZXh0TWVudSgpIHtcbiAgICB0aGlzLm92cj8uZGlzcG9zZSgpXG4gICAgdGhpcy5vdnIgPSB1bmRlZmluZWRcbiAgfVxuXG4gIGNsb3NlKCkge1xuICAgIHRoaXMuZGlzcGxheSA9ICdub25lJ1xuICAgIHRoaXMuYWN0aXZlQmxvY2sgPSB1bmRlZmluZWRcbiAgICB0aGlzLl9hY3RpdmVCbG9ja1dyYXAgPSB1bmRlZmluZWRcbiAgICB0aGlzLmNsb3NlQ29udGV4dE1lbnUoKVxuICAgIHRoaXMuY2RyLm1hcmtGb3JDaGVjaygpXG4gICAgLy8gY2hlY2sgYWZ0ZXIgTkcxMDBcbiAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUoKCkgPT4ge1xuICAgIH0pXG4gIH1cblxufVxuIl19