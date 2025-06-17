import { Component, ElementRef, ViewChild } from "@angular/core";
import { BaseBlock, isCursorAtElEnd, isCursorAtElStart, USER_CHANGE_SIGNAL } from "../../core";
import { TableRowBlock } from "./table-row.block";
import { AsyncPipe, NgForOf, NgIf } from "@angular/common";
import { BehaviorSubject, filter, fromEvent, take, takeUntil } from "rxjs";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { ComponentPortal } from "@angular/cdk/portal";
import { FloatToolbar } from "../../components";
import { SET_COL_HEADER, SET_ROW_HEADER, TableColControlMenu, TableRolControlMenu } from "./const";
import * as i0 from "@angular/core";
import * as i1 from "@angular/cdk/overlay";
export class TableBlock extends BaseBlock {
    constructor(overlay) {
        super();
        this.overlay = overlay;
        this.activeColIdx = -1;
        this.activeRowIdx = -1;
        this._rowHeights = [];
        this.hoverCell = [-1, -1];
        this._colWidths = [];
        this.resizing$ = new BehaviorSubject(false);
        this.resizeColIdx = -1;
        this.resizeBarX = 0;
        this.selecting$ = new BehaviorSubject(false);
        this.trackById = (index, item) => item.id;
        this.trackByValue = (index, w) => w;
        this.getCellPos = (td) => {
            if (!td || td.tagName !== 'TD')
                return null;
            const colIdx = td.getAttribute('data-col-idx');
            const rowIdx = td.getAttribute('data-row-idx');
            return [parseInt(rowIdx), parseInt(colIdx)];
        };
    }
    ngAfterViewInit() {
        super.ngAfterViewInit();
        this._colWidths = [...this.model.props.colWidths];
        this.selecting$.pipe(takeUntilDestroyed(this.destroyRef), filter(e => e)).subscribe((selecting) => {
            window.getSelection().removeAllRanges();
            this.table.nativeElement.focus({ preventScroll: true });
        });
        this.model.update$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(e => {
            if (e.type === 'props') {
                if (e.event.changes.keys.get('colWidths')) {
                    this._colWidths = [...this.model.props.colWidths];
                }
            }
        });
    }
    ngOnDestroy() {
        super.ngOnDestroy();
        this.overlayRef?.dispose();
    }
    onKeyDown(e) {
        if (e.code === 'KeyC' && (e.ctrlKey || e.metaKey)) {
            this.copyCells(e);
            return;
        }
        if (this.controller.readonly$.value)
            return;
        switch (e.key) {
            case 'Enter':
                e.preventDefault();
                break;
            case 'ArrowLeft':
            case 'ArrowUp':
                {
                    e.stopPropagation();
                    if (this.selectingCell) {
                        e.preventDefault();
                        this.focusCell(this.selectingCell[0][0], this.selectingCell[0][1], 'start');
                        return;
                    }
                    const cell = e.target;
                    if (isCursorAtElStart(cell)) {
                        e.preventDefault();
                        this.moveSelection(e.target, e.key === 'ArrowLeft' ? 'left' : 'up');
                    }
                }
                break;
            case 'ArrowRight':
            case 'ArrowDown':
                {
                    e.stopPropagation();
                    if (this.selectingCell) {
                        e.preventDefault();
                        this.focusCell(this.selectingCell[1][0], this.selectingCell[1][1], 'end');
                        return;
                    }
                    const target = e.target;
                    if (isCursorAtElEnd(target)) {
                        e.preventDefault();
                        this.moveSelection(target, e.key === 'ArrowRight' ? 'right' : 'down');
                    }
                }
                break;
            case 'Backspace':
                if (this.selectingCell) {
                    e.stopPropagation();
                    e.preventDefault();
                    this.clearSelectingCellText();
                }
                else {
                    const cell = e.target;
                    if (isCursorAtElStart(cell)) {
                        e.preventDefault();
                        e.stopPropagation();
                    }
                }
                break;
        }
    }
    copyCells(e) {
        if (!this.selectingCell)
            return;
        e.stopPropagation();
        e.preventDefault();
        const json = this.model.toJSON();
        // 裁截选中的单元格
        const [start, end] = this.selectingCell;
        json.children = json.children.slice(start[0], end[0] + 1);
        json.children.forEach(row => {
            row.children = row.children.slice(start[1], end[1] + 1);
        });
        json.props = {
            colHead: false,
            rowHead: false,
            colWidths: this._colWidths.slice(start[1], end[1] + 1)
        };
        this.controller.clipboard.writeData([{
                type: 'block',
                data: [json]
            }]);
    }
    /** 表格行列操作 **/
    onShowColBar(e) {
        e.stopPropagation();
        const target = e.target;
        const dataColIdx = target.getAttribute('data-col-idx');
        if (!dataColIdx)
            return;
        const colIdx = parseInt(dataColIdx);
        this.activeColIdx = colIdx;
        const portal = new ComponentPortal(FloatToolbar);
        this.overlayRef = this.overlay.create({
            positionStrategy: this.overlay.position().flexibleConnectedTo(target).withPositions([
                { originX: 'center', originY: 'top', overlayX: 'center', overlayY: 'bottom', offsetY: -4 },
                { originX: 'center', originY: 'bottom', overlayX: 'center', overlayY: 'top', offsetY: 4 },
            ]),
            scrollStrategy: this.overlay.scrollStrategies.close(),
            hasBackdrop: true,
            backdropClass: 'cdk-overlay-transparent-backdrop',
        });
        const close = () => {
            this.overlayRef?.dispose();
            this.activeColIdx = -1;
        };
        this.overlayRef.backdropClick().pipe(take(1)).subscribe(close);
        const cpr = this.overlayRef.attach(portal);
        const menu = [...TableColControlMenu];
        if (colIdx === 0)
            menu.unshift(SET_COL_HEADER);
        const colFirAlign = this.children[0].children[colIdx].props['textAlign'];
        const commonAlign = this.children.every(row => row.children[colIdx].props['textAlign'] === colFirAlign);
        if (commonAlign) {
            cpr.instance.addActive('align-' + colFirAlign);
        }
        if (this.props.colHead) {
            cpr.instance.addActive('setHeadCol');
        }
        cpr.setInput('toolbarList', menu);
        cpr.instance.itemClick.pipe(takeUntilDestroyed(cpr.instance.destroyRef)).subscribe(({ item, event }) => {
            switch (item.name) {
                case 'align':
                    this.setColAlign(colIdx, item.value);
                    cpr.instance.replaceActiveGroupByName(item.name, item.id);
                    break;
                case 'insert':
                    this.addCol(item.value === 'left' ? colIdx : colIdx + 1);
                    break;
                case 'delete':
                    this.deleteCol(colIdx);
                    close();
                    break;
                case 'setHeadCol':
                    this.setProp('colHead', !this.props.colHead);
                    this.props.colHead ? cpr.instance.addActive('setHeadCol') : cpr.instance.removeActive('setHeadCol');
                    break;
            }
        });
    }
    setColAlign(colIdx, align) {
        const rows = this.model.children;
        this.controller.transact(() => {
            for (let i = 0; i < rows.length; i++) {
                const cell = rows[i].children[colIdx];
                if (cell && cell.props['textAlign'] !== align)
                    cell.setProp('textAlign', align);
            }
        }, USER_CHANGE_SIGNAL);
    }
    setRowAlign(rowIdx, align) {
        const cells = this.model.children[rowIdx].children;
        this.controller.transact(() => {
            cells.forEach(cell => {
                if (cell.props['textAlign'] !== align)
                    cell.setProp('textAlign', align);
            });
        });
    }
    addCol(index) {
        const addWidth = 80;
        // // 提前计算宽度
        // const maxWidth = this.table.nativeElement.getBoundingClientRect().width
        // const totalWidth = this._colWidths.reduce((pre, cur) => pre + cur, 0)
        // // 如果超出最大宽度
        // if (totalWidth + addWidth > maxWidth) {
        //   // 其他列宽度平均减少加出的宽度
        //   const reduceWidth = Math.floor((totalWidth + addWidth - maxWidth) / this._colWidths.length)
        //   this._colWidths = this._colWidths.map(width => width - reduceWidth)
        // }
        this._colWidths.splice(index, 0, addWidth);
        this.controller.transact(() => {
            this.model.children.forEach(row => {
                const cell = this.controller.createBlock('table-cell');
                row.insertChildren(index, [cell]);
            });
        }, USER_CHANGE_SIGNAL);
        this.setColWidths();
    }
    deleteCol(index, len = 1) {
        if (len === this.children[0].children.length) {
            return this.destroySelf();
        }
        this.controller.transact(() => {
            this.model.children.forEach(row => {
                row.deleteChildren(index, 1);
            });
        }, USER_CHANGE_SIGNAL);
        this._colWidths.splice(index, 1);
        this.setColWidths();
    }
    onRowHeightChange(height, rowIdx) {
        this._rowHeights[rowIdx] = height;
    }
    onShowRowBar(e) {
        e.stopPropagation();
        const target = e.target;
        const dataRowIdx = target.getAttribute('data-row-idx');
        if (!dataRowIdx)
            return;
        const rowIdx = parseInt(dataRowIdx);
        this.activeRowIdx = rowIdx;
        const portal = new ComponentPortal(FloatToolbar);
        const overlayRef = this.overlay.create({
            positionStrategy: this.overlay.position().flexibleConnectedTo(target).withPositions([
                { originX: 'end', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -4 },
                { originX: 'end', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetX: 4 },
            ]),
            scrollStrategy: this.overlay.scrollStrategies.close(),
            hasBackdrop: true,
            backdropClass: 'cdk-overlay-transparent-backdrop',
        });
        const close = () => {
            overlayRef.dispose();
            this.activeRowIdx = -1;
        };
        overlayRef.backdropClick().pipe(take(1)).subscribe(close);
        const cpr = overlayRef.attach(portal);
        const menu = [...TableRolControlMenu];
        if (rowIdx === 0)
            menu.unshift(SET_ROW_HEADER);
        const rowFirAlign = this.children[rowIdx].children[0].props['textAlign'];
        const commonAlign = this.children[rowIdx].children.every(cell => cell.props['textAlign'] === rowFirAlign);
        if (commonAlign) {
            cpr.instance.addActive('align-' + rowFirAlign);
        }
        if (this.props.rowHead) {
            cpr.instance.addActive('setHeadRow');
        }
        cpr.setInput('toolbarList', menu);
        cpr.instance.itemClick.pipe(takeUntilDestroyed(cpr.instance.destroyRef)).subscribe(({ item, event }) => {
            switch (item.name) {
                case 'align':
                    this.setRowAlign(rowIdx, item.value);
                    cpr.instance.replaceActiveGroupByName('align', item.id);
                    break;
                case 'insert':
                    this.addRow(item.value === 'top' ? rowIdx : rowIdx + 1);
                    break;
                case 'delete':
                    this.deleteRow(rowIdx);
                    close();
                    break;
                case 'setHeadRow':
                    this.setProp('rowHead', !this.props.rowHead);
                    this.props.colHead ? cpr.instance.addActive('setHeadRow') : cpr.instance.removeActive('setHeadRow');
                    break;
            }
        });
    }
    addRow(index) {
        const addHeight = 40;
        this._rowHeights.splice(index, 0, addHeight);
        const row = this.controller.createBlock('table-row', [this._colWidths.length]);
        this.model.insertChildren(index, [row]);
    }
    deleteRow(index, len = 1) {
        if (len === this.children.length) {
            return this.destroySelf();
        }
        this.model.deleteChildren(index, 1);
        this._rowHeights.splice(index, 1);
    }
    onTableBarRightClick(e) {
        e.preventDefault();
        e.stopPropagation();
        this.addCol(this.model.children[0].children.length);
    }
    onTableBarBottomClick(e) {
        e.preventDefault();
        e.stopPropagation();
        this.addRow(this.model.children.length);
    }
    /** 表格列宽调整 **/
    setColWidths() {
        this.model.yModel.get('props').set('colWidths', this._colWidths);
    }
    onMouseOver(e) {
        const target = e.target;
        if (target.tagName !== 'TD' || this.resizing$.value)
            return;
        const colIdx = parseInt(target.getAttribute('data-col-idx'));
        const rowIdx = parseInt(target.getAttribute('data-row-idx'));
        this.hoverCell = [rowIdx, colIdx];
        this.resizeColIdx = colIdx;
        this.resizeBarX = target.getBoundingClientRect().right - this.table.nativeElement.getBoundingClientRect().left;
    }
    onResizebarMouseDown(e) {
        e.stopPropagation();
        e.preventDefault();
        this.resizing$.next(true);
        const resizeSub = fromEvent(document, 'mousemove').pipe(takeUntil(this.resizing$.pipe(filter(v => !v))))
            .subscribe((e) => {
            const { left } = this.tableWrapper.nativeElement.getBoundingClientRect();
            const scrollLeft = this.tableWrapper.nativeElement.scrollLeft;
            if (!this.resizing$.value || e.clientX < left)
                return;
            const targetRect = this.table.nativeElement.querySelector(`td:nth-child(${this.resizeColIdx + 1})`).getBoundingClientRect();
            let newWidth = e.clientX - targetRect.left;
            // 不得小于50，不得大于maxWidth - 其他列宽度之和
            if (newWidth < 50)
                return;
            // // 如果是减少宽度，不用判断是否超出最大宽度
            // if (newWidth <= this.props.colWidths[this.resizeColIdx]) {
            //   this.resizeBarX = targetRect.right - left - 2
            //   this._colWidths[this.resizeColIdx] = newWidth
            //   return;
            // }
            // if (newWidth - this.props.colWidths[this.resizeColIdx] > width - this.props.colWidths.reduce((pre, cur) => pre + cur, 0)) return
            this.resizeBarX = targetRect.right + scrollLeft - left;
            this._colWidths[this.resizeColIdx] = newWidth;
        });
        fromEvent(document, 'mouseup').pipe(take(1)).subscribe(() => {
            if (!this.resizing$.value)
                return;
            this.resizing$.next(false);
            this.resizeColIdx = -1;
            this.setColWidths();
        });
    }
    /** 表格选中 **/
    focusCell(rowIdx, colIdx, pos) {
        const cell = this.model.children[rowIdx].children[colIdx];
        if (!cell)
            return;
        this.controller.getBlockRef(cell.id).setSelection(pos);
    }
    moveSelection(target, direction) {
        const cellEl = target.closest('td.table-cell');
        const cellPos = this.getCellPos(cellEl);
        if (!cellPos)
            return;
        const [rowIdx, colIdx] = cellPos;
        switch (direction) {
            case 'up':
                if (rowIdx === 0)
                    return;
                this.focusCell(rowIdx - 1, colIdx, 'end');
                break;
            case 'down':
                if (rowIdx === this.model.children.length - 1)
                    return;
                this.focusCell(rowIdx + 1, colIdx, 'start');
                break;
            case 'left':
                if (colIdx === 0)
                    return;
                this.focusCell(rowIdx, colIdx - 1, 'end');
                break;
            case 'right':
                if (colIdx === this.model.children[rowIdx].children.length - 1)
                    return;
                this.focusCell(rowIdx, colIdx + 1, 'start');
                break;
        }
    }
    clearSelectingCellText() {
        if (!this.selectingCell)
            return;
        const [start, end] = this.selectingCell;
        if (start[0] === end[0] && start[1] === end[1])
            return this.clearSelecting();
        const [startRowIdx, startColIdx] = start;
        const [endRowIdx, endColIdx] = end;
        this.controller.transact(() => {
            for (let rowIdx = startRowIdx; rowIdx <= endRowIdx; rowIdx++) {
                const tr = this.model.children[rowIdx];
                for (let colIdx = startColIdx; colIdx <= endColIdx; colIdx++) {
                    const td = tr.children[colIdx];
                    const block = this.controller.getBlockRef(td.id);
                    if (!block)
                        continue;
                    block.textLength && block.applyDelta([
                        { retain: 0 },
                        { delete: block.textLength }
                    ]);
                }
            }
        });
        const firstCell = this.model.children[startRowIdx].children[startColIdx];
        this.controller.selection.setSelection(firstCell.id, 0);
        this.clearSelecting();
    }
    onBlur() {
        console.log('blur', this.id);
        this.clearSelecting();
    }
    onMouseDown(e) {
        e.stopPropagation();
        this.clearSelecting();
        const target = e.target;
        const cellPos = this.getCellPos(target.closest('td.table-cell'));
        if (!cellPos)
            return;
        this.startSelectingCell = cellPos;
        this.selectingCell = [cellPos, cellPos];
        fromEvent(this.hostEl.nativeElement, 'mouseover').pipe(takeUntil(fromEvent(document, 'mouseup')))
            .subscribe((e) => {
            e.stopPropagation();
            if (!this.startSelectingCell || !this.selectingCell)
                return;
            const cellPos = this.getCellPos(e.target.closest('td.table-cell'));
            if (!cellPos)
                return;
            // 确定选区，左上角和右下角
            if (this.startSelectingCell[0] === cellPos[0] && this.startSelectingCell[1] === cellPos[1]) {
                return;
            }
            // 鼠标移动方向，确定是从左上到右下还是从右下到左上
            // 从左上到右下
            if (this.startSelectingCell[0] <= cellPos[0] && this.startSelectingCell[1] <= cellPos[1])
                this.selectingCell[1] = cellPos;
            // 从右下到左上
            else
                this.selectingCell[0] = cellPos;
            this.selecting$.next(true);
            this.selectCell();
        });
        fromEvent(document, 'mouseup').pipe(take(1)).subscribe((e) => {
            if (!this.selecting$.value)
                return this.clearSelecting();
            this.selecting$.next(false);
        });
    }
    clearSelecting() {
        this.selectingCell = undefined;
        this.startSelectingCell = undefined;
        this.cells?.forEach(cell => cell.classList.remove('selected'));
        this.cells = undefined;
    }
    selectCell() {
        if (!this.selectingCell)
            return;
        if (!this.cells) {
            this.cells = this.hostEl.nativeElement.querySelectorAll('td.table-cell');
        }
        this.cells.forEach((cell, idx) => {
            const [cellRowIdx, cellColIdx] = this.getCellPos(cell);
            if (cellRowIdx >= this.selectingCell[0][0] && cellRowIdx <= this.selectingCell[1][0] && cellColIdx >= this.selectingCell[0][1] && cellColIdx <= this.selectingCell[1][1]) {
                cell.classList.add('selected');
            }
            else {
                cell.classList.remove('selected');
            }
        });
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: TableBlock, deps: [{ token: i1.Overlay }], target: i0.ɵɵFactoryTarget.Component }); }
    static { this.ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "14.0.0", version: "17.3.12", type: TableBlock, isStandalone: true, selector: "div.table-block", viewQueries: [{ propertyName: "table", first: true, predicate: ["tableElement"], descendants: true, read: ElementRef }, { propertyName: "tableWrapper", first: true, predicate: ["wrapper"], descendants: true, read: ElementRef }], usesInheritance: true, ngImport: i0, template: "<div class=\"table-header_row-bar\" (click)=\"onShowRowBar($event)\" [class.active]=\"activeRowIdx >= 0\">\n    <span *ngFor=\"let row of _rowHeights; index as idx; trackBy: trackByValue\" [attr.data-row-idx]=\"idx\"\n          [class.active]=\"activeRowIdx === idx\" [class.hover]=\"hoverCell[0] === idx\" [style.height.px]=\"row || 0\"></span>\n</div>\n\n<div class=\"table-wrapper\" [class.col-head]=\"props.colHead\" [class.row-head]=\"props.rowHead\" #wrapper>\n  <div class=\"table-col-resize-bar\" *ngIf=\"!(controller.readonly$ | async)\" [class.active]=\"resizing$ | async\"\n       [hidden]=\"resizeColIdx < 0\" [style.left.px]=\"resizeBarX\" (mousedown)=\"onResizebarMouseDown($event)\"></div>\n\n  <div class=\"table-header_col-bar\" (click)=\"onShowColBar($event)\" [class.active]=\"activeColIdx >= 0\">\n    <span *ngFor=\"let col of _colWidths; index as idx\" [style.width.px]=\"col\" [attr.data-col-idx]=\"idx\"\n          [class.active]=\"activeColIdx === idx\" [class.hover]=\"hoverCell[1] === idx\"></span>\n  </div>\n\n  <table tabindex=\"0\" #tableElement (keydown)=\"onKeyDown($event)\" (blur)=\"onBlur()\" (mousedown)=\"onMouseDown($event)\"\n         (mouseover)=\"onMouseOver($event)\">\n    <colgroup>\n      <col *ngFor=\"let column of _colWidths; index as idx; trackBy: trackByValue\" [width]=\"column\"/>\n    </colgroup>\n\n    <tbody>\n    <tr class=\"table-row\" *ngFor=\"let row of model.children; index as rowIdx; trackBy: trackById\" [rowIdx]=\"rowIdx\"\n        [controller]=\"controller\" [model]=\"$any(row)\" [class.active]=\"activeRowIdx === rowIdx\"\n        (heightChange)=\"onRowHeightChange($event, rowIdx)\">\n    </tr>\n    </tbody>\n  </table>\n</div>\n\n\n\n\n\n", styles: [":host{display:block;position:relative;padding:0 2px 0 10px}:host.selected table{border:1px solid var(--bf-selected-border);background:var(--bf-selected)}:host:hover .table-header_row-bar,:host:focus-within .table-header_row-bar{display:block}:host:hover .table-header_col-bar,:host:hover .table-add-bar,:host:focus-within .table-header_col-bar,:host:focus-within .table-add-bar{display:flex}:host .table-col-resize-bar{z-index:3;position:absolute;top:0;left:0;height:100%;width:6px;background-color:#4857e2;cursor:col-resize;opacity:0}:host .table-col-resize-bar.active,:host .table-col-resize-bar:hover{opacity:1}:host .table-wrapper{padding-top:10px;position:relative;overflow-x:auto;overflow-y:hidden;scrollbar-width:thin;scrollbar-color:rgba(153,153,153,.5) transparent}:host .table-wrapper.col-head ::ng-deep td:first-child{font-weight:700;background:#f2f3f5;position:sticky;left:0;z-index:1}:host .table-wrapper.col-head .table-header_col-bar>span:first-child{position:sticky;left:0;z-index:2}:host .table-wrapper.row-head tr:first-child{font-weight:700;background:#f2f3f5;position:sticky;top:0;z-index:1}:host .table-header_col-bar{position:absolute;top:0;left:0;display:none;height:100%}:host .table-header_col-bar.active{display:flex}:host .table-header_col-bar>span{height:10px;background:#f1f1f1;cursor:pointer;position:relative}:host .table-header_col-bar>span:hover,:host .table-header_col-bar>span.hover{background:#e0e0e0}:host .table-header_col-bar>span.active{height:100%;z-index:2;background:unset}:host .table-header_col-bar>span.active:before,:host .table-header_col-bar>span.active:after{z-index:2;content:\"\";position:absolute;top:0;left:0;width:100%}:host .table-header_col-bar>span.active:before{height:10px;background:#4857e2}:host .table-header_col-bar>span.active:after{height:100%;background:#5f6fff14}:host .table-header_row-bar{display:none;position:absolute;top:10px;left:0;height:100%;overflow:hidden}:host .table-header_row-bar.active{display:block}:host .table-header_row-bar>span{display:block;width:10px;background:#f1f1f1;cursor:pointer;position:relative}:host .table-header_row-bar>span.active{background:#4857e2}:host .table-header_row-bar>span:hover,:host .table-header_row-bar>span.hover{background:#e0e0e0}:host table{position:relative;outline:none;table-layout:fixed;border-collapse:collapse;width:fit-content;font-size:var(--bf-fs)}:host table tr{position:relative}:host table tr.active:after{z-index:2;position:absolute;content:\"\";top:0;left:0;width:100%;height:100%;background:#5f6fff14!important}:host table ::ng-deep .table-cell{padding:10px;position:relative;border:1px solid #ccc;min-height:calc(var(--bf-fs) + 20px)}:host table ::ng-deep .table-cell.selected:after{z-index:2;position:absolute;content:\"\";top:0;left:0;width:100%;height:100%;background:#5f6fff14!important}:host .table-add-bar{display:none;position:absolute;background-color:#f1f1f0;color:#a5a5a2;align-items:center;justify-content:center;border-radius:4px;cursor:pointer;transition:all .2s;font-size:14px}:host .table-add-bar:hover{background-color:#e0e0de}:host .table-add-bar-right{top:0;right:-20px;width:16px;height:100%}:host .table-add-bar-bottom{bottom:-20px;width:100%;left:0;height:16px}:host .table-add-bar-bottom-right{position:absolute;bottom:-20px;right:-20px;width:16px;height:16px;background-color:#f1f1f0;color:#a5a5a2;border-radius:4px;cursor:pointer;display:flex;align-items:center;justify-content:center}\n"], dependencies: [{ kind: "component", type: TableRowBlock, selector: "tr.table-row", inputs: ["rowIdx"], outputs: ["heightChange"] }, { kind: "directive", type: NgIf, selector: "[ngIf]", inputs: ["ngIf", "ngIfThen", "ngIfElse"] }, { kind: "directive", type: NgForOf, selector: "[ngFor][ngForOf]", inputs: ["ngForOf", "ngForTrackBy", "ngForTemplate"] }, { kind: "pipe", type: AsyncPipe, name: "async" }] }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: TableBlock, decorators: [{
            type: Component,
            args: [{ selector: 'div.table-block', standalone: true, imports: [
                        TableRowBlock,
                        NgIf,
                        NgForOf,
                        AsyncPipe,
                    ], template: "<div class=\"table-header_row-bar\" (click)=\"onShowRowBar($event)\" [class.active]=\"activeRowIdx >= 0\">\n    <span *ngFor=\"let row of _rowHeights; index as idx; trackBy: trackByValue\" [attr.data-row-idx]=\"idx\"\n          [class.active]=\"activeRowIdx === idx\" [class.hover]=\"hoverCell[0] === idx\" [style.height.px]=\"row || 0\"></span>\n</div>\n\n<div class=\"table-wrapper\" [class.col-head]=\"props.colHead\" [class.row-head]=\"props.rowHead\" #wrapper>\n  <div class=\"table-col-resize-bar\" *ngIf=\"!(controller.readonly$ | async)\" [class.active]=\"resizing$ | async\"\n       [hidden]=\"resizeColIdx < 0\" [style.left.px]=\"resizeBarX\" (mousedown)=\"onResizebarMouseDown($event)\"></div>\n\n  <div class=\"table-header_col-bar\" (click)=\"onShowColBar($event)\" [class.active]=\"activeColIdx >= 0\">\n    <span *ngFor=\"let col of _colWidths; index as idx\" [style.width.px]=\"col\" [attr.data-col-idx]=\"idx\"\n          [class.active]=\"activeColIdx === idx\" [class.hover]=\"hoverCell[1] === idx\"></span>\n  </div>\n\n  <table tabindex=\"0\" #tableElement (keydown)=\"onKeyDown($event)\" (blur)=\"onBlur()\" (mousedown)=\"onMouseDown($event)\"\n         (mouseover)=\"onMouseOver($event)\">\n    <colgroup>\n      <col *ngFor=\"let column of _colWidths; index as idx; trackBy: trackByValue\" [width]=\"column\"/>\n    </colgroup>\n\n    <tbody>\n    <tr class=\"table-row\" *ngFor=\"let row of model.children; index as rowIdx; trackBy: trackById\" [rowIdx]=\"rowIdx\"\n        [controller]=\"controller\" [model]=\"$any(row)\" [class.active]=\"activeRowIdx === rowIdx\"\n        (heightChange)=\"onRowHeightChange($event, rowIdx)\">\n    </tr>\n    </tbody>\n  </table>\n</div>\n\n\n\n\n\n", styles: [":host{display:block;position:relative;padding:0 2px 0 10px}:host.selected table{border:1px solid var(--bf-selected-border);background:var(--bf-selected)}:host:hover .table-header_row-bar,:host:focus-within .table-header_row-bar{display:block}:host:hover .table-header_col-bar,:host:hover .table-add-bar,:host:focus-within .table-header_col-bar,:host:focus-within .table-add-bar{display:flex}:host .table-col-resize-bar{z-index:3;position:absolute;top:0;left:0;height:100%;width:6px;background-color:#4857e2;cursor:col-resize;opacity:0}:host .table-col-resize-bar.active,:host .table-col-resize-bar:hover{opacity:1}:host .table-wrapper{padding-top:10px;position:relative;overflow-x:auto;overflow-y:hidden;scrollbar-width:thin;scrollbar-color:rgba(153,153,153,.5) transparent}:host .table-wrapper.col-head ::ng-deep td:first-child{font-weight:700;background:#f2f3f5;position:sticky;left:0;z-index:1}:host .table-wrapper.col-head .table-header_col-bar>span:first-child{position:sticky;left:0;z-index:2}:host .table-wrapper.row-head tr:first-child{font-weight:700;background:#f2f3f5;position:sticky;top:0;z-index:1}:host .table-header_col-bar{position:absolute;top:0;left:0;display:none;height:100%}:host .table-header_col-bar.active{display:flex}:host .table-header_col-bar>span{height:10px;background:#f1f1f1;cursor:pointer;position:relative}:host .table-header_col-bar>span:hover,:host .table-header_col-bar>span.hover{background:#e0e0e0}:host .table-header_col-bar>span.active{height:100%;z-index:2;background:unset}:host .table-header_col-bar>span.active:before,:host .table-header_col-bar>span.active:after{z-index:2;content:\"\";position:absolute;top:0;left:0;width:100%}:host .table-header_col-bar>span.active:before{height:10px;background:#4857e2}:host .table-header_col-bar>span.active:after{height:100%;background:#5f6fff14}:host .table-header_row-bar{display:none;position:absolute;top:10px;left:0;height:100%;overflow:hidden}:host .table-header_row-bar.active{display:block}:host .table-header_row-bar>span{display:block;width:10px;background:#f1f1f1;cursor:pointer;position:relative}:host .table-header_row-bar>span.active{background:#4857e2}:host .table-header_row-bar>span:hover,:host .table-header_row-bar>span.hover{background:#e0e0e0}:host table{position:relative;outline:none;table-layout:fixed;border-collapse:collapse;width:fit-content;font-size:var(--bf-fs)}:host table tr{position:relative}:host table tr.active:after{z-index:2;position:absolute;content:\"\";top:0;left:0;width:100%;height:100%;background:#5f6fff14!important}:host table ::ng-deep .table-cell{padding:10px;position:relative;border:1px solid #ccc;min-height:calc(var(--bf-fs) + 20px)}:host table ::ng-deep .table-cell.selected:after{z-index:2;position:absolute;content:\"\";top:0;left:0;width:100%;height:100%;background:#5f6fff14!important}:host .table-add-bar{display:none;position:absolute;background-color:#f1f1f0;color:#a5a5a2;align-items:center;justify-content:center;border-radius:4px;cursor:pointer;transition:all .2s;font-size:14px}:host .table-add-bar:hover{background-color:#e0e0de}:host .table-add-bar-right{top:0;right:-20px;width:16px;height:100%}:host .table-add-bar-bottom{bottom:-20px;width:100%;left:0;height:16px}:host .table-add-bar-bottom-right{position:absolute;bottom:-20px;right:-20px;width:16px;height:16px;background-color:#f1f1f0;color:#a5a5a2;border-radius:4px;cursor:pointer;display:flex;align-items:center;justify-content:center}\n"] }]
        }], ctorParameters: () => [{ type: i1.Overlay }], propDecorators: { table: [{
                type: ViewChild,
                args: ['tableElement', { read: ElementRef }]
            }], tableWrapper: [{
                type: ViewChild,
                args: ['wrapper', { read: ElementRef }]
            }] } });
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGFibGUuYmxvY2suanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi9ibG9ja2Zsb3cvc3JjL2Jsb2Nrcy90YWJsZS90YWJsZS5ibG9jay50cyIsIi4uLy4uLy4uLy4uLy4uL2Jsb2NrZmxvdy9zcmMvYmxvY2tzL3RhYmxlL3RhYmxlLmJsb2NrLmh0bWwiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsT0FBTyxFQUFDLFNBQVMsRUFBRSxVQUFVLEVBQUUsU0FBUyxFQUFDLE1BQU0sZUFBZSxDQUFDO0FBRS9ELE9BQU8sRUFDTCxTQUFTLEVBR1QsZUFBZSxFQUNmLGlCQUFpQixFQUNqQixrQkFBa0IsRUFDbkIsTUFBTSxZQUFZLENBQUM7QUFDcEIsT0FBTyxFQUFDLGFBQWEsRUFBQyxNQUFNLG1CQUFtQixDQUFDO0FBQ2hELE9BQU8sRUFBQyxTQUFTLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBQyxNQUFNLGlCQUFpQixDQUFDO0FBQ3pELE9BQU8sRUFBQyxlQUFlLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFDLE1BQU0sTUFBTSxDQUFDO0FBQ3pFLE9BQU8sRUFBQyxrQkFBa0IsRUFBQyxNQUFNLDRCQUE0QixDQUFDO0FBRTlELE9BQU8sRUFBQyxlQUFlLEVBQUMsTUFBTSxxQkFBcUIsQ0FBQztBQUNwRCxPQUFPLEVBQUMsWUFBWSxFQUFDLE1BQU0sa0JBQWtCLENBQUM7QUFFOUMsT0FBTyxFQUFDLGNBQWMsRUFBRSxjQUFjLEVBQUUsbUJBQW1CLEVBQUUsbUJBQW1CLEVBQUMsTUFBTSxTQUFTLENBQUM7OztBQWNqRyxNQUFNLE9BQU8sVUFBVyxTQUFRLFNBQTJCO0lBd0J6RCxZQUNVLE9BQWdCO1FBRXhCLEtBQUssRUFBRSxDQUFDO1FBRkEsWUFBTyxHQUFQLE9BQU8sQ0FBUztRQXhCaEIsaUJBQVksR0FBRyxDQUFDLENBQUMsQ0FBQTtRQUNqQixpQkFBWSxHQUFHLENBQUMsQ0FBQyxDQUFB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LENBQUMsVUFBVSxFQUFFLFVBQVUsQ0FBQyxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsSUFBbUIsQ0FBRSxDQUFBO1lBQ3RFLElBQUksVUFBVSxJQUFJLElBQUksQ0FBQyxhQUFjLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksVUFBVSxJQUFJLElBQUksQ0FBQyxhQUFjLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksVUFBVSxJQUFJLElBQUksQ0FBQyxhQUFjLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksVUFBVSxJQUFJLElBQUksQ0FBQyxhQUFjLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztnQkFDN0ssSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFDLENBQUE7WUFDaEMsQ0FBQztpQkFBTSxDQUFDO2dCQUNOLElBQUksQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxDQUFBO1lBQ25DLENBQUM7UUFDSCxDQUFDLENBQUMsQ0FBQTtJQUNKLENBQUM7K0dBMWZVLFVBQVU7bUdBQVYsVUFBVSw2SkFnQmEsVUFBVSxrR0FDZixVQUFVLG9EQ2pEekMsZ3JEQWlDQSxpN0dEUEksYUFBYSx3R0FDYixJQUFJLDZGQUNKLE9BQU8sOEdBQ1AsU0FBUzs7NEZBR0EsVUFBVTtrQkFadEIsU0FBUzsrQkFDRSxpQkFBaUIsY0FHZixJQUFJLFdBQ1A7d0JBQ1AsYUFBYTt3QkFDYixJQUFJO3dCQUNKLE9BQU87d0JBQ1AsU0FBUztxQkFDVjs0RUFrQjhDLEtBQUs7c0JBQW5ELFNBQVM7dUJBQUMsY0FBYyxFQUFFLEVBQUMsSUFBSSxFQUFFLFVBQVUsRUFBQztnQkFDSCxZQUFZO3NCQUFyRCxTQUFTO3VCQUFDLFNBQVMsRUFBRSxFQUFDLElBQUksRUFBRSxVQUFVLEVBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQge0NvbXBvbmVudCwgRWxlbWVudFJlZiwgVmlld0NoaWxkfSBmcm9tIFwiQGFuZ3VsYXIvY29yZVwiO1xuaW1wb3J0IHtJVGFibGVCbG9ja01vZGVsLCBJVGFibGVSb3dCbG9ja01vZGVsfSBmcm9tIFwiLi90eXBlXCI7XG5pbXBvcnQge1xuICBCYXNlQmxvY2ssXG4gIEVkaXRhYmxlQmxvY2ssXG4gIGdldEN1cnJlbnRDaGFyYWN0ZXJSYW5nZSxcbiAgaXNDdXJzb3JBdEVsRW5kLFxuICBpc0N1cnNvckF0RWxTdGFydCxcbiAgVVNFUl9DSEFOR0VfU0lHTkFMXG59IGZyb20gXCIuLi8uLi9jb3JlXCI7XG5pbXBvcnQge1RhYmxlUm93QmxvY2t9IGZyb20gXCIuL3RhYmxlLXJvdy5ibG9ja1wiO1xuaW1wb3J0IHtBc3luY1BpcGUsIE5nRm9yT2YsIE5nSWZ9IGZyb20gXCJAYW5ndWxhci9jb21tb25cIjtcbmltcG9ydCB7QmVoYXZpb3JTdWJqZWN0LCBmaWx0ZXIsIGZyb21FdmVudCwgdGFrZSwgdGFrZVVudGlsfSBmcm9tIFwicnhqc1wiO1xuaW1wb3J0IHt0YWtlVW50aWxEZXN0cm95ZWR9IGZyb20gXCJAYW5ndWxhci9jb3JlL3J4anMtaW50ZXJvcFwiO1xuaW1wb3J0IHtUYWJsZUNlbGxCbG9ja30gZnJvbSBcIi4vdGFibGUtY2VsbC5ibG9ja1wiO1xuaW1wb3J0IHtDb21wb25lbnRQb3J0YWx9IGZyb20gXCJAYW5ndWxhci9jZGsvcG9ydGFsXCI7XG5pbXBvcnQge0Zsb2F0VG9vbGJhcn0gZnJvbSBcIi4uLy4uL2NvbXBvbmVudHNcIjtcbmltcG9ydCB7T3ZlcmxheSwgT3ZlcmxheVJlZn0gZnJvbSBcIkBhbmd1bGFyL2Nkay9vdmVybGF5XCI7XG5pbXBvcnQge1NFVF9DT0xfSEVBREVSLCBTRVRfUk9XX0hFQURFUiwgVGFibGVDb2xDb250cm9sTWVudSwgVGFibGVSb2xDb250cm9sTWVudX0gZnJvbSBcIi4vY29uc3RcIjtcblxuQENvbXBvbmVudCh7XG4gIHNlbGVjdG9yOiAnZGl2LnRhYmxlLWJsb2NrJyxcbiAgdGVtcGxhdGVVcmw6ICcuL3RhYmxlLmJsb2NrLmh0bWwnLFxuICBzdHlsZVVybDogJy4vdGFibGUuYmxvY2suc2NzcycsXG4gIHN0YW5kYWxvbmU6IHRydWUsXG4gIGltcG9ydHM6IFtcbiAgICBUYWJsZVJvd0Jsb2NrLFxuICAgIE5nSWYsXG4gICAgTmdGb3JPZixcbiAgICBBc3luY1BpcGUsXG4gIF0sXG59KVxuZXhwb3J0IGNsYXNzIFRhYmxlQmxvY2sgZXh0ZW5kcyBCYXNlQmxvY2s8SVRhYmxlQmxvY2tNb2RlbD4ge1xuICBwcm90ZWN0ZWQgYWN0aXZlQ29sSWR4ID0gLTFcbiAgcHJvdGVjdGVkIGFjdGl2ZVJvd0lkeCA9IC0xXG4gIHByb3RlY3RlZCBfcm93SGVpZ2h0czogbnVtYmVyW10gPSBbXVxuXG4gIHByb3RlY3RlZCBob3ZlckNlbGw6IFtudW1iZXIsIG51bWJlcl0gPSBbLTEsIC0xXVxuICBwcm90ZWN0ZWQgX2NvbFdpZHRoczogbnVtYmVyW10gPSBbXVxuICBwcm90ZWN0ZWQgcmVzaXppbmckID0gbmV3IEJlaGF2aW9yU3ViamVjdChmYWxzZSlcbiAgcHJvdGVjdGVkIHJlc2l6ZUNvbElkeCA9IC0xXG4gIHByb3RlY3RlZCByZXNpemVCYXJYID0gMFxuXG4gIHByaXZhdGUgY2VsbHM/OiBOb2RlTGlzdE9mPEVsZW1lbnQ+XG4gIHByaXZhdGUgc3RhcnRTZWxlY3RpbmdDZWxsPzogW251bWJlciwgbnVtYmVyXVxuICBwcml2YXRlIHNlbGVjdGluZ0NlbGw/OiBbW251bWJlciwgbnVtYmVyXSwgW251bWJlciwgbnVtYmVyXV1cbiAgcHJpdmF0ZSBzZWxlY3RpbmckID0gbmV3IEJlaGF2aW9yU3ViamVjdDxib29sZWFuPihmYWxzZSlcblxuICBAVmlld0NoaWxkKCd0YWJsZUVsZW1lbnQnLCB7cmVhZDogRWxlbWVudFJlZn0pIHRhYmxlITogRWxlbWVudFJlZjxIVE1MVGFibGVFbGVtZW50PlxuICBAVmlld0NoaWxkKCd3cmFwcGVyJywge3JlYWQ6IEVsZW1lbnRSZWZ9KSB0YWJsZVdyYXBwZXIhOiBFbGVtZW50UmVmPEhUTUxFbGVtZW50PlxuXG4gIHRyYWNrQnlJZCA9IChpbmRleDogbnVtYmVyLCBpdGVtOiBhbnkpID0+IGl0ZW0uaWRcbiAgdHJhY2tCeVZhbHVlID0gKGluZGV4OiBudW1iZXIsIHc6IG51bWJlcikgPT4gd1xuXG4gIHByaXZhdGUgb3ZlcmxheVJlZj86IE92ZXJsYXlSZWZcblxuICBjb25zdHJ1Y3RvcihcbiAgICBwcml2YXRlIG92ZXJsYXk6IE92ZXJsYXksXG4gICkge1xuICAgIHN1cGVyKCk7XG4gIH1cblxuICBvdmVycmlkZSBuZ0FmdGVyVmlld0luaXQoKSB7XG4gICAgc3VwZXIubmdBZnRlclZpZXdJbml0KCk7XG4gICAgdGhpcy5fY29sV2lkdGhzID0gWy4uLnRoaXMubW9kZWwucHJvcHMuY29sV2lkdGhzXVxuXG4gICAgdGhpcy5zZWxlY3RpbmckLnBpcGUodGFrZVVudGlsRGVzdHJveWVkKHRoaXMuZGVzdHJveVJlZiksIGZpbHRlcihlID0+IGUpKS5zdWJzY3JpYmUoKHNlbGVjdGluZykgPT4ge1xuICAgICAgd2luZG93LmdldFNlbGVjdGlvbigpIS5yZW1vdmVBbGxSYW5nZXMoKVxuICAgICAgdGhpcy50YWJsZS5uYXRpdmVFbGVtZW50LmZvY3VzKHtwcmV2ZW50U2Nyb2xsOiB0cnVlfSlcbiAgICB9KVxuXG4gICAgdGhpcy5tb2RlbC51cGRhdGUkLnBpcGUodGFrZVVudGlsRGVzdHJveWVkKHRoaXMuZGVzdHJveVJlZikpLnN1YnNjcmliZShlID0+IHtcbiAgICAgIGlmIChlLnR5cGUgPT09ICdwcm9wcycpIHtcbiAgICAgICAgaWYgKGUuZXZlbnQuY2hhbmdlcy5rZXlzLmdldCgnY29sV2lkdGhzJykpIHtcbiAgICAgICAgICB0aGlzLl9jb2xXaWR0aHMgPSBbLi4udGhpcy5tb2RlbC5wcm9wcy5jb2xXaWR0aHNdXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KVxuICB9XG5cbiAgb3ZlcnJpZGUgbmdPbkRlc3Ryb3koKSB7XG4gICAgc3VwZXIubmdPbkRlc3Ryb3koKTtcbiAgICB0aGlzLm92ZXJsYXlSZWY/LmRpc3Bvc2UoKVxuICB9XG5cbiAgb25LZXlEb3duKGU6IEtleWJvYXJkRXZlbnQpIHtcbiAgICBpZiAoZS5jb2RlID09PSAnS2V5QycgJiYgKGUuY3RybEtleSB8fCBlLm1ldGFLZXkpKSB7XG4gICAgICB0aGlzLmNvcHlDZWxscyhlKVxuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAodGhpcy5jb250cm9sbGVyLnJlYWRvbmx5JC52YWx1ZSkgcmV0dXJuO1xuICAgIHN3aXRjaCAoZS5rZXkpIHtcbiAgICAgIGNhc2UgJ0VudGVyJzpcbiAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICBicmVha1xuICAgICAgY2FzZSAnQXJyb3dMZWZ0JzpcbiAgICAgIGNhc2UgJ0Fycm93VXAnOiB7XG4gICAgICAgIGUuc3RvcFByb3BhZ2F0aW9uKClcbiAgICAgICAgaWYgKHRoaXMuc2VsZWN0aW5nQ2VsbCkge1xuICAgICAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgICB0aGlzLmZvY3VzQ2VsbCh0aGlzLnNlbGVjdGluZ0NlbGxbMF1bMF0sIHRoaXMuc2VsZWN0aW5nQ2VsbFswXVsxXSwgJ3N0YXJ0JylcbiAgICAgICAgICByZXR1cm5cbiAgICAgICAgfVxuICAgICAgICBjb25zdCBjZWxsID0gZS50YXJnZXQgYXMgSFRNTEVsZW1lbnRcbiAgICAgICAgaWYgKGlzQ3Vyc29yQXRFbFN0YXJ0KGNlbGwpKSB7XG4gICAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICAgIHRoaXMubW92ZVNlbGVjdGlvbihlLnRhcmdldCBhcyBIVE1MRWxlbWVudCwgZS5rZXkgPT09ICdBcnJvd0xlZnQnID8gJ2xlZnQnIDogJ3VwJylcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgICBicmVha1xuICAgICAgY2FzZSAnQXJyb3dSaWdodCc6XG4gICAgICBjYXNlICdBcnJvd0Rvd24nOiB7XG4gICAgICAgIGUuc3RvcFByb3BhZ2F0aW9uKClcbiAgICAgICAgaWYgKHRoaXMuc2VsZWN0aW5nQ2VsbCkge1xuICAgICAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgICB0aGlzLmZvY3VzQ2VsbCh0aGlzLnNlbGVjdGluZ0NlbGxbMV1bMF0sIHRoaXMuc2VsZWN0aW5nQ2VsbFsxXVsxXSwgJ2VuZCcpXG4gICAgICAgICAgcmV0dXJuXG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgdGFyZ2V0ID0gZS50YXJnZXQgYXMgSFRNTEVsZW1lbnRcbiAgICAgICAgaWYgKGlzQ3Vyc29yQXRFbEVuZCh0YXJnZXQpKSB7XG4gICAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICAgIHRoaXMubW92ZVNlbGVjdGlvbih0YXJnZXQsIGUua2V5ID09PSAnQXJyb3dSaWdodCcgPyAncmlnaHQnIDogJ2Rvd24nKVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICAgIGJyZWFrXG4gICAgICBjYXNlICdCYWNrc3BhY2UnOlxuICAgICAgICBpZiAodGhpcy5zZWxlY3RpbmdDZWxsKSB7XG4gICAgICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKVxuICAgICAgICAgIGUucHJldmVudERlZmF1bHQoKVxuICAgICAgICAgIHRoaXMuY2xlYXJTZWxlY3RpbmdDZWxsVGV4dCgpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgY29uc3QgY2VsbCA9IGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50XG4gICAgICAgICAgaWYgKGlzQ3Vyc29yQXRFbFN0YXJ0KGNlbGwpKSB7XG4gICAgICAgICAgICBlLnByZXZlbnREZWZhdWx0KClcbiAgICAgICAgICAgIGUuc3RvcFByb3BhZ2F0aW9uKClcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWtcbiAgICB9XG4gIH1cblxuICBjb3B5Q2VsbHMoZTogRXZlbnQpIHtcbiAgICBpZiAoIXRoaXMuc2VsZWN0aW5nQ2VsbCkgcmV0dXJuXG4gICAgZS5zdG9wUHJvcGFnYXRpb24oKVxuICAgIGUucHJldmVudERlZmF1bHQoKVxuICAgIGNvbnN0IGpzb24gPSB0aGlzLm1vZGVsLnRvSlNPTigpIGFzIElUYWJsZUJsb2NrTW9kZWxcbiAgICAvLyDoo4HmiKrpgInkuK3nmoTljZXlhYPmoLxcbiAgICBjb25zdCBbc3RhcnQsIGVuZF0gPSB0aGlzLnNlbGVjdGluZ0NlbGxcbiAgICBqc29uLmNoaWxkcmVuID0ganNvbi5jaGlsZHJlbi5zbGljZShzdGFydFswXSwgZW5kWzBdICsgMSk7XG4gICAgKGpzb24uY2hpbGRyZW4gYXMgSVRhYmxlUm93QmxvY2tNb2RlbFtdKS5mb3JFYWNoKHJvdyA9PiB7XG4gICAgICByb3cuY2hpbGRyZW4gPSByb3cuY2hpbGRyZW4uc2xpY2Uoc3RhcnRbMV0sIGVuZFsxXSArIDEpXG4gICAgfSlcbiAgICBqc29uLnByb3BzID0ge1xuICAgICAgY29sSGVhZDogZmFsc2UsXG4gICAgICByb3dIZWFkOiBmYWxzZSxcbiAgICAgIGNvbFdpZHRoczogdGhpcy5fY29sV2lkdGhzLnNsaWNlKHN0YXJ0WzFdLCBlbmRbMV0gKyAxKVxuICAgIH1cbiAgICB0aGlzLmNvbnRyb2xsZXIuY2xpcGJvYXJkLndyaXRlRGF0YShbe1xuICAgICAgdHlwZTogJ2Jsb2NrJyxcbiAgICAgIGRhdGE6IFtqc29uXVxuICAgIH1dKVxuICB9XG5cbiAgLyoqIOihqOagvOihjOWIl+aTjeS9nCAqKi9cbiAgb25TaG93Q29sQmFyKGU6IE1vdXNlRXZlbnQpIHtcbiAgICBlLnN0b3BQcm9wYWdhdGlvbigpXG4gICAgY29uc3QgdGFyZ2V0ID0gZS50YXJnZXQgYXMgSFRNTEVsZW1lbnRcbiAgICBjb25zdCBkYXRhQ29sSWR4ID0gdGFyZ2V0LmdldEF0dHJpYnV0ZSgnZGF0YS1jb2wtaWR4JylcbiAgICBpZiAoIWRhdGFDb2xJZHgpIHJldHVyblxuICAgIGNvbnN0IGNvbElkeCA9IHBhcnNlSW50KGRhdGFDb2xJZHgpXG4gICAgdGhpcy5hY3RpdmVDb2xJZHggPSBjb2xJZHhcbiAgICBjb25zdCBwb3J0YWwgPSBuZXcgQ29tcG9uZW50UG9ydGFsKEZsb2F0VG9vbGJhcilcbiAgICB0aGlzLm92ZXJsYXlSZWYgPSB0aGlzLm92ZXJsYXkuY3JlYXRlKHtcbiAgICAgIHBvc2l0aW9uU3RyYXRlZ3k6IHRoaXMub3ZlcmxheS5wb3NpdGlvbigpLmZsZXhpYmxlQ29ubmVjdGVkVG8odGFyZ2V0KS53aXRoUG9zaXRpb25zKFtcbiAgICAgICAge29yaWdpblg6ICdjZW50ZXInLCBvcmlnaW5ZOiAndG9wJywgb3ZlcmxheVg6ICdjZW50ZXInLCBvdmVybGF5WTogJ2JvdHRvbScsIG9mZnNldFk6IC00fSxcbiAgICAgICAge29yaWdpblg6ICdjZW50ZXInLCBvcmlnaW5ZOiAnYm90dG9tJywgb3ZlcmxheVg6ICdjZW50ZXInLCBvdmVybGF5WTogJ3RvcCcsIG9mZnNldFk6IDR9LFxuICAgICAgXSksXG4gICAgICBzY3JvbGxTdHJhdGVneTogdGhpcy5vdmVybGF5LnNjcm9sbFN0cmF0ZWdpZXMuY2xvc2UoKSxcbiAgICAgIGhhc0JhY2tkcm9wOiB0cnVlLFxuICAgICAgYmFja2Ryb3BDbGFzczogJ2Nkay1vdmVybGF5LXRyYW5zcGFyZW50LWJhY2tkcm9wJyxcbiAgICB9KVxuICAgIGNvbnN0IGNsb3NlID0gKCkgPT4ge1xuICAgICAgdGhpcy5vdmVybGF5UmVmPy5kaXNwb3NlKClcbiAgICAgIHRoaXMuYWN0aXZlQ29sSWR4ID0gLTFcbiAgICB9XG5cbiAgICB0aGlzLm92ZXJsYXlSZWYuYmFja2Ryb3BDbGljaygpLnBpcGUodGFrZSgxKSkuc3Vic2NyaWJlKGNsb3NlKVxuICAgIGNvbnN0IGNwciA9IHRoaXMub3ZlcmxheVJlZi5hdHRhY2gocG9ydGFsKVxuICAgIGNvbnN0IG1lbnUgPSBbLi4uVGFibGVDb2xDb250cm9sTWVudV1cbiAgICBpZiAoY29sSWR4ID09PSAwKSBtZW51LnVuc2hpZnQoU0VUX0NPTF9IRUFERVIpXG5cbiAgICBjb25zdCBjb2xGaXJBbGlnbiA9IHRoaXMuY2hpbGRyZW5bMF0uY2hpbGRyZW5bY29sSWR4XS5wcm9wc1sndGV4dEFsaWduJ11cbiAgICBjb25zdCBjb21tb25BbGlnbiA9IHRoaXMuY2hpbGRyZW4uZXZlcnkocm93ID0+IHJvdy5jaGlsZHJlbltjb2xJZHhdLnByb3BzWyd0ZXh0QWxpZ24nXSA9PT0gY29sRmlyQWxpZ24pXG4gICAgaWYgKGNvbW1vbkFsaWduKSB7XG4gICAgICBjcHIuaW5zdGFuY2UuYWRkQWN0aXZlKCdhbGlnbi0nICsgY29sRmlyQWxpZ24pXG4gICAgfVxuICAgIGlmICh0aGlzLnByb3BzLmNvbEhlYWQpIHtcbiAgICAgIGNwci5pbnN0YW5jZS5hZGRBY3RpdmUoJ3NldEhlYWRDb2wnKVxuICAgIH1cblxuICAgIGNwci5zZXRJbnB1dCgndG9vbGJhckxpc3QnLCBtZW51KVxuICAgIGNwci5pbnN0YW5jZS5pdGVtQ2xpY2sucGlwZSh0YWtlVW50aWxEZXN0cm95ZWQoY3ByLmluc3RhbmNlLmRlc3Ryb3lSZWYpKS5zdWJzY3JpYmUoKHtpdGVtLCBldmVudH0pID0+IHtcbiAgICAgIHN3aXRjaCAoaXRlbS5uYW1lKSB7XG4gICAgICAgIGNhc2UgJ2FsaWduJzpcbiAgICAgICAgICB0aGlzLnNldENvbEFsaWduKGNvbElkeCwgPGFueT5pdGVtLnZhbHVlKVxuICAgICAgICAgIGNwci5pbnN0YW5jZS5yZXBsYWNlQWN0aXZlR3JvdXBCeU5hbWUoaXRlbS5uYW1lLCBpdGVtLmlkKVxuICAgICAgICAgIGJyZWFrXG4gICAgICAgIGNhc2UgJ2luc2VydCc6XG4gICAgICAgICAgdGhpcy5hZGRDb2woaXRlbS52YWx1ZSA9PT0gJ2xlZnQnID8gY29sSWR4IDogY29sSWR4ICsgMSk7XG4gICAgICAgICAgYnJlYWtcbiAgICAgICAgY2FzZSAnZGVsZXRlJzpcbiAgICAgICAgICB0aGlzLmRlbGV0ZUNvbChjb2xJZHgpXG4gICAgICAgICAgY2xvc2UoKVxuICAgICAgICAgIGJyZWFrXG4gICAgICAgIGNhc2UgJ3NldEhlYWRDb2wnOlxuICAgICAgICAgIHRoaXMuc2V0UHJvcCgnY29sSGVhZCcsICF0aGlzLnByb3BzLmNvbEhlYWQpXG4gICAgICAgICAgdGhpcy5wcm9wcy5jb2xIZWFkID8gY3ByLmluc3RhbmNlLmFkZEFjdGl2ZSgnc2V0SGVhZENvbCcpIDogY3ByLmluc3RhbmNlLnJlbW92ZUFjdGl2ZSgnc2V0SGVhZENvbCcpXG4gICAgICAgICAgYnJlYWtcbiAgICAgIH1cbiAgICB9KVxuICB9XG5cbiAgc2V0Q29sQWxpZ24oY29sSWR4OiBudW1iZXIsIGFsaWduOiAnbGVmdCcgfCAnY2VudGVyJyB8ICdyaWdodCcpIHtcbiAgICBjb25zdCByb3dzID0gdGhpcy5tb2RlbC5jaGlsZHJlblxuICAgIHRoaXMuY29udHJvbGxlci50cmFuc2FjdCgoKSA9PiB7XG4gICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHJvd3MubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgY29uc3QgY2VsbCA9IHJvd3NbaV0uY2hpbGRyZW5bY29sSWR4XVxuICAgICAgICBpZiAoY2VsbCAmJiBjZWxsLnByb3BzWyd0ZXh0QWxpZ24nXSAhPT0gYWxpZ24pIGNlbGwuc2V0UHJvcCgndGV4dEFsaWduJywgYWxpZ24pXG4gICAgICB9XG4gICAgfSwgVVNFUl9DSEFOR0VfU0lHTkFMKVxuICB9XG5cbiAgc2V0Um93QWxpZ24ocm93SWR4OiBudW1iZXIsIGFsaWduOiAnbGVmdCcgfCAnY2VudGVyJyB8ICdyaWdodCcpIHtcbiAgICBjb25zdCBjZWxscyA9IHRoaXMubW9kZWwuY2hpbGRyZW5bcm93SWR4XS5jaGlsZHJlblxuICAgIHRoaXMuY29udHJvbGxlci50cmFuc2FjdCgoKSA9PiB7XG4gICAgICBjZWxscy5mb3JFYWNoKGNlbGwgPT4ge1xuICAgICAgICBpZiAoY2VsbC5wcm9wc1sndGV4dEFsaWduJ10gIT09IGFsaWduKSBjZWxsLnNldFByb3AoJ3RleHRBbGlnbicsIGFsaWduKVxuICAgICAgfSlcbiAgICB9KVxuICB9XG5cbiAgYWRkQ29sKGluZGV4OiBudW1iZXIpIHtcbiAgICBjb25zdCBhZGRXaWR0aCA9IDgwXG4gICAgLy8gLy8g5o+Q5YmN6K6h566X5a695bqmXG4gICAgLy8gY29uc3QgbWF4V2lkdGggPSB0aGlzLnRhYmxlLm5hdGl2ZUVsZW1lbnQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCkud2lkdGhcbiAgICAvLyBjb25zdCB0b3RhbFdpZHRoID0gdGhpcy5fY29sV2lkdGhzLnJlZHVjZSgocHJlLCBjdXIpID0+IHByZSArIGN1ciwgMClcbiAgICAvLyAvLyDlpoLmnpzotoXlh7rmnIDlpKflrr3luqZcbiAgICAvLyBpZiAodG90YWxXaWR0aCArIGFkZFdpZHRoID4gbWF4V2lkdGgpIHtcbiAgICAvLyAgIC8vIOWFtuS7luWIl+WuveW6puW5s+Wdh+WHj+WwkeWKoOWHuueahOWuveW6plxuICAgIC8vICAgY29uc3QgcmVkdWNlV2lkdGggPSBNYXRoLmZsb29yKCh0b3RhbFdpZHRoICsgYWRkV2lkdGggLSBtYXhXaWR0aCkgLyB0aGlzLl9jb2xXaWR0aHMubGVuZ3RoKVxuICAgIC8vICAgdGhpcy5fY29sV2lkdGhzID0gdGhpcy5fY29sV2lkdGhzLm1hcCh3aWR0aCA9PiB3aWR0aCAtIHJlZHVjZVdpZHRoKVxuICAgIC8vIH1cbiAgICB0aGlzLl9jb2xXaWR0aHMuc3BsaWNlKGluZGV4LCAwLCBhZGRXaWR0aClcblxuICAgIHRoaXMuY29udHJvbGxlci50cmFuc2FjdCgoKSA9PiB7XG4gICAgICB0aGlzLm1vZGVsLmNoaWxkcmVuLmZvckVhY2gocm93ID0+IHtcbiAgICAgICAgY29uc3QgY2VsbCA9IHRoaXMuY29udHJvbGxlci5jcmVhdGVCbG9jaygndGFibGUtY2VsbCcpXG4gICAgICAgIHJvdy5pbnNlcnRDaGlsZHJlbihpbmRleCwgW2NlbGxdKVxuICAgICAgfSlcbiAgICB9LCBVU0VSX0NIQU5HRV9TSUdOQUwpXG4gICAgdGhpcy5zZXRDb2xXaWR0aHMoKVxuICB9XG5cbiAgZGVsZXRlQ29sKGluZGV4OiBudW1iZXIsIGxlbiA9IDEpIHtcbiAgICBpZiAobGVuID09PSB0aGlzLmNoaWxkcmVuWzBdLmNoaWxkcmVuLmxlbmd0aCkge1xuICAgICAgcmV0dXJuIHRoaXMuZGVzdHJveVNlbGYoKVxuICAgIH1cbiAgICB0aGlzLmNvbnRyb2xsZXIudHJhbnNhY3QoKCkgPT4ge1xuICAgICAgdGhpcy5tb2RlbC5jaGlsZHJlbi5mb3JFYWNoKHJvdyA9PiB7XG4gICAgICAgIHJvdy5kZWxldGVDaGlsZHJlbihpbmRleCwgMSlcbiAgICAgIH0pXG4gICAgfSwgVVNFUl9DSEFOR0VfU0lHTkFMKVxuICAgIHRoaXMuX2NvbFdpZHRocy5zcGxpY2UoaW5kZXgsIDEpXG4gICAgdGhpcy5zZXRDb2xXaWR0aHMoKVxuICB9XG5cbiAgb25Sb3dIZWlnaHRDaGFuZ2UoaGVpZ2h0OiBudW1iZXIsIHJvd0lkeDogbnVtYmVyKSB7XG4gICAgdGhpcy5fcm93SGVpZ2h0c1tyb3dJZHhdID0gaGVpZ2h0XG4gIH1cblxuICBvblNob3dSb3dCYXIoZTogTW91c2VFdmVudCkge1xuICAgIGUuc3RvcFByb3BhZ2F0aW9uKClcbiAgICBjb25zdCB0YXJnZXQgPSBlLnRhcmdldCBhcyBIVE1MRWxlbWVudFxuICAgIGNvbnN0IGRhdGFSb3dJZHggPSB0YXJnZXQuZ2V0QXR0cmlidXRlKCdkYXRhLXJvdy1pZHgnKVxuICAgIGlmICghZGF0YVJvd0lkeCkgcmV0dXJuXG4gICAgY29uc3Qgcm93SWR4ID0gcGFyc2VJbnQoZGF0YVJvd0lkeClcbiAgICB0aGlzLmFjdGl2ZVJvd0lkeCA9IHJvd0lkeFxuICAgIGNvbnN0IHBvcnRhbCA9IG5ldyBDb21wb25lbnRQb3J0YWwoRmxvYXRUb29sYmFyKVxuICAgIGNvbnN0IG92ZXJsYXlSZWYgPSB0aGlzLm92ZXJsYXkuY3JlYXRlKHtcbiAgICAgIHBvc2l0aW9uU3RyYXRlZ3k6IHRoaXMub3ZlcmxheS5wb3NpdGlvbigpLmZsZXhpYmxlQ29ubmVjdGVkVG8odGFyZ2V0KS53aXRoUG9zaXRpb25zKFtcbiAgICAgICAge29yaWdpblg6ICdlbmQnLCBvcmlnaW5ZOiAndG9wJywgb3ZlcmxheVg6ICdzdGFydCcsIG92ZXJsYXlZOiAnYm90dG9tJywgb2Zmc2V0WTogLTR9LFxuICAgICAgICB7b3JpZ2luWDogJ2VuZCcsIG9yaWdpblk6ICdib3R0b20nLCBvdmVybGF5WDogJ3N0YXJ0Jywgb3ZlcmxheVk6ICd0b3AnLCBvZmZzZXRYOiA0fSxcbiAgICAgIF0pLFxuICAgICAgc2Nyb2xsU3RyYXRlZ3k6IHRoaXMub3ZlcmxheS5zY3JvbGxTdHJhdGVnaWVzLmNsb3NlKCksXG4gICAgICBoYXNCYWNrZHJvcDogdHJ1ZSxcbiAgICAgIGJhY2tkcm9wQ2xhc3M6ICdjZGstb3ZlcmxheS10cmFuc3BhcmVudC1iYWNrZHJvcCcsXG4gICAgfSlcbiAgICBjb25zdCBjbG9zZSA9ICgpID0+IHtcbiAgICAgIG92ZXJsYXlSZWYuZGlzcG9zZSgpXG4gICAgICB0aGlzLmFjdGl2ZVJvd0lkeCA9IC0xXG4gICAgfVxuICAgIG92ZXJsYXlSZWYuYmFja2Ryb3BDbGljaygpLnBpcGUodGFrZSgxKSkuc3Vic2NyaWJlKGNsb3NlKVxuICAgIGNvbnN0IGNwciA9IG92ZXJsYXlSZWYuYXR0YWNoKHBvcnRhbClcbiAgICBjb25zdCBtZW51ID0gWy4uLlRhYmxlUm9sQ29udHJvbE1lbnVdXG4gICAgaWYgKHJvd0lkeCA9PT0gMCkgbWVudS51bnNoaWZ0KFNFVF9ST1dfSEVBREVSKVxuXG4gICAgY29uc3Qgcm93RmlyQWxpZ24gPSB0aGlzLmNoaWxkcmVuW3Jvd0lkeF0uY2hpbGRyZW5bMF0ucHJvcHNbJ3RleHRBbGlnbiddXG4gICAgY29uc3QgY29tbW9uQWxpZ24gPSB0aGlzLmNoaWxkcmVuW3Jvd0lkeF0uY2hpbGRyZW4uZXZlcnkoY2VsbCA9PiBjZWxsLnByb3BzWyd0ZXh0QWxpZ24nXSA9PT0gcm93RmlyQWxpZ24pXG4gICAgaWYgKGNvbW1vbkFsaWduKSB7XG4gICAgICBjcHIuaW5zdGFuY2UuYWRkQWN0aXZlKCdhbGlnbi0nICsgcm93RmlyQWxpZ24pXG4gICAgfVxuXG4gICAgaWYgKHRoaXMucHJvcHMucm93SGVhZCkge1xuICAgICAgY3ByLmluc3RhbmNlLmFkZEFjdGl2ZSgnc2V0SGVhZFJvdycpXG4gICAgfVxuICAgIGNwci5zZXRJbnB1dCgndG9vbGJhckxpc3QnLCBtZW51KVxuICAgIGNwci5pbnN0YW5jZS5pdGVtQ2xpY2sucGlwZSh0YWtlVW50aWxEZXN0cm95ZWQoY3ByLmluc3RhbmNlLmRlc3Ryb3lSZWYpKS5zdWJzY3JpYmUoKHtpdGVtLCBldmVudH0pID0+IHtcbiAgICAgIHN3aXRjaCAoaXRlbS5uYW1lKSB7XG4gICAgICAgIGNhc2UgJ2FsaWduJzpcbiAgICAgICAgICB0aGlzLnNldFJvd0FsaWduKHJvd0lkeCwgPGFueT5pdGVtLnZhbHVlKVxuICAgICAgICAgIGNwci5pbnN0YW5jZS5yZXBsYWNlQWN0aXZlR3JvdXBCeU5hbWUoJ2FsaWduJywgaXRlbS5pZClcbiAgICAgICAgICBicmVha1xuICAgICAgICBjYXNlICdpbnNlcnQnOlxuICAgICAgICAgIHRoaXMuYWRkUm93KGl0ZW0udmFsdWUgPT09ICd0b3AnID8gcm93SWR4IDogcm93SWR4ICsgMSlcbiAgICAgICAgICBicmVha1xuICAgICAgICBjYXNlICdkZWxldGUnOlxuICAgICAgICAgIHRoaXMuZGVsZXRlUm93KHJvd0lkeClcbiAgICAgICAgICBjbG9zZSgpXG4gICAgICAgICAgYnJlYWtcbiAgICAgICAgY2FzZSAnc2V0SGVhZFJvdyc6XG4gICAgICAgICAgdGhpcy5zZXRQcm9wKCdyb3dIZWFkJywgIXRoaXMucHJvcHMucm93SGVhZClcbiAgICAgICAgICB0aGlzLnByb3BzLmNvbEhlYWQgPyBjcHIuaW5zdGFuY2UuYWRkQWN0aXZlKCdzZXRIZWFkUm93JykgOiBjcHIuaW5zdGFuY2UucmVtb3ZlQWN0aXZlKCdzZXRIZWFkUm93JylcbiAgICAgICAgICBicmVha1xuICAgICAgfVxuICAgIH0pXG4gIH1cblxuICBhZGRSb3coaW5kZXg6IG51bWJlcikge1xuICAgIGNvbnN0IGFkZEhlaWdodCA9IDQwXG4gICAgdGhpcy5fcm93SGVpZ2h0cy5zcGxpY2UoaW5kZXgsIDAsIGFkZEhlaWdodClcbiAgICBjb25zdCByb3cgPSB0aGlzLmNvbnRyb2xsZXIuY3JlYXRlQmxvY2soJ3RhYmxlLXJvdycsIFt0aGlzLl9jb2xXaWR0aHMubGVuZ3RoXSlcbiAgICB0aGlzLm1vZGVsLmluc2VydENoaWxkcmVuKGluZGV4LCBbcm93XSlcbiAgfVxuXG4gIGRlbGV0ZVJvdyhpbmRleDogbnVtYmVyLCBsZW4gPSAxKSB7XG4gICAgaWYgKGxlbiA9PT0gdGhpcy5jaGlsZHJlbi5sZW5ndGgpIHtcbiAgICAgIHJldHVybiB0aGlzLmRlc3Ryb3lTZWxmKClcbiAgICB9XG4gICAgdGhpcy5tb2RlbC5kZWxldGVDaGlsZHJlbihpbmRleCwgMSlcbiAgICB0aGlzLl9yb3dIZWlnaHRzLnNwbGljZShpbmRleCwgMSlcbiAgfVxuXG4gIG9uVGFibGVCYXJSaWdodENsaWNrKGU6IE1vdXNlRXZlbnQpIHtcbiAgICBlLnByZXZlbnREZWZhdWx0KClcbiAgICBlLnN0b3BQcm9wYWdhdGlvbigpXG4gICAgdGhpcy5hZGRDb2wodGhpcy5tb2RlbC5jaGlsZHJlblswXS5jaGlsZHJlbi5sZW5ndGgpXG4gIH1cblxuICBvblRhYmxlQmFyQm90dG9tQ2xpY2soZTogTW91c2VFdmVudCkge1xuICAgIGUucHJldmVudERlZmF1bHQoKVxuICAgIGUuc3RvcFByb3BhZ2F0aW9uKClcbiAgICB0aGlzLmFkZFJvdyh0aGlzLm1vZGVsLmNoaWxkcmVuLmxlbmd0aClcbiAgfVxuXG4gIC8qKiDooajmoLzliJflrr3osIPmlbQgKiovXG4gIHNldENvbFdpZHRocygpIHtcbiAgICB0aGlzLm1vZGVsLnlNb2RlbC5nZXQoJ3Byb3BzJykuc2V0KCdjb2xXaWR0aHMnLCB0aGlzLl9jb2xXaWR0aHMpXG4gIH1cblxuICBvbk1vdXNlT3ZlcihlOiBNb3VzZUV2ZW50KSB7XG4gICAgY29uc3QgdGFyZ2V0ID0gZS50YXJnZXQgYXMgSFRNTEVsZW1lbnRcbiAgICBpZiAodGFyZ2V0LnRhZ05hbWUgIT09ICdURCcgfHwgdGhpcy5yZXNpemluZyQudmFsdWUpIHJldHVyblxuICAgIGNvbnN0IGNvbElkeCA9IHBhcnNlSW50KHRhcmdldC5nZXRBdHRyaWJ1dGUoJ2RhdGEtY29sLWlkeCcpISlcbiAgICBjb25zdCByb3dJZHggPSBwYXJzZUludCh0YXJnZXQuZ2V0QXR0cmlidXRlKCdkYXRhLXJvdy1pZHgnKSEpXG4gICAgdGhpcy5ob3ZlckNlbGwgPSBbcm93SWR4LCBjb2xJZHhdXG4gICAgdGhpcy5yZXNpemVDb2xJZHggPSBjb2xJZHhcbiAgICB0aGlzLnJlc2l6ZUJhclggPSB0YXJnZXQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCkucmlnaHQgLSB0aGlzLnRhYmxlLm5hdGl2ZUVsZW1lbnQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCkubGVmdFxuICB9XG5cbiAgb25SZXNpemViYXJNb3VzZURvd24oZTogTW91c2VFdmVudCkge1xuICAgIGUuc3RvcFByb3BhZ2F0aW9uKClcbiAgICBlLnByZXZlbnREZWZhdWx0KClcbiAgICB0aGlzLnJlc2l6aW5nJC5uZXh0KHRydWUpXG5cbiAgICBjb25zdCByZXNpemVTdWIgPSBmcm9tRXZlbnQ8TW91c2VFdmVudD4oZG9jdW1lbnQsICdtb3VzZW1vdmUnKS5waXBlKHRha2VVbnRpbCh0aGlzLnJlc2l6aW5nJC5waXBlKGZpbHRlcih2ID0+ICF2KSkpKVxuICAgICAgLnN1YnNjcmliZSgoZSkgPT4ge1xuICAgICAgICBjb25zdCB7bGVmdH0gPSB0aGlzLnRhYmxlV3JhcHBlci5uYXRpdmVFbGVtZW50LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpXG4gICAgICAgIGNvbnN0IHNjcm9sbExlZnQgPSB0aGlzLnRhYmxlV3JhcHBlci5uYXRpdmVFbGVtZW50LnNjcm9sbExlZnRcbiAgICAgICAgaWYgKCF0aGlzLnJlc2l6aW5nJC52YWx1ZSB8fCBlLmNsaWVudFggPCBsZWZ0KSByZXR1cm5cbiAgICAgICAgY29uc3QgdGFyZ2V0UmVjdCA9IHRoaXMudGFibGUubmF0aXZlRWxlbWVudC5xdWVyeVNlbGVjdG9yKGB0ZDpudGgtY2hpbGQoJHt0aGlzLnJlc2l6ZUNvbElkeCArIDF9KWApIS5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKVxuICAgICAgICBsZXQgbmV3V2lkdGggPSBlLmNsaWVudFggLSB0YXJnZXRSZWN0LmxlZnRcbiAgICAgICAgLy8g5LiN5b6X5bCP5LqONTDvvIzkuI3lvpflpKfkuo5tYXhXaWR0aCAtIOWFtuS7luWIl+WuveW6puS5i+WSjFxuICAgICAgICBpZiAobmV3V2lkdGggPCA1MCkgcmV0dXJuXG4gICAgICAgIC8vIC8vIOWmguaenOaYr+WHj+WwkeWuveW6pu+8jOS4jeeUqOWIpOaWreaYr+WQpui2heWHuuacgOWkp+WuveW6plxuICAgICAgICAvLyBpZiAobmV3V2lkdGggPD0gdGhpcy5wcm9wcy5jb2xXaWR0aHNbdGhpcy5yZXNpemVDb2xJZHhdKSB7XG4gICAgICAgIC8vICAgdGhpcy5yZXNpemVCYXJYID0gdGFyZ2V0UmVjdC5yaWdodCAtIGxlZnQgLSAyXG4gICAgICAgIC8vICAgdGhpcy5fY29sV2lkdGhzW3RoaXMucmVzaXplQ29sSWR4XSA9IG5ld1dpZHRoXG4gICAgICAgIC8vICAgcmV0dXJuO1xuICAgICAgICAvLyB9XG4gICAgICAgIC8vIGlmIChuZXdXaWR0aCAtIHRoaXMucHJvcHMuY29sV2lkdGhzW3RoaXMucmVzaXplQ29sSWR4XSA+IHdpZHRoIC0gdGhpcy5wcm9wcy5jb2xXaWR0aHMucmVkdWNlKChwcmUsIGN1cikgPT4gcHJlICsgY3VyLCAwKSkgcmV0dXJuXG4gICAgICAgIHRoaXMucmVzaXplQmFyWCA9IHRhcmdldFJlY3QucmlnaHQgKyBzY3JvbGxMZWZ0IC0gbGVmdFxuICAgICAgICB0aGlzLl9jb2xXaWR0aHNbdGhpcy5yZXNpemVDb2xJZHhdID0gbmV3V2lkdGhcbiAgICAgIH0pXG5cbiAgICBmcm9tRXZlbnQoZG9jdW1lbnQsICdtb3VzZXVwJykucGlwZSh0YWtlKDEpKS5zdWJzY3JpYmUoKCkgPT4ge1xuICAgICAgaWYgKCF0aGlzLnJlc2l6aW5nJC52YWx1ZSkgcmV0dXJuXG4gICAgICB0aGlzLnJlc2l6aW5nJC5uZXh0KGZhbHNlKVxuICAgICAgdGhpcy5yZXNpemVDb2xJZHggPSAtMVxuICAgICAgdGhpcy5zZXRDb2xXaWR0aHMoKVxuICAgIH0pXG4gIH1cblxuICAvKiog6KGo5qC86YCJ5LitICoqL1xuICBmb2N1c0NlbGwocm93SWR4OiBudW1iZXIsIGNvbElkeDogbnVtYmVyLCBwb3M6ICdzdGFydCcgfCAnZW5kJykge1xuICAgIGNvbnN0IGNlbGwgPSB0aGlzLm1vZGVsLmNoaWxkcmVuW3Jvd0lkeF0uY2hpbGRyZW5bY29sSWR4XVxuICAgIGlmICghY2VsbCkgcmV0dXJuXG4gICAgKHRoaXMuY29udHJvbGxlci5nZXRCbG9ja1JlZihjZWxsLmlkKSBhcyBFZGl0YWJsZUJsb2NrKS5zZXRTZWxlY3Rpb24ocG9zKVxuICB9XG5cbiAgbW92ZVNlbGVjdGlvbih0YXJnZXQ6IEhUTUxFbGVtZW50LCBkaXJlY3Rpb246ICd1cCcgfCAnZG93bicgfCAnbGVmdCcgfCAncmlnaHQnKSB7XG4gICAgY29uc3QgY2VsbEVsID0gdGFyZ2V0LmNsb3Nlc3QoJ3RkLnRhYmxlLWNlbGwnKSBhcyBIVE1MVGFibGVDZWxsRWxlbWVudFxuICAgIGNvbnN0IGNlbGxQb3MgPSB0aGlzLmdldENlbGxQb3MoY2VsbEVsKVxuICAgIGlmICghY2VsbFBvcykgcmV0dXJuXG4gICAgY29uc3QgW3Jvd0lkeCwgY29sSWR4XSA9IGNlbGxQb3NcbiAgICBzd2l0Y2ggKGRpcmVjdGlvbikge1xuICAgICAgY2FzZSAndXAnOlxuICAgICAgICBpZiAocm93SWR4ID09PSAwKSByZXR1cm5cbiAgICAgICAgdGhpcy5mb2N1c0NlbGwocm93SWR4IC0gMSwgY29sSWR4LCAnZW5kJylcbiAgICAgICAgYnJlYWtcbiAgICAgIGNhc2UgJ2Rvd24nOlxuICAgICAgICBpZiAocm93SWR4ID09PSB0aGlzLm1vZGVsLmNoaWxkcmVuLmxlbmd0aCAtIDEpIHJldHVyblxuICAgICAgICB0aGlzLmZvY3VzQ2VsbChyb3dJZHggKyAxLCBjb2xJZHgsICdzdGFydCcpXG4gICAgICAgIGJyZWFrXG4gICAgICBjYXNlICdsZWZ0JzpcbiAgICAgICAgaWYgKGNvbElkeCA9PT0gMCkgcmV0dXJuXG4gICAgICAgIHRoaXMuZm9jdXNDZWxsKHJvd0lkeCwgY29sSWR4IC0gMSwgJ2VuZCcpXG4gICAgICAgIGJyZWFrXG4gICAgICBjYXNlICdyaWdodCc6XG4gICAgICAgIGlmIChjb2xJZHggPT09IHRoaXMubW9kZWwuY2hpbGRyZW5bcm93SWR4XS5jaGlsZHJlbi5sZW5ndGggLSAxKSByZXR1cm5cbiAgICAgICAgdGhpcy5mb2N1c0NlbGwocm93SWR4LCBjb2xJZHggKyAxLCAnc3RhcnQnKVxuICAgICAgICBicmVha1xuICAgIH1cbiAgfVxuXG4gIGNsZWFyU2VsZWN0aW5nQ2VsbFRleHQoKSB7XG4gICAgaWYgKCF0aGlzLnNlbGVjdGluZ0NlbGwpIHJldHVyblxuICAgIGNvbnN0IFtzdGFydCwgZW5kXSA9IHRoaXMuc2VsZWN0aW5nQ2VsbFxuICAgIGlmIChzdGFydFswXSA9PT0gZW5kWzBdICYmIHN0YXJ0WzFdID09PSBlbmRbMV0pIHJldHVybiB0aGlzLmNsZWFyU2VsZWN0aW5nKClcbiAgICBjb25zdCBbc3RhcnRSb3dJZHgsIHN0YXJ0Q29sSWR4XSA9IHN0YXJ0XG4gICAgY29uc3QgW2VuZFJvd0lkeCwgZW5kQ29sSWR4XSA9IGVuZFxuXG4gICAgdGhpcy5jb250cm9sbGVyLnRyYW5zYWN0KCgpID0+IHtcbiAgICAgIGZvciAobGV0IHJvd0lkeCA9IHN0YXJ0Um93SWR4OyByb3dJZHggPD0gZW5kUm93SWR4OyByb3dJZHgrKykge1xuICAgICAgICBjb25zdCB0ciA9IHRoaXMubW9kZWwuY2hpbGRyZW5bcm93SWR4XVxuICAgICAgICBmb3IgKGxldCBjb2xJZHggPSBzdGFydENvbElkeDsgY29sSWR4IDw9IGVuZENvbElkeDsgY29sSWR4KyspIHtcbiAgICAgICAgICBjb25zdCB0ZCA9IHRyLmNoaWxkcmVuW2NvbElkeF1cbiAgICAgICAgICBjb25zdCBibG9jayA9IHRoaXMuY29udHJvbGxlci5nZXRCbG9ja1JlZih0ZC5pZCkgYXMgVGFibGVDZWxsQmxvY2tcbiAgICAgICAgICBpZiAoIWJsb2NrKSBjb250aW51ZVxuICAgICAgICAgIGJsb2NrLnRleHRMZW5ndGggJiYgYmxvY2suYXBwbHlEZWx0YShbXG4gICAgICAgICAgICB7cmV0YWluOiAwfSxcbiAgICAgICAgICAgIHtkZWxldGU6IGJsb2NrLnRleHRMZW5ndGh9XG4gICAgICAgICAgXSlcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pXG5cbiAgICBjb25zdCBmaXJzdENlbGwgPSB0aGlzLm1vZGVsLmNoaWxkcmVuW3N0YXJ0Um93SWR4XS5jaGlsZHJlbltzdGFydENvbElkeF1cbiAgICB0aGlzLmNvbnRyb2xsZXIuc2VsZWN0aW9uLnNldFNlbGVjdGlvbihmaXJzdENlbGwuaWQsIDApXG4gICAgdGhpcy5jbGVhclNlbGVjdGluZygpXG4gIH1cblxuICBvbkJsdXIoKSB7XG4gICAgY29uc29sZS5sb2coJ2JsdXInLCB0aGlzLmlkKVxuICAgIHRoaXMuY2xlYXJTZWxlY3RpbmcoKVxuICB9XG5cbiAgb25Nb3VzZURvd24oZTogTW91c2VFdmVudCkge1xuICAgIGUuc3RvcFByb3BhZ2F0aW9uKClcbiAgICB0aGlzLmNsZWFyU2VsZWN0aW5nKClcbiAgICBjb25zdCB0YXJnZXQgPSBlLnRhcmdldCBhcyBIVE1MRWxlbWVudFxuICAgIGNvbnN0IGNlbGxQb3MgPSB0aGlzLmdldENlbGxQb3ModGFyZ2V0LmNsb3Nlc3QoJ3RkLnRhYmxlLWNlbGwnKSlcbiAgICBpZiAoIWNlbGxQb3MpIHJldHVyblxuICAgIHRoaXMuc3RhcnRTZWxlY3RpbmdDZWxsID0gY2VsbFBvc1xuICAgIHRoaXMuc2VsZWN0aW5nQ2VsbCA9IFtjZWxsUG9zLCBjZWxsUG9zXVxuXG4gICAgZnJvbUV2ZW50PE1vdXNlRXZlbnQ+KHRoaXMuaG9zdEVsLm5hdGl2ZUVsZW1lbnQsICdtb3VzZW92ZXInKS5waXBlKHRha2VVbnRpbChmcm9tRXZlbnQ8TW91c2VFdmVudD4oZG9jdW1lbnQsICdtb3VzZXVwJykpKVxuICAgICAgLnN1YnNjcmliZSgoZSkgPT4ge1xuICAgICAgICBlLnN0b3BQcm9wYWdhdGlvbigpXG4gICAgICAgIGlmICghdGhpcy5zdGFydFNlbGVjdGluZ0NlbGwgfHwgIXRoaXMuc2VsZWN0aW5nQ2VsbCkgcmV0dXJuXG4gICAgICAgIGNvbnN0IGNlbGxQb3MgPSB0aGlzLmdldENlbGxQb3MoKGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50KS5jbG9zZXN0KCd0ZC50YWJsZS1jZWxsJykpXG4gICAgICAgIGlmICghY2VsbFBvcykgcmV0dXJuXG4gICAgICAgIC8vIOehruWumumAieWMuu+8jOW3puS4iuinkuWSjOWPs+S4i+inklxuICAgICAgICBpZiAodGhpcy5zdGFydFNlbGVjdGluZ0NlbGxbMF0gPT09IGNlbGxQb3NbMF0gJiYgdGhpcy5zdGFydFNlbGVjdGluZ0NlbGxbMV0gPT09IGNlbGxQb3NbMV0pIHtcbiAgICAgICAgICByZXR1cm5cbiAgICAgICAgfVxuICAgICAgICAvLyDpvKDmoIfnp7vliqjmlrnlkJHvvIznoa7lrprmmK/ku47lt6bkuIrliLDlj7PkuIvov5jmmK/ku47lj7PkuIvliLDlt6bkuIpcbiAgICAgICAgLy8g5LuO5bem5LiK5Yiw5Y+z5LiLXG4gICAgICAgIGlmICh0aGlzLnN0YXJ0U2VsZWN0aW5nQ2VsbFswXSA8PSBjZWxsUG9zWzBdICYmIHRoaXMuc3RhcnRTZWxlY3RpbmdDZWxsWzFdIDw9IGNlbGxQb3NbMV0pXG4gICAgICAgICAgdGhpcy5zZWxlY3RpbmdDZWxsWzFdID0gY2VsbFBvc1xuICAgICAgICAvLyDku47lj7PkuIvliLDlt6bkuIpcbiAgICAgICAgZWxzZSB0aGlzLnNlbGVjdGluZ0NlbGxbMF0gPSBjZWxsUG9zXG4gICAgICAgIHRoaXMuc2VsZWN0aW5nJC5uZXh0KHRydWUpXG4gICAgICAgIHRoaXMuc2VsZWN0Q2VsbCgpXG4gICAgICB9KVxuXG4gICAgZnJvbUV2ZW50PE1vdXNlRXZlbnQ+KGRvY3VtZW50LCAnbW91c2V1cCcpLnBpcGUodGFrZSgxKSkuc3Vic2NyaWJlKChlKSA9PiB7XG4gICAgICBpZiAoIXRoaXMuc2VsZWN0aW5nJC52YWx1ZSkgcmV0dXJuIHRoaXMuY2xlYXJTZWxlY3RpbmcoKVxuICAgICAgdGhpcy5zZWxlY3RpbmckLm5leHQoZmFsc2UpXG4gICAgfSlcbiAgfVxuXG4gIGdldENlbGxQb3MgPSAodGQ6IEhUTUxFbGVtZW50IHwgbnVsbCk6IG51bGwgfCBbbnVtYmVyLCBudW1iZXJdID0+IHtcbiAgICBpZiAoIXRkIHx8IHRkLnRhZ05hbWUgIT09ICdURCcpIHJldHVybiBudWxsXG4gICAgY29uc3QgY29sSWR4ID0gdGQuZ2V0QXR0cmlidXRlKCdkYXRhLWNvbC1pZHgnKSFcbiAgICBjb25zdCByb3dJZHggPSB0ZC5nZXRBdHRyaWJ1dGUoJ2RhdGEtcm93LWlkeCcpIVxuICAgIHJldHVybiBbcGFyc2VJbnQocm93SWR4KSwgcGFyc2VJbnQoY29sSWR4KV1cbiAgfVxuXG4gIGNsZWFyU2VsZWN0aW5nKCkge1xuICAgIHRoaXMuc2VsZWN0aW5nQ2VsbCA9IHVuZGVmaW5lZFxuICAgIHRoaXMuc3RhcnRTZWxlY3RpbmdDZWxsID0gdW5kZWZpbmVkXG4gICAgdGhpcy5jZWxscz8uZm9yRWFjaChjZWxsID0+IGNlbGwuY2xhc3NMaXN0LnJlbW92ZSgnc2VsZWN0ZWQnKSlcbiAgICB0aGlzLmNlbGxzID0gdW5kZWZpbmVkXG4gIH1cblxuICBzZWxlY3RDZWxsKCkge1xuICAgIGlmICghdGhpcy5zZWxlY3RpbmdDZWxsKSByZXR1cm5cbiAgICBpZiAoIXRoaXMuY2VsbHMpIHtcbiAgICAgIHRoaXMuY2VsbHMgPSB0aGlzLmhvc3RFbC5uYXRpdmVFbGVtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ3RkLnRhYmxlLWNlbGwnKVxuICAgIH1cbiAgICB0aGlzLmNlbGxzLmZvckVhY2goKGNlbGwsIGlkeCkgPT4ge1xuICAgICAgY29uc3QgW2NlbGxSb3dJZHgsIGNlbGxDb2xJZHhdID0gdGhpcy5nZXRDZWxsUG9zKGNlbGwgYXMgSFRNTEVsZW1lbnQpIVxuICAgICAgaWYgKGNlbGxSb3dJZHggPj0gdGhpcy5zZWxlY3RpbmdDZWxsIVswXVswXSAmJiBjZWxsUm93SWR4IDw9IHRoaXMuc2VsZWN0aW5nQ2VsbCFbMV1bMF0gJiYgY2VsbENvbElkeCA+PSB0aGlzLnNlbGVjdGluZ0NlbGwhWzBdWzFdICYmIGNlbGxDb2xJZHggPD0gdGhpcy5zZWxlY3RpbmdDZWxsIVsxXVsxXSkge1xuICAgICAgICBjZWxsLmNsYXNzTGlzdC5hZGQoJ3NlbGVjdGVkJylcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNlbGwuY2xhc3NMaXN0LnJlbW92ZSgnc2VsZWN0ZWQnKVxuICAgICAgfVxuICAgIH0pXG4gIH1cblxufVxuIiwiPGRpdiBjbGFzcz1cInRhYmxlLWhlYWRlcl9yb3ctYmFyXCIgKGNsaWNrKT1cIm9uU2hvd1Jvd0JhcigkZXZlbnQpXCIgW2NsYXNzLmFjdGl2ZV09XCJhY3RpdmVSb3dJZHggPj0gMFwiPlxuICAgIDxzcGFuICpuZ0Zvcj1cImxldCByb3cgb2YgX3Jvd0hlaWdodHM7IGluZGV4IGFzIGlkeDsgdHJhY2tCeTogdHJhY2tCeVZhbHVlXCIgW2F0dHIuZGF0YS1yb3ctaWR4XT1cImlkeFwiXG4gICAgICAgICAgW2NsYXNzLmFjdGl2ZV09XCJhY3RpdmVSb3dJZHggPT09IGlkeFwiIFtjbGFzcy5ob3Zlcl09XCJob3ZlckNlbGxbMF0gPT09IGlkeFwiIFtzdHlsZS5oZWlnaHQucHhdPVwicm93IHx8IDBcIj48L3NwYW4+XG48L2Rpdj5cblxuPGRpdiBjbGFzcz1cInRhYmxlLXdyYXBwZXJcIiBbY2xhc3MuY29sLWhlYWRdPVwicHJvcHMuY29sSGVhZFwiIFtjbGFzcy5yb3ctaGVhZF09XCJwcm9wcy5yb3dIZWFkXCIgI3dyYXBwZXI+XG4gIDxkaXYgY2xhc3M9XCJ0YWJsZS1jb2wtcmVzaXplLWJhclwiICpuZ0lmPVwiIShjb250cm9sbGVyLnJlYWRvbmx5JCB8IGFzeW5jKVwiIFtjbGFzcy5hY3RpdmVdPVwicmVzaXppbmckIHwgYXN5bmNcIlxuICAgICAgIFtoaWRkZW5dPVwicmVzaXplQ29sSWR4IDwgMFwiIFtzdHlsZS5sZWZ0LnB4XT1cInJlc2l6ZUJhclhcIiAobW91c2Vkb3duKT1cIm9uUmVzaXplYmFyTW91c2VEb3duKCRldmVudClcIj48L2Rpdj5cblxuICA8ZGl2IGNsYXNzPVwidGFibGUtaGVhZGVyX2NvbC1iYXJcIiAoY2xpY2spPVwib25TaG93Q29sQmFyKCRldmVudClcIiBbY2xhc3MuYWN0aXZlXT1cImFjdGl2ZUNvbElkeCA+PSAwXCI+XG4gICAgPHNwYW4gKm5nRm9yPVwibGV0IGNvbCBvZiBfY29sV2lkdGhzOyBpbmRleCBhcyBpZHhcIiBbc3R5bGUud2lkdGgucHhdPVwiY29sXCIgW2F0dHIuZGF0YS1jb2wtaWR4XT1cImlkeFwiXG4gICAgICAgICAgW2NsYXNzLmFjdGl2ZV09XCJhY3RpdmVDb2xJZHggPT09IGlkeFwiIFtjbGFzcy5ob3Zlcl09XCJob3ZlckNlbGxbMV0gPT09IGlkeFwiPjwvc3Bhbj5cbiAgPC9kaXY+XG5cbiAgPHRhYmxlIHRhYmluZGV4PVwiMFwiICN0YWJsZUVsZW1lbnQgKGtleWRvd24pPVwib25LZXlEb3duKCRldmVudClcIiAoYmx1cik9XCJvbkJsdXIoKVwiIChtb3VzZWRvd24pPVwib25Nb3VzZURvd24oJGV2ZW50KVwiXG4gICAgICAgICAobW91c2VvdmVyKT1cIm9uTW91c2VPdmVyKCRldmVudClcIj5cbiAgICA8Y29sZ3JvdXA+XG4gICAgICA8Y29sICpuZ0Zvcj1cImxldCBjb2x1bW4gb2YgX2NvbFdpZHRoczsgaW5kZXggYXMgaWR4OyB0cmFja0J5OiB0cmFja0J5VmFsdWVcIiBbd2lkdGhdPVwiY29sdW1uXCIvPlxuICAgIDwvY29sZ3JvdXA+XG5cbiAgICA8dGJvZHk+XG4gICAgPHRyIGNsYXNzPVwidGFibGUtcm93XCIgKm5nRm9yPVwibGV0IHJvdyBvZiBtb2RlbC5jaGlsZHJlbjsgaW5kZXggYXMgcm93SWR4OyB0cmFja0J5OiB0cmFja0J5SWRcIiBbcm93SWR4XT1cInJvd0lkeFwiXG4gICAgICAgIFtjb250cm9sbGVyXT1cImNvbnRyb2xsZXJcIiBbbW9kZWxdPVwiJGFueShyb3cpXCIgW2NsYXNzLmFjdGl2ZV09XCJhY3RpdmVSb3dJZHggPT09IHJvd0lkeFwiXG4gICAgICAgIChoZWlnaHRDaGFuZ2UpPVwib25Sb3dIZWlnaHRDaGFuZ2UoJGV2ZW50LCByb3dJZHgpXCI+XG4gICAgPC90cj5cbiAgICA8L3Rib2R5PlxuICA8L3RhYmxlPlxuPC9kaXY+XG5cblxuXG5cblxuIl19