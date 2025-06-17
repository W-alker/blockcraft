import { ChangeDetectionStrategy, Component, ElementRef, EventEmitter, Input, Output, ViewChild } from "@angular/core";
import { LANGUAGE_LIST } from "./const";
import { NgForOf } from "@angular/common";
import * as i0 from "@angular/core";
export class LangListComponent {
    constructor(cdr, destroyRef) {
        this.cdr = cdr;
        this.destroyRef = destroyRef;
        this.activeLang = 'javascript';
        this.langChange = new EventEmitter();
        this.destroy = new EventEmitter();
        this.languageList = LANGUAGE_LIST;
        this.hoverIdx = -1;
    }
    ngOnInit() {
        this.setHoverIdx(this.activeLang);
    }
    ngAfterViewInit() {
        this.input.nativeElement.focus();
        this.viewHoverLang();
    }
    onMouseEnter(e) {
        const target = e.target;
        if (target.classList.contains('lang-list_item')) {
            this.setHoverIdx(target.dataset["value"]);
        }
    }
    onMouseDown(e) {
        e.stopPropagation();
        e.preventDefault();
        const target = e.target;
        if (target.classList.contains('lang-list_item')) {
            this.langChange.emit(this.languageList.find(item => item.value === target.dataset["value"]));
        }
    }
    setHoverIdx(v) {
        this.hoverIdx = this.languageList.findIndex(item => item.value === v);
    }
    viewHoverLang() {
        this.langList.nativeElement.children[this.hoverIdx].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    onSearch(e) {
        const v = e.target.value;
        if (!v)
            this.languageList = LANGUAGE_LIST;
        else
            this.languageList = LANGUAGE_LIST.filter(item => item.value.includes(v) || item.name.includes(v));
        this.hoverIdx = [0, this.hoverIdx, this.languageList.length].sort((a, b) => a - b)[1];
        this.cdr.markForCheck();
    }
    onKeydown($event) {
        switch ($event.key) {
            case 'Escape':
                $event.preventDefault();
                this.destroy.emit();
                break;
            case 'ArrowDown':
                $event.preventDefault();
                this.hoverIdx = this.hoverIdx < this.languageList.length - 1 ? this.hoverIdx + 1 : 0;
                this.cdr.detectChanges();
                this.viewHoverLang();
                break;
            case 'ArrowUp':
                $event.preventDefault();
                this.hoverIdx = this.hoverIdx > 0 ? this.hoverIdx - 1 : this.languageList.length - 1;
                this.cdr.detectChanges();
                this.viewHoverLang();
                break;
            case 'Enter':
                if (!this.languageList.length || !this.languageList[this.hoverIdx])
                    return;
                this.langChange.emit(this.languageList[this.hoverIdx]);
                break;
            default:
                break;
        }
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: LangListComponent, deps: [{ token: i0.ChangeDetectorRef }, { token: i0.DestroyRef }], target: i0.ɵɵFactoryTarget.Component }); }
    static { this.ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "17.0.0", version: "17.3.12", type: LangListComponent, isStandalone: true, selector: "lang-list", inputs: { activeLang: "activeLang" }, outputs: { langChange: "langChange", destroy: "destroy" }, viewQueries: [{ propertyName: "input", first: true, predicate: ["input"], descendants: true, read: ElementRef }, { propertyName: "langList", first: true, predicate: ["langList"], descendants: true, read: ElementRef }], ngImport: i0, template: `
    <input (input)="onSearch($event)" #input (keydown)="onKeydown($event)" />
    <div class="lang-list" (mouseover)="onMouseEnter($event)" (mousedown)="onMouseDown($event)" #langList>
      @for (item of languageList; track item.name; let index = $index) {
        <div class="lang-list_item" [class.active]="item.value === activeLang"
             [attr.data-value]="item.value" [class.hover]="hoverIdx === index">
          {{ item.name }}
        </div>
      }
    </div>
  `, isInline: true, styles: [":host{background-color:#fff;border:1px solid #f5f2f0;box-shadow:0 0 4px #0000001a;border-radius:4px;padding:4px}:host>input{margin:0 auto;width:120px;height:calc(var(--bf-lh) * 1.5);line-height:calc(var(--bf-lh) * 1.5);font-size:var(--bf-fs);border:1px solid #f5f2f0;border-radius:4px;padding:0 4px}:host>input:focus{outline:1px solid #4857E2}:host .lang-list{margin-top:4px;max-height:40vh;overflow-y:auto}:host .lang-list_item{margin-top:4px;padding:0 4px;height:calc(var(--bf-lh) * 1.5);line-height:calc(var(--bf-lh) * 1.5);text-align:center;font-size:calc(var(--bf-fs) * .8);color:#999;cursor:pointer;border-radius:4px}:host .lang-list_item:is(.active,.hover){background-color:#9999991a}\n"], changeDetection: i0.ChangeDetectionStrategy.OnPush }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: LangListComponent, decorators: [{
            type: Component,
            args: [{ selector: 'lang-list', template: `
    <input (input)="onSearch($event)" #input (keydown)="onKeydown($event)" />
    <div class="lang-list" (mouseover)="onMouseEnter($event)" (mousedown)="onMouseDown($event)" #langList>
      @for (item of languageList; track item.name; let index = $index) {
        <div class="lang-list_item" [class.active]="item.value === activeLang"
             [attr.data-value]="item.value" [class.hover]="hoverIdx === index">
          {{ item.name }}
        </div>
      }
    </div>
  `, imports: [NgForOf], standalone: true, changeDetection: ChangeDetectionStrategy.OnPush, styles: [":host{background-color:#fff;border:1px solid #f5f2f0;box-shadow:0 0 4px #0000001a;border-radius:4px;padding:4px}:host>input{margin:0 auto;width:120px;height:calc(var(--bf-lh) * 1.5);line-height:calc(var(--bf-lh) * 1.5);font-size:var(--bf-fs);border:1px solid #f5f2f0;border-radius:4px;padding:0 4px}:host>input:focus{outline:1px solid #4857E2}:host .lang-list{margin-top:4px;max-height:40vh;overflow-y:auto}:host .lang-list_item{margin-top:4px;padding:0 4px;height:calc(var(--bf-lh) * 1.5);line-height:calc(var(--bf-lh) * 1.5);text-align:center;font-size:calc(var(--bf-fs) * .8);color:#999;cursor:pointer;border-radius:4px}:host .lang-list_item:is(.active,.hover){background-color:#9999991a}\n"] }]
        }], ctorParameters: () => [{ type: i0.ChangeDetectorRef }, { type: i0.DestroyRef }], propDecorators: { activeLang: [{
                type: Input
            }], langChange: [{
                type: Output
            }], destroy: [{
                type: Output
            }], input: [{
                type: ViewChild,
                args: ['input', { read: ElementRef }]
            }], langList: [{
                type: ViewChild,
                args: ['langList', { read: ElementRef }]
            }] } });
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGFuZy1saXN0LmNvbXBvbmVudC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uL2Jsb2NrZmxvdy9zcmMvYmxvY2tzL2NvZGUvbGFuZy1saXN0LmNvbXBvbmVudC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxPQUFPLEVBQ0wsdUJBQXVCLEVBRXZCLFNBQVMsRUFDRyxVQUFVLEVBQ3RCLFlBQVksRUFDWixLQUFLLEVBQ0wsTUFBTSxFQUFFLFNBQVMsRUFDbEIsTUFBTSxlQUFlLENBQUM7QUFDdkIsT0FBTyxFQUFDLGFBQWEsRUFBQyxNQUFNLFNBQVMsQ0FBQztBQUN0QyxPQUFPLEVBQUMsT0FBTyxFQUFDLE1BQU0saUJBQWlCLENBQUM7O0FBa0V4QyxNQUFNLE9BQU8saUJBQWlCO0lBWTVCLFlBQ1UsR0FBc0IsRUFDZCxVQUFzQjtRQUQ5QixRQUFHLEdBQUgsR0FBRyxDQUFtQjtRQUNkLGVBQVUsR0FBVixVQUFVLENBQVk7UUFiL0IsZUFBVSxHQUFXLFlBQVksQ0FBQztRQUNqQyxlQUFVLEdBQUcsSUFBSSxZQUFZLEVBQWEsQ0FBQztRQUMzQyxZQUFPLEdBQUcsSUFBSSxZQUFZLEVBQVEsQ0FBQTtRQUtsQyxpQkFBWSxHQUFHLGFBQWEsQ0FBQztRQUU3QixhQUFRLEdBQUcsQ0FBQyxDQUFDLENBQUM7SUFNeEIsQ0FBQztJQUVELFFBQVE7UUFDTixJQUFJLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQTtJQUNuQyxDQUFDO0lBRUQsZUFBZTtRQUNiLElBQUksQ0FBQyxLQUFLLENBQUMsYUFBYSxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQ2pDLElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQTtJQUN0QixDQUFDO0lBRUQsWUFBWSxDQUFDLENBQWE7UUFDeEIsTUFBTSxNQUFNLEdBQUcsQ0FBQyxDQUFDLE1BQXFCLENBQUM7UUFDdkMsSUFBSSxNQUFNLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxnQkFBZ0IsQ0FBQyxFQUFFLENBQUM7WUFDaEQsSUFBSSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBRSxDQUFDLENBQUE7UUFDNUMsQ0FBQztJQUNILENBQUM7SUFFRCxXQUFXLENBQUMsQ0FBYTtRQUN2QixDQUFDLENBQUMsZUFBZSxFQUFFLENBQUE7UUFDbkIsQ0FBQyxDQUFDLGNBQWMsRUFBRSxDQUFBO1FBQ2xCLE1BQU0sTUFBTSxHQUFHLENBQUMsQ0FBQyxNQUFxQixDQUFDO1FBQ3ZDLElBQUksTUFBTSxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLENBQUMsRUFBRSxDQUFDO1lBQ2hELElBQUksQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLEtBQUssS0FBSyxNQUFNLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFFLENBQUMsQ0FBQTtRQUMvRixDQUFDO0lBQ0gsQ0FBQztJQUVELFdBQVcsQ0FBQyxDQUFTO1FBQ25CLElBQUksQ0FBQyxRQUFRLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsS0FBSyxLQUFLLENBQUMsQ0FBQyxDQUFBO0lBQ3ZFLENBQUM7SUFFRCxhQUFhO1FBQ1gsSUFBSSxDQUFDLFFBQVEsQ0FBQyxhQUFhLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQyxjQUFjLENBQUMsRUFBQyxRQUFRLEVBQUUsUUFBUSxFQUFFLEtBQUssRUFBRSxTQUFTLEVBQUMsQ0FBQyxDQUFBO0lBQzVHLENBQUM7SUFFRCxRQUFRLENBQUMsQ0FBUTtRQUNmLE1BQU0sQ0FBQyxHQUFJLENBQUMsQ0FBQyxNQUEyQixDQUFDLEtBQUssQ0FBQztRQUMvQyxJQUFJLENBQUMsQ0FBQztZQUFFLElBQUksQ0FBQyxZQUFZLEdBQUcsYUFBYSxDQUFDOztZQUNyQyxJQUFJLENBQUMsWUFBWSxHQUFHLGFBQWEsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsSUFBSSxJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3ZHLElBQUksQ0FBQyxRQUFRLEdBQUcsQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsWUFBWSxDQUFDLE1BQU0sQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQTtRQUNyRixJQUFJLENBQUMsR0FBRyxDQUFDLFlBQVksRUFBRSxDQUFDO0lBQzFCLENBQUM7SUFFRCxTQUFTLENBQUMsTUFBcUI7UUFDN0IsUUFBUSxNQUFNLENBQUMsR0FBRyxFQUFFLENBQUM7WUFDbkIsS0FBSyxRQUFRO2dCQUNYLE1BQU0sQ0FBQyxjQUFjLEVBQUUsQ0FBQTtnQkFDdkIsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFDcEIsTUFBSztZQUNQLEtBQUssV0FBVztnQkFDZCxNQUFNLENBQUMsY0FBYyxFQUFFLENBQUE7Z0JBQ3ZCLElBQUksQ0FBQyxRQUFRLEdBQUcsSUFBSSxDQUFDLFFBQVEsR0FBRyxJQUFJLENBQUMsWUFBWSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxRQUFRLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ3JGLElBQUksQ0FBQyxHQUFHLENBQUMsYUFBYSxFQUFFLENBQUM7Z0JBQ3pCLElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQTtnQkFDcEIsTUFBTTtZQUNSLEtBQUssU0FBUztnQkFDWixNQUFNLENBQUMsY0FBYyxFQUFFLENBQUE7Z0JBQ3ZCLElBQUksQ0FBQyxRQUFRLEdBQUcsSUFBSSxDQUFDLFFBQVEsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxRQUFRLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUM7Z0JBQ3JGLElBQUksQ0FBQyxHQUFHLENBQUMsYUFBYSxFQUFFLENBQUM7Z0JBQ3pCLElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQTtnQkFDcEIsTUFBTTtZQUNSLEtBQUssT0FBTztnQkFDVixJQUFHLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxNQUFNLElBQUksQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUM7b0JBQUUsT0FBTztnQkFDMUUsSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztnQkFDdkQsTUFBTTtZQUNSO2dCQUNFLE1BQU07UUFDVixDQUFDO0lBQ0gsQ0FBQzsrR0FwRlUsaUJBQWlCO21HQUFqQixpQkFBaUIsaVBBS0QsVUFBVSwrRkFDUCxVQUFVLDZCQW5FOUI7Ozs7Ozs7Ozs7R0FVVDs7NEZBbURVLGlCQUFpQjtrQkEvRDdCLFNBQVM7K0JBQ0UsV0FBVyxZQUNYOzs7Ozs7Ozs7O0dBVVQsV0ErQ1EsQ0FBQyxPQUFPLENBQUMsY0FDTixJQUFJLG1CQUNDLHVCQUF1QixDQUFDLE1BQU07K0dBR3RDLFVBQVU7c0JBQWxCLEtBQUs7Z0JBQ0ksVUFBVTtzQkFBbkIsTUFBTTtnQkFDRyxPQUFPO3NCQUFoQixNQUFNO2dCQUVpQyxLQUFLO3NCQUE1QyxTQUFTO3VCQUFDLE9BQU8sRUFBRSxFQUFDLElBQUksRUFBRSxVQUFVLEVBQUM7Z0JBQ0ssUUFBUTtzQkFBbEQsU0FBUzt1QkFBQyxVQUFVLEVBQUUsRUFBQyxJQUFJLEVBQUUsVUFBVSxFQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHtcbiAgQ2hhbmdlRGV0ZWN0aW9uU3RyYXRlZ3ksXG4gIENoYW5nZURldGVjdG9yUmVmLFxuICBDb21wb25lbnQsXG4gIERlc3Ryb3lSZWYsIEVsZW1lbnRSZWYsXG4gIEV2ZW50RW1pdHRlcixcbiAgSW5wdXQsXG4gIE91dHB1dCwgVmlld0NoaWxkXG59IGZyb20gXCJAYW5ndWxhci9jb3JlXCI7XG5pbXBvcnQge0xBTkdVQUdFX0xJU1R9IGZyb20gXCIuL2NvbnN0XCI7XG5pbXBvcnQge05nRm9yT2Z9IGZyb20gXCJAYW5ndWxhci9jb21tb25cIjtcbmltcG9ydCB7SU1vZGVJdGVtfSBmcm9tIFwiLi90eXBlXCI7XG5cbkBDb21wb25lbnQoe1xuICBzZWxlY3RvcjogJ2xhbmctbGlzdCcsXG4gIHRlbXBsYXRlOiBgXG4gICAgPGlucHV0IChpbnB1dCk9XCJvblNlYXJjaCgkZXZlbnQpXCIgI2lucHV0IChrZXlkb3duKT1cIm9uS2V5ZG93bigkZXZlbnQpXCIgLz5cbiAgICA8ZGl2IGNsYXNzPVwibGFuZy1saXN0XCIgKG1vdXNlb3Zlcik9XCJvbk1vdXNlRW50ZXIoJGV2ZW50KVwiIChtb3VzZWRvd24pPVwib25Nb3VzZURvd24oJGV2ZW50KVwiICNsYW5nTGlzdD5cbiAgICAgIEBmb3IgKGl0ZW0gb2YgbGFuZ3VhZ2VMaXN0OyB0cmFjayBpdGVtLm5hbWU7IGxldCBpbmRleCA9ICRpbmRleCkge1xuICAgICAgICA8ZGl2IGNsYXNzPVwibGFuZy1saXN0X2l0ZW1cIiBbY2xhc3MuYWN0aXZlXT1cIml0ZW0udmFsdWUgPT09IGFjdGl2ZUxhbmdcIlxuICAgICAgICAgICAgIFthdHRyLmRhdGEtdmFsdWVdPVwiaXRlbS52YWx1ZVwiIFtjbGFzcy5ob3Zlcl09XCJob3ZlcklkeCA9PT0gaW5kZXhcIj5cbiAgICAgICAgICB7eyBpdGVtLm5hbWUgfX1cbiAgICAgICAgPC9kaXY+XG4gICAgICB9XG4gICAgPC9kaXY+XG4gIGAsXG4gIHN0eWxlczogW2BcbiAgICA6aG9zdCB7XG4gICAgICBiYWNrZ3JvdW5kLWNvbG9yOiAjZmZmO1xuICAgICAgYm9yZGVyOiAxcHggc29saWQgI2Y1ZjJmMDtcbiAgICAgIGJveC1zaGFkb3c6IDAgMCA0cHggcmdiYSgwLCAwLCAwLCAuMSk7XG4gICAgICBib3JkZXItcmFkaXVzOiA0cHg7XG4gICAgICBwYWRkaW5nOiA0cHg7XG5cbiAgICAgID4gaW5wdXQge1xuICAgICAgICBtYXJnaW46IDAgYXV0bztcbiAgICAgICAgd2lkdGg6IDEyMHB4O1xuICAgICAgICBoZWlnaHQ6IGNhbGModmFyKC0tYmYtbGgpICogMS41KTtcbiAgICAgICAgbGluZS1oZWlnaHQ6IGNhbGModmFyKC0tYmYtbGgpICogMS41KTtcbiAgICAgICAgZm9udC1zaXplOiB2YXIoLS1iZi1mcyk7XG4gICAgICAgIGJvcmRlcjogMXB4IHNvbGlkICNmNWYyZjA7XG4gICAgICAgIGJvcmRlci1yYWRpdXM6IDRweDtcbiAgICAgICAgcGFkZGluZzogMCA0cHg7XG5cbiAgICAgICAgJjpmb2N1cyB7XG4gICAgICAgICAgb3V0bGluZTogMXB4IHNvbGlkICM0ODU3RTI7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLmxhbmctbGlzdCB7XG4gICAgICAgIG1hcmdpbi10b3A6IDRweDtcbiAgICAgICAgbWF4LWhlaWdodDogNDB2aDtcbiAgICAgICAgb3ZlcmZsb3cteTogYXV0bztcbiAgICAgIH1cblxuICAgICAgLmxhbmctbGlzdF9pdGVtIHtcbiAgICAgICAgbWFyZ2luLXRvcDogNHB4O1xuICAgICAgICBwYWRkaW5nOiAwIDRweDtcbiAgICAgICAgaGVpZ2h0OiBjYWxjKHZhcigtLWJmLWxoKSAqIDEuNSk7XG4gICAgICAgIGxpbmUtaGVpZ2h0OiBjYWxjKHZhcigtLWJmLWxoKSAqIDEuNSk7XG4gICAgICAgIHRleHQtYWxpZ246IGNlbnRlcjtcbiAgICAgICAgZm9udC1zaXplOiBjYWxjKHZhcigtLWJmLWZzKSAqIC44KTtcbiAgICAgICAgY29sb3I6ICM5OTk7XG4gICAgICAgIGN1cnNvcjogcG9pbnRlcjtcbiAgICAgICAgYm9yZGVyLXJhZGl1czogNHB4O1xuXG4gICAgICAgICYuYWN0aXZlLCAmLmhvdmVyIHtcbiAgICAgICAgICBiYWNrZ3JvdW5kLWNvbG9yOiByZ2JhKDE1MywgMTUzLCAxNTMsIC4xKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgYF0sXG4gIGltcG9ydHM6IFtOZ0Zvck9mXSxcbiAgc3RhbmRhbG9uZTogdHJ1ZSxcbiAgY2hhbmdlRGV0ZWN0aW9uOiBDaGFuZ2VEZXRlY3Rpb25TdHJhdGVneS5PblB1c2hcbn0pXG5leHBvcnQgY2xhc3MgTGFuZ0xpc3RDb21wb25lbnQge1xuICBASW5wdXQoKSBhY3RpdmVMYW5nOiBzdHJpbmcgPSAnamF2YXNjcmlwdCc7XG4gIEBPdXRwdXQoKSBsYW5nQ2hhbmdlID0gbmV3IEV2ZW50RW1pdHRlcjxJTW9kZUl0ZW0+KCk7XG4gIEBPdXRwdXQoKSBkZXN0cm95ID0gbmV3IEV2ZW50RW1pdHRlcjx2b2lkPigpXG5cbiAgQFZpZXdDaGlsZCgnaW5wdXQnLCB7cmVhZDogRWxlbWVudFJlZn0pIGlucHV0ITogRWxlbWVudFJlZjxIVE1MSW5wdXRFbGVtZW50PlxuICBAVmlld0NoaWxkKCdsYW5nTGlzdCcsIHtyZWFkOiBFbGVtZW50UmVmfSkgbGFuZ0xpc3QhOiBFbGVtZW50UmVmPEhUTUxFbGVtZW50PlxuXG4gIHByb3RlY3RlZCBsYW5ndWFnZUxpc3QgPSBMQU5HVUFHRV9MSVNUO1xuXG4gIHByb3RlY3RlZCBob3ZlcklkeCA9IC0xO1xuXG4gIGNvbnN0cnVjdG9yKFxuICAgIHByaXZhdGUgY2RyOiBDaGFuZ2VEZXRlY3RvclJlZixcbiAgICBwdWJsaWMgcmVhZG9ubHkgZGVzdHJveVJlZjogRGVzdHJveVJlZlxuICApIHtcbiAgfVxuXG4gIG5nT25Jbml0KCkge1xuICAgIHRoaXMuc2V0SG92ZXJJZHgodGhpcy5hY3RpdmVMYW5nKVxuICB9XG5cbiAgbmdBZnRlclZpZXdJbml0KCkge1xuICAgIHRoaXMuaW5wdXQubmF0aXZlRWxlbWVudC5mb2N1cygpO1xuICAgIHRoaXMudmlld0hvdmVyTGFuZygpXG4gIH1cblxuICBvbk1vdXNlRW50ZXIoZTogTW91c2VFdmVudCkge1xuICAgIGNvbnN0IHRhcmdldCA9IGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50O1xuICAgIGlmICh0YXJnZXQuY2xhc3NMaXN0LmNvbnRhaW5zKCdsYW5nLWxpc3RfaXRlbScpKSB7XG4gICAgICB0aGlzLnNldEhvdmVySWR4KHRhcmdldC5kYXRhc2V0W1widmFsdWVcIl0hKVxuICAgIH1cbiAgfVxuXG4gIG9uTW91c2VEb3duKGU6IE1vdXNlRXZlbnQpIHtcbiAgICBlLnN0b3BQcm9wYWdhdGlvbigpXG4gICAgZS5wcmV2ZW50RGVmYXVsdCgpXG4gICAgY29uc3QgdGFyZ2V0ID0gZS50YXJnZXQgYXMgSFRNTEVsZW1lbnQ7XG4gICAgaWYgKHRhcmdldC5jbGFzc0xpc3QuY29udGFpbnMoJ2xhbmctbGlzdF9pdGVtJykpIHtcbiAgICAgIHRoaXMubGFuZ0NoYW5nZS5lbWl0KHRoaXMubGFuZ3VhZ2VMaXN0LmZpbmQoaXRlbSA9PiBpdGVtLnZhbHVlID09PSB0YXJnZXQuZGF0YXNldFtcInZhbHVlXCJdKSEpXG4gICAgfVxuICB9XG5cbiAgc2V0SG92ZXJJZHgodjogc3RyaW5nKSB7XG4gICAgdGhpcy5ob3ZlcklkeCA9IHRoaXMubGFuZ3VhZ2VMaXN0LmZpbmRJbmRleChpdGVtID0+IGl0ZW0udmFsdWUgPT09IHYpXG4gIH1cblxuICB2aWV3SG92ZXJMYW5nKCkge1xuICAgIHRoaXMubGFuZ0xpc3QubmF0aXZlRWxlbWVudC5jaGlsZHJlblt0aGlzLmhvdmVySWR4XS5zY3JvbGxJbnRvVmlldyh7YmVoYXZpb3I6ICdzbW9vdGgnLCBibG9jazogJ25lYXJlc3QnfSlcbiAgfVxuXG4gIG9uU2VhcmNoKGU6IEV2ZW50KSB7XG4gICAgY29uc3QgdiA9IChlLnRhcmdldCBhcyBIVE1MSW5wdXRFbGVtZW50KS52YWx1ZTtcbiAgICBpZiAoIXYpIHRoaXMubGFuZ3VhZ2VMaXN0ID0gTEFOR1VBR0VfTElTVDtcbiAgICBlbHNlIHRoaXMubGFuZ3VhZ2VMaXN0ID0gTEFOR1VBR0VfTElTVC5maWx0ZXIoaXRlbSA9PiBpdGVtLnZhbHVlLmluY2x1ZGVzKHYpIHx8IGl0ZW0ubmFtZS5pbmNsdWRlcyh2KSk7XG4gICAgdGhpcy5ob3ZlcklkeCA9IFswLCB0aGlzLmhvdmVySWR4LCB0aGlzLmxhbmd1YWdlTGlzdC5sZW5ndGhdLnNvcnQoKGEsIGIpID0+IGEgLSBiKVsxXVxuICAgIHRoaXMuY2RyLm1hcmtGb3JDaGVjaygpO1xuICB9XG5cbiAgb25LZXlkb3duKCRldmVudDogS2V5Ym9hcmRFdmVudCkge1xuICAgIHN3aXRjaCAoJGV2ZW50LmtleSkge1xuICAgICAgY2FzZSAnRXNjYXBlJzpcbiAgICAgICAgJGV2ZW50LnByZXZlbnREZWZhdWx0KClcbiAgICAgICAgdGhpcy5kZXN0cm95LmVtaXQoKTtcbiAgICAgICAgYnJlYWtcbiAgICAgIGNhc2UgJ0Fycm93RG93bic6XG4gICAgICAgICRldmVudC5wcmV2ZW50RGVmYXVsdCgpXG4gICAgICAgIHRoaXMuaG92ZXJJZHggPSB0aGlzLmhvdmVySWR4IDwgdGhpcy5sYW5ndWFnZUxpc3QubGVuZ3RoIC0gMSA/IHRoaXMuaG92ZXJJZHggKyAxIDogMDtcbiAgICAgICAgdGhpcy5jZHIuZGV0ZWN0Q2hhbmdlcygpO1xuICAgICAgICB0aGlzLnZpZXdIb3ZlckxhbmcoKVxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ0Fycm93VXAnOlxuICAgICAgICAkZXZlbnQucHJldmVudERlZmF1bHQoKVxuICAgICAgICB0aGlzLmhvdmVySWR4ID0gdGhpcy5ob3ZlcklkeCA+IDAgPyB0aGlzLmhvdmVySWR4IC0gMSA6IHRoaXMubGFuZ3VhZ2VMaXN0Lmxlbmd0aCAtIDE7XG4gICAgICAgIHRoaXMuY2RyLmRldGVjdENoYW5nZXMoKTtcbiAgICAgICAgdGhpcy52aWV3SG92ZXJMYW5nKClcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdFbnRlcic6XG4gICAgICAgIGlmKCF0aGlzLmxhbmd1YWdlTGlzdC5sZW5ndGggfHwgIXRoaXMubGFuZ3VhZ2VMaXN0W3RoaXMuaG92ZXJJZHhdKSByZXR1cm47XG4gICAgICAgIHRoaXMubGFuZ0NoYW5nZS5lbWl0KHRoaXMubGFuZ3VhZ2VMaXN0W3RoaXMuaG92ZXJJZHhdKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBkZWZhdWx0OlxuICAgICAgICBicmVhaztcbiAgICB9XG4gIH1cbn1cbiJdfQ==