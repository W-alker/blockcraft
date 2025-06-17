import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from "@angular/core";
import { NgForOf, NgTemplateOutlet } from "@angular/common";
import { MatIcon } from "@angular/material/icon";
import * as i0 from "@angular/core";
export class BlockTransformContextMenu {
    constructor(cdr, host) {
        this.cdr = cdr;
        this.host = host;
        this.blocks = [];
        this.blockSelected = new EventEmitter();
        this.activeIdx = 0;
    }
    selectUp() {
        if (this.activeIdx > 0)
            this.activeIdx--;
        else
            this.activeIdx = this.blocks.length - 1;
        this.cdr.detectChanges();
        this.host.nativeElement.querySelector('.list__item.active')?.scrollIntoView({ behavior: 'smooth' });
    }
    selectDown() {
        if (this.activeIdx < this.blocks.length - 1)
            this.activeIdx++;
        else
            this.activeIdx = 0;
        this.cdr.detectChanges();
        this.host.nativeElement.querySelector('.list__item.active')?.scrollIntoView({ behavior: 'smooth' });
    }
    select() {
        this.blockSelected.emit(this.blocks[this.activeIdx]);
    }
    onMouseDown(event, item) {
        event.preventDefault();
        event.stopPropagation();
        this.blockSelected.emit(item);
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: BlockTransformContextMenu, deps: [{ token: i0.ChangeDetectorRef }, { token: i0.ElementRef }], target: i0.ɵɵFactoryTarget.Component }); }
    static { this.ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "17.0.0", version: "17.3.12", type: BlockTransformContextMenu, isStandalone: true, selector: "block-transform-contextmenu", inputs: { blocks: "blocks" }, outputs: { blockSelected: "blockSelected" }, ngImport: i0, template: `
    <ul class="list">
      <li class="list__item" *ngFor="let item of blocks; index as idx" [title]="item.description || item.label"
          (mousedown)="onMouseDown($event, item)" [class.active]="activeIdx === idx" (mouseenter)="activeIdx = idx">
        @if (item.svgIcon) {
          <mat-icon [svgIcon]="item.svgIcon" style="width: 1em; height: 1em"></mat-icon>
        } @else {
          <i [class]="item.icon"></i>
        }
        <span>{{ item.label }}</span>
      </li>
    </ul>
  `, isInline: true, styles: [":host{display:block;background:#fff;box-shadow:0 0 8px #0003;border-radius:4px;max-height:50vh;overflow-y:auto}:host ::ng-deep mat-icon svg{vertical-align:top}:host .list{margin:0;padding:4px;width:224px}:host .list__item{display:flex;align-items:center;gap:8px;height:36px;padding:0 8px;border-radius:4px;cursor:pointer}:host .list__item>mat-icon,:host .list__item i{font-size:1em}:host .list__item.active{background:#f3f3f3}\n"], dependencies: [{ kind: "directive", type: NgForOf, selector: "[ngFor][ngForOf]", inputs: ["ngForOf", "ngForTrackBy", "ngForTemplate"] }, { kind: "component", type: MatIcon, selector: "mat-icon", inputs: ["color", "inline", "svgIcon", "fontSet", "fontIcon"], exportAs: ["matIcon"] }], changeDetection: i0.ChangeDetectionStrategy.OnPush }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: BlockTransformContextMenu, decorators: [{
            type: Component,
            args: [{ selector: 'block-transform-contextmenu', template: `
    <ul class="list">
      <li class="list__item" *ngFor="let item of blocks; index as idx" [title]="item.description || item.label"
          (mousedown)="onMouseDown($event, item)" [class.active]="activeIdx === idx" (mouseenter)="activeIdx = idx">
        @if (item.svgIcon) {
          <mat-icon [svgIcon]="item.svgIcon" style="width: 1em; height: 1em"></mat-icon>
        } @else {
          <i [class]="item.icon"></i>
        }
        <span>{{ item.label }}</span>
      </li>
    </ul>
  `, standalone: true, imports: [
                        NgForOf,
                        NgTemplateOutlet,
                        MatIcon
                    ], changeDetection: ChangeDetectionStrategy.OnPush, styles: [":host{display:block;background:#fff;box-shadow:0 0 8px #0003;border-radius:4px;max-height:50vh;overflow-y:auto}:host ::ng-deep mat-icon svg{vertical-align:top}:host .list{margin:0;padding:4px;width:224px}:host .list__item{display:flex;align-items:center;gap:8px;height:36px;padding:0 8px;border-radius:4px;cursor:pointer}:host .list__item>mat-icon,:host .list__item i{font-size:1em}:host .list__item.active{background:#f3f3f3}\n"] }]
        }], ctorParameters: () => [{ type: i0.ChangeDetectorRef }, { type: i0.ElementRef }], propDecorators: { blocks: [{
                type: Input
            }], blockSelected: [{
                type: Output
            }] } });
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29udGV4dG1lbnUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi9ibG9ja2Zsb3cvc3JjL3BsdWdpbnMvYmxvY2stdHJhbnNmb3JtL3dpZGdldC9jb250ZXh0bWVudS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxPQUFPLEVBQ0wsdUJBQXVCLEVBRXZCLFNBQVMsRUFFVCxZQUFZLEVBQ1osS0FBSyxFQUNMLE1BQU0sRUFDUCxNQUFNLGVBQWUsQ0FBQztBQUV2QixPQUFPLEVBQUMsT0FBTyxFQUFFLGdCQUFnQixFQUFDLE1BQU0saUJBQWlCLENBQUM7QUFDMUQsT0FBTyxFQUFDLE9BQU8sRUFBQyxNQUFNLHdCQUF3QixDQUFDOztBQTBCL0MsTUFBTSxPQUFPLHlCQUF5QjtJQUtwQyxZQUNrQixHQUFzQixFQUN0QixJQUE2QjtRQUQ3QixRQUFHLEdBQUgsR0FBRyxDQUFtQjtRQUN0QixTQUFJLEdBQUosSUFBSSxDQUF5QjtRQU50QyxXQUFNLEdBQWtCLEVBQUUsQ0FBQTtRQUV6QixrQkFBYSxHQUFHLElBQUksWUFBWSxFQUFlLENBQUE7UUFRekQsY0FBUyxHQUFHLENBQUMsQ0FBQTtJQUZiLENBQUM7SUFJRCxRQUFRO1FBQ04sSUFBSSxJQUFJLENBQUMsU0FBUyxHQUFHLENBQUM7WUFBRSxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUE7O1lBQ25DLElBQUksQ0FBQyxTQUFTLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFBO1FBQzVDLElBQUksQ0FBQyxHQUFHLENBQUMsYUFBYSxFQUFFLENBQUE7UUFDeEIsSUFBSSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsYUFBYSxDQUFDLG9CQUFvQixDQUFDLEVBQUUsY0FBYyxDQUFDLEVBQUMsUUFBUSxFQUFFLFFBQVEsRUFBQyxDQUFDLENBQUE7SUFDbkcsQ0FBQztJQUVELFVBQVU7UUFDUixJQUFJLElBQUksQ0FBQyxTQUFTLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLEdBQUcsQ0FBQztZQUFFLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQTs7WUFDeEQsSUFBSSxDQUFDLFNBQVMsR0FBRyxDQUFDLENBQUE7UUFDdkIsSUFBSSxDQUFDLEdBQUcsQ0FBQyxhQUFhLEVBQUUsQ0FBQTtRQUN4QixJQUFJLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxhQUFhLENBQUMsb0JBQW9CLENBQUMsRUFBRSxjQUFjLENBQUMsRUFBQyxRQUFRLEVBQUUsUUFBUSxFQUFDLENBQUMsQ0FBQTtJQUNuRyxDQUFDO0lBRUQsTUFBTTtRQUNKLElBQUksQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUE7SUFDdEQsQ0FBQztJQUVELFdBQVcsQ0FBQyxLQUFpQixFQUFFLElBQWlCO1FBQzlDLEtBQUssQ0FBQyxjQUFjLEVBQUUsQ0FBQTtRQUN0QixLQUFLLENBQUMsZUFBZSxFQUFFLENBQUE7UUFDdkIsSUFBSSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUE7SUFDL0IsQ0FBQzsrR0FuQ1UseUJBQXlCO21HQUF6Qix5QkFBeUIsa0tBdEIxQjs7Ozs7Ozs7Ozs7O0dBWVQsc2ZBSUMsT0FBTyxtSEFFUCxPQUFPOzs0RkFJRSx5QkFBeUI7a0JBeEJyQyxTQUFTOytCQUNFLDZCQUE2QixZQUM3Qjs7Ozs7Ozs7Ozs7O0dBWVQsY0FFVyxJQUFJLFdBQ1A7d0JBQ1AsT0FBTzt3QkFDUCxnQkFBZ0I7d0JBQ2hCLE9BQU87cUJBQ1IsbUJBQ2dCLHVCQUF1QixDQUFDLE1BQU07K0dBR3RDLE1BQU07c0JBQWQsS0FBSztnQkFFSSxhQUFhO3NCQUF0QixNQUFNIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHtcbiAgQ2hhbmdlRGV0ZWN0aW9uU3RyYXRlZ3ksXG4gIENoYW5nZURldGVjdG9yUmVmLFxuICBDb21wb25lbnQsXG4gIEVsZW1lbnRSZWYsXG4gIEV2ZW50RW1pdHRlcixcbiAgSW5wdXQsXG4gIE91dHB1dFxufSBmcm9tIFwiQGFuZ3VsYXIvY29yZVwiO1xuaW1wb3J0IHtCbG9ja1NjaGVtYX0gZnJvbSBcIi4uLy4uLy4uL2NvcmVcIjtcbmltcG9ydCB7TmdGb3JPZiwgTmdUZW1wbGF0ZU91dGxldH0gZnJvbSBcIkBhbmd1bGFyL2NvbW1vblwiO1xuaW1wb3J0IHtNYXRJY29ufSBmcm9tIFwiQGFuZ3VsYXIvbWF0ZXJpYWwvaWNvblwiO1xuXG5AQ29tcG9uZW50KHtcbiAgc2VsZWN0b3I6ICdibG9jay10cmFuc2Zvcm0tY29udGV4dG1lbnUnLFxuICB0ZW1wbGF0ZTogYFxuICAgIDx1bCBjbGFzcz1cImxpc3RcIj5cbiAgICAgIDxsaSBjbGFzcz1cImxpc3RfX2l0ZW1cIiAqbmdGb3I9XCJsZXQgaXRlbSBvZiBibG9ja3M7IGluZGV4IGFzIGlkeFwiIFt0aXRsZV09XCJpdGVtLmRlc2NyaXB0aW9uIHx8IGl0ZW0ubGFiZWxcIlxuICAgICAgICAgIChtb3VzZWRvd24pPVwib25Nb3VzZURvd24oJGV2ZW50LCBpdGVtKVwiIFtjbGFzcy5hY3RpdmVdPVwiYWN0aXZlSWR4ID09PSBpZHhcIiAobW91c2VlbnRlcik9XCJhY3RpdmVJZHggPSBpZHhcIj5cbiAgICAgICAgQGlmIChpdGVtLnN2Z0ljb24pIHtcbiAgICAgICAgICA8bWF0LWljb24gW3N2Z0ljb25dPVwiaXRlbS5zdmdJY29uXCIgc3R5bGU9XCJ3aWR0aDogMWVtOyBoZWlnaHQ6IDFlbVwiPjwvbWF0LWljb24+XG4gICAgICAgIH0gQGVsc2Uge1xuICAgICAgICAgIDxpIFtjbGFzc109XCJpdGVtLmljb25cIj48L2k+XG4gICAgICAgIH1cbiAgICAgICAgPHNwYW4+e3sgaXRlbS5sYWJlbCB9fTwvc3Bhbj5cbiAgICAgIDwvbGk+XG4gICAgPC91bD5cbiAgYCxcbiAgc3R5bGVVcmxzOiBbJ2NvbnRleHRtZW51LnNjc3MnXSxcbiAgc3RhbmRhbG9uZTogdHJ1ZSxcbiAgaW1wb3J0czogW1xuICAgIE5nRm9yT2YsXG4gICAgTmdUZW1wbGF0ZU91dGxldCxcbiAgICBNYXRJY29uXG4gIF0sXG4gIGNoYW5nZURldGVjdGlvbjogQ2hhbmdlRGV0ZWN0aW9uU3RyYXRlZ3kuT25QdXNoXG59KVxuZXhwb3J0IGNsYXNzIEJsb2NrVHJhbnNmb3JtQ29udGV4dE1lbnUge1xuICBASW5wdXQoKSBibG9ja3M6IEJsb2NrU2NoZW1hW10gPSBbXVxuXG4gIEBPdXRwdXQoKSBibG9ja1NlbGVjdGVkID0gbmV3IEV2ZW50RW1pdHRlcjxCbG9ja1NjaGVtYT4oKVxuXG4gIGNvbnN0cnVjdG9yKFxuICAgIHB1YmxpYyByZWFkb25seSBjZHI6IENoYW5nZURldGVjdG9yUmVmLFxuICAgIHB1YmxpYyByZWFkb25seSBob3N0OiBFbGVtZW50UmVmPEhUTUxFbGVtZW50PlxuICApIHtcbiAgfVxuXG4gIGFjdGl2ZUlkeCA9IDBcblxuICBzZWxlY3RVcCgpIHtcbiAgICBpZiAodGhpcy5hY3RpdmVJZHggPiAwKSB0aGlzLmFjdGl2ZUlkeC0tXG4gICAgZWxzZSB0aGlzLmFjdGl2ZUlkeCA9IHRoaXMuYmxvY2tzLmxlbmd0aCAtIDFcbiAgICB0aGlzLmNkci5kZXRlY3RDaGFuZ2VzKClcbiAgICB0aGlzLmhvc3QubmF0aXZlRWxlbWVudC5xdWVyeVNlbGVjdG9yKCcubGlzdF9faXRlbS5hY3RpdmUnKT8uc2Nyb2xsSW50b1ZpZXcoe2JlaGF2aW9yOiAnc21vb3RoJ30pXG4gIH1cblxuICBzZWxlY3REb3duKCkge1xuICAgIGlmICh0aGlzLmFjdGl2ZUlkeCA8IHRoaXMuYmxvY2tzLmxlbmd0aCAtIDEpIHRoaXMuYWN0aXZlSWR4KytcbiAgICBlbHNlIHRoaXMuYWN0aXZlSWR4ID0gMFxuICAgIHRoaXMuY2RyLmRldGVjdENoYW5nZXMoKVxuICAgIHRoaXMuaG9zdC5uYXRpdmVFbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJy5saXN0X19pdGVtLmFjdGl2ZScpPy5zY3JvbGxJbnRvVmlldyh7YmVoYXZpb3I6ICdzbW9vdGgnfSlcbiAgfVxuXG4gIHNlbGVjdCgpIHtcbiAgICB0aGlzLmJsb2NrU2VsZWN0ZWQuZW1pdCh0aGlzLmJsb2Nrc1t0aGlzLmFjdGl2ZUlkeF0pXG4gIH1cblxuICBvbk1vdXNlRG93bihldmVudDogTW91c2VFdmVudCwgaXRlbTogQmxvY2tTY2hlbWEpIHtcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpXG4gICAgZXZlbnQuc3RvcFByb3BhZ2F0aW9uKClcbiAgICB0aGlzLmJsb2NrU2VsZWN0ZWQuZW1pdChpdGVtKVxuICB9XG59XG4iXX0=