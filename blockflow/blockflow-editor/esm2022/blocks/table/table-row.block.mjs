import { Component, EventEmitter, Input, Output } from "@angular/core";
import { BaseBlock } from "../../core";
import { TableCellBlock } from "./table-cell.block";
import { NgForOf } from "@angular/common";
import { fromEventPattern } from "rxjs";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import * as i0 from "@angular/core";
export class TableRowBlock extends BaseBlock {
    constructor() {
        super(...arguments);
        this._height = 0;
        this.rowIdx = 0;
        this.heightChange = new EventEmitter();
        this.trackById = (index, item) => item.id;
    }
    ngAfterViewInit() {
        super.ngAfterViewInit();
        fromEventPattern(handler => {
            this._resizeObserver = new ResizeObserver(handler);
            this._resizeObserver.observe(this.hostEl.nativeElement);
        }, () => {
            this._resizeObserver.disconnect();
        }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(e => {
            if (e[0][0].contentRect.height === this._height)
                return;
            this._height = e[0][0].contentRect.height;
            this.heightChange.emit(this._height);
            // console.log('height change', this._height)
        });
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: TableRowBlock, deps: null, target: i0.ɵɵFactoryTarget.Component }); }
    static { this.ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "14.0.0", version: "17.3.12", type: TableRowBlock, isStandalone: true, selector: "tr.table-row", inputs: { rowIdx: "rowIdx" }, outputs: { heightChange: "heightChange" }, host: { properties: { "attr.data-row-idx": "rowIdx" } }, usesInheritance: true, ngImport: i0, template: `
    <td class="table-cell" *ngFor="let cell of model.children; index as colIdx; trackBy: trackById" [colIdx]="colIdx"
        [rowIdx]="rowIdx" [controller]="controller" [model]="cell"></td>
  `, isInline: true, styles: [""], dependencies: [{ kind: "component", type: TableCellBlock, selector: "td.table-cell", inputs: ["colIdx", "rowIdx"] }, { kind: "directive", type: NgForOf, selector: "[ngFor][ngForOf]", inputs: ["ngForOf", "ngForTrackBy", "ngForTemplate"] }] }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: TableRowBlock, decorators: [{
            type: Component,
            args: [{ selector: 'tr.table-row', template: `
    <td class="table-cell" *ngFor="let cell of model.children; index as colIdx; trackBy: trackById" [colIdx]="colIdx"
        [rowIdx]="rowIdx" [controller]="controller" [model]="cell"></td>
  `, standalone: true, imports: [
                        TableCellBlock,
                        NgForOf
                    ], host: {
                        '[attr.data-row-idx]': 'rowIdx'
                    } }]
        }], propDecorators: { rowIdx: [{
                type: Input
            }], heightChange: [{
                type: Output
            }] } });
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGFibGUtcm93LmJsb2NrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vYmxvY2tmbG93L3NyYy9ibG9ja3MvdGFibGUvdGFibGUtcm93LmJsb2NrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLE9BQU8sRUFBMEIsU0FBUyxFQUFFLFlBQVksRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFDLE1BQU0sZUFBZSxDQUFDO0FBQzlGLE9BQU8sRUFBQyxTQUFTLEVBQUMsTUFBTSxZQUFZLENBQUM7QUFDckMsT0FBTyxFQUFDLGNBQWMsRUFBQyxNQUFNLG9CQUFvQixDQUFDO0FBQ2xELE9BQU8sRUFBQyxPQUFPLEVBQUMsTUFBTSxpQkFBaUIsQ0FBQztBQUV4QyxPQUFPLEVBQUMsZ0JBQWdCLEVBQWUsTUFBTSxNQUFNLENBQUM7QUFDcEQsT0FBTyxFQUFDLGtCQUFrQixFQUFDLE1BQU0sNEJBQTRCLENBQUM7O0FBbUI5RCxNQUFNLE9BQU8sYUFBYyxTQUFRLFNBQThCO0lBakJqRTs7UUFrQlUsWUFBTyxHQUFXLENBQUMsQ0FBQztRQUk1QixXQUFNLEdBQVcsQ0FBQyxDQUFDO1FBRVQsaUJBQVksR0FBRyxJQUFJLFlBQVksRUFBVSxDQUFBO1FBRW5ELGNBQVMsR0FBRyxDQUFDLEtBQWEsRUFBRSxJQUFTLEVBQUUsRUFBRSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUE7S0FzQmxEO0lBcEJVLGVBQWU7UUFDdEIsS0FBSyxDQUFDLGVBQWUsRUFBRSxDQUFDO1FBRXhCLGdCQUFnQixDQUNkLE9BQU8sQ0FBQyxFQUFFO1lBQ1IsSUFBSSxDQUFDLGVBQWUsR0FBRyxJQUFJLGNBQWMsQ0FBQyxPQUFPLENBQUMsQ0FBQTtZQUNsRCxJQUFJLENBQUMsZUFBZSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLGFBQWEsQ0FBQyxDQUFBO1FBQ3pELENBQUMsRUFDRCxHQUFHLEVBQUU7WUFDSCxJQUFJLENBQUMsZUFBZSxDQUFDLFVBQVUsRUFBRSxDQUFBO1FBQ25DLENBQUMsQ0FDRixDQUFDLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLEVBQUU7WUFDeEQsSUFBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsV0FBVyxDQUFDLE1BQU0sS0FBSyxJQUFJLENBQUMsT0FBTztnQkFBRSxPQUFNO1lBQ3RELElBQUksQ0FBQyxPQUFPLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUE7WUFDekMsSUFBSSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFBO1lBQ3BDLDZDQUE2QztRQUMvQyxDQUFDLENBQUMsQ0FBQTtJQUVKLENBQUM7K0dBN0JVLGFBQWE7bUdBQWIsYUFBYSxpT0FmZDs7O0dBR1QsMEVBS0MsY0FBYyx3RkFDZCxPQUFPOzs0RkFNRSxhQUFhO2tCQWpCekIsU0FBUzsrQkFDRSxjQUFjLFlBQ2Q7OztHQUdULGNBR1csSUFBSSxXQUNQO3dCQUNQLGNBQWM7d0JBQ2QsT0FBTztxQkFDUixRQUNLO3dCQUNKLHFCQUFxQixFQUFFLFFBQVE7cUJBQ2hDOzhCQU9ELE1BQU07c0JBREwsS0FBSztnQkFHSSxZQUFZO3NCQUFyQixNQUFNIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHtDaGFuZ2VEZXRlY3Rpb25TdHJhdGVneSwgQ29tcG9uZW50LCBFdmVudEVtaXR0ZXIsIElucHV0LCBPdXRwdXR9IGZyb20gXCJAYW5ndWxhci9jb3JlXCI7XG5pbXBvcnQge0Jhc2VCbG9ja30gZnJvbSBcIi4uLy4uL2NvcmVcIjtcbmltcG9ydCB7VGFibGVDZWxsQmxvY2t9IGZyb20gXCIuL3RhYmxlLWNlbGwuYmxvY2tcIjtcbmltcG9ydCB7TmdGb3JPZn0gZnJvbSBcIkBhbmd1bGFyL2NvbW1vblwiO1xuaW1wb3J0IHtJVGFibGVSb3dCbG9ja01vZGVsfSBmcm9tIFwiLi90eXBlXCI7XG5pbXBvcnQge2Zyb21FdmVudFBhdHRlcm4sIHRocm90dGxlVGltZX0gZnJvbSBcInJ4anNcIjtcbmltcG9ydCB7dGFrZVVudGlsRGVzdHJveWVkfSBmcm9tIFwiQGFuZ3VsYXIvY29yZS9yeGpzLWludGVyb3BcIjtcblxuQENvbXBvbmVudCh7XG4gIHNlbGVjdG9yOiAndHIudGFibGUtcm93JyxcbiAgdGVtcGxhdGU6IGBcbiAgICA8dGQgY2xhc3M9XCJ0YWJsZS1jZWxsXCIgKm5nRm9yPVwibGV0IGNlbGwgb2YgbW9kZWwuY2hpbGRyZW47IGluZGV4IGFzIGNvbElkeDsgdHJhY2tCeTogdHJhY2tCeUlkXCIgW2NvbElkeF09XCJjb2xJZHhcIlxuICAgICAgICBbcm93SWR4XT1cInJvd0lkeFwiIFtjb250cm9sbGVyXT1cImNvbnRyb2xsZXJcIiBbbW9kZWxdPVwiY2VsbFwiPjwvdGQ+XG4gIGAsXG4gIHN0eWxlczogW2BcbiAgYF0sXG4gIHN0YW5kYWxvbmU6IHRydWUsXG4gIGltcG9ydHM6IFtcbiAgICBUYWJsZUNlbGxCbG9jayxcbiAgICBOZ0Zvck9mXG4gIF0sXG4gIGhvc3Q6IHtcbiAgICAnW2F0dHIuZGF0YS1yb3ctaWR4XSc6ICdyb3dJZHgnXG4gIH0sXG59KVxuZXhwb3J0IGNsYXNzIFRhYmxlUm93QmxvY2sgZXh0ZW5kcyBCYXNlQmxvY2s8SVRhYmxlUm93QmxvY2tNb2RlbD4ge1xuICBwcml2YXRlIF9oZWlnaHQ6IG51bWJlciA9IDA7XG4gIHByaXZhdGUgX3Jlc2l6ZU9ic2VydmVyITogUmVzaXplT2JzZXJ2ZXI7XG5cbiAgQElucHV0KClcbiAgcm93SWR4OiBudW1iZXIgPSAwO1xuXG4gIEBPdXRwdXQoKSBoZWlnaHRDaGFuZ2UgPSBuZXcgRXZlbnRFbWl0dGVyPG51bWJlcj4oKVxuXG4gIHRyYWNrQnlJZCA9IChpbmRleDogbnVtYmVyLCBpdGVtOiBhbnkpID0+IGl0ZW0uaWRcblxuICBvdmVycmlkZSBuZ0FmdGVyVmlld0luaXQoKSB7XG4gICAgc3VwZXIubmdBZnRlclZpZXdJbml0KCk7XG5cbiAgICBmcm9tRXZlbnRQYXR0ZXJuPFtbUmVzaXplT2JzZXJ2ZXJFbnRyeV0sIFJlc2l6ZU9ic2VydmVyXT4oXG4gICAgICBoYW5kbGVyID0+IHtcbiAgICAgICAgdGhpcy5fcmVzaXplT2JzZXJ2ZXIgPSBuZXcgUmVzaXplT2JzZXJ2ZXIoaGFuZGxlcilcbiAgICAgICAgdGhpcy5fcmVzaXplT2JzZXJ2ZXIub2JzZXJ2ZSh0aGlzLmhvc3RFbC5uYXRpdmVFbGVtZW50KVxuICAgICAgfSxcbiAgICAgICgpID0+IHtcbiAgICAgICAgdGhpcy5fcmVzaXplT2JzZXJ2ZXIuZGlzY29ubmVjdCgpXG4gICAgICB9XG4gICAgKS5waXBlKHRha2VVbnRpbERlc3Ryb3llZCh0aGlzLmRlc3Ryb3lSZWYpKS5zdWJzY3JpYmUoZSA9PiB7XG4gICAgICBpZihlWzBdWzBdLmNvbnRlbnRSZWN0LmhlaWdodCA9PT0gdGhpcy5faGVpZ2h0KSByZXR1cm5cbiAgICAgIHRoaXMuX2hlaWdodCA9IGVbMF1bMF0uY29udGVudFJlY3QuaGVpZ2h0XG4gICAgICB0aGlzLmhlaWdodENoYW5nZS5lbWl0KHRoaXMuX2hlaWdodClcbiAgICAgIC8vIGNvbnNvbGUubG9nKCdoZWlnaHQgY2hhbmdlJywgdGhpcy5faGVpZ2h0KVxuICAgIH0pXG5cbiAgfVxuXG59XG4iXX0=