import { ChangeDetectionStrategy, Component, ElementRef, EventEmitter, HostListener, Output, ViewChild } from "@angular/core";
import { isUrl } from "../../../core";
import { NzButtonComponent } from "ng-zorro-antd/button";
import * as i0 from "@angular/core";
export class LinkInputPad {
    constructor(cdr, destroyRef) {
        this.cdr = cdr;
        this.destroyRef = destroyRef;
        this.onCancel = new EventEmitter();
        this.onConfirm = new EventEmitter();
        this.isValid = true;
    }
    onMouseDown($event) {
        if ($event.eventPhase !== 2)
            return;
        $event.preventDefault();
        $event.stopPropagation();
    }
    ngAfterViewInit() {
        this.inputElement.nativeElement.focus();
    }
    onInput($event) {
        this.isValid = isUrl(this.inputElement.nativeElement.value);
        this.cdr.markForCheck();
    }
    submitValue() {
        if (!this.isValid)
            return;
        this.onConfirm.emit(this.inputElement.nativeElement.value);
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: LinkInputPad, deps: [{ token: i0.ChangeDetectorRef }, { token: i0.DestroyRef }], target: i0.ɵɵFactoryTarget.Component }); }
    static { this.ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "14.0.0", version: "17.3.12", type: LinkInputPad, isStandalone: true, selector: "link-input-pad", outputs: { onCancel: "onCancel", onConfirm: "onConfirm" }, host: { listeners: { "mousedown": "onMouseDown($event)" } }, viewQueries: [{ propertyName: "inputElement", first: true, predicate: ["inputElement"], descendants: true, read: ElementRef }], ngImport: i0, template: `
    <input type="text" (input)="onInput($event)" [class.error]="!isValid" #inputElement/>
    <div style="display: flex; justify-content: flex-end; gap: 8px; width: 100%;">
      <button nz-button nzType="default" (mousedown)="$event.preventDefault(); onCancel.emit()">取消</button>
      <button nz-button nzType="primary" (mousedown)="$event.preventDefault(); submitValue()">确定</button>
    </div>

  `, isInline: true, styles: [":host{width:400px;display:flex;flex-direction:column;align-items:flex-start;padding:16px;gap:16px;border-radius:4px;border:1px solid #E6E6E6;background:#fff;box-shadow:0 0 20px #0000001a;font-size:14px;color:#333}:host>input{width:100%;margin:0;padding:8px;border-radius:4px;border:1px solid #E6E6E6;outline:none}:host>input:focus{border-color:#4857e2}:host>input.error{border-color:#ff4d4f!important}\n"], dependencies: [{ kind: "component", type: NzButtonComponent, selector: "button[nz-button], a[nz-button]", inputs: ["nzBlock", "nzGhost", "nzSearch", "nzLoading", "nzDanger", "disabled", "tabIndex", "nzType", "nzShape", "nzSize"], exportAs: ["nzButton"] }], changeDetection: i0.ChangeDetectionStrategy.OnPush }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: LinkInputPad, decorators: [{
            type: Component,
            args: [{ selector: 'link-input-pad', template: `
    <input type="text" (input)="onInput($event)" [class.error]="!isValid" #inputElement/>
    <div style="display: flex; justify-content: flex-end; gap: 8px; width: 100%;">
      <button nz-button nzType="default" (mousedown)="$event.preventDefault(); onCancel.emit()">取消</button>
      <button nz-button nzType="primary" (mousedown)="$event.preventDefault(); submitValue()">确定</button>
    </div>

  `, standalone: true, imports: [
                        NzButtonComponent
                    ], changeDetection: ChangeDetectionStrategy.OnPush, styles: [":host{width:400px;display:flex;flex-direction:column;align-items:flex-start;padding:16px;gap:16px;border-radius:4px;border:1px solid #E6E6E6;background:#fff;box-shadow:0 0 20px #0000001a;font-size:14px;color:#333}:host>input{width:100%;margin:0;padding:8px;border-radius:4px;border:1px solid #E6E6E6;outline:none}:host>input:focus{border-color:#4857e2}:host>input.error{border-color:#ff4d4f!important}\n"] }]
        }], ctorParameters: () => [{ type: i0.ChangeDetectorRef }, { type: i0.DestroyRef }], propDecorators: { onCancel: [{
                type: Output
            }], onConfirm: [{
                type: Output
            }], inputElement: [{
                type: ViewChild,
                args: ['inputElement', { read: ElementRef }]
            }], onMouseDown: [{
                type: HostListener,
                args: ['mousedown', ['$event']]
            }] } });
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGluay1pbnB1dC1wYWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi9ibG9ja2Zsb3cvc3JjL3BsdWdpbnMvZmxvYXQtdGV4dC10b29sYmFyL3dpZGdldC9saW5rLWlucHV0LXBhZC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxPQUFPLEVBQ0wsdUJBQXVCLEVBRXZCLFNBQVMsRUFDVCxVQUFVLEVBQ1YsWUFBWSxFQUFFLFlBQVksRUFDMUIsTUFBTSxFQUNOLFNBQVMsRUFDVixNQUFNLGVBQWUsQ0FBQztBQUN2QixPQUFPLEVBQUMsS0FBSyxFQUFDLE1BQU0sZUFBZSxDQUFDO0FBQ3BDLE9BQU8sRUFBQyxpQkFBaUIsRUFBQyxNQUFNLHNCQUFzQixDQUFDOztBQW1EdkQsTUFBTSxPQUFPLFlBQVk7SUFDdkIsWUFDVSxHQUFzQixFQUNkLFVBQXNCO1FBRDlCLFFBQUcsR0FBSCxHQUFHLENBQW1CO1FBQ2QsZUFBVSxHQUFWLFVBQVUsQ0FBWTtRQUk5QixhQUFRLEdBQUcsSUFBSSxZQUFZLEVBQVEsQ0FBQTtRQUNuQyxjQUFTLEdBQUcsSUFBSSxZQUFZLEVBQVUsQ0FBQTtRQVdoRCxZQUFPLEdBQUcsSUFBSSxDQUFBO0lBZGQsQ0FBQztJQVFELFdBQVcsQ0FBQyxNQUFrQjtRQUM1QixJQUFHLE1BQU0sQ0FBQyxVQUFVLEtBQUssQ0FBQztZQUFFLE9BQU07UUFDbEMsTUFBTSxDQUFDLGNBQWMsRUFBRSxDQUFBO1FBQ3ZCLE1BQU0sQ0FBQyxlQUFlLEVBQUUsQ0FBQTtJQUMxQixDQUFDO0lBSUQsZUFBZTtRQUNiLElBQUksQ0FBQyxZQUFZLENBQUMsYUFBYSxDQUFDLEtBQUssRUFBRSxDQUFBO0lBQ3pDLENBQUM7SUFFRCxPQUFPLENBQUMsTUFBYTtRQUNuQixJQUFJLENBQUMsT0FBTyxHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsQ0FBQTtRQUMzRCxJQUFJLENBQUMsR0FBRyxDQUFDLFlBQVksRUFBRSxDQUFBO0lBQ3pCLENBQUM7SUFFRCxXQUFXO1FBQ1QsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPO1lBQUUsT0FBTTtRQUN6QixJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsQ0FBQTtJQUM1RCxDQUFDOytHQWpDVSxZQUFZO21HQUFaLFlBQVksMlJBVVcsVUFBVSw2QkF6RGxDOzs7Ozs7O0dBT1QsNmRBb0NDLGlCQUFpQjs7NEZBSVIsWUFBWTtrQkFqRHhCLFNBQVM7K0JBQ0UsZ0JBQWdCLFlBQ2hCOzs7Ozs7O0dBT1QsY0FrQ1csSUFBSSxXQUNQO3dCQUNQLGlCQUFpQjtxQkFDbEIsbUJBQ2dCLHVCQUF1QixDQUFDLE1BQU07K0dBU3JDLFFBQVE7c0JBQWpCLE1BQU07Z0JBQ0csU0FBUztzQkFBbEIsTUFBTTtnQkFFd0MsWUFBWTtzQkFBMUQsU0FBUzt1QkFBQyxjQUFjLEVBQUUsRUFBQyxJQUFJLEVBQUUsVUFBVSxFQUFDO2dCQUc3QyxXQUFXO3NCQURWLFlBQVk7dUJBQUMsV0FBVyxFQUFFLENBQUMsUUFBUSxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHtcbiAgQ2hhbmdlRGV0ZWN0aW9uU3RyYXRlZ3ksXG4gIENoYW5nZURldGVjdG9yUmVmLFxuICBDb21wb25lbnQsIERlc3Ryb3lSZWYsXG4gIEVsZW1lbnRSZWYsXG4gIEV2ZW50RW1pdHRlciwgSG9zdExpc3RlbmVyLFxuICBPdXRwdXQsXG4gIFZpZXdDaGlsZFxufSBmcm9tIFwiQGFuZ3VsYXIvY29yZVwiO1xuaW1wb3J0IHtpc1VybH0gZnJvbSBcIi4uLy4uLy4uL2NvcmVcIjtcbmltcG9ydCB7TnpCdXR0b25Db21wb25lbnR9IGZyb20gXCJuZy16b3Jyby1hbnRkL2J1dHRvblwiO1xuXG5AQ29tcG9uZW50KHtcbiAgc2VsZWN0b3I6ICdsaW5rLWlucHV0LXBhZCcsXG4gIHRlbXBsYXRlOiBgXG4gICAgPGlucHV0IHR5cGU9XCJ0ZXh0XCIgKGlucHV0KT1cIm9uSW5wdXQoJGV2ZW50KVwiIFtjbGFzcy5lcnJvcl09XCIhaXNWYWxpZFwiICNpbnB1dEVsZW1lbnQvPlxuICAgIDxkaXYgc3R5bGU9XCJkaXNwbGF5OiBmbGV4OyBqdXN0aWZ5LWNvbnRlbnQ6IGZsZXgtZW5kOyBnYXA6IDhweDsgd2lkdGg6IDEwMCU7XCI+XG4gICAgICA8YnV0dG9uIG56LWJ1dHRvbiBuelR5cGU9XCJkZWZhdWx0XCIgKG1vdXNlZG93bik9XCIkZXZlbnQucHJldmVudERlZmF1bHQoKTsgb25DYW5jZWwuZW1pdCgpXCI+5Y+W5raIPC9idXR0b24+XG4gICAgICA8YnV0dG9uIG56LWJ1dHRvbiBuelR5cGU9XCJwcmltYXJ5XCIgKG1vdXNlZG93bik9XCIkZXZlbnQucHJldmVudERlZmF1bHQoKTsgc3VibWl0VmFsdWUoKVwiPuehruWumjwvYnV0dG9uPlxuICAgIDwvZGl2PlxuXG4gIGAsXG4gIHN0eWxlczogW2BcbiAgICA6aG9zdCB7XG4gICAgICB3aWR0aDogNDAwcHg7XG4gICAgICBkaXNwbGF5OiBmbGV4O1xuICAgICAgZmxleC1kaXJlY3Rpb246IGNvbHVtbjtcbiAgICAgIGFsaWduLWl0ZW1zOiBmbGV4LXN0YXJ0O1xuICAgICAgcGFkZGluZzogMTZweDtcbiAgICAgIGdhcDogMTZweDtcbiAgICAgIGJvcmRlci1yYWRpdXM6IDRweDtcbiAgICAgIGJvcmRlcjogMXB4IHNvbGlkICNFNkU2RTY7XG4gICAgICBiYWNrZ3JvdW5kOiAjRkZGO1xuICAgICAgYm94LXNoYWRvdzogMHB4IDBweCAyMHB4IDBweCByZ2JhKDAsIDAsIDAsIDAuMTApO1xuICAgICAgZm9udC1zaXplOiAxNHB4O1xuICAgICAgY29sb3I6ICMzMzM7XG5cbiAgICAgID4gaW5wdXQge1xuICAgICAgICB3aWR0aDogMTAwJTtcbiAgICAgICAgbWFyZ2luOiAwO1xuICAgICAgICBwYWRkaW5nOiA4cHg7XG4gICAgICAgIGJvcmRlci1yYWRpdXM6IDRweDtcbiAgICAgICAgYm9yZGVyOiAxcHggc29saWQgI0U2RTZFNjtcbiAgICAgICAgb3V0bGluZTogbm9uZTtcblxuICAgICAgICAmOmZvY3VzIHtcbiAgICAgICAgICBib3JkZXItY29sb3I6ICM0ODU3RTI7XG4gICAgICAgIH1cblxuICAgICAgICAmLmVycm9yIHtcbiAgICAgICAgICBib3JkZXItY29sb3I6ICNmZjRkNGYgIWltcG9ydGFudDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgYF0sXG4gIHN0YW5kYWxvbmU6IHRydWUsXG4gIGltcG9ydHM6IFtcbiAgICBOekJ1dHRvbkNvbXBvbmVudFxuICBdLFxuICBjaGFuZ2VEZXRlY3Rpb246IENoYW5nZURldGVjdGlvblN0cmF0ZWd5Lk9uUHVzaFxufSlcbmV4cG9ydCBjbGFzcyBMaW5rSW5wdXRQYWQge1xuICBjb25zdHJ1Y3RvcihcbiAgICBwcml2YXRlIGNkcjogQ2hhbmdlRGV0ZWN0b3JSZWYsXG4gICAgcHVibGljIHJlYWRvbmx5IGRlc3Ryb3lSZWY6IERlc3Ryb3lSZWZcbiAgKSB7XG4gIH1cblxuICBAT3V0cHV0KCkgb25DYW5jZWwgPSBuZXcgRXZlbnRFbWl0dGVyPHZvaWQ+KClcbiAgQE91dHB1dCgpIG9uQ29uZmlybSA9IG5ldyBFdmVudEVtaXR0ZXI8c3RyaW5nPigpXG5cbiAgQFZpZXdDaGlsZCgnaW5wdXRFbGVtZW50Jywge3JlYWQ6IEVsZW1lbnRSZWZ9KSBpbnB1dEVsZW1lbnQhOiBFbGVtZW50UmVmPEhUTUxJbnB1dEVsZW1lbnQ+O1xuXG4gIEBIb3N0TGlzdGVuZXIoJ21vdXNlZG93bicsIFsnJGV2ZW50J10pXG4gIG9uTW91c2VEb3duKCRldmVudDogTW91c2VFdmVudCkge1xuICAgIGlmKCRldmVudC5ldmVudFBoYXNlICE9PSAyKSByZXR1cm5cbiAgICAkZXZlbnQucHJldmVudERlZmF1bHQoKVxuICAgICRldmVudC5zdG9wUHJvcGFnYXRpb24oKVxuICB9XG5cbiAgaXNWYWxpZCA9IHRydWVcblxuICBuZ0FmdGVyVmlld0luaXQoKSB7XG4gICAgdGhpcy5pbnB1dEVsZW1lbnQubmF0aXZlRWxlbWVudC5mb2N1cygpXG4gIH1cblxuICBvbklucHV0KCRldmVudDogRXZlbnQpIHtcbiAgICB0aGlzLmlzVmFsaWQgPSBpc1VybCh0aGlzLmlucHV0RWxlbWVudC5uYXRpdmVFbGVtZW50LnZhbHVlKVxuICAgIHRoaXMuY2RyLm1hcmtGb3JDaGVjaygpXG4gIH1cblxuICBzdWJtaXRWYWx1ZSgpIHtcbiAgICBpZiAoIXRoaXMuaXNWYWxpZCkgcmV0dXJuXG4gICAgdGhpcy5vbkNvbmZpcm0uZW1pdCh0aGlzLmlucHV0RWxlbWVudC5uYXRpdmVFbGVtZW50LnZhbHVlKVxuICB9XG59XG4iXX0=