import { ElementRef } from "@angular/core";
import { ITableBlockModel } from "./type";
import { BaseBlock } from "../../core";
import { BehaviorSubject } from "rxjs";
import { Overlay } from "@angular/cdk/overlay";
import * as i0 from "@angular/core";
export declare class TableBlock extends BaseBlock<ITableBlockModel> {
    private overlay;
    protected activeColIdx: number;
    protected activeRowIdx: number;
    protected _rowHeights: number[];
    protected hoverCell: [number, number];
    protected _colWidths: number[];
    protected resizing$: BehaviorSubject<boolean>;
    protected resizeColIdx: number;
    protected resizeBarX: number;
    private cells?;
    private startSelectingCell?;
    private selectingCell?;
    private selecting$;
    table: ElementRef<HTMLTableElement>;
    tableWrapper: ElementRef<HTMLElement>;
    trackById: (index: number, item: any) => any;
    trackByValue: (index: number, w: number) => number;
    private overlayRef?;
    constructor(overlay: Overlay);
    ngAfterViewInit(): void;
    ngOnDestroy(): void;
    onKeyDown(e: KeyboardEvent): void;
    copyCells(e: Event): void;
    /** 表格行列操作 **/
    onShowColBar(e: MouseEvent): void;
    setColAlign(colIdx: number, align: 'left' | 'center' | 'right'): void;
    setRowAlign(rowIdx: number, align: 'left' | 'center' | 'right'): void;
    addCol(index: number): void;
    deleteCol(index: number, len?: number): void;
    onRowHeightChange(height: number, rowIdx: number): void;
    onShowRowBar(e: MouseEvent): void;
    addRow(index: number): void;
    deleteRow(index: number, len?: number): void;
    onTableBarRightClick(e: MouseEvent): void;
    onTableBarBottomClick(e: MouseEvent): void;
    /** 表格列宽调整 **/
    setColWidths(): void;
    onMouseOver(e: MouseEvent): void;
    onResizebarMouseDown(e: MouseEvent): void;
    /** 表格选中 **/
    focusCell(rowIdx: number, colIdx: number, pos: 'start' | 'end'): void;
    moveSelection(target: HTMLElement, direction: 'up' | 'down' | 'left' | 'right'): void;
    clearSelectingCellText(): void;
    onBlur(): void;
    onMouseDown(e: MouseEvent): void;
    getCellPos: (td: HTMLElement | null) => null | [
        number,
        number
    ];
    clearSelecting(): void;
    selectCell(): void;
    static ɵfac: i0.ɵɵFactoryDeclaration<TableBlock, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<TableBlock, "div.table-block", never, {}, {}, never, never, true, never>;
}
