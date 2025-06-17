import { ChangeDetectionStrategy, Component, ElementRef, EventEmitter, Input, Output, ViewChild } from "@angular/core";
import { NzButtonModule } from "ng-zorro-antd/button";
import { FormsModule } from "@angular/forms";
import { isUrl } from "../../core";
import { NzRadioModule } from "ng-zorro-antd/radio";
import * as i0 from "@angular/core";
import * as i1 from "ng-zorro-antd/button";
import * as i2 from "ng-zorro-antd/core/transition-patch";
import * as i3 from "ng-zorro-antd/core/wave";
import * as i4 from "ng-zorro-antd/radio";
import * as i5 from "@angular/forms";
export class LinkBlockFloatDialog {
    constructor() {
        this.close = new EventEmitter();
        this.update = new EventEmitter();
        this.titleError = false;
        this.urlError = false;
        this.updatedText = '';
        this.updatedHref = '';
        this.appearanceUpdated = false;
    }
    onTextUpdate(e) {
        this.updatedText = e.target.value;
        this.titleError = !this.updatedText;
    }
    onHrefUpdate(e) {
        this.updatedHref = e.target.value;
        this.urlError = !isUrl(this.updatedHref);
    }
    onClose() {
        this.close.emit();
    }
    onAppearanceUpdate(value) {
        this.appearanceUpdated = value !== this.attrs?.appearance;
    }
    onUpdate() {
        if (this.titleError)
            return this.titleInput.nativeElement.focus();
        if (this.urlError)
            return this.urlInput.nativeElement.focus();
        this.update.emit({
            text: this.updatedText || this.attrs?.text,
            href: this.updatedHref || this.attrs?.href,
            appearance: this.appearanceUpdated ? this.attrs?.appearance === 'card' ? 'text' : 'card' : this.attrs?.appearance
        });
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: LinkBlockFloatDialog, deps: [], target: i0.ɵɵFactoryTarget.Component }); }
    static { this.ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "14.0.0", version: "17.3.12", type: LinkBlockFloatDialog, isStandalone: true, selector: "div.float-edit-dialog", inputs: { attrs: "attrs" }, outputs: { close: "close", update: "update" }, viewQueries: [{ propertyName: "titleInput", first: true, predicate: ["titleInput"], descendants: true, read: ElementRef }, { propertyName: "urlInput", first: true, predicate: ["urlInput"], descendants: true, read: ElementRef }], ngImport: i0, template: `
    <p>标题</p>
    <input type="text" placeholder="请输入标题" [value]="attrs?.text" (input)="onTextUpdate($event)"
           [class.error]="titleError" #titleInput>
    <p>地址</p>
    <input type="text" placeholder="请输入地址" [value]="attrs?.href" (input)="onHrefUpdate($event)"
           [class.error]="urlError" #urlInput>
    <p>展现</p>
    <nz-radio-group [ngModel]="attrs?.appearance" (ngModelChange)="onAppearanceUpdate($event)">
      <label nz-radio nzValue="text">链接</label>
      <label nz-radio nzValue="card">卡片</label>
    </nz-radio-group>
    <div style="width: 100%; display: flex; justify-content: flex-end; gap: 16px">
      <button nz-button (click)="onClose()">取消</button>
      <button nz-button nzType="primary" (click)="onUpdate()">确定</button>
    </div>
  `, isInline: true, styles: [":host{width:400px;display:flex;flex-direction:column;align-items:flex-start;padding:16px;gap:16px;border-radius:4px;border:1px solid #E6E6E6;background:#fff;box-shadow:0 0 20px #0000001a;font-size:14px;color:#333}:host>p{margin:0;padding:0}:host>input{width:100%;margin:0;padding:8px;border-radius:4px;border:1px solid #E6E6E6}:host>input:focus{border-color:#4857e2}:host>input.error{border-color:#ff4d4f}\n"], dependencies: [{ kind: "ngmodule", type: NzButtonModule }, { kind: "component", type: i1.NzButtonComponent, selector: "button[nz-button], a[nz-button]", inputs: ["nzBlock", "nzGhost", "nzSearch", "nzLoading", "nzDanger", "disabled", "tabIndex", "nzType", "nzShape", "nzSize"], exportAs: ["nzButton"] }, { kind: "directive", type: i2.ɵNzTransitionPatchDirective, selector: "[nz-button], nz-button-group, [nz-icon], [nz-menu-item], [nz-submenu], nz-select-top-control, nz-select-placeholder, nz-input-group", inputs: ["hidden"] }, { kind: "directive", type: i3.NzWaveDirective, selector: "[nz-wave],button[nz-button]:not([nzType=\"link\"]):not([nzType=\"text\"])", inputs: ["nzWaveExtraNode"], exportAs: ["nzWave"] }, { kind: "ngmodule", type: NzRadioModule }, { kind: "component", type: i4.NzRadioComponent, selector: "[nz-radio],[nz-radio-button]", inputs: ["nzValue", "nzDisabled", "nzAutoFocus", "nz-radio-button"], exportAs: ["nzRadio"] }, { kind: "component", type: i4.NzRadioGroupComponent, selector: "nz-radio-group", inputs: ["nzDisabled", "nzButtonStyle", "nzSize", "nzName"], exportAs: ["nzRadioGroup"] }, { kind: "ngmodule", type: FormsModule }, { kind: "directive", type: i5.NgControlStatus, selector: "[formControlName],[ngModel],[formControl]" }, { kind: "directive", type: i5.NgModel, selector: "[ngModel]:not([formControlName]):not([formControl])", inputs: ["name", "disabled", "ngModel", "ngModelOptions"], outputs: ["ngModelChange"], exportAs: ["ngModel"] }], changeDetection: i0.ChangeDetectionStrategy.OnPush }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: LinkBlockFloatDialog, decorators: [{
            type: Component,
            args: [{ selector: 'div.float-edit-dialog', template: `
    <p>标题</p>
    <input type="text" placeholder="请输入标题" [value]="attrs?.text" (input)="onTextUpdate($event)"
           [class.error]="titleError" #titleInput>
    <p>地址</p>
    <input type="text" placeholder="请输入地址" [value]="attrs?.href" (input)="onHrefUpdate($event)"
           [class.error]="urlError" #urlInput>
    <p>展现</p>
    <nz-radio-group [ngModel]="attrs?.appearance" (ngModelChange)="onAppearanceUpdate($event)">
      <label nz-radio nzValue="text">链接</label>
      <label nz-radio nzValue="card">卡片</label>
    </nz-radio-group>
    <div style="width: 100%; display: flex; justify-content: flex-end; gap: 16px">
      <button nz-button (click)="onClose()">取消</button>
      <button nz-button nzType="primary" (click)="onUpdate()">确定</button>
    </div>
  `, standalone: true, imports: [
                        NzButtonModule,
                        NzRadioModule,
                        FormsModule,
                    ], changeDetection: ChangeDetectionStrategy.OnPush, styles: [":host{width:400px;display:flex;flex-direction:column;align-items:flex-start;padding:16px;gap:16px;border-radius:4px;border:1px solid #E6E6E6;background:#fff;box-shadow:0 0 20px #0000001a;font-size:14px;color:#333}:host>p{margin:0;padding:0}:host>input{width:100%;margin:0;padding:8px;border-radius:4px;border:1px solid #E6E6E6}:host>input:focus{border-color:#4857e2}:host>input.error{border-color:#ff4d4f}\n"] }]
        }], propDecorators: { attrs: [{
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdC1kaWFsb2cuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi9ibG9ja2Zsb3cvc3JjL2Jsb2Nrcy9saW5rL2VkaXQtZGlhbG9nLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLE9BQU8sRUFBQyx1QkFBdUIsRUFBRSxTQUFTLEVBQUUsVUFBVSxFQUFFLFlBQVksRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBQyxNQUFNLGVBQWUsQ0FBQztBQUNySCxPQUFPLEVBQUMsY0FBYyxFQUFDLE1BQU0sc0JBQXNCLENBQUM7QUFDcEQsT0FBTyxFQUFDLFdBQVcsRUFBQyxNQUFNLGdCQUFnQixDQUFDO0FBRTNDLE9BQU8sRUFBQyxLQUFLLEVBQUMsTUFBTSxZQUFZLENBQUM7QUFDakMsT0FBTyxFQUFDLGFBQWEsRUFBQyxNQUFNLHFCQUFxQixDQUFDOzs7Ozs7O0FBa0VsRCxNQUFNLE9BQU8sb0JBQW9CO0lBaEVqQztRQW1FWSxVQUFLLEdBQUcsSUFBSSxZQUFZLEVBQVEsQ0FBQTtRQUNoQyxXQUFNLEdBQUcsSUFBSSxZQUFZLEVBQTRCLENBQUE7UUFLckQsZUFBVSxHQUFHLEtBQUssQ0FBQTtRQUNsQixhQUFRLEdBQUcsS0FBSyxDQUFBO1FBQ2hCLGdCQUFXLEdBQVcsRUFBRSxDQUFBO1FBQ3hCLGdCQUFXLEdBQVcsRUFBRSxDQUFBO1FBRXhCLHNCQUFpQixHQUFHLEtBQUssQ0FBQTtLQThCcEM7SUE1QkMsWUFBWSxDQUFDLENBQVE7UUFDbkIsSUFBSSxDQUFDLFdBQVcsR0FBSSxDQUFDLENBQUMsTUFBMkIsQ0FBQyxLQUFLLENBQUE7UUFDdkQsSUFBSSxDQUFDLFVBQVUsR0FBRyxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUE7SUFDckMsQ0FBQztJQUVELFlBQVksQ0FBQyxDQUFRO1FBQ25CLElBQUksQ0FBQyxXQUFXLEdBQUksQ0FBQyxDQUFDLE1BQTJCLENBQUMsS0FBSyxDQUFBO1FBQ3ZELElBQUksQ0FBQyxRQUFRLEdBQUcsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFBO0lBQzFDLENBQUM7SUFFRCxPQUFPO1FBQ0wsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQTtJQUNuQixDQUFDO0lBRUQsa0JBQWtCLENBQUMsS0FBNkM7UUFDOUQsSUFBSSxDQUFDLGlCQUFpQixHQUFHLEtBQUssS0FBSyxJQUFJLENBQUMsS0FBSyxFQUFFLFVBQVUsQ0FBQTtJQUMzRCxDQUFDO0lBRUQsUUFBUTtRQUNOLElBQUksSUFBSSxDQUFDLFVBQVU7WUFBRSxPQUFPLElBQUksQ0FBQyxVQUFVLENBQUMsYUFBYSxDQUFDLEtBQUssRUFBRSxDQUFBO1FBQ2pFLElBQUksSUFBSSxDQUFDLFFBQVE7WUFBRSxPQUFPLElBQUksQ0FBQyxRQUFRLENBQUMsYUFBYSxDQUFDLEtBQUssRUFBRSxDQUFBO1FBQzdELElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDO1lBQ2YsSUFBSSxFQUFFLElBQUksQ0FBQyxXQUFXLElBQUksSUFBSSxDQUFDLEtBQUssRUFBRSxJQUFLO1lBQzNDLElBQUksRUFBRSxJQUFJLENBQUMsV0FBVyxJQUFJLElBQUksQ0FBQyxLQUFLLEVBQUUsSUFBSztZQUMzQyxVQUFVLEVBQUUsSUFBSSxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFLFVBQVUsS0FBSyxNQUFNLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFLFVBQVc7U0FDbkgsQ0FBQyxDQUFBO0lBQ0osQ0FBQzsrR0ExQ1Usb0JBQW9CO21HQUFwQixvQkFBb0IsaVBBTUMsVUFBVSwrRkFDWixVQUFVLDZCQXJFOUI7Ozs7Ozs7Ozs7Ozs7Ozs7R0FnQlQsZ2VBd0NDLGNBQWMsK3FCQUNkLGFBQWEsa1lBQ2IsV0FBVzs7NEZBSUYsb0JBQW9CO2tCQWhFaEMsU0FBUzsrQkFDRSx1QkFBdUIsWUFDdkI7Ozs7Ozs7Ozs7Ozs7Ozs7R0FnQlQsY0FzQ1csSUFBSSxXQUNQO3dCQUNQLGNBQWM7d0JBQ2QsYUFBYTt3QkFDYixXQUFXO3FCQUNaLG1CQUNnQix1QkFBdUIsQ0FBQyxNQUFNOzhCQUd0QixLQUFLO3NCQUE3QixLQUFLO3VCQUFDLEVBQUMsUUFBUSxFQUFFLElBQUksRUFBQztnQkFFYixLQUFLO3NCQUFkLE1BQU07Z0JBQ0csTUFBTTtzQkFBZixNQUFNO2dCQUVzQyxVQUFVO3NCQUF0RCxTQUFTO3VCQUFDLFlBQVksRUFBRSxFQUFDLElBQUksRUFBRSxVQUFVLEVBQUM7Z0JBQ0EsUUFBUTtzQkFBbEQsU0FBUzt1QkFBQyxVQUFVLEVBQUUsRUFBQyxJQUFJLEVBQUUsVUFBVSxFQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHtDaGFuZ2VEZXRlY3Rpb25TdHJhdGVneSwgQ29tcG9uZW50LCBFbGVtZW50UmVmLCBFdmVudEVtaXR0ZXIsIElucHV0LCBPdXRwdXQsIFZpZXdDaGlsZH0gZnJvbSBcIkBhbmd1bGFyL2NvcmVcIjtcbmltcG9ydCB7TnpCdXR0b25Nb2R1bGV9IGZyb20gXCJuZy16b3Jyby1hbnRkL2J1dHRvblwiO1xuaW1wb3J0IHtGb3Jtc01vZHVsZX0gZnJvbSBcIkBhbmd1bGFyL2Zvcm1zXCI7XG5pbXBvcnQge0lMaW5rQmxvY2tNb2RlbH0gZnJvbSBcIi4vdHlwZVwiO1xuaW1wb3J0IHtpc1VybH0gZnJvbSBcIi4uLy4uL2NvcmVcIjtcbmltcG9ydCB7TnpSYWRpb01vZHVsZX0gZnJvbSBcIm5nLXpvcnJvLWFudGQvcmFkaW9cIjtcblxuQENvbXBvbmVudCh7XG4gIHNlbGVjdG9yOiAnZGl2LmZsb2F0LWVkaXQtZGlhbG9nJyxcbiAgdGVtcGxhdGU6IGBcbiAgICA8cD7moIfpopg8L3A+XG4gICAgPGlucHV0IHR5cGU9XCJ0ZXh0XCIgcGxhY2Vob2xkZXI9XCLor7fovpPlhaXmoIfpophcIiBbdmFsdWVdPVwiYXR0cnM/LnRleHRcIiAoaW5wdXQpPVwib25UZXh0VXBkYXRlKCRldmVudClcIlxuICAgICAgICAgICBbY2xhc3MuZXJyb3JdPVwidGl0bGVFcnJvclwiICN0aXRsZUlucHV0PlxuICAgIDxwPuWcsOWdgDwvcD5cbiAgICA8aW5wdXQgdHlwZT1cInRleHRcIiBwbGFjZWhvbGRlcj1cIuivt+i+k+WFpeWcsOWdgFwiIFt2YWx1ZV09XCJhdHRycz8uaHJlZlwiIChpbnB1dCk9XCJvbkhyZWZVcGRhdGUoJGV2ZW50KVwiXG4gICAgICAgICAgIFtjbGFzcy5lcnJvcl09XCJ1cmxFcnJvclwiICN1cmxJbnB1dD5cbiAgICA8cD7lsZXnjrA8L3A+XG4gICAgPG56LXJhZGlvLWdyb3VwIFtuZ01vZGVsXT1cImF0dHJzPy5hcHBlYXJhbmNlXCIgKG5nTW9kZWxDaGFuZ2UpPVwib25BcHBlYXJhbmNlVXBkYXRlKCRldmVudClcIj5cbiAgICAgIDxsYWJlbCBuei1yYWRpbyBuelZhbHVlPVwidGV4dFwiPumTvuaOpTwvbGFiZWw+XG4gICAgICA8bGFiZWwgbnotcmFkaW8gbnpWYWx1ZT1cImNhcmRcIj7ljaHniYc8L2xhYmVsPlxuICAgIDwvbnotcmFkaW8tZ3JvdXA+XG4gICAgPGRpdiBzdHlsZT1cIndpZHRoOiAxMDAlOyBkaXNwbGF5OiBmbGV4OyBqdXN0aWZ5LWNvbnRlbnQ6IGZsZXgtZW5kOyBnYXA6IDE2cHhcIj5cbiAgICAgIDxidXR0b24gbnotYnV0dG9uIChjbGljayk9XCJvbkNsb3NlKClcIj7lj5bmtog8L2J1dHRvbj5cbiAgICAgIDxidXR0b24gbnotYnV0dG9uIG56VHlwZT1cInByaW1hcnlcIiAoY2xpY2spPVwib25VcGRhdGUoKVwiPuehruWumjwvYnV0dG9uPlxuICAgIDwvZGl2PlxuICBgLFxuICBzdHlsZXM6IFtgXG4gICAgOmhvc3Qge1xuICAgICAgd2lkdGg6IDQwMHB4O1xuICAgICAgZGlzcGxheTogZmxleDtcbiAgICAgIGZsZXgtZGlyZWN0aW9uOiBjb2x1bW47XG4gICAgICBhbGlnbi1pdGVtczogZmxleC1zdGFydDtcbiAgICAgIHBhZGRpbmc6IDE2cHg7XG4gICAgICBnYXA6IDE2cHg7XG4gICAgICBib3JkZXItcmFkaXVzOiA0cHg7XG4gICAgICBib3JkZXI6IDFweCBzb2xpZCAjRTZFNkU2O1xuICAgICAgYmFja2dyb3VuZDogI0ZGRjtcbiAgICAgIGJveC1zaGFkb3c6IDBweCAwcHggMjBweCAwcHggcmdiYSgwLCAwLCAwLCAwLjEwKTtcbiAgICAgIGZvbnQtc2l6ZTogMTRweDtcbiAgICAgIGNvbG9yOiAjMzMzO1xuXG4gICAgICA+IHAge1xuICAgICAgICBtYXJnaW46IDA7XG4gICAgICAgIHBhZGRpbmc6IDA7XG4gICAgICB9XG5cbiAgICAgID4gaW5wdXQge1xuICAgICAgICB3aWR0aDogMTAwJTtcbiAgICAgICAgbWFyZ2luOiAwO1xuICAgICAgICBwYWRkaW5nOiA4cHg7XG4gICAgICAgIGJvcmRlci1yYWRpdXM6IDRweDtcbiAgICAgICAgYm9yZGVyOiAxcHggc29saWQgI0U2RTZFNjtcblxuICAgICAgICAmOmZvY3VzIHtcbiAgICAgICAgICBib3JkZXItY29sb3I6ICM0ODU3RTI7XG4gICAgICAgIH1cblxuICAgICAgICAmLmVycm9yIHtcbiAgICAgICAgICBib3JkZXItY29sb3I6ICNmZjRkNGY7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIGBdLFxuICBzdGFuZGFsb25lOiB0cnVlLFxuICBpbXBvcnRzOiBbXG4gICAgTnpCdXR0b25Nb2R1bGUsXG4gICAgTnpSYWRpb01vZHVsZSxcbiAgICBGb3Jtc01vZHVsZSxcbiAgXSxcbiAgY2hhbmdlRGV0ZWN0aW9uOiBDaGFuZ2VEZXRlY3Rpb25TdHJhdGVneS5PblB1c2hcbn0pXG5leHBvcnQgY2xhc3MgTGlua0Jsb2NrRmxvYXREaWFsb2cge1xuICBASW5wdXQoe3JlcXVpcmVkOiB0cnVlfSkgYXR0cnM/OiBJTGlua0Jsb2NrTW9kZWxbJ3Byb3BzJ11cblxuICBAT3V0cHV0KCkgY2xvc2UgPSBuZXcgRXZlbnRFbWl0dGVyPHZvaWQ+KClcbiAgQE91dHB1dCgpIHVwZGF0ZSA9IG5ldyBFdmVudEVtaXR0ZXI8SUxpbmtCbG9ja01vZGVsWydwcm9wcyddPigpXG5cbiAgQFZpZXdDaGlsZCgndGl0bGVJbnB1dCcsIHtyZWFkOiBFbGVtZW50UmVmfSkgdGl0bGVJbnB1dCE6IEVsZW1lbnRSZWY8SFRNTElucHV0RWxlbWVudD5cbiAgQFZpZXdDaGlsZCgndXJsSW5wdXQnLCB7cmVhZDogRWxlbWVudFJlZn0pIHVybElucHV0ITogRWxlbWVudFJlZjxIVE1MSW5wdXRFbGVtZW50PlxuXG4gIHByb3RlY3RlZCB0aXRsZUVycm9yID0gZmFsc2VcbiAgcHJvdGVjdGVkIHVybEVycm9yID0gZmFsc2VcbiAgcHJvdGVjdGVkIHVwZGF0ZWRUZXh0OiBzdHJpbmcgPSAnJ1xuICBwcm90ZWN0ZWQgdXBkYXRlZEhyZWY6IHN0cmluZyA9ICcnXG5cbiAgcHJvdGVjdGVkIGFwcGVhcmFuY2VVcGRhdGVkID0gZmFsc2VcblxuICBvblRleHRVcGRhdGUoZTogRXZlbnQpIHtcbiAgICB0aGlzLnVwZGF0ZWRUZXh0ID0gKGUudGFyZ2V0IGFzIEhUTUxJbnB1dEVsZW1lbnQpLnZhbHVlXG4gICAgdGhpcy50aXRsZUVycm9yID0gIXRoaXMudXBkYXRlZFRleHRcbiAgfVxuXG4gIG9uSHJlZlVwZGF0ZShlOiBFdmVudCkge1xuICAgIHRoaXMudXBkYXRlZEhyZWYgPSAoZS50YXJnZXQgYXMgSFRNTElucHV0RWxlbWVudCkudmFsdWVcbiAgICB0aGlzLnVybEVycm9yID0gIWlzVXJsKHRoaXMudXBkYXRlZEhyZWYpXG4gIH1cblxuICBvbkNsb3NlKCkge1xuICAgIHRoaXMuY2xvc2UuZW1pdCgpXG4gIH1cblxuICBvbkFwcGVhcmFuY2VVcGRhdGUodmFsdWU6IElMaW5rQmxvY2tNb2RlbFsncHJvcHMnXVsnYXBwZWFyYW5jZSddKSB7XG4gICAgdGhpcy5hcHBlYXJhbmNlVXBkYXRlZCA9IHZhbHVlICE9PSB0aGlzLmF0dHJzPy5hcHBlYXJhbmNlXG4gIH1cblxuICBvblVwZGF0ZSgpIHtcbiAgICBpZiAodGhpcy50aXRsZUVycm9yKSByZXR1cm4gdGhpcy50aXRsZUlucHV0Lm5hdGl2ZUVsZW1lbnQuZm9jdXMoKVxuICAgIGlmICh0aGlzLnVybEVycm9yKSByZXR1cm4gdGhpcy51cmxJbnB1dC5uYXRpdmVFbGVtZW50LmZvY3VzKClcbiAgICB0aGlzLnVwZGF0ZS5lbWl0KHtcbiAgICAgIHRleHQ6IHRoaXMudXBkYXRlZFRleHQgfHwgdGhpcy5hdHRycz8udGV4dCEsXG4gICAgICBocmVmOiB0aGlzLnVwZGF0ZWRIcmVmIHx8IHRoaXMuYXR0cnM/LmhyZWYhLFxuICAgICAgYXBwZWFyYW5jZTogdGhpcy5hcHBlYXJhbmNlVXBkYXRlZCA/IHRoaXMuYXR0cnM/LmFwcGVhcmFuY2UgPT09ICdjYXJkJyA/ICd0ZXh0JyA6ICdjYXJkJyA6IHRoaXMuYXR0cnM/LmFwcGVhcmFuY2UhXG4gICAgfSlcbiAgfVxuXG59XG4iXX0=