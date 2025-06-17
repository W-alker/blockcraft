import { ChangeDetectionStrategy, Component, HostBinding } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { NgIf } from "@angular/common";
import { NzDatePickerModule } from "ng-zorro-antd/date-picker";
import { EditableBlock } from "../../core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import * as i0 from "@angular/core";
export class TodoListBlock extends EditableBlock {
    constructor() {
        super(...arguments);
        this.placeholder = '待办事项';
        this._date = null;
        this._checked = false;
    }
    ngOnInit() {
        super.ngOnInit();
        this.setCheck();
    }
    ngAfterViewInit() {
        super.ngAfterViewInit();
        this.model.update$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(v => {
            if (v.type === 'props') {
                this._checked !== this.props.checked && this.setCheck();
            }
        });
    }
    setCheck() {
        this._checked = this.props.checked;
        this.cdr.markForCheck();
    }
    toggleCheck() {
        if (this.controller.readonly$.value)
            return;
        this._checked = !this._checked;
        this.setProp('checked', this._checked);
    }
    openDatePicker() {
        this._date = this.props.endTime ? new Date(this.props.endTime) : new Date();
    }
    onDatePickerChange(e) {
        e ? this.setProp('endTime', e.getTime()) : this.deleteProp('endTime');
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: TodoListBlock, deps: null, target: i0.ɵɵFactoryTarget.Component }); }
    static { this.ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "14.0.0", version: "17.3.12", type: TodoListBlock, isStandalone: true, selector: "div.todo-list", host: { properties: { "class.checked": "this._checked" } }, usesInheritance: true, ngImport: i0, template: `
      <span [class]="['todo-list__icon', 'bf_icon', props.checked ? 'bf_xuanzhong-fill' : 'bf_weixuanzhong']"
            [class.checked]="props.checked" (click)="toggleCheck()"></span>
      <div class="editable-container"></div>
  `, isInline: true, styles: [":host{position:relative;padding-left:1.2em}:host.selected{background-color:var(--bf-selected)}.todo-list__icon{position:absolute;left:0;cursor:pointer;color:var(--bf-anchor);font-size:1.1em;line-height:var(--bf-lh)}:host.checked .todo-list__icon{color:var(--bf-anchor)}:host .editable-container{flex:1}:host.checked .editable-container{text-decoration:line-through;opacity:.6}.todo-list__date-pick-icon{cursor:pointer}.todo-list__date-pick-icon:hover{color:#4857e2}\n"], dependencies: [{ kind: "ngmodule", type: FormsModule }, { kind: "ngmodule", type: NzDatePickerModule }], changeDetection: i0.ChangeDetectionStrategy.OnPush }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: TodoListBlock, decorators: [{
            type: Component,
            args: [{ selector: 'div.todo-list', template: `
      <span [class]="['todo-list__icon', 'bf_icon', props.checked ? 'bf_xuanzhong-fill' : 'bf_weixuanzhong']"
            [class.checked]="props.checked" (click)="toggleCheck()"></span>
      <div class="editable-container"></div>
  `, standalone: true, imports: [
                        FormsModule,
                        NgIf,
                        NzDatePickerModule
                    ], changeDetection: ChangeDetectionStrategy.OnPush, styles: [":host{position:relative;padding-left:1.2em}:host.selected{background-color:var(--bf-selected)}.todo-list__icon{position:absolute;left:0;cursor:pointer;color:var(--bf-anchor);font-size:1.1em;line-height:var(--bf-lh)}:host.checked .todo-list__icon{color:var(--bf-anchor)}:host .editable-container{flex:1}:host.checked .editable-container{text-decoration:line-through;opacity:.6}.todo-list__date-pick-icon{cursor:pointer}.todo-list__date-pick-icon:hover{color:#4857e2}\n"] }]
        }], propDecorators: { _checked: [{
                type: HostBinding,
                args: ['class.checked']
            }] } });
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidG9kby1saXN0LmJsb2NrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vYmxvY2tmbG93L3NyYy9ibG9ja3MvdG9kby1saXN0L3RvZG8tbGlzdC5ibG9jay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxPQUFPLEVBQUMsdUJBQXVCLEVBQUUsU0FBUyxFQUFFLFdBQVcsRUFBQyxNQUFNLGVBQWUsQ0FBQztBQUM5RSxPQUFPLEVBQUMsV0FBVyxFQUFDLE1BQU0sZ0JBQWdCLENBQUM7QUFDM0MsT0FBTyxFQUFDLElBQUksRUFBQyxNQUFNLGlCQUFpQixDQUFDO0FBQ3JDLE9BQU8sRUFBQyxrQkFBa0IsRUFBQyxNQUFNLDJCQUEyQixDQUFDO0FBQzdELE9BQU8sRUFBQyxhQUFhLEVBQUMsTUFBTSxZQUFZLENBQUM7QUFFekMsT0FBTyxFQUFDLGtCQUFrQixFQUFDLE1BQU0sNEJBQTRCLENBQUM7O0FBeUQ5RCxNQUFNLE9BQU8sYUFBYyxTQUFRLGFBQWtDO0lBdkRyRTs7UUF3RFcsZ0JBQVcsR0FBRyxNQUFNLENBQUE7UUFFbkIsVUFBSyxHQUFnQixJQUFJLENBQUE7UUFHM0IsYUFBUSxHQUFHLEtBQUssQ0FBQTtLQW9DekI7SUFsQ1UsUUFBUTtRQUNmLEtBQUssQ0FBQyxRQUFRLEVBQUUsQ0FBQTtRQUNoQixJQUFJLENBQUMsUUFBUSxFQUFFLENBQUE7SUFDakIsQ0FBQztJQUVRLGVBQWU7UUFDdEIsS0FBSyxDQUFDLGVBQWUsRUFBRSxDQUFDO1FBRXhCLElBQUksQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLEVBQUU7WUFDekUsSUFBRyxDQUFDLENBQUMsSUFBSSxLQUFLLE9BQU8sRUFBRSxDQUFDO2dCQUN0QixJQUFJLENBQUMsUUFBUSxLQUFLLElBQUksQ0FBQyxLQUFLLENBQUMsT0FBTyxJQUFJLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQTtZQUN6RCxDQUFDO1FBQ0gsQ0FBQyxDQUFDLENBQUE7SUFDSixDQUFDO0lBRUQsUUFBUTtRQUNOLElBQUksQ0FBQyxRQUFRLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUE7UUFDbEMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxZQUFZLEVBQUUsQ0FBQTtJQUN6QixDQUFDO0lBRUQsV0FBVztRQUNULElBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxTQUFTLENBQUMsS0FBSztZQUFFLE9BQU07UUFDMUMsSUFBSSxDQUFDLFFBQVEsR0FBRyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUE7UUFDOUIsSUFBSSxDQUFDLE9BQU8sQ0FBQyxTQUFTLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFBO0lBQ3hDLENBQUM7SUFFRCxjQUFjO1FBQ1osSUFBSSxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsSUFBSSxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxJQUFJLEVBQUUsQ0FBQTtJQUM3RSxDQUFDO0lBRUQsa0JBQWtCLENBQUMsQ0FBTztRQUN4QixDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxDQUFBO0lBQ3ZFLENBQUM7K0dBeENVLGFBQWE7bUdBQWIsYUFBYSw0SkFyRGQ7Ozs7R0FJVCw0aEJBMkNDLFdBQVcsOEJBRVgsa0JBQWtCOzs0RkFJVCxhQUFhO2tCQXZEekIsU0FBUzsrQkFDRSxlQUFlLFlBQ2Y7Ozs7R0FJVCxjQXlDVyxJQUFJLFdBQ1A7d0JBQ1AsV0FBVzt3QkFDWCxJQUFJO3dCQUNKLGtCQUFrQjtxQkFDbkIsbUJBQ2dCLHVCQUF1QixDQUFDLE1BQU07OEJBUXZDLFFBQVE7c0JBRGYsV0FBVzt1QkFBQyxlQUFlIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHtDaGFuZ2VEZXRlY3Rpb25TdHJhdGVneSwgQ29tcG9uZW50LCBIb3N0QmluZGluZ30gZnJvbSBcIkBhbmd1bGFyL2NvcmVcIjtcbmltcG9ydCB7Rm9ybXNNb2R1bGV9IGZyb20gXCJAYW5ndWxhci9mb3Jtc1wiO1xuaW1wb3J0IHtOZ0lmfSBmcm9tIFwiQGFuZ3VsYXIvY29tbW9uXCI7XG5pbXBvcnQge056RGF0ZVBpY2tlck1vZHVsZX0gZnJvbSBcIm5nLXpvcnJvLWFudGQvZGF0ZS1waWNrZXJcIjtcbmltcG9ydCB7RWRpdGFibGVCbG9ja30gZnJvbSBcIi4uLy4uL2NvcmVcIjtcbmltcG9ydCB7SVRvZG9MaXN0QmxvY2tNb2RlbH0gZnJvbSBcIi4vdHlwZVwiO1xuaW1wb3J0IHt0YWtlVW50aWxEZXN0cm95ZWR9IGZyb20gXCJAYW5ndWxhci9jb3JlL3J4anMtaW50ZXJvcFwiO1xuXG5AQ29tcG9uZW50KHtcbiAgc2VsZWN0b3I6ICdkaXYudG9kby1saXN0JyxcbiAgdGVtcGxhdGU6IGBcbiAgICAgIDxzcGFuIFtjbGFzc109XCJbJ3RvZG8tbGlzdF9faWNvbicsICdiZl9pY29uJywgcHJvcHMuY2hlY2tlZCA/ICdiZl94dWFuemhvbmctZmlsbCcgOiAnYmZfd2VpeHVhbnpob25nJ11cIlxuICAgICAgICAgICAgW2NsYXNzLmNoZWNrZWRdPVwicHJvcHMuY2hlY2tlZFwiIChjbGljayk9XCJ0b2dnbGVDaGVjaygpXCI+PC9zcGFuPlxuICAgICAgPGRpdiBjbGFzcz1cImVkaXRhYmxlLWNvbnRhaW5lclwiPjwvZGl2PlxuICBgLFxuICBzdHlsZXM6IFtgXG4gICAgOmhvc3Qge1xuICAgICAgcG9zaXRpb246IHJlbGF0aXZlO1xuICAgICAgcGFkZGluZy1sZWZ0OiAxLjJlbTtcblxuICAgICAgJi5zZWxlY3RlZCB7XG4gICAgICAgIGJhY2tncm91bmQtY29sb3I6IHZhcigtLWJmLXNlbGVjdGVkKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAudG9kby1saXN0X19pY29uIHtcbiAgICAgIHBvc2l0aW9uOiBhYnNvbHV0ZTtcbiAgICAgIGxlZnQ6IDA7XG4gICAgICBjdXJzb3I6IHBvaW50ZXI7XG4gICAgICBjb2xvcjogdmFyKC0tYmYtYW5jaG9yKTtcbiAgICAgIGZvbnQtc2l6ZTogMS4xZW07XG4gICAgICBsaW5lLWhlaWdodDogdmFyKC0tYmYtbGgpO1xuICAgIH1cblxuICAgIDpob3N0LmNoZWNrZWQgLnRvZG8tbGlzdF9faWNvbiB7XG4gICAgICBjb2xvcjogdmFyKC0tYmYtYW5jaG9yKTtcbiAgICB9XG5cbiAgICA6aG9zdCAuZWRpdGFibGUtY29udGFpbmVyIHtcbiAgICAgIGZsZXg6IDE7XG4gICAgfVxuXG4gICAgOmhvc3QuY2hlY2tlZCAuZWRpdGFibGUtY29udGFpbmVyIHtcbiAgICAgIHRleHQtZGVjb3JhdGlvbjogbGluZS10aHJvdWdoO1xuICAgICAgb3BhY2l0eTogLjY7XG4gICAgfVxuXG4gICAgLnRvZG8tbGlzdF9fZGF0ZS1waWNrLWljb24ge1xuICAgICAgY3Vyc29yOiBwb2ludGVyO1xuICAgIH1cblxuICAgIC50b2RvLWxpc3RfX2RhdGUtcGljay1pY29uOmhvdmVyIHtcbiAgICAgIGNvbG9yOiAjNDg1N0UyO1xuICAgIH1cbiAgYF0sXG4gIHN0YW5kYWxvbmU6IHRydWUsXG4gIGltcG9ydHM6IFtcbiAgICBGb3Jtc01vZHVsZSxcbiAgICBOZ0lmLFxuICAgIE56RGF0ZVBpY2tlck1vZHVsZVxuICBdLFxuICBjaGFuZ2VEZXRlY3Rpb246IENoYW5nZURldGVjdGlvblN0cmF0ZWd5Lk9uUHVzaFxufSlcbmV4cG9ydCBjbGFzcyBUb2RvTGlzdEJsb2NrIGV4dGVuZHMgRWRpdGFibGVCbG9jazxJVG9kb0xpc3RCbG9ja01vZGVsPiB7XG4gIG92ZXJyaWRlIHBsYWNlaG9sZGVyID0gJ+W+heWKnuS6i+mhuSdcblxuICBwcm90ZWN0ZWQgX2RhdGU6IERhdGUgfCBudWxsID0gbnVsbFxuXG4gIEBIb3N0QmluZGluZygnY2xhc3MuY2hlY2tlZCcpXG4gIHByaXZhdGUgX2NoZWNrZWQgPSBmYWxzZVxuXG4gIG92ZXJyaWRlIG5nT25Jbml0KCkge1xuICAgIHN1cGVyLm5nT25Jbml0KClcbiAgICB0aGlzLnNldENoZWNrKClcbiAgfVxuXG4gIG92ZXJyaWRlIG5nQWZ0ZXJWaWV3SW5pdCgpIHtcbiAgICBzdXBlci5uZ0FmdGVyVmlld0luaXQoKTtcblxuICAgIHRoaXMubW9kZWwudXBkYXRlJC5waXBlKHRha2VVbnRpbERlc3Ryb3llZCh0aGlzLmRlc3Ryb3lSZWYpKS5zdWJzY3JpYmUodiA9PiB7XG4gICAgICBpZih2LnR5cGUgPT09ICdwcm9wcycpIHtcbiAgICAgICAgdGhpcy5fY2hlY2tlZCAhPT0gdGhpcy5wcm9wcy5jaGVja2VkICYmIHRoaXMuc2V0Q2hlY2soKVxuICAgICAgfVxuICAgIH0pXG4gIH1cblxuICBzZXRDaGVjaygpIHtcbiAgICB0aGlzLl9jaGVja2VkID0gdGhpcy5wcm9wcy5jaGVja2VkXG4gICAgdGhpcy5jZHIubWFya0ZvckNoZWNrKClcbiAgfVxuXG4gIHRvZ2dsZUNoZWNrKCkge1xuICAgIGlmKHRoaXMuY29udHJvbGxlci5yZWFkb25seSQudmFsdWUpIHJldHVyblxuICAgIHRoaXMuX2NoZWNrZWQgPSAhdGhpcy5fY2hlY2tlZFxuICAgIHRoaXMuc2V0UHJvcCgnY2hlY2tlZCcsIHRoaXMuX2NoZWNrZWQpXG4gIH1cblxuICBvcGVuRGF0ZVBpY2tlcigpIHtcbiAgICB0aGlzLl9kYXRlID0gdGhpcy5wcm9wcy5lbmRUaW1lID8gbmV3IERhdGUodGhpcy5wcm9wcy5lbmRUaW1lKSA6IG5ldyBEYXRlKClcbiAgfVxuXG4gIG9uRGF0ZVBpY2tlckNoYW5nZShlOiBEYXRlKSB7XG4gICAgZSA/IHRoaXMuc2V0UHJvcCgnZW5kVGltZScsIGUuZ2V0VGltZSgpKSA6IHRoaXMuZGVsZXRlUHJvcCgnZW5kVGltZScpXG4gIH1cblxufVxuIl19