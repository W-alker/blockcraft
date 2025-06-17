import { ChangeDetectionStrategy, Component } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { EditableBlock } from "../../core";
import { getNumberPrefix } from "./utils";
import * as i0 from "@angular/core";
export class OrderedListBlock extends EditableBlock {
    constructor() {
        super(...arguments);
        this._numPrefix = '';
    }
    ngOnInit() {
        super.ngOnInit();
        this.setOrder();
        this.model.update$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((v) => {
            if (v.type === 'props') {
                this.setOrder();
            }
        });
    }
    setOrder() {
        this._numPrefix = getNumberPrefix(this.props.order, this.props.indent);
        this.cdr.markForCheck();
        // this.hostEl.nativeElement.setAttribute('data-order', getNumberPrefix(this.props.order, this.props.indent))
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: OrderedListBlock, deps: null, target: i0.ɵɵFactoryTarget.Component }); }
    static { this.ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "14.0.0", version: "17.3.12", type: OrderedListBlock, isStandalone: true, selector: "div.ordered-list", usesInheritance: true, ngImport: i0, template: `
    <span class="order-list__num">{{_numPrefix}}.&nbsp;</span>
    <div class="editable-container"></div>
  `, isInline: true, styles: [":host{position:relative;display:flex}:host.selected{background-color:var(--bf-selected)}:host>.order-list__num{color:var(--bf-anchor)}:host>.editable-container{flex:1;text-indent:0}\n"], changeDetection: i0.ChangeDetectionStrategy.OnPush }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: OrderedListBlock, decorators: [{
            type: Component,
            args: [{ selector: 'div.ordered-list', template: `
    <span class="order-list__num">{{_numPrefix}}.&nbsp;</span>
    <div class="editable-container"></div>
  `, standalone: true, changeDetection: ChangeDetectionStrategy.OnPush, styles: [":host{position:relative;display:flex}:host.selected{background-color:var(--bf-selected)}:host>.order-list__num{color:var(--bf-anchor)}:host>.editable-container{flex:1;text-indent:0}\n"] }]
        }] });
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib3JkZXJlZC1saXN0LmJsb2NrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vYmxvY2tmbG93L3NyYy9ibG9ja3Mvb3JkZXJlZC1saXN0L29yZGVyZWQtbGlzdC5ibG9jay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxPQUFPLEVBQUMsdUJBQXVCLEVBQUUsU0FBUyxFQUFDLE1BQU0sZUFBZSxDQUFDO0FBQ2pFLE9BQU8sRUFBQyxrQkFBa0IsRUFBQyxNQUFNLDRCQUE0QixDQUFDO0FBQzlELE9BQU8sRUFBQyxhQUFhLEVBQUMsTUFBTSxZQUFZLENBQUM7QUFFekMsT0FBTyxFQUFDLGVBQWUsRUFBQyxNQUFNLFNBQVMsQ0FBQzs7QUE4QnhDLE1BQU0sT0FBTyxnQkFBaUIsU0FBUSxhQUFxQztJQTVCM0U7O1FBNkJZLGVBQVUsR0FBVyxFQUFFLENBQUE7S0FrQmxDO0lBaEJVLFFBQVE7UUFDZixLQUFLLENBQUMsUUFBUSxFQUFFLENBQUE7UUFDaEIsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFBO1FBQ2YsSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFO1lBQzNFLElBQUksQ0FBQyxDQUFDLElBQUksS0FBSyxPQUFPLEVBQUUsQ0FBQztnQkFDdkIsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFBO1lBQ2pCLENBQUM7UUFDSCxDQUFDLENBQUMsQ0FBQTtJQUNKLENBQUM7SUFFTyxRQUFRO1FBQ2QsSUFBSSxDQUFDLFVBQVUsR0FBRyxlQUFlLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxLQUFLLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQTtRQUN0RSxJQUFJLENBQUMsR0FBRyxDQUFDLFlBQVksRUFBRSxDQUFBO1FBQ3ZCLDZHQUE2RztJQUMvRyxDQUFDOytHQWpCVSxnQkFBZ0I7bUdBQWhCLGdCQUFnQixtR0ExQmpCOzs7R0FHVDs7NEZBdUJVLGdCQUFnQjtrQkE1QjVCLFNBQVM7K0JBQ0Usa0JBQWtCLFlBQ2xCOzs7R0FHVCxjQW9CVyxJQUFJLG1CQUNDLHVCQUF1QixDQUFDLE1BQU0iLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQge0NoYW5nZURldGVjdGlvblN0cmF0ZWd5LCBDb21wb25lbnR9IGZyb20gXCJAYW5ndWxhci9jb3JlXCI7XG5pbXBvcnQge3Rha2VVbnRpbERlc3Ryb3llZH0gZnJvbSBcIkBhbmd1bGFyL2NvcmUvcnhqcy1pbnRlcm9wXCI7XG5pbXBvcnQge0VkaXRhYmxlQmxvY2t9IGZyb20gXCIuLi8uLi9jb3JlXCI7XG5pbXBvcnQge0lPcmRlcmVkTGlzdEJsb2NrTW9kZWx9IGZyb20gXCIuL3R5cGVcIjtcbmltcG9ydCB7Z2V0TnVtYmVyUHJlZml4fSBmcm9tIFwiLi91dGlsc1wiO1xuXG5AQ29tcG9uZW50KHtcbiAgc2VsZWN0b3I6ICdkaXYub3JkZXJlZC1saXN0JyxcbiAgdGVtcGxhdGU6IGBcbiAgICA8c3BhbiBjbGFzcz1cIm9yZGVyLWxpc3RfX251bVwiPnt7X251bVByZWZpeH19LiZuYnNwOzwvc3Bhbj5cbiAgICA8ZGl2IGNsYXNzPVwiZWRpdGFibGUtY29udGFpbmVyXCI+PC9kaXY+XG4gIGAsXG4gIHN0eWxlczogW2BcbiAgICA6aG9zdCB7XG4gICAgICBwb3NpdGlvbjogcmVsYXRpdmU7XG4gICAgICBkaXNwbGF5OiBmbGV4O1xuXG4gICAgICAmLnNlbGVjdGVkIHtcbiAgICAgICAgYmFja2dyb3VuZC1jb2xvcjogdmFyKC0tYmYtc2VsZWN0ZWQpO1xuICAgICAgfVxuXG4gICAgICA+IC5vcmRlci1saXN0X19udW0ge1xuICAgICAgICBjb2xvcjogdmFyKC0tYmYtYW5jaG9yKTtcbiAgICAgIH1cblxuICAgICAgPiAuZWRpdGFibGUtY29udGFpbmVyIHtcbiAgICAgICAgZmxleDogMTtcbiAgICAgICAgdGV4dC1pbmRlbnQ6IDA7XG4gICAgICB9XG4gICAgfVxuICBgXSxcbiAgc3RhbmRhbG9uZTogdHJ1ZSxcbiAgY2hhbmdlRGV0ZWN0aW9uOiBDaGFuZ2VEZXRlY3Rpb25TdHJhdGVneS5PblB1c2hcbn0pXG5leHBvcnQgY2xhc3MgT3JkZXJlZExpc3RCbG9jayBleHRlbmRzIEVkaXRhYmxlQmxvY2s8SU9yZGVyZWRMaXN0QmxvY2tNb2RlbD4ge1xuICBwcm90ZWN0ZWQgX251bVByZWZpeDogc3RyaW5nID0gJydcblxuICBvdmVycmlkZSBuZ09uSW5pdCgpIHtcbiAgICBzdXBlci5uZ09uSW5pdCgpXG4gICAgdGhpcy5zZXRPcmRlcigpXG4gICAgdGhpcy5tb2RlbC51cGRhdGUkLnBpcGUodGFrZVVudGlsRGVzdHJveWVkKHRoaXMuZGVzdHJveVJlZikpLnN1YnNjcmliZSgodikgPT4ge1xuICAgICAgaWYgKHYudHlwZSA9PT0gJ3Byb3BzJykge1xuICAgICAgICB0aGlzLnNldE9yZGVyKClcbiAgICAgIH1cbiAgICB9KVxuICB9XG5cbiAgcHJpdmF0ZSBzZXRPcmRlcigpIHtcbiAgICB0aGlzLl9udW1QcmVmaXggPSBnZXROdW1iZXJQcmVmaXgodGhpcy5wcm9wcy5vcmRlciwgdGhpcy5wcm9wcy5pbmRlbnQpXG4gICAgdGhpcy5jZHIubWFya0ZvckNoZWNrKClcbiAgICAvLyB0aGlzLmhvc3RFbC5uYXRpdmVFbGVtZW50LnNldEF0dHJpYnV0ZSgnZGF0YS1vcmRlcicsIGdldE51bWJlclByZWZpeCh0aGlzLnByb3BzLm9yZGVyLCB0aGlzLnByb3BzLmluZGVudCkpXG4gIH1cblxufVxuIl19