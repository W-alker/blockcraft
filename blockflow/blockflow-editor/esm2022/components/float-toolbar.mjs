import { ChangeDetectionStrategy, Component, EventEmitter, HostListener, Input, Output } from "@angular/core";
import { NgForOf, NgIf } from "@angular/common";
import * as i0 from "@angular/core";
export class FloatToolbar {
    constructor(destroyRef, cdr) {
        this.destroyRef = destroyRef;
        this.cdr = cdr;
        this.toolbarList = [];
        this.itemClick = new EventEmitter;
    }
    addActive(id) {
        this.activeMenu ??= new Set();
        this.activeMenu?.add(id);
        this.cdr.markForCheck();
    }
    removeActive(id) {
        this.cdr.markForCheck();
        this.activeMenu?.delete(id);
    }
    clearActive() {
        this.cdr.markForCheck();
        this.activeMenu?.clear();
    }
    clearActiveByName(name) {
        this.toolbarList.forEach(item => {
            if (item.name === name && this.activeMenu?.has(item.id)) {
                this.activeMenu?.delete(item.id);
            }
        });
        this.cdr.markForCheck();
    }
    replaceActiveGroupByName(name, id) {
        this.activeMenu ??= new Set();
        this.clearActiveByName(name);
        id && this.addActive(id);
    }
    onMouseEvent(event) {
        event.stopPropagation();
        event.preventDefault();
    }
    onItemClick(event, item) {
        event.stopPropagation();
        this.itemClick.emit({ item, event });
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: FloatToolbar, deps: [{ token: i0.DestroyRef }, { token: i0.ChangeDetectorRef }], target: i0.ɵɵFactoryTarget.Component }); }
    static { this.ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "17.0.0", version: "17.3.12", type: FloatToolbar, isStandalone: true, selector: "div.bf-float-toolbar", inputs: { activeMenu: "activeMenu", toolbarList: "toolbarList" }, outputs: { itemClick: "itemClick" }, host: { listeners: { "mousedown": "onMouseEvent($event)" } }, ngImport: i0, template: `
    @for(item of toolbarList; track item.id) {
        <div class="bf-float-toolbar__item" [title]="item.title" (click)="onItemClick($event, item)"
             [class.active]="activeMenu?.has(item.id)" [class.divide]="item.divide">
          <i [class]="item.icon"></i><span *ngIf="item.text">{{ item.text }}</span>
        </div>
    }
  `, isInline: true, styles: [":host{display:flex;height:32px;padding:0 8px;align-items:center;gap:8px;background:#fff;border-radius:4px;box-shadow:0 0 20px #0000001a}.bf-float-toolbar__item{display:flex;gap:4px;align-items:center;justify-content:center;padding:0 4px;height:24px;cursor:pointer;border-radius:4px;font-size:16px;color:#333;white-space:nowrap}.bf-float-toolbar__item.divide{margin-right:8px;position:relative}.bf-float-toolbar__item.divide:after{position:absolute;content:\"\";height:32px;width:1px;background:#e6e6e6;right:-8px;top:-4px}.bf-float-toolbar__item.active{background:#5f6fff14;color:#4857e2}.bf-float-toolbar__item:hover{background:#d7d7d799}.bf-float-toolbar__item>span{font-size:14px}.bf-float-toolbar__item>i{font-size:inherit;color:inherit}\n"], dependencies: [{ kind: "directive", type: NgIf, selector: "[ngIf]", inputs: ["ngIf", "ngIfThen", "ngIfElse"] }], changeDetection: i0.ChangeDetectionStrategy.OnPush }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: FloatToolbar, decorators: [{
            type: Component,
            args: [{ selector: 'div.bf-float-toolbar', template: `
    @for(item of toolbarList; track item.id) {
        <div class="bf-float-toolbar__item" [title]="item.title" (click)="onItemClick($event, item)"
             [class.active]="activeMenu?.has(item.id)" [class.divide]="item.divide">
          <i [class]="item.icon"></i><span *ngIf="item.text">{{ item.text }}</span>
        </div>
    }
  `, standalone: true, imports: [
                        NgForOf,
                        NgIf
                    ], changeDetection: ChangeDetectionStrategy.OnPush, styles: [":host{display:flex;height:32px;padding:0 8px;align-items:center;gap:8px;background:#fff;border-radius:4px;box-shadow:0 0 20px #0000001a}.bf-float-toolbar__item{display:flex;gap:4px;align-items:center;justify-content:center;padding:0 4px;height:24px;cursor:pointer;border-radius:4px;font-size:16px;color:#333;white-space:nowrap}.bf-float-toolbar__item.divide{margin-right:8px;position:relative}.bf-float-toolbar__item.divide:after{position:absolute;content:\"\";height:32px;width:1px;background:#e6e6e6;right:-8px;top:-4px}.bf-float-toolbar__item.active{background:#5f6fff14;color:#4857e2}.bf-float-toolbar__item:hover{background:#d7d7d799}.bf-float-toolbar__item>span{font-size:14px}.bf-float-toolbar__item>i{font-size:inherit;color:inherit}\n"] }]
        }], ctorParameters: () => [{ type: i0.DestroyRef }, { type: i0.ChangeDetectorRef }], propDecorators: { activeMenu: [{
                type: Input
            }], toolbarList: [{
                type: Input,
                args: [{ required: true }]
            }], itemClick: [{
                type: Output
            }], onMouseEvent: [{
                type: HostListener,
                args: ['mousedown', ['$event']]
            }] } });
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZmxvYXQtdG9vbGJhci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL2Jsb2NrZmxvdy9zcmMvY29tcG9uZW50cy9mbG9hdC10b29sYmFyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLE9BQU8sRUFDTCx1QkFBdUIsRUFFdkIsU0FBUyxFQUVULFlBQVksRUFDWixZQUFZLEVBQ1osS0FBSyxFQUNMLE1BQU0sRUFDUCxNQUFNLGVBQWUsQ0FBQztBQUN2QixPQUFPLEVBQUMsT0FBTyxFQUFFLElBQUksRUFBQyxNQUFNLGlCQUFpQixDQUFDOztBQXdGOUMsTUFBTSxPQUFPLFlBQVk7SUFLdkIsWUFDa0IsVUFBc0IsRUFDdEIsR0FBc0I7UUFEdEIsZUFBVSxHQUFWLFVBQVUsQ0FBWTtRQUN0QixRQUFHLEdBQUgsR0FBRyxDQUFtQjtRQUxmLGdCQUFXLEdBQW1CLEVBQUUsQ0FBQTtRQUMvQyxjQUFTLEdBQUcsSUFBSSxZQUF1RCxDQUFBO0lBTWpGLENBQUM7SUFFRCxTQUFTLENBQUMsRUFBVTtRQUNsQixJQUFJLENBQUMsVUFBVSxLQUFLLElBQUksR0FBRyxFQUFFLENBQUE7UUFDN0IsSUFBSSxDQUFDLFVBQVUsRUFBRSxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUE7UUFDeEIsSUFBSSxDQUFDLEdBQUcsQ0FBQyxZQUFZLEVBQUUsQ0FBQTtJQUN6QixDQUFDO0lBRUQsWUFBWSxDQUFDLEVBQVU7UUFDckIsSUFBSSxDQUFDLEdBQUcsQ0FBQyxZQUFZLEVBQUUsQ0FBQTtRQUN2QixJQUFJLENBQUMsVUFBVSxFQUFFLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQTtJQUM3QixDQUFDO0lBRUQsV0FBVztRQUNULElBQUksQ0FBQyxHQUFHLENBQUMsWUFBWSxFQUFFLENBQUE7UUFDdkIsSUFBSSxDQUFDLFVBQVUsRUFBRSxLQUFLLEVBQUUsQ0FBQTtJQUMxQixDQUFDO0lBRUQsaUJBQWlCLENBQUMsSUFBWTtRQUM1QixJQUFJLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsRUFBRTtZQUM5QixJQUFJLElBQUksQ0FBQyxJQUFJLEtBQUssSUFBSSxJQUFJLElBQUksQ0FBQyxVQUFVLEVBQUUsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDO2dCQUN4RCxJQUFJLENBQUMsVUFBVSxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUE7WUFDbEMsQ0FBQztRQUNILENBQUMsQ0FBQyxDQUFBO1FBQ0YsSUFBSSxDQUFDLEdBQUcsQ0FBQyxZQUFZLEVBQUUsQ0FBQTtJQUN6QixDQUFDO0lBRUQsd0JBQXdCLENBQUMsSUFBWSxFQUFFLEVBQVc7UUFDaEQsSUFBSSxDQUFDLFVBQVUsS0FBSyxJQUFJLEdBQUcsRUFBRSxDQUFBO1FBQzdCLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsQ0FBQTtRQUM1QixFQUFFLElBQUksSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUMsQ0FBQTtJQUMxQixDQUFDO0lBR0QsWUFBWSxDQUFDLEtBQWlCO1FBQzVCLEtBQUssQ0FBQyxlQUFlLEVBQUUsQ0FBQTtRQUN2QixLQUFLLENBQUMsY0FBYyxFQUFFLENBQUE7SUFDeEIsQ0FBQztJQUVELFdBQVcsQ0FBQyxLQUFpQixFQUFFLElBQWtCO1FBQy9DLEtBQUssQ0FBQyxlQUFlLEVBQUUsQ0FBQTtRQUN2QixJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxFQUFDLElBQUksRUFBRSxLQUFLLEVBQUMsQ0FBQyxDQUFBO0lBQ3BDLENBQUM7K0dBbkRVLFlBQVk7bUdBQVosWUFBWSxxUEExRWI7Ozs7Ozs7R0FPVCxpekJBK0RDLElBQUk7OzRGQUlLLFlBQVk7a0JBNUV4QixTQUFTOytCQUNFLHNCQUFzQixZQUN0Qjs7Ozs7OztHQU9ULGNBNERXLElBQUksV0FDUDt3QkFDUCxPQUFPO3dCQUNQLElBQUk7cUJBQ0wsbUJBQ2dCLHVCQUF1QixDQUFDLE1BQU07K0dBR3RDLFVBQVU7c0JBQWxCLEtBQUs7Z0JBQ21CLFdBQVc7c0JBQW5DLEtBQUs7dUJBQUMsRUFBQyxRQUFRLEVBQUUsSUFBSSxFQUFDO2dCQUNiLFNBQVM7c0JBQWxCLE1BQU07Z0JBd0NQLFlBQVk7c0JBRFgsWUFBWTt1QkFBQyxXQUFXLEVBQUUsQ0FBQyxRQUFRLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQge1xuICBDaGFuZ2VEZXRlY3Rpb25TdHJhdGVneSxcbiAgQ2hhbmdlRGV0ZWN0b3JSZWYsXG4gIENvbXBvbmVudCxcbiAgRGVzdHJveVJlZixcbiAgRXZlbnRFbWl0dGVyLFxuICBIb3N0TGlzdGVuZXIsXG4gIElucHV0LFxuICBPdXRwdXRcbn0gZnJvbSBcIkBhbmd1bGFyL2NvcmVcIjtcbmltcG9ydCB7TmdGb3JPZiwgTmdJZn0gZnJvbSBcIkBhbmd1bGFyL2NvbW1vblwiO1xuXG5leHBvcnQgaW50ZXJmYWNlIElUb29sYmFySXRlbSB7XG4gIGlkOiBzdHJpbmdcbiAgbmFtZTogc3RyaW5nXG4gIGljb24/OiBzdHJpbmdcbiAgdmFsdWU/OiBzdHJpbmdcbiAgdGl0bGU/OiBzdHJpbmdcbiAgdGV4dD86IHN0cmluZ1xuICBkaXZpZGU/OiBib29sZWFuXG59XG5cbkBDb21wb25lbnQoe1xuICBzZWxlY3RvcjogJ2Rpdi5iZi1mbG9hdC10b29sYmFyJyxcbiAgdGVtcGxhdGU6IGBcbiAgICBAZm9yKGl0ZW0gb2YgdG9vbGJhckxpc3Q7IHRyYWNrIGl0ZW0uaWQpIHtcbiAgICAgICAgPGRpdiBjbGFzcz1cImJmLWZsb2F0LXRvb2xiYXJfX2l0ZW1cIiBbdGl0bGVdPVwiaXRlbS50aXRsZVwiIChjbGljayk9XCJvbkl0ZW1DbGljaygkZXZlbnQsIGl0ZW0pXCJcbiAgICAgICAgICAgICBbY2xhc3MuYWN0aXZlXT1cImFjdGl2ZU1lbnU/LmhhcyhpdGVtLmlkKVwiIFtjbGFzcy5kaXZpZGVdPVwiaXRlbS5kaXZpZGVcIj5cbiAgICAgICAgICA8aSBbY2xhc3NdPVwiaXRlbS5pY29uXCI+PC9pPjxzcGFuICpuZ0lmPVwiaXRlbS50ZXh0XCI+e3sgaXRlbS50ZXh0IH19PC9zcGFuPlxuICAgICAgICA8L2Rpdj5cbiAgICB9XG4gIGAsXG4gIHN0eWxlczogW2BcbiAgICA6aG9zdCB7XG4gICAgICBkaXNwbGF5OiBmbGV4O1xuICAgICAgaGVpZ2h0OiAzMnB4O1xuICAgICAgcGFkZGluZzogMCA4cHg7XG4gICAgICBhbGlnbi1pdGVtczogY2VudGVyO1xuICAgICAgZ2FwOiA4cHg7XG4gICAgICBiYWNrZ3JvdW5kOiAjZmZmO1xuICAgICAgYm9yZGVyLXJhZGl1czogNHB4O1xuICAgICAgYm94LXNoYWRvdzogMCAwIDIwcHggcmdiYSgwLCAwLCAwLCAwLjEwKTtcbiAgICB9XG5cbiAgICAuYmYtZmxvYXQtdG9vbGJhcl9faXRlbSB7XG4gICAgICBkaXNwbGF5OiBmbGV4O1xuICAgICAgZ2FwOiA0cHg7XG4gICAgICBhbGlnbi1pdGVtczogY2VudGVyO1xuICAgICAganVzdGlmeS1jb250ZW50OiBjZW50ZXI7XG4gICAgICBwYWRkaW5nOiAwIDRweDtcbiAgICAgIGhlaWdodDogMjRweDtcbiAgICAgIGN1cnNvcjogcG9pbnRlcjtcbiAgICAgIGJvcmRlci1yYWRpdXM6IDRweDtcbiAgICAgIGZvbnQtc2l6ZTogMTZweDtcbiAgICAgIGNvbG9yOiAjMzMzO1xuICAgICAgd2hpdGUtc3BhY2U6IG5vd3JhcDtcblxuICAgICAgJi5kaXZpZGUge1xuICAgICAgICBtYXJnaW4tcmlnaHQ6IDhweDtcbiAgICAgICAgcG9zaXRpb246IHJlbGF0aXZlO1xuXG4gICAgICAgICY6OmFmdGVyIHtcbiAgICAgICAgICBwb3NpdGlvbjogYWJzb2x1dGU7XG4gICAgICAgICAgY29udGVudDogJyc7XG4gICAgICAgICAgaGVpZ2h0OiAzMnB4O1xuICAgICAgICAgIHdpZHRoOiAxcHg7XG4gICAgICAgICAgYmFja2dyb3VuZDogI2U2ZTZlNjtcbiAgICAgICAgICByaWdodDogLThweDtcbiAgICAgICAgICB0b3A6IC00cHg7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgJi5hY3RpdmUge1xuICAgICAgICBiYWNrZ3JvdW5kOiByZ2JhKDk1LCAxMTEsIDI1NSwgMC4wOCk7XG4gICAgICAgIGNvbG9yOiAjNDg1N0UyO1xuICAgICAgfVxuXG4gICAgICAmOmhvdmVyIHtcbiAgICAgICAgYmFja2dyb3VuZDogcmdiYSgyMTUsIDIxNSwgMjE1LCAwLjYpO1xuICAgICAgfVxuICAgIH1cblxuICAgIC5iZi1mbG9hdC10b29sYmFyX19pdGVtID4gc3BhbiB7XG4gICAgICBmb250LXNpemU6IDE0cHg7XG4gICAgfVxuXG4gICAgLmJmLWZsb2F0LXRvb2xiYXJfX2l0ZW0gPiBpIHtcbiAgICAgIGZvbnQtc2l6ZTogaW5oZXJpdDtcbiAgICAgIGNvbG9yOiBpbmhlcml0O1xuICAgIH1cbiAgYF0sXG4gIHN0YW5kYWxvbmU6IHRydWUsXG4gIGltcG9ydHM6IFtcbiAgICBOZ0Zvck9mLFxuICAgIE5nSWZcbiAgXSxcbiAgY2hhbmdlRGV0ZWN0aW9uOiBDaGFuZ2VEZXRlY3Rpb25TdHJhdGVneS5PblB1c2hcbn0pXG5leHBvcnQgY2xhc3MgRmxvYXRUb29sYmFyIHtcbiAgQElucHV0KCkgYWN0aXZlTWVudT86IFNldDxzdHJpbmc+XG4gIEBJbnB1dCh7cmVxdWlyZWQ6IHRydWV9KSB0b29sYmFyTGlzdDogSVRvb2xiYXJJdGVtW10gPSBbXVxuICBAT3V0cHV0KCkgaXRlbUNsaWNrID0gbmV3IEV2ZW50RW1pdHRlcjx7IGl0ZW06IElUb29sYmFySXRlbSwgZXZlbnQ6IE1vdXNlRXZlbnQgfT5cblxuICBjb25zdHJ1Y3RvcihcbiAgICBwdWJsaWMgcmVhZG9ubHkgZGVzdHJveVJlZjogRGVzdHJveVJlZixcbiAgICBwdWJsaWMgcmVhZG9ubHkgY2RyOiBDaGFuZ2VEZXRlY3RvclJlZlxuICApIHtcbiAgfVxuXG4gIGFkZEFjdGl2ZShpZDogc3RyaW5nKSB7XG4gICAgdGhpcy5hY3RpdmVNZW51ID8/PSBuZXcgU2V0KClcbiAgICB0aGlzLmFjdGl2ZU1lbnU/LmFkZChpZClcbiAgICB0aGlzLmNkci5tYXJrRm9yQ2hlY2soKVxuICB9XG5cbiAgcmVtb3ZlQWN0aXZlKGlkOiBzdHJpbmcpIHtcbiAgICB0aGlzLmNkci5tYXJrRm9yQ2hlY2soKVxuICAgIHRoaXMuYWN0aXZlTWVudT8uZGVsZXRlKGlkKVxuICB9XG5cbiAgY2xlYXJBY3RpdmUoKSB7XG4gICAgdGhpcy5jZHIubWFya0ZvckNoZWNrKClcbiAgICB0aGlzLmFjdGl2ZU1lbnU/LmNsZWFyKClcbiAgfVxuXG4gIGNsZWFyQWN0aXZlQnlOYW1lKG5hbWU6IHN0cmluZykge1xuICAgIHRoaXMudG9vbGJhckxpc3QuZm9yRWFjaChpdGVtID0+IHtcbiAgICAgIGlmIChpdGVtLm5hbWUgPT09IG5hbWUgJiYgdGhpcy5hY3RpdmVNZW51Py5oYXMoaXRlbS5pZCkpIHtcbiAgICAgICAgdGhpcy5hY3RpdmVNZW51Py5kZWxldGUoaXRlbS5pZClcbiAgICAgIH1cbiAgICB9KVxuICAgIHRoaXMuY2RyLm1hcmtGb3JDaGVjaygpXG4gIH1cblxuICByZXBsYWNlQWN0aXZlR3JvdXBCeU5hbWUobmFtZTogc3RyaW5nLCBpZD86IHN0cmluZykge1xuICAgIHRoaXMuYWN0aXZlTWVudSA/Pz0gbmV3IFNldCgpXG4gICAgdGhpcy5jbGVhckFjdGl2ZUJ5TmFtZShuYW1lKVxuICAgIGlkICYmIHRoaXMuYWRkQWN0aXZlKGlkKVxuICB9XG5cbiAgQEhvc3RMaXN0ZW5lcignbW91c2Vkb3duJywgWyckZXZlbnQnXSlcbiAgb25Nb3VzZUV2ZW50KGV2ZW50OiBNb3VzZUV2ZW50KSB7XG4gICAgZXZlbnQuc3RvcFByb3BhZ2F0aW9uKClcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpXG4gIH1cblxuICBvbkl0ZW1DbGljayhldmVudDogTW91c2VFdmVudCwgaXRlbTogSVRvb2xiYXJJdGVtKSB7XG4gICAgZXZlbnQuc3RvcFByb3BhZ2F0aW9uKClcbiAgICB0aGlzLml0ZW1DbGljay5lbWl0KHtpdGVtLCBldmVudH0pXG4gIH1cbn1cbiJdfQ==