import { ChangeDetectionStrategy, Component, ElementRef, EventEmitter, Input, Output, ViewChild } from "@angular/core";
import { NzButtonModule } from "ng-zorro-antd/button";
import { FormsModule } from "@angular/forms";
import { isUrl } from "../../../core";
import * as i0 from "@angular/core";
import * as i1 from "ng-zorro-antd/button";
import * as i2 from "ng-zorro-antd/core/transition-patch";
import * as i3 from "ng-zorro-antd/core/wave";
import * as i4 from "@angular/forms";
export class InlineLinkBlockFloatDialog {
    set text(v) {
        this.updatedText = v;
        this._text = v;
    }
    get text() {
        return this._text;
    }
    set href(v) {
        this.updatedHref = v;
        this._href = v;
    }
    get href() {
        return this._href;
    }
    constructor() {
        this._text = '';
        this._href = '';
        this.close = new EventEmitter();
        this.update = new EventEmitter();
        this.titleError = false;
        this.urlError = false;
        this.updatedText = '';
        this.updatedHref = '';
    }
    ngAfterViewInit() {
        this.titleInput.nativeElement.focus();
    }
    verifyText() {
        this.titleError = !this.updatedText;
    }
    verifyUrl() {
        this.urlError = !isUrl(this.updatedHref);
    }
    onClose() {
        this.close.emit();
    }
    onUpdate() {
        this.verifyUrl();
        this.verifyText();
        if (this.titleError)
            return this.titleInput.nativeElement.focus();
        if (this.urlError)
            return this.urlInput.nativeElement.focus();
        if (this.updatedText === this.text && this.updatedHref === this.href)
            return this.close.emit();
        this.update.emit({
            text: this.updatedText,
            href: this.updatedHref
        });
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: InlineLinkBlockFloatDialog, deps: [], target: i0.ɵɵFactoryTarget.Component }); }
    static { this.ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "14.0.0", version: "17.3.12", type: InlineLinkBlockFloatDialog, isStandalone: true, selector: "div.float-edit-dialog", inputs: { text: "text", href: "href" }, outputs: { close: "close", update: "update" }, viewQueries: [{ propertyName: "titleInput", first: true, predicate: ["titleInput"], descendants: true, read: ElementRef }, { propertyName: "urlInput", first: true, predicate: ["urlInput"], descendants: true, read: ElementRef }], ngImport: i0, template: `
    <p>标题</p>
    <input type="text" placeholder="请输入标题" [(ngModel)]="updatedText"
           [class.error]="titleError" #titleInput (keyup.enter)="onUpdate()" (keydown.tab)="titleInput.focus()">
    <p>地址</p>
    <input type="text" placeholder="请输入地址" [(ngModel)]="updatedHref"
           [class.error]="urlError" #urlInput (keyup.enter)="onUpdate()" (keydown.tab)="urlInput.focus()">
    <div style="width: 100%; display: flex; justify-content: flex-end; gap: 16px">
      <button nz-button (click)="onClose()">取消</button>
      <button nz-button nzType="primary" (click)="onUpdate()">确定</button>
    </div>
  `, isInline: true, styles: [":host{width:400px;display:flex;flex-direction:column;align-items:flex-start;padding:16px;gap:16px;border-radius:4px;border:1px solid #E6E6E6;background:#fff;box-shadow:0 0 20px #0000001a;font-size:14px;color:#333}:host>p{margin:0;padding:0}:host>input{width:100%;margin:0;padding:8px;border-radius:4px;border:1px solid #E6E6E6;outline:none}:host>input:focus{border-color:#4857e2}:host>input.error{border-color:#ff4d4f}\n"], dependencies: [{ kind: "ngmodule", type: NzButtonModule }, { kind: "component", type: i1.NzButtonComponent, selector: "button[nz-button], a[nz-button]", inputs: ["nzBlock", "nzGhost", "nzSearch", "nzLoading", "nzDanger", "disabled", "tabIndex", "nzType", "nzShape", "nzSize"], exportAs: ["nzButton"] }, { kind: "directive", type: i2.ɵNzTransitionPatchDirective, selector: "[nz-button], nz-button-group, [nz-icon], [nz-menu-item], [nz-submenu], nz-select-top-control, nz-select-placeholder, nz-input-group", inputs: ["hidden"] }, { kind: "directive", type: i3.NzWaveDirective, selector: "[nz-wave],button[nz-button]:not([nzType=\"link\"]):not([nzType=\"text\"])", inputs: ["nzWaveExtraNode"], exportAs: ["nzWave"] }, { kind: "ngmodule", type: FormsModule }, { kind: "directive", type: i4.DefaultValueAccessor, selector: "input:not([type=checkbox])[formControlName],textarea[formControlName],input:not([type=checkbox])[formControl],textarea[formControl],input:not([type=checkbox])[ngModel],textarea[ngModel],[ngDefaultControl]" }, { kind: "directive", type: i4.NgControlStatus, selector: "[formControlName],[ngModel],[formControl]" }, { kind: "directive", type: i4.NgModel, selector: "[ngModel]:not([formControlName]):not([formControl])", inputs: ["name", "disabled", "ngModel", "ngModelOptions"], outputs: ["ngModelChange"], exportAs: ["ngModel"] }], changeDetection: i0.ChangeDetectionStrategy.OnPush }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: InlineLinkBlockFloatDialog, decorators: [{
            type: Component,
            args: [{ selector: 'div.float-edit-dialog', template: `
    <p>标题</p>
    <input type="text" placeholder="请输入标题" [(ngModel)]="updatedText"
           [class.error]="titleError" #titleInput (keyup.enter)="onUpdate()" (keydown.tab)="titleInput.focus()">
    <p>地址</p>
    <input type="text" placeholder="请输入地址" [(ngModel)]="updatedHref"
           [class.error]="urlError" #urlInput (keyup.enter)="onUpdate()" (keydown.tab)="urlInput.focus()">
    <div style="width: 100%; display: flex; justify-content: flex-end; gap: 16px">
      <button nz-button (click)="onClose()">取消</button>
      <button nz-button nzType="primary" (click)="onUpdate()">确定</button>
    </div>
  `, standalone: true, imports: [
                        NzButtonModule,
                        FormsModule,
                    ], changeDetection: ChangeDetectionStrategy.OnPush, styles: [":host{width:400px;display:flex;flex-direction:column;align-items:flex-start;padding:16px;gap:16px;border-radius:4px;border:1px solid #E6E6E6;background:#fff;box-shadow:0 0 20px #0000001a;font-size:14px;color:#333}:host>p{margin:0;padding:0}:host>input{width:100%;margin:0;padding:8px;border-radius:4px;border:1px solid #E6E6E6;outline:none}:host>input:focus{border-color:#4857e2}:host>input.error{border-color:#ff4d4f}\n"] }]
        }], ctorParameters: () => [], propDecorators: { text: [{
                type: Input,
                args: [{ required: true }]
            }], href: [{
                type: Input,
                args: [{ required: true }]
            }], close: [{
                type: Output
            }], update: [{
                type: Output
            }], titleInput: [{
                type: ViewChild,
                args: ['titleInput', { read: ElementRef }]
            }], urlInput: [{
                type: ViewChild,
                args: ['urlInput', { read: ElementRef }]
            }] } });
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZmxvYXQtZWRpdC1kaWFsb2cuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi9ibG9ja2Zsb3cvc3JjL3BsdWdpbnMvaW5saW5lLWxpbmsvd2lkZ2V0L2Zsb2F0LWVkaXQtZGlhbG9nLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLE9BQU8sRUFBQyx1QkFBdUIsRUFBRSxTQUFTLEVBQUUsVUFBVSxFQUFFLFlBQVksRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBQyxNQUFNLGVBQWUsQ0FBQztBQUNySCxPQUFPLEVBQUMsY0FBYyxFQUFDLE1BQU0sc0JBQXNCLENBQUM7QUFDcEQsT0FBTyxFQUFDLFdBQVcsRUFBQyxNQUFNLGdCQUFnQixDQUFDO0FBQzNDLE9BQU8sRUFBQyxLQUFLLEVBQUMsTUFBTSxlQUFlLENBQUM7Ozs7OztBQTZEcEMsTUFBTSxPQUFPLDBCQUEwQjtJQUVyQyxJQUNJLElBQUksQ0FBQyxDQUFTO1FBQ2hCLElBQUksQ0FBQyxXQUFXLEdBQUcsQ0FBQyxDQUFBO1FBQ3BCLElBQUksQ0FBQyxLQUFLLEdBQUcsQ0FBQyxDQUFBO0lBQ2hCLENBQUM7SUFDRCxJQUFJLElBQUk7UUFDTixPQUFPLElBQUksQ0FBQyxLQUFLLENBQUE7SUFDbkIsQ0FBQztJQUdELElBQ0ksSUFBSSxDQUFDLENBQVM7UUFDaEIsSUFBSSxDQUFDLFdBQVcsR0FBRyxDQUFDLENBQUE7UUFDcEIsSUFBSSxDQUFDLEtBQUssR0FBRyxDQUFDLENBQUE7SUFDaEIsQ0FBQztJQUNELElBQUksSUFBSTtRQUNOLE9BQU8sSUFBSSxDQUFDLEtBQUssQ0FBQTtJQUNuQixDQUFDO0lBS0Q7UUF2QlEsVUFBSyxHQUFXLEVBQUUsQ0FBQTtRQVVsQixVQUFLLEdBQVcsRUFBRSxDQUFBO1FBVWhCLFVBQUssR0FBRyxJQUFJLFlBQVksRUFBUSxDQUFBO1FBQ2hDLFdBQU0sR0FBRyxJQUFJLFlBQVksRUFBOEIsQ0FBQTtRQVF2RCxlQUFVLEdBQUcsS0FBSyxDQUFBO1FBQ2xCLGFBQVEsR0FBRyxLQUFLLENBQUE7UUFDaEIsZ0JBQVcsR0FBVyxFQUFFLENBQUE7UUFDeEIsZ0JBQVcsR0FBVyxFQUFFLENBQUE7SUFSbEMsQ0FBQztJQVVELGVBQWU7UUFDYixJQUFJLENBQUMsVUFBVSxDQUFDLGFBQWEsQ0FBQyxLQUFLLEVBQUUsQ0FBQTtJQUN2QyxDQUFDO0lBRUQsVUFBVTtRQUNSLElBQUksQ0FBQyxVQUFVLEdBQUcsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFBO0lBQ3JDLENBQUM7SUFFRCxTQUFTO1FBQ1AsSUFBSSxDQUFDLFFBQVEsR0FBRyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUE7SUFDMUMsQ0FBQztJQUVELE9BQU87UUFDTCxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxDQUFBO0lBQ25CLENBQUM7SUFFRCxRQUFRO1FBQ04sSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFBO1FBQ2hCLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQTtRQUNqQixJQUFJLElBQUksQ0FBQyxVQUFVO1lBQUUsT0FBTyxJQUFJLENBQUMsVUFBVSxDQUFDLGFBQWEsQ0FBQyxLQUFLLEVBQUUsQ0FBQTtRQUNqRSxJQUFJLElBQUksQ0FBQyxRQUFRO1lBQUUsT0FBTyxJQUFJLENBQUMsUUFBUSxDQUFDLGFBQWEsQ0FBQyxLQUFLLEVBQUUsQ0FBQTtRQUM3RCxJQUFHLElBQUksQ0FBQyxXQUFXLEtBQUssSUFBSSxDQUFDLElBQUksSUFBSSxJQUFJLENBQUMsV0FBVyxLQUFLLElBQUksQ0FBQyxJQUFJO1lBQUUsT0FBTyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxDQUFBO1FBQzdGLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDO1lBQ2YsSUFBSSxFQUFFLElBQUksQ0FBQyxXQUFXO1lBQ3RCLElBQUksRUFBRSxJQUFJLENBQUMsV0FBVztTQUN2QixDQUFDLENBQUE7SUFDSixDQUFDOytHQTdEVSwwQkFBMEI7bUdBQTFCLDBCQUEwQiw2UEEyQkwsVUFBVSwrRkFDWixVQUFVLDZCQXJGOUI7Ozs7Ozs7Ozs7O0dBV1QsNmVBeUNDLGNBQWMsK3FCQUNkLFdBQVc7OzRGQUlGLDBCQUEwQjtrQkEzRHRDLFNBQVM7K0JBQ0UsdUJBQXVCLFlBQ3ZCOzs7Ozs7Ozs7OztHQVdULGNBdUNXLElBQUksV0FDUDt3QkFDUCxjQUFjO3dCQUNkLFdBQVc7cUJBQ1osbUJBQ2dCLHVCQUF1QixDQUFDLE1BQU07d0RBSzNDLElBQUk7c0JBRFAsS0FBSzt1QkFBQyxFQUFDLFFBQVEsRUFBRSxJQUFJLEVBQUM7Z0JBV25CLElBQUk7c0JBRFAsS0FBSzt1QkFBQyxFQUFDLFFBQVEsRUFBRSxJQUFJLEVBQUM7Z0JBU2IsS0FBSztzQkFBZCxNQUFNO2dCQUNHLE1BQU07c0JBQWYsTUFBTTtnQkFLc0MsVUFBVTtzQkFBdEQsU0FBUzt1QkFBQyxZQUFZLEVBQUUsRUFBQyxJQUFJLEVBQUUsVUFBVSxFQUFDO2dCQUNBLFFBQVE7c0JBQWxELFNBQVM7dUJBQUMsVUFBVSxFQUFFLEVBQUMsSUFBSSxFQUFFLFVBQVUsRUFBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7Q2hhbmdlRGV0ZWN0aW9uU3RyYXRlZ3ksIENvbXBvbmVudCwgRWxlbWVudFJlZiwgRXZlbnRFbWl0dGVyLCBJbnB1dCwgT3V0cHV0LCBWaWV3Q2hpbGR9IGZyb20gXCJAYW5ndWxhci9jb3JlXCI7XG5pbXBvcnQge056QnV0dG9uTW9kdWxlfSBmcm9tIFwibmctem9ycm8tYW50ZC9idXR0b25cIjtcbmltcG9ydCB7Rm9ybXNNb2R1bGV9IGZyb20gXCJAYW5ndWxhci9mb3Jtc1wiO1xuaW1wb3J0IHtpc1VybH0gZnJvbSBcIi4uLy4uLy4uL2NvcmVcIjtcblxuQENvbXBvbmVudCh7XG4gIHNlbGVjdG9yOiAnZGl2LmZsb2F0LWVkaXQtZGlhbG9nJyxcbiAgdGVtcGxhdGU6IGBcbiAgICA8cD7moIfpopg8L3A+XG4gICAgPGlucHV0IHR5cGU9XCJ0ZXh0XCIgcGxhY2Vob2xkZXI9XCLor7fovpPlhaXmoIfpophcIiBbKG5nTW9kZWwpXT1cInVwZGF0ZWRUZXh0XCJcbiAgICAgICAgICAgW2NsYXNzLmVycm9yXT1cInRpdGxlRXJyb3JcIiAjdGl0bGVJbnB1dCAoa2V5dXAuZW50ZXIpPVwib25VcGRhdGUoKVwiIChrZXlkb3duLnRhYik9XCJ0aXRsZUlucHV0LmZvY3VzKClcIj5cbiAgICA8cD7lnLDlnYA8L3A+XG4gICAgPGlucHV0IHR5cGU9XCJ0ZXh0XCIgcGxhY2Vob2xkZXI9XCLor7fovpPlhaXlnLDlnYBcIiBbKG5nTW9kZWwpXT1cInVwZGF0ZWRIcmVmXCJcbiAgICAgICAgICAgW2NsYXNzLmVycm9yXT1cInVybEVycm9yXCIgI3VybElucHV0IChrZXl1cC5lbnRlcik9XCJvblVwZGF0ZSgpXCIgKGtleWRvd24udGFiKT1cInVybElucHV0LmZvY3VzKClcIj5cbiAgICA8ZGl2IHN0eWxlPVwid2lkdGg6IDEwMCU7IGRpc3BsYXk6IGZsZXg7IGp1c3RpZnktY29udGVudDogZmxleC1lbmQ7IGdhcDogMTZweFwiPlxuICAgICAgPGJ1dHRvbiBuei1idXR0b24gKGNsaWNrKT1cIm9uQ2xvc2UoKVwiPuWPlua2iDwvYnV0dG9uPlxuICAgICAgPGJ1dHRvbiBuei1idXR0b24gbnpUeXBlPVwicHJpbWFyeVwiIChjbGljayk9XCJvblVwZGF0ZSgpXCI+56Gu5a6aPC9idXR0b24+XG4gICAgPC9kaXY+XG4gIGAsXG4gIHN0eWxlczogW2BcbiAgICA6aG9zdCB7XG4gICAgICB3aWR0aDogNDAwcHg7XG4gICAgICBkaXNwbGF5OiBmbGV4O1xuICAgICAgZmxleC1kaXJlY3Rpb246IGNvbHVtbjtcbiAgICAgIGFsaWduLWl0ZW1zOiBmbGV4LXN0YXJ0O1xuICAgICAgcGFkZGluZzogMTZweDtcbiAgICAgIGdhcDogMTZweDtcbiAgICAgIGJvcmRlci1yYWRpdXM6IDRweDtcbiAgICAgIGJvcmRlcjogMXB4IHNvbGlkICNFNkU2RTY7XG4gICAgICBiYWNrZ3JvdW5kOiAjRkZGO1xuICAgICAgYm94LXNoYWRvdzogMHB4IDBweCAyMHB4IDBweCByZ2JhKDAsIDAsIDAsIDAuMTApO1xuICAgICAgZm9udC1zaXplOiAxNHB4O1xuICAgICAgY29sb3I6ICMzMzM7XG5cbiAgICAgID4gcCB7XG4gICAgICAgIG1hcmdpbjogMDtcbiAgICAgICAgcGFkZGluZzogMDtcbiAgICAgIH1cblxuICAgICAgPiBpbnB1dCB7XG4gICAgICAgIHdpZHRoOiAxMDAlO1xuICAgICAgICBtYXJnaW46IDA7XG4gICAgICAgIHBhZGRpbmc6IDhweDtcbiAgICAgICAgYm9yZGVyLXJhZGl1czogNHB4O1xuICAgICAgICBib3JkZXI6IDFweCBzb2xpZCAjRTZFNkU2O1xuICAgICAgICBvdXRsaW5lOiBub25lO1xuXG4gICAgICAgICY6Zm9jdXMge1xuICAgICAgICAgIGJvcmRlci1jb2xvcjogIzQ4NTdFMjtcbiAgICAgICAgfVxuXG4gICAgICAgICYuZXJyb3Ige1xuICAgICAgICAgIGJvcmRlci1jb2xvcjogI2ZmNGQ0ZjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgYF0sXG4gIHN0YW5kYWxvbmU6IHRydWUsXG4gIGltcG9ydHM6IFtcbiAgICBOekJ1dHRvbk1vZHVsZSxcbiAgICBGb3Jtc01vZHVsZSxcbiAgXSxcbiAgY2hhbmdlRGV0ZWN0aW9uOiBDaGFuZ2VEZXRlY3Rpb25TdHJhdGVneS5PblB1c2hcbn0pXG5leHBvcnQgY2xhc3MgSW5saW5lTGlua0Jsb2NrRmxvYXREaWFsb2cge1xuICBwcml2YXRlIF90ZXh0OiBzdHJpbmcgPSAnJ1xuICBASW5wdXQoe3JlcXVpcmVkOiB0cnVlfSlcbiAgc2V0IHRleHQodjogc3RyaW5nKSB7XG4gICAgdGhpcy51cGRhdGVkVGV4dCA9IHZcbiAgICB0aGlzLl90ZXh0ID0gdlxuICB9XG4gIGdldCB0ZXh0KCkge1xuICAgIHJldHVybiB0aGlzLl90ZXh0XG4gIH1cblxuICBwcml2YXRlIF9ocmVmOiBzdHJpbmcgPSAnJ1xuICBASW5wdXQoe3JlcXVpcmVkOiB0cnVlfSlcbiAgc2V0IGhyZWYodjogc3RyaW5nKSB7XG4gICAgdGhpcy51cGRhdGVkSHJlZiA9IHZcbiAgICB0aGlzLl9ocmVmID0gdlxuICB9XG4gIGdldCBocmVmKCkge1xuICAgIHJldHVybiB0aGlzLl9ocmVmXG4gIH1cblxuICBAT3V0cHV0KCkgY2xvc2UgPSBuZXcgRXZlbnRFbWl0dGVyPHZvaWQ+KClcbiAgQE91dHB1dCgpIHVwZGF0ZSA9IG5ldyBFdmVudEVtaXR0ZXI8e3RleHQ6c3RyaW5nLCBocmVmOnN0cmluZ30+KClcblxuICBjb25zdHJ1Y3RvcigpIHtcbiAgfVxuXG4gIEBWaWV3Q2hpbGQoJ3RpdGxlSW5wdXQnLCB7cmVhZDogRWxlbWVudFJlZn0pIHRpdGxlSW5wdXQhOiBFbGVtZW50UmVmPEhUTUxJbnB1dEVsZW1lbnQ+XG4gIEBWaWV3Q2hpbGQoJ3VybElucHV0Jywge3JlYWQ6IEVsZW1lbnRSZWZ9KSB1cmxJbnB1dCE6IEVsZW1lbnRSZWY8SFRNTElucHV0RWxlbWVudD5cblxuICBwcm90ZWN0ZWQgdGl0bGVFcnJvciA9IGZhbHNlXG4gIHByb3RlY3RlZCB1cmxFcnJvciA9IGZhbHNlXG4gIHByb3RlY3RlZCB1cGRhdGVkVGV4dDogc3RyaW5nID0gJydcbiAgcHJvdGVjdGVkIHVwZGF0ZWRIcmVmOiBzdHJpbmcgPSAnJ1xuXG4gIG5nQWZ0ZXJWaWV3SW5pdCgpIHtcbiAgICB0aGlzLnRpdGxlSW5wdXQubmF0aXZlRWxlbWVudC5mb2N1cygpXG4gIH1cblxuICB2ZXJpZnlUZXh0KCkge1xuICAgIHRoaXMudGl0bGVFcnJvciA9ICF0aGlzLnVwZGF0ZWRUZXh0XG4gIH1cblxuICB2ZXJpZnlVcmwoKSB7XG4gICAgdGhpcy51cmxFcnJvciA9ICFpc1VybCh0aGlzLnVwZGF0ZWRIcmVmKVxuICB9XG5cbiAgb25DbG9zZSgpIHtcbiAgICB0aGlzLmNsb3NlLmVtaXQoKVxuICB9XG5cbiAgb25VcGRhdGUoKSB7XG4gICAgdGhpcy52ZXJpZnlVcmwoKVxuICAgIHRoaXMudmVyaWZ5VGV4dCgpXG4gICAgaWYgKHRoaXMudGl0bGVFcnJvcikgcmV0dXJuIHRoaXMudGl0bGVJbnB1dC5uYXRpdmVFbGVtZW50LmZvY3VzKClcbiAgICBpZiAodGhpcy51cmxFcnJvcikgcmV0dXJuIHRoaXMudXJsSW5wdXQubmF0aXZlRWxlbWVudC5mb2N1cygpXG4gICAgaWYodGhpcy51cGRhdGVkVGV4dCA9PT0gdGhpcy50ZXh0ICYmIHRoaXMudXBkYXRlZEhyZWYgPT09IHRoaXMuaHJlZikgcmV0dXJuIHRoaXMuY2xvc2UuZW1pdCgpXG4gICAgdGhpcy51cGRhdGUuZW1pdCh7XG4gICAgICB0ZXh0OiB0aGlzLnVwZGF0ZWRUZXh0LFxuICAgICAgaHJlZjogdGhpcy51cGRhdGVkSHJlZlxuICAgIH0pXG4gIH1cblxufVxuIl19