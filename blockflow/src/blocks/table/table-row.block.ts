import {ChangeDetectionStrategy, Component, EventEmitter, Input, Output} from "@angular/core";
import {BaseBlock} from "../../core";
import {TableCellBlock} from "./table-cell.block";
import {NgForOf} from "@angular/common";
import {ITableRowBlockModel} from "./type";
import {fromEventPattern, throttleTime} from "rxjs";
import {takeUntilDestroyed} from "@angular/core/rxjs-interop";

@Component({
  selector: 'tr.table-row',
  template: `
    <td class="table-cell" *ngFor="let cell of model.children; index as colIdx; trackBy: trackById" [colIdx]="colIdx"
        [rowIdx]="rowIdx" [controller]="controller" [model]="cell"></td>
  `,
  styles: [`
  `],
  standalone: true,
  imports: [
    TableCellBlock,
    NgForOf
  ],
  host: {
    '[attr.data-row-idx]': 'rowIdx'
  },
})
export class TableRowBlock extends BaseBlock<ITableRowBlockModel> {
  private _height: number = 0;
  private _resizeObserver!: ResizeObserver;

  @Input()
  rowIdx: number = 0;

  @Output() heightChange = new EventEmitter<number>()

  trackById = (index: number, item: any) => item.id

  override ngAfterViewInit() {
    super.ngAfterViewInit();

    fromEventPattern<[[ResizeObserverEntry], ResizeObserver]>(
      handler => {
        this._resizeObserver = new ResizeObserver(handler)
        this._resizeObserver.observe(this.hostEl.nativeElement)
      },
      () => {
        this._resizeObserver.disconnect()
      }
    ).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(e => {
      if(e[0][0].contentRect.height === this._height) return
      this._height = e[0][0].contentRect.height
      this.heightChange.emit(this._height)
      console.log('height change', this._height)
    })

  }

}
