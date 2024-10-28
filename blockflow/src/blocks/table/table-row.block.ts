import {Component, Input} from "@angular/core";
import {BaseBlock} from "../../core";
import {TableCellBlock} from "./table-cell.block";
import {NgForOf} from "@angular/common";
import {ITableRowBlockModel} from "./type";

@Component({
    selector: 'tr.table-row',
    template: `
        <td class="table-cell" *ngFor="let cell of model.children; index as colIdx; trackBy: trackById" [colIdx]="colIdx" [rowIdx]="rowIdx"
            [controller]="controller" [model]="cell"></td>
    `,
    styles: [``],
    standalone: true,
    imports: [
        TableCellBlock,
        NgForOf
    ],
    host: {
        '[attr.data-row-idx]': 'rowIdx'
    }
})
export class TableRowBlock extends BaseBlock<ITableRowBlockModel> {

    @Input()
    rowIdx: number = 0;

    trackById = (index: number, item: any) => item.id

}
