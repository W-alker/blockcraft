import { ChangeDetectionStrategy, Component, Input } from "@angular/core";
import { EditableBlock } from "../../core";
import * as i0 from "@angular/core";
export class TableCellBlock extends EditableBlock {
    constructor() {
        super(...arguments);
        this.colIdx = 0;
        this.rowIdx = 0;
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: TableCellBlock, deps: null, target: i0.ɵɵFactoryTarget.Component }); }
    static { this.ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "14.0.0", version: "17.3.12", type: TableCellBlock, isStandalone: true, selector: "td.table-cell", inputs: { colIdx: "colIdx", rowIdx: "rowIdx" }, host: { properties: { "class.bf-multi-line": "true", "class.editable-container": "true", "attr.data-col-idx": "colIdx", "attr.data-row-idx": "rowIdx" } }, usesInheritance: true, ngImport: i0, template: ``, isInline: true, styles: [""], changeDetection: i0.ChangeDetectionStrategy.OnPush }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: TableCellBlock, decorators: [{
            type: Component,
            args: [{ selector: 'td.table-cell', template: ``, standalone: true, host: {
                        '[class.bf-multi-line]': 'true',
                        '[class.editable-container]': 'true',
                        '[attr.data-col-idx]': 'colIdx',
                        '[attr.data-row-idx]': 'rowIdx'
                    }, changeDetection: ChangeDetectionStrategy.OnPush }]
        }], propDecorators: { colIdx: [{
                type: Input
            }], rowIdx: [{
                type: Input
            }] } });
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGFibGUtY2VsbC5ibG9jay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uL2Jsb2NrZmxvdy9zcmMvYmxvY2tzL3RhYmxlL3RhYmxlLWNlbGwuYmxvY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsT0FBTyxFQUFDLHVCQUF1QixFQUFFLFNBQVMsRUFBRSxLQUFLLEVBQUMsTUFBTSxlQUFlLENBQUM7QUFDeEUsT0FBTyxFQUFDLGFBQWEsRUFBQyxNQUFNLFlBQVksQ0FBQzs7QUFlekMsTUFBTSxPQUFPLGNBQWUsU0FBUSxhQUFhO0lBYmpEOztRQWVJLFdBQU0sR0FBVyxDQUFDLENBQUM7UUFHbkIsV0FBTSxHQUFXLENBQUMsQ0FBQztLQUN0QjsrR0FOWSxjQUFjO21HQUFkLGNBQWMsMlNBWGIsRUFBRTs7NEZBV0gsY0FBYztrQkFiMUIsU0FBUzsrQkFDSSxlQUFlLFlBQ2YsRUFBRSxjQUVBLElBQUksUUFDVjt3QkFDRix1QkFBdUIsRUFBRSxNQUFNO3dCQUMvQiw0QkFBNEIsRUFBRSxNQUFNO3dCQUNwQyxxQkFBcUIsRUFBRSxRQUFRO3dCQUMvQixxQkFBcUIsRUFBRSxRQUFRO3FCQUNsQyxtQkFDZ0IsdUJBQXVCLENBQUMsTUFBTTs4QkFJL0MsTUFBTTtzQkFETCxLQUFLO2dCQUlOLE1BQU07c0JBREwsS0FBSyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7Q2hhbmdlRGV0ZWN0aW9uU3RyYXRlZ3ksIENvbXBvbmVudCwgSW5wdXR9IGZyb20gXCJAYW5ndWxhci9jb3JlXCI7XG5pbXBvcnQge0VkaXRhYmxlQmxvY2t9IGZyb20gXCIuLi8uLi9jb3JlXCI7XG5cbkBDb21wb25lbnQoe1xuICAgIHNlbGVjdG9yOiAndGQudGFibGUtY2VsbCcsXG4gICAgdGVtcGxhdGU6IGBgLFxuICAgIHN0eWxlczogW2BgXSxcbiAgICBzdGFuZGFsb25lOiB0cnVlLFxuICAgIGhvc3Q6IHtcbiAgICAgICAgJ1tjbGFzcy5iZi1tdWx0aS1saW5lXSc6ICd0cnVlJyxcbiAgICAgICAgJ1tjbGFzcy5lZGl0YWJsZS1jb250YWluZXJdJzogJ3RydWUnLFxuICAgICAgICAnW2F0dHIuZGF0YS1jb2wtaWR4XSc6ICdjb2xJZHgnLFxuICAgICAgICAnW2F0dHIuZGF0YS1yb3ctaWR4XSc6ICdyb3dJZHgnXG4gICAgfSxcbiAgICBjaGFuZ2VEZXRlY3Rpb246IENoYW5nZURldGVjdGlvblN0cmF0ZWd5Lk9uUHVzaFxufSlcbmV4cG9ydCBjbGFzcyBUYWJsZUNlbGxCbG9jayBleHRlbmRzIEVkaXRhYmxlQmxvY2t7XG4gICAgQElucHV0KClcbiAgICBjb2xJZHg6IG51bWJlciA9IDA7XG5cbiAgICBASW5wdXQoKVxuICAgIHJvd0lkeDogbnVtYmVyID0gMDtcbn1cbiJdfQ==