import {ChangeDetectionStrategy, Component, Input} from "@angular/core";
import {EditableBlock} from "../../core";

@Component({
    selector: 'td.table-cell',
    template: ``,
    styles: [``],
    standalone: true,
    host: {
        '[class.bf-multi-line]': 'true',
        '[class.editable-container]': 'true',
        '[attr.data-col-idx]': 'colIdx',
        '[attr.data-row-idx]': 'rowIdx'
    },
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TableCellBlock extends EditableBlock{
    @Input()
    colIdx: number = 0;

    @Input()
    rowIdx: number = 0;
}
