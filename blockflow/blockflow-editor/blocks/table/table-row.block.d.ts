import { EventEmitter } from "@angular/core";
import { BaseBlock } from "../../core";
import { ITableRowBlockModel } from "./type";
import * as i0 from "@angular/core";
export declare class TableRowBlock extends BaseBlock<ITableRowBlockModel> {
    private _height;
    private _resizeObserver;
    rowIdx: number;
    heightChange: EventEmitter<number>;
    trackById: (index: number, item: any) => any;
    ngAfterViewInit(): void;
    static ɵfac: i0.ɵɵFactoryDeclaration<TableRowBlock, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<TableRowBlock, "tr.table-row", never, { "rowIdx": { "alias": "rowIdx"; "required": false; }; }, { "heightChange": "heightChange"; }, never, never, true, never>;
}
