import { ChangeDetectionStrategy, Component, EventEmitter, HostListener, Input, Output, ViewChild, } from "@angular/core";
import { NgForOf, NgIf, NgTemplateOutlet } from "@angular/common";
import { EditableBlock, USER_CHANGE_SIGNAL } from "../../core";
import { FILE_UPLOADER } from "../../blocks";
import { TemplatePortal } from "@angular/cdk/portal";
import { fromEvent } from "rxjs";
import { MatIconModule } from "@angular/material/icon";
import * as i0 from "@angular/core";
import * as i1 from "@angular/cdk/overlay";
import * as i2 from "@angular/material/icon";
export * from './type';
export class BlockFlowContextmenu {
    set activeBlock(val) {
        if (!val)
            return;
        this._activeBlock = val;
        this.hasContent = val instanceof EditableBlock && val.flavour === 'paragraph' ? !!val.textLength : true;
    }
    get activeBlock() {
        return this._activeBlock;
    }
    set controller(val) {
        if (!val)
            throw new Error('Controller is required');
        this._controller = val;
        const schemas = val.schemas.values().filter(schema => !schema.isLeaf);
        this.baseBlockList = schemas.filter(schema => schema.nodeType === 'editable');
        this.commonBlockList = schemas.filter(schema => schema.nodeType !== 'editable');
    }
    get controller() {
        return this._controller;
    }
    constructor(cdr, vcr, overlay) {
        this.cdr = cdr;
        this.vcr = vcr;
        this.overlay = overlay;
        this.itemClick = new EventEmitter();
        this.destroy = new EventEmitter();
        this.baseBlockList = [];
        this.commonBlockList = [];
        this.toolList = [
            {
                flavour: 'cut',
                icon: 'bf_icon bf_jianqie',
                label: '剪切',
            },
            {
                flavour: 'copy',
                icon: 'bf_icon bf_fuzhi',
                label: '复制',
            },
            {
                flavour: 'delete',
                icon: 'bf_icon bf_shanchu-2',
                label: '删除',
            }
        ];
        this.hasContent = false;
    }
    onClick(event) {
        event.stopPropagation();
        event.preventDefault();
    }
    onMouseDown(event, item, type) {
        if (type === 'block' && this.activeBlock.nodeType === "editable" && this.activeBlock.flavour === item.flavour)
            return;
        this.onItemClicked({ item, type });
        this.itemClick.emit({ item, type });
    }
    onItemClicked(value) {
        const { item, type } = value;
        const selection = this.controller.selection.getSelection();
        if (type === 'tool') {
            switch (item.flavour) {
                case 'cut':
                case 'copy':
                    if (selection?.isAtRoot && selection.rootRange) {
                        this.controller.clipboard.execCommand(item.flavour);
                    }
                    else {
                        this.controller.clipboard.writeData([
                            { type: 'block', data: [this.activeBlock.model.toJSON()] }
                        ]);
                    }
                    return;
                case 'delete':
                    if (this.controller.root.selectedBlockRange)
                        this.controller.deleteSelectedBlocks();
                    else
                        this.controller.deleteBlockById(this.activeBlock.id);
                    return;
            }
            return;
        }
        const schema = item;
        if (schema.nodeType === 'editable' && selection?.isAtRoot && selection.rootRange) {
            const selectedBlockModels = this.controller.rootModel.slice(selection.rootRange.start, selection.rootRange.end);
            if (selectedBlockModels.find(v => v.id === this.activeBlock.id)) {
                const modelsArr = selectedBlockModels.map((v, i) => {
                    if (v.flavour === schema.flavour || v.nodeType !== 'editable')
                        return -1;
                    return selection.rootRange.start + i;
                }).filter(v => v >= 0);
                if (modelsArr.length > 1) {
                    const splitModelsArr = modelsArr.reduce((acc, cur, i) => {
                        if (cur - acc[acc.length - 1][1] > 1) {
                            acc.push([cur, cur]);
                        }
                        else {
                            acc[acc.length - 1][1] = cur;
                        }
                        return acc;
                    }, [[modelsArr[0], modelsArr[0]]]);
                    this.controller.transact(() => {
                        splitModelsArr.forEach(([start, end]) => {
                            const newBlocks = [];
                            for (let i = start; i <= end; i++) {
                                const block = this.controller.rootModel[i];
                                newBlocks.push(this.controller.createBlock(schema.flavour, [JSON.parse(JSON.stringify(block.children)), block.props]));
                            }
                            this.controller.replaceBlocks(start, newBlocks.length, newBlocks).then(() => {
                                this.controller.selection.applyRange(selection);
                            });
                        });
                    }, USER_CHANGE_SIGNAL);
                    return;
                }
            }
        }
        if (this.activeBlock instanceof EditableBlock && schema.nodeType === 'editable') {
            const deltas = this.activeBlock.getTextDelta();
            const newBlock = this.controller.createBlock(schema.flavour, [deltas, this.activeBlock.props]);
            this.controller.replaceWith(this.activeBlock.id, [newBlock]).then(() => {
                this.controller.selection.setSelection(newBlock.id, 'start');
            });
            return;
        }
        const position = this.controller.getBlockPosition(this.activeBlock.id);
        if (schema.flavour === 'image') {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.multiple = false;
            input.click();
            input.onchange = () => {
                const file = input.files[0];
                if (!file)
                    return;
                const fileUploader = this.controller.injector.get(FILE_UPLOADER);
                if (!file)
                    throw new Error('file is required');
                fileUploader.uploadImg(file).then((fileUri) => {
                    const newBlock = this.controller.createBlock(schema.flavour, [fileUri]);
                    this.controller.insertBlocks(position.index + 1, [newBlock], position.parentId).then(() => {
                        newBlock.nodeType === 'editable' && this.controller.selection.setSelection(newBlock.id, 'start');
                    });
                });
            };
            return;
        }
        const newBlock = this.controller.createBlock(schema.flavour);
        if (!this.hasContent)
            this.controller.replaceWith(this.activeBlock.id, [newBlock]).then(() => {
                newBlock.nodeType === 'editable' && this.controller.selection.setSelection(newBlock.id, 'start');
            });
        else
            this.controller.insertBlocks(position.index + 1, [newBlock], position.parentId).then(() => {
                newBlock.nodeType === 'editable' && this.controller.selection.setSelection(newBlock.id, 'start');
            });
    }
    onShowMoreBlock(event) {
        event.preventDefault();
        event.stopPropagation();
        if (this.moreBlockTpr)
            return;
        const target = event.target;
        const positionStrategy = this.overlay.position().flexibleConnectedTo(target)
            .withPositions([
            { originX: 'end', originY: 'top', overlayX: 'start', overlayY: 'top' },
            { originX: 'end', originY: 'bottom', overlayX: 'start', overlayY: 'bottom' },
        ]).withPush(true);
        const ovr = this.overlay.create({
            positionStrategy,
            hasBackdrop: false
        });
        this.moreBlockTpr = ovr.attach(new TemplatePortal(this.moreBlockContainer, this.vcr));
        const tprEl = this.moreBlockTpr.rootNodes[0];
        const leaveSub = fromEvent(target, 'mouseleave')
            .subscribe(e => {
            if (tprEl.contains(e.relatedTarget))
                return;
            ovr.dispose();
        });
        const leaveSub2 = fromEvent(tprEl, 'mouseleave')
            .subscribe(e => {
            if (target.contains(e.relatedTarget))
                return;
            ovr.dispose();
        });
        this.moreBlockTpr.onDestroy(() => {
            leaveSub.unsubscribe();
            leaveSub2.unsubscribe();
            this.moreBlockTpr = undefined;
            this.cdr.detectChanges();
        });
    }
    ngOnDestroy() {
        this.destroy.emit(true);
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: BlockFlowContextmenu, deps: [{ token: i0.ChangeDetectorRef }, { token: i0.ViewContainerRef }, { token: i1.Overlay }], target: i0.ɵɵFactoryTarget.Component }); }
    static { this.ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "14.0.0", version: "17.3.12", type: BlockFlowContextmenu, isStandalone: true, selector: "div.bf-contextmenu", inputs: { activeBlock: "activeBlock", controller: "controller" }, outputs: { itemClick: "itemClick", destroy: "destroy" }, host: { listeners: { "click": "onClick($event)", "mousedown": "onClick($event)" } }, viewQueries: [{ propertyName: "moreBlockContainer", first: true, predicate: ["moreBlockContainer"], descendants: true }], ngImport: i0, template: `

    <ng-template #icon let-item>
      <i [class]="item.icon"></i>
    </ng-template>

    <ng-template #svgIcon let-item>
      <mat-icon [svgIcon]="item.svgIcon" style="width: 1em; height: 1em"></mat-icon>
    </ng-template>

    <div class="spark-popover__gap"></div>
    <div class="spark-popover__container">
      <ng-container *ngIf="activeBlock.nodeType === 'editable'">
        <h4 class="title">基础</h4>
        <ul class='base-list'>
          <li class="base-list__item" *ngFor="let item of baseBlockList" [title]="item.description || item.label"
              (mousedown)="onMouseDown($event, item, 'block')" [class.active]="activeBlock.flavour === item.flavour">
            <ng-container *ngTemplateOutlet="item.svgIcon ? svgIcon : icon; context: {$implicit: item}">
            </ng-container>
          </li>
        </ul>
        <div class="line"></div>
      </ng-container>

      <ng-container *ngIf="hasContent">
        <ul class="common-list">
          <li class="common-list__item" *ngFor="let item of toolList"
              (mousedown)="onMouseDown($event, item, 'tool')">
            <i [class]="item.icon"></i>
            <span>{{ item.label }}</span>
          </li>
        </ul>
        <div class="line"></div>
      </ng-container>

      <ng-container *ngIf="!hasContent else appendAfter">
        <ng-container *ngTemplateOutlet="moreBlockList"></ng-container>
      </ng-container>

      <ng-template #appendAfter>
        <ul class='common-list'>
          <li class="common-list__item add-block-btn" (mouseenter)="onShowMoreBlock($event)"
              [class.active]="moreBlockTpr">
            <i class="bf_icon bf_tianjia"></i>
            <span>在下方添加</span>
            <i class="bf_icon bf_youjiantou"></i>
          </li>
        </ul>
      </ng-template>
    </div>

    <ng-template #moreBlockContainer>
      <div class="spark-popover__container spark-popover__more-block" style="max-height: 500px; overflow-y: auto;">
        <ng-container *ngTemplateOutlet="moreBlockList"></ng-container>
      </div>
    </ng-template>

    <ng-template #moreBlockList>
      <h4 class="title" *ngIf="commonBlockList.length">常用</h4>
      <ul class='common-list'>
        <ng-container *ngIf="activeBlock.nodeType !== 'editable'">
          <li class="common-list__item" *ngFor="let item of baseBlockList" [title]="item.description || item.label"
              (mousedown)="onMouseDown($event, item, 'block')">
            <ng-container *ngTemplateOutlet="item.svgIcon ? svgIcon : icon; context: {$implicit: item}">
            </ng-container>
            <span>{{ item.label }}</span>
          </li>
        </ng-container>

        <li class="common-list__item" *ngFor="let item of commonBlockList" [title]="item.description || item.label"
            (mousedown)="onMouseDown($event, item, 'block')">
          <ng-container *ngTemplateOutlet="item.svgIcon ? svgIcon : icon; context: {$implicit: item}">
          </ng-container>
          <span>{{ item.label }}</span>
        </li>
      </ul>
    </ng-template>

    <div class="spark-popover__gap"></div>
  `, isInline: true, styles: [":host{display:block}::ng-deep mat-icon{width:1em;height:1em;font-size:1em}::ng-deep mat-icon>svg{vertical-align:top}.spark-popover__gap{height:8px}.spark-popover__container{padding:8px 0;width:224px;background:#fff;border-radius:4px;border:1px solid #E6E6E6;box-shadow:0 0 20px #0000001a}.title{margin:8px 16px 0;color:#999;font-size:14px;font-weight:600;line-height:140%}.line{height:1px;background:#f3f3f3;width:100%}.base-list,.common-list{margin:0}.base-list{display:flex;flex-wrap:wrap;padding:8px 12px;gap:8px}.base-list__item{width:24px;height:24px;border-radius:4px;display:flex;justify-content:center;align-items:center;cursor:pointer}.base-list__item:hover,.base-list__item.active{background:#f3f3f3}.base-list__item>i{font-size:16px}.common-list{padding:8px}.common-list__item{display:flex;align-items:center;gap:8px;height:36px;padding:0 8px;border-radius:4px;cursor:pointer}.common-list__item:hover,.common-list__item.active{background-color:#f5f5f5}.common-list__item>i{font-size:14px}.common-list__item>span{color:#333;font-size:14px;line-height:20px;flex:1}.add-block-btn{position:relative}\n"], dependencies: [{ kind: "directive", type: NgForOf, selector: "[ngFor][ngForOf]", inputs: ["ngForOf", "ngForTrackBy", "ngForTemplate"] }, { kind: "directive", type: NgIf, selector: "[ngIf]", inputs: ["ngIf", "ngIfThen", "ngIfElse"] }, { kind: "directive", type: NgTemplateOutlet, selector: "[ngTemplateOutlet]", inputs: ["ngTemplateOutletContext", "ngTemplateOutlet", "ngTemplateOutletInjector"] }, { kind: "ngmodule", type: MatIconModule }, { kind: "component", type: i2.MatIcon, selector: "mat-icon", inputs: ["color", "inline", "svgIcon", "fontSet", "fontIcon"], exportAs: ["matIcon"] }], changeDetection: i0.ChangeDetectionStrategy.OnPush }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: BlockFlowContextmenu, decorators: [{
            type: Component,
            args: [{ selector: 'div.bf-contextmenu', standalone: true, template: `

    <ng-template #icon let-item>
      <i [class]="item.icon"></i>
    </ng-template>

    <ng-template #svgIcon let-item>
      <mat-icon [svgIcon]="item.svgIcon" style="width: 1em; height: 1em"></mat-icon>
    </ng-template>

    <div class="spark-popover__gap"></div>
    <div class="spark-popover__container">
      <ng-container *ngIf="activeBlock.nodeType === 'editable'">
        <h4 class="title">基础</h4>
        <ul class='base-list'>
          <li class="base-list__item" *ngFor="let item of baseBlockList" [title]="item.description || item.label"
              (mousedown)="onMouseDown($event, item, 'block')" [class.active]="activeBlock.flavour === item.flavour">
            <ng-container *ngTemplateOutlet="item.svgIcon ? svgIcon : icon; context: {$implicit: item}">
            </ng-container>
          </li>
        </ul>
        <div class="line"></div>
      </ng-container>

      <ng-container *ngIf="hasContent">
        <ul class="common-list">
          <li class="common-list__item" *ngFor="let item of toolList"
              (mousedown)="onMouseDown($event, item, 'tool')">
            <i [class]="item.icon"></i>
            <span>{{ item.label }}</span>
          </li>
        </ul>
        <div class="line"></div>
      </ng-container>

      <ng-container *ngIf="!hasContent else appendAfter">
        <ng-container *ngTemplateOutlet="moreBlockList"></ng-container>
      </ng-container>

      <ng-template #appendAfter>
        <ul class='common-list'>
          <li class="common-list__item add-block-btn" (mouseenter)="onShowMoreBlock($event)"
              [class.active]="moreBlockTpr">
            <i class="bf_icon bf_tianjia"></i>
            <span>在下方添加</span>
            <i class="bf_icon bf_youjiantou"></i>
          </li>
        </ul>
      </ng-template>
    </div>

    <ng-template #moreBlockContainer>
      <div class="spark-popover__container spark-popover__more-block" style="max-height: 500px; overflow-y: auto;">
        <ng-container *ngTemplateOutlet="moreBlockList"></ng-container>
      </div>
    </ng-template>

    <ng-template #moreBlockList>
      <h4 class="title" *ngIf="commonBlockList.length">常用</h4>
      <ul class='common-list'>
        <ng-container *ngIf="activeBlock.nodeType !== 'editable'">
          <li class="common-list__item" *ngFor="let item of baseBlockList" [title]="item.description || item.label"
              (mousedown)="onMouseDown($event, item, 'block')">
            <ng-container *ngTemplateOutlet="item.svgIcon ? svgIcon : icon; context: {$implicit: item}">
            </ng-container>
            <span>{{ item.label }}</span>
          </li>
        </ng-container>

        <li class="common-list__item" *ngFor="let item of commonBlockList" [title]="item.description || item.label"
            (mousedown)="onMouseDown($event, item, 'block')">
          <ng-container *ngTemplateOutlet="item.svgIcon ? svgIcon : icon; context: {$implicit: item}">
          </ng-container>
          <span>{{ item.label }}</span>
        </li>
      </ul>
    </ng-template>

    <div class="spark-popover__gap"></div>
  `, imports: [NgForOf, NgIf, NgTemplateOutlet, MatIconModule], changeDetection: ChangeDetectionStrategy.OnPush, styles: [":host{display:block}::ng-deep mat-icon{width:1em;height:1em;font-size:1em}::ng-deep mat-icon>svg{vertical-align:top}.spark-popover__gap{height:8px}.spark-popover__container{padding:8px 0;width:224px;background:#fff;border-radius:4px;border:1px solid #E6E6E6;box-shadow:0 0 20px #0000001a}.title{margin:8px 16px 0;color:#999;font-size:14px;font-weight:600;line-height:140%}.line{height:1px;background:#f3f3f3;width:100%}.base-list,.common-list{margin:0}.base-list{display:flex;flex-wrap:wrap;padding:8px 12px;gap:8px}.base-list__item{width:24px;height:24px;border-radius:4px;display:flex;justify-content:center;align-items:center;cursor:pointer}.base-list__item:hover,.base-list__item.active{background:#f3f3f3}.base-list__item>i{font-size:16px}.common-list{padding:8px}.common-list__item{display:flex;align-items:center;gap:8px;height:36px;padding:0 8px;border-radius:4px;cursor:pointer}.common-list__item:hover,.common-list__item.active{background-color:#f5f5f5}.common-list__item>i{font-size:14px}.common-list__item>span{color:#333;font-size:14px;line-height:20px;flex:1}.add-block-btn{position:relative}\n"] }]
        }], ctorParameters: () => [{ type: i0.ChangeDetectorRef }, { type: i0.ViewContainerRef }, { type: i1.Overlay }], propDecorators: { activeBlock: [{
                type: Input,
                args: [{ required: true }]
            }], controller: [{
                type: Input,
                args: [{ required: true }]
            }], itemClick: [{
                type: Output
            }], destroy: [{
                type: Output
            }], moreBlockContainer: [{
                type: ViewChild,
                args: ['moreBlockContainer']
            }], onClick: [{
                type: HostListener,
                args: ['click', ['$event']]
            }, {
                type: HostListener,
                args: ['mousedown', ['$event']]
            }] } });
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi9ibG9ja2Zsb3cvc3JjL2VkaXRvci9jb250ZXh0bWVudS9pbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxPQUFPLEVBQ0wsdUJBQXVCLEVBQ3ZCLFNBQVMsRUFDVCxZQUFZLEVBQ1osWUFBWSxFQUNaLEtBQUssRUFDTCxNQUFNLEVBQWUsU0FBUyxHQUMvQixNQUFNLGVBQWUsQ0FBQztBQUN2QixPQUFPLEVBQUMsT0FBTyxFQUFFLElBQUksRUFBRSxnQkFBZ0IsRUFBQyxNQUFNLGlCQUFpQixDQUFDO0FBRWhFLE9BQU8sRUFLTCxhQUFhLEVBRWIsa0JBQWtCLEVBQ25CLE1BQU0sWUFBWSxDQUFDO0FBQ3BCLE9BQU8sRUFBQyxhQUFhLEVBQUMsTUFBTSxjQUFjLENBQUM7QUFFM0MsT0FBTyxFQUFDLGNBQWMsRUFBQyxNQUFNLHFCQUFxQixDQUFDO0FBQ25ELE9BQU8sRUFBQyxTQUFTLEVBQUMsTUFBTSxNQUFNLENBQUM7QUFDL0IsT0FBTyxFQUFDLGFBQWEsRUFBQyxNQUFNLHdCQUF3QixDQUFDOzs7O0FBRXJELGNBQWMsUUFBUSxDQUFBO0FBb010QixNQUFNLE9BQU8sb0JBQW9CO0lBRy9CLElBQ0ksV0FBVyxDQUFDLEdBQWM7UUFDNUIsSUFBSSxDQUFDLEdBQUc7WUFBRSxPQUFNO1FBQ2hCLElBQUksQ0FBQyxZQUFZLEdBQUcsR0FBRyxDQUFBO1FBQ3ZCLElBQUksQ0FBQyxVQUFVLEdBQUcsR0FBRyxZQUFZLGFBQWEsSUFBSSxHQUFHLENBQUMsT0FBTyxLQUFLLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQTtJQUN6RyxDQUFDO0lBRUQsSUFBSSxXQUFXO1FBQ2IsT0FBTyxJQUFJLENBQUMsWUFBWSxDQUFBO0lBQzFCLENBQUM7SUFHRCxJQUNJLFVBQVUsQ0FBQyxHQUFl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Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7R0ErRVQsV0FDUSxDQUFDLE9BQU8sRUFBRSxJQUFJLEVBQUUsZ0JBQWdCLEVBQUUsYUFBYSxDQUFDLG1CQTZHeEMsdUJBQXVCLENBQUMsTUFBTTsySUFNM0MsV0FBVztzQkFEZCxLQUFLO3VCQUFDLEVBQUMsUUFBUSxFQUFFLElBQUksRUFBQztnQkFhbkIsVUFBVTtzQkFEYixLQUFLO3VCQUFDLEVBQUMsUUFBUSxFQUFFLElBQUksRUFBQztnQkFhYixTQUFTO3NCQUFsQixNQUFNO2dCQUNHLE9BQU87c0JBQWhCLE1BQU07Z0JBUzBCLGtCQUFrQjtzQkFBbEQsU0FBUzt1QkFBQyxvQkFBb0I7Z0JBNEIvQixPQUFPO3NCQUZOLFlBQVk7dUJBQUMsT0FBTyxFQUFFLENBQUMsUUFBUSxDQUFDOztzQkFDaEMsWUFBWTt1QkFBQyxXQUFXLEVBQUUsQ0FBQyxRQUFRLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQge1xuICBDaGFuZ2VEZXRlY3Rpb25TdHJhdGVneSwgQ2hhbmdlRGV0ZWN0b3JSZWYsXG4gIENvbXBvbmVudCwgRW1iZWRkZWRWaWV3UmVmLFxuICBFdmVudEVtaXR0ZXIsXG4gIEhvc3RMaXN0ZW5lcixcbiAgSW5wdXQsXG4gIE91dHB1dCwgVGVtcGxhdGVSZWYsIFZpZXdDaGlsZCwgVmlld0NvbnRhaW5lclJlZixcbn0gZnJvbSBcIkBhbmd1bGFyL2NvcmVcIjtcbmltcG9ydCB7TmdGb3JPZiwgTmdJZiwgTmdUZW1wbGF0ZU91dGxldH0gZnJvbSBcIkBhbmd1bGFyL2NvbW1vblwiO1xuaW1wb3J0IHtJQ29udGV4dE1lbnVFdmVudCwgSUNvbnRleHRNZW51SXRlbX0gZnJvbSBcIi4vdHlwZVwiO1xuaW1wb3J0IHtcbiAgQmFzZUJsb2NrLFxuICBCbG9ja01vZGVsLFxuICBCbG9ja1NjaGVtYSxcbiAgQ29udHJvbGxlcixcbiAgRWRpdGFibGVCbG9jayxcbiAgSUVkaXRhYmxlQmxvY2tNb2RlbCxcbiAgVVNFUl9DSEFOR0VfU0lHTkFMXG59IGZyb20gXCIuLi8uLi9jb3JlXCI7XG5pbXBvcnQge0ZJTEVfVVBMT0FERVJ9IGZyb20gXCIuLi8uLi9ibG9ja3NcIjtcbmltcG9ydCB7T3ZlcmxheX0gZnJvbSBcIkBhbmd1bGFyL2Nkay9vdmVybGF5XCI7XG5pbXBvcnQge1RlbXBsYXRlUG9ydGFsfSBmcm9tIFwiQGFuZ3VsYXIvY2RrL3BvcnRhbFwiO1xuaW1wb3J0IHtmcm9tRXZlbnR9IGZyb20gXCJyeGpzXCI7XG5pbXBvcnQge01hdEljb25Nb2R1bGV9IGZyb20gXCJAYW5ndWxhci9tYXRlcmlhbC9pY29uXCI7XG5cbmV4cG9ydCAqIGZyb20gJy4vdHlwZSdcblxuQENvbXBvbmVudCh7XG4gIHNlbGVjdG9yOiAnZGl2LmJmLWNvbnRleHRtZW51JyxcbiAgc3RhbmRhbG9uZTogdHJ1ZSxcbiAgdGVtcGxhdGU6IGBcblxuICAgIDxuZy10ZW1wbGF0ZSAjaWNvbiBsZXQtaXRlbT5cbiAgICAgIDxpIFtjbGFzc109XCJpdGVtLmljb25cIj48L2k+XG4gICAgPC9uZy10ZW1wbGF0ZT5cblxuICAgIDxuZy10ZW1wbGF0ZSAjc3ZnSWNvbiBsZXQtaXRlbT5cbiAgICAgIDxtYXQtaWNvbiBbc3ZnSWNvbl09XCJpdGVtLnN2Z0ljb25cIiBzdHlsZT1cIndpZHRoOiAxZW07IGhlaWdodDogMWVtXCI+PC9tYXQtaWNvbj5cbiAgICA8L25nLXRlbXBsYXRlPlxuXG4gICAgPGRpdiBjbGFzcz1cInNwYXJrLXBvcG92ZXJfX2dhcFwiPjwvZGl2PlxuICAgIDxkaXYgY2xhc3M9XCJzcGFyay1wb3BvdmVyX19jb250YWluZXJcIj5cbiAgICAgIDxuZy1jb250YWluZXIgKm5nSWY9XCJhY3RpdmVCbG9jay5ub2RlVHlwZSA9PT0gJ2VkaXRhYmxlJ1wiPlxuICAgICAgICA8aDQgY2xhc3M9XCJ0aXRsZVwiPuWfuuehgDwvaDQ+XG4gICAgICAgIDx1bCBjbGFzcz0nYmFzZS1saXN0Jz5cbiAgICAgICAgICA8bGkgY2xhc3M9XCJiYXNlLWxpc3RfX2l0ZW1cIiAqbmdGb3I9XCJsZXQgaXRlbSBvZiBiYXNlQmxvY2tMaXN0XCIgW3RpdGxlXT1cIml0ZW0uZGVzY3JpcHRpb24gfHwgaXRlbS5sYWJlbFwiXG4gICAgICAgICAgICAgIChtb3VzZWRvd24pPVwib25Nb3VzZURvd24oJGV2ZW50LCBpdGVtLCAnYmxvY2snKVwiIFtjbGFzcy5hY3RpdmVdPVwiYWN0aXZlQmxvY2suZmxhdm91ciA9PT0gaXRlbS5mbGF2b3VyXCI+XG4gICAgICAgICAgICA8bmctY29udGFpbmVyICpuZ1RlbXBsYXRlT3V0bGV0PVwiaXRlbS5zdmdJY29uID8gc3ZnSWNvbiA6IGljb247IGNvbnRleHQ6IHskaW1wbGljaXQ6IGl0ZW19XCI+XG4gICAgICAgICAgICA8L25nLWNvbnRhaW5lcj5cbiAgICAgICAgICA8L2xpPlxuICAgICAgICA8L3VsPlxuICAgICAgICA8ZGl2IGNsYXNzPVwibGluZVwiPjwvZGl2PlxuICAgICAgPC9uZy1jb250YWluZXI+XG5cbiAgICAgIDxuZy1jb250YWluZXIgKm5nSWY9XCJoYXNDb250ZW50XCI+XG4gICAgICAgIDx1bCBjbGFzcz1cImNvbW1vbi1saXN0XCI+XG4gICAgICAgICAgPGxpIGNsYXNzPVwiY29tbW9uLWxpc3RfX2l0ZW1cIiAqbmdGb3I9XCJsZXQgaXRlbSBvZiB0b29sTGlzdFwiXG4gICAgICAgICAgICAgIChtb3VzZWRvd24pPVwib25Nb3VzZURvd24oJGV2ZW50LCBpdGVtLCAndG9vbCcpXCI+XG4gICAgICAgICAgICA8aSBbY2xhc3NdPVwiaXRlbS5pY29uXCI+PC9pPlxuICAgICAgICAgICAgPHNwYW4+e3sgaXRlbS5sYWJlbCB9fTwvc3Bhbj5cbiAgICAgICAgICA8L2xpPlxuICAgICAgICA8L3VsPlxuICAgICAgICA8ZGl2IGNsYXNzPVwibGluZVwiPjwvZGl2PlxuICAgICAgPC9uZy1jb250YWluZXI+XG5cbiAgICAgIDxuZy1jb250YWluZXIgKm5nSWY9XCIhaGFzQ29udGVudCBlbHNlIGFwcGVuZEFmdGVyXCI+XG4gICAgICAgIDxuZy1jb250YWluZXIgKm5nVGVtcGxhdGVPdXRsZXQ9XCJtb3JlQmxvY2tMaXN0XCI+PC9uZy1jb250YWluZXI+XG4gICAgICA8L25nLWNvbnRhaW5lcj5cblxuICAgICAgPG5nLXRlbXBsYXRlICNhcHBlbmRBZnRlcj5cbiAgICAgICAgPHVsIGNsYXNzPSdjb21tb24tbGlzdCc+XG4gICAgICAgICAgPGxpIGNsYXNzPVwiY29tbW9uLWxpc3RfX2l0ZW0gYWRkLWJsb2NrLWJ0blwiIChtb3VzZWVudGVyKT1cIm9uU2hvd01vcmVCbG9jaygkZXZlbnQpXCJcbiAgICAgICAgICAgICAgW2NsYXNzLmFjdGl2ZV09XCJtb3JlQmxvY2tUcHJcIj5cbiAgICAgICAgICAgIDxpIGNsYXNzPVwiYmZfaWNvbiBiZl90aWFuamlhXCI+PC9pPlxuICAgICAgICAgICAgPHNwYW4+5Zyo5LiL5pa55re75YqgPC9zcGFuPlxuICAgICAgICAgICAgPGkgY2xhc3M9XCJiZl9pY29uIGJmX3lvdWppYW50b3VcIj48L2k+XG4gICAgICAgICAgPC9saT5cbiAgICAgICAgPC91bD5cbiAgICAgIDwvbmctdGVtcGxhdGU+XG4gICAgPC9kaXY+XG5cbiAgICA8bmctdGVtcGxhdGUgI21vcmVCbG9ja0NvbnRhaW5lcj5cbiAgICAgIDxkaXYgY2xhc3M9XCJzcGFyay1wb3BvdmVyX19jb250YWluZXIgc3BhcmstcG9wb3Zlcl9fbW9yZS1ibG9ja1wiIHN0eWxlPVwibWF4LWhlaWdodDogNTAwcHg7IG92ZXJmbG93LXk6IGF1dG87XCI+XG4gICAgICAgIDxuZy1jb250YWluZXIgKm5nVGVtcGxhdGVPdXRsZXQ9XCJtb3JlQmxvY2tMaXN0XCI+PC9uZy1jb250YWluZXI+XG4gICAgICA8L2Rpdj5cbiAgICA8L25nLXRlbXBsYXRlPlxuXG4gICAgPG5nLXRlbXBsYXRlICNtb3JlQmxvY2tMaXN0PlxuICAgICAgPGg0IGNsYXNzPVwidGl0bGVcIiAqbmdJZj1cImNvbW1vbkJsb2NrTGlzdC5sZW5ndGhcIj7luLjnlKg8L2g0PlxuICAgICAgPHVsIGNsYXNzPSdjb21tb24tbGlzdCc+XG4gICAgICAgIDxuZy1jb250YWluZXIgKm5nSWY9XCJhY3RpdmVCbG9jay5ub2RlVHlwZSAhPT0gJ2VkaXRhYmxlJ1wiPlxuICAgICAgICAgIDxsaSBjbGFzcz1cImNvbW1vbi1saXN0X19pdGVtXCIgKm5nRm9yPVwibGV0IGl0ZW0gb2YgYmFzZUJsb2NrTGlzdFwiIFt0aXRsZV09XCJpdGVtLmRlc2NyaXB0aW9uIHx8IGl0ZW0ubGFiZWxcIlxuICAgICAgICAgICAgICAobW91c2Vkb3duKT1cIm9uTW91c2VEb3duKCRldmVudCwgaXRlbSwgJ2Jsb2NrJylcIj5cbiAgICAgICAgICAgIDxuZy1jb250YWluZXIgKm5nVGVtcGxhdGVPdXRsZXQ9XCJpdGVtLnN2Z0ljb24gPyBzdmdJY29uIDogaWNvbjsgY29udGV4dDogeyRpbXBsaWNpdDogaXRlbX1cIj5cbiAgICAgICAgICAgIDwvbmctY29udGFpbmVyPlxuICAgICAgICAgICAgPHNwYW4+e3sgaXRlbS5sYWJlbCB9fTwvc3Bhbj5cbiAgICAgICAgICA8L2xpPlxuICAgICAgICA8L25nLWNvbnRhaW5lcj5cblxuICAgICAgICA8bGkgY2xhc3M9XCJjb21tb24tbGlzdF9faXRlbVwiICpuZ0Zvcj1cImxldCBpdGVtIG9mIGNvbW1vbkJsb2NrTGlzdFwiIFt0aXRsZV09XCJpdGVtLmRlc2NyaXB0aW9uIHx8IGl0ZW0ubGFiZWxcIlxuICAgICAgICAgICAgKG1vdXNlZG93bik9XCJvbk1vdXNlRG93bigkZXZlbnQsIGl0ZW0sICdibG9jaycpXCI+XG4gICAgICAgICAgPG5nLWNvbnRhaW5lciAqbmdUZW1wbGF0ZU91dGxldD1cIml0ZW0uc3ZnSWNvbiA/IHN2Z0ljb24gOiBpY29uOyBjb250ZXh0OiB7JGltcGxpY2l0OiBpdGVtfVwiPlxuICAgICAgICAgIDwvbmctY29udGFpbmVyPlxuICAgICAgICAgIDxzcGFuPnt7IGl0ZW0ubGFiZWwgfX08L3NwYW4+XG4gICAgICAgIDwvbGk+XG4gICAgICA8L3VsPlxuICAgIDwvbmctdGVtcGxhdGU+XG5cbiAgICA8ZGl2IGNsYXNzPVwic3BhcmstcG9wb3Zlcl9fZ2FwXCI+PC9kaXY+XG4gIGAsXG4gIGltcG9ydHM6IFtOZ0Zvck9mLCBOZ0lmLCBOZ1RlbXBsYXRlT3V0bGV0LCBNYXRJY29uTW9kdWxlXSxcbiAgc3R5bGVzOiBbYFxuICAgIDpob3N0IHtcbiAgICAgIGRpc3BsYXk6IGJsb2NrO1xuICAgIH1cblxuICAgIDo6bmctZGVlcCBtYXQtaWNvbiB7XG4gICAgICB3aWR0aDogMWVtO1xuICAgICAgaGVpZ2h0OiAxZW07XG4gICAgICBmb250LXNpemU6IDFlbTtcbiAgICB9XG5cbiAgICA6Om5nLWRlZXAgbWF0LWljb24gPiBzdmcge1xuICAgICAgdmVydGljYWwtYWxpZ246IHRvcDtcbiAgICB9XG5cbiAgICAuc3BhcmstcG9wb3Zlcl9fZ2FwIHtcbiAgICAgIGhlaWdodDogOHB4O1xuICAgIH1cblxuICAgIC5zcGFyay1wb3BvdmVyX19jb250YWluZXIge1xuICAgICAgcGFkZGluZzogOHB4IDA7XG4gICAgICB3aWR0aDogMjI0cHg7XG4gICAgICBiYWNrZ3JvdW5kOiAjZmZmO1xuICAgICAgYm9yZGVyLXJhZGl1czogNHB4O1xuICAgICAgYm9yZGVyOiAxcHggc29saWQgI0U2RTZFNjtcbiAgICAgIGJveC1zaGFkb3c6IDBweCAwcHggMjBweCAwcHggcmdiYSgwLCAwLCAwLCAwLjEwKTtcbiAgICB9XG5cbiAgICAudGl0bGUge1xuICAgICAgbWFyZ2luOiA4cHggMTZweCAwIDE2cHg7XG4gICAgICBjb2xvcjogIzk5OTtcbiAgICAgIGZvbnQtc2l6ZTogMTRweDtcbiAgICAgIGZvbnQtd2VpZ2h0OiA2MDA7XG4gICAgICBsaW5lLWhlaWdodDogMTQwJTsgLyogMTkuNnB4ICovXG4gICAgfVxuXG4gICAgLmxpbmUge1xuICAgICAgaGVpZ2h0OiAxcHg7XG4gICAgICBiYWNrZ3JvdW5kOiAjZjNmM2YzO1xuICAgICAgd2lkdGg6IDEwMCU7XG4gICAgfVxuXG4gICAgLmJhc2UtbGlzdCwgLmNvbW1vbi1saXN0IHtcbiAgICAgIG1hcmdpbjogMDtcbiAgICB9XG5cbiAgICAuYmFzZS1saXN0IHtcbiAgICAgIGRpc3BsYXk6IGZsZXg7XG4gICAgICBmbGV4LXdyYXA6IHdyYXA7XG4gICAgICBwYWRkaW5nOiA4cHggMTJweDtcbiAgICAgIGdhcDogOHB4O1xuICAgIH1cblxuICAgIC5iYXNlLWxpc3RfX2l0ZW0ge1xuICAgICAgd2lkdGg6IDI0cHg7XG4gICAgICBoZWlnaHQ6IDI0cHg7XG4gICAgICBib3JkZXItcmFkaXVzOiA0cHg7XG4gICAgICBkaXNwbGF5OiBmbGV4O1xuICAgICAganVzdGlmeS1jb250ZW50OiBjZW50ZXI7XG4gICAgICBhbGlnbi1pdGVtczogY2VudGVyO1xuICAgICAgY3Vyc29yOiBwb2ludGVyO1xuICAgIH1cblxuICAgIC5iYXNlLWxpc3RfX2l0ZW06aG92ZXIsIC5iYXNlLWxpc3RfX2l0ZW0uYWN0aXZlIHtcbiAgICAgIGJhY2tncm91bmQ6ICNmM2YzZjM7XG4gICAgfVxuXG4gICAgLmJhc2UtbGlzdF9faXRlbSA+IGkge1xuICAgICAgZm9udC1zaXplOiAxNnB4O1xuICAgIH1cblxuICAgIC5jb21tb24tbGlzdCB7XG4gICAgICBwYWRkaW5nOiA4cHg7XG4gICAgfVxuXG4gICAgLmNvbW1vbi1saXN0X19pdGVtIHtcbiAgICAgIGRpc3BsYXk6IGZsZXg7XG4gICAgICBhbGlnbi1pdGVtczogY2VudGVyO1xuICAgICAgZ2FwOiA4cHg7XG4gICAgICBoZWlnaHQ6IDM2cHg7XG4gICAgICBwYWRkaW5nOiAwIDhweDtcbiAgICAgIGJvcmRlci1yYWRpdXM6IDRweDtcbiAgICAgIGN1cnNvcjogcG9pbnRlcjtcbiAgICB9XG5cbiAgICAuY29tbW9uLWxpc3RfX2l0ZW06aG92ZXIsIC5jb21tb24tbGlzdF9faXRlbS5hY3RpdmUge1xuICAgICAgYmFja2dyb3VuZC1jb2xvcjogI2Y1ZjVmNTtcbiAgICB9XG5cbiAgICAuY29tbW9uLWxpc3RfX2l0ZW0gPiBpIHtcbiAgICAgIGZvbnQtc2l6ZTogMTRweDtcbiAgICB9XG5cbiAgICAuY29tbW9uLWxpc3RfX2l0ZW0gPiBzcGFuIHtcbiAgICAgIGNvbG9yOiAjMzMzO1xuICAgICAgZm9udC1zaXplOiAxNHB4O1xuICAgICAgbGluZS1oZWlnaHQ6IDIwcHg7XG4gICAgICBmbGV4OiAxO1xuICAgIH1cblxuICAgIC5hZGQtYmxvY2stYnRuIHtcbiAgICAgIHBvc2l0aW9uOiByZWxhdGl2ZTtcbiAgICB9XG5cbiAgICAuc3BhcmstcG9wb3Zlcl9fbW9yZS1ibG9jayB7XG4gICAgfVxuXG4gIGBdLFxuICBjaGFuZ2VEZXRlY3Rpb246IENoYW5nZURldGVjdGlvblN0cmF0ZWd5Lk9uUHVzaFxufSlcbmV4cG9ydCBjbGFzcyBCbG9ja0Zsb3dDb250ZXh0bWVudSB7XG5cbiAgcHJpdmF0ZSBfYWN0aXZlQmxvY2shOiBCYXNlQmxvY2tcbiAgQElucHV0KHtyZXF1aXJlZDogdHJ1ZX0pXG4gIHNldCBhY3RpdmVCbG9jayh2YWw6IEJhc2VCbG9jaykge1xuICAgIGlmICghdmFsKSByZXR1cm5cbiAgICB0aGlzLl9hY3RpdmVCbG9jayA9IHZhbFxuICAgIHRoaXMuaGFzQ29udGVudCA9IHZhbCBpbnN0YW5jZW9mIEVkaXRhYmxlQmxvY2sgJiYgdmFsLmZsYXZvdXIgPT09ICdwYXJhZ3JhcGgnID8gISF2YWwudGV4dExlbmd0aCA6IHRydWVcbiAgfVxuXG4gIGdldCBhY3RpdmVCbG9jaygpIHtcbiAgICByZXR1cm4gdGhpcy5fYWN0aXZlQmxvY2tcbiAgfVxuXG4gIHByaXZhdGUgX2NvbnRyb2xsZXIhOiBDb250cm9sbGVyXG4gIEBJbnB1dCh7cmVxdWlyZWQ6IHRydWV9KVxuICBzZXQgY29udHJvbGxlcih2YWw6IENvbnRyb2xsZXIpIHtcbiAgICBpZiAoIXZhbCkgdGhyb3cgbmV3IEVycm9yKCdDb250cm9sbGVyIGlzIHJlcXVpcmVkJylcbiAgICB0aGlzLl9jb250cm9sbGVyID0gdmFsXG4gICAgY29uc3Qgc2NoZW1hcyA9IHZhbC5zY2hlbWFzLnZhbHVlcygpLmZpbHRlcihzY2hlbWEgPT4gIXNjaGVtYS5pc0xlYWYpXG4gICAgdGhpcy5iYXNlQmxvY2tMaXN0ID0gc2NoZW1hcy5maWx0ZXIoc2NoZW1hID0+IHNjaGVtYS5ub2RlVHlwZSA9PT0gJ2VkaXRhYmxlJylcbiAgICB0aGlzLmNvbW1vbkJsb2NrTGlzdCA9IHNjaGVtYXMuZmlsdGVyKHNjaGVtYSA9PiBzY2hlbWEubm9kZVR5cGUgIT09ICdlZGl0YWJsZScpXG4gIH1cblxuICBnZXQgY29udHJvbGxlcigpIHtcbiAgICByZXR1cm4gdGhpcy5fY29udHJvbGxlclxuICB9XG5cbiAgQE91dHB1dCgpIGl0ZW1DbGljayA9IG5ldyBFdmVudEVtaXR0ZXI8SUNvbnRleHRNZW51RXZlbnQ+KClcbiAgQE91dHB1dCgpIGRlc3Ryb3kgPSBuZXcgRXZlbnRFbWl0dGVyPGJvb2xlYW4+KClcblxuICBjb25zdHJ1Y3RvcihcbiAgICBwcml2YXRlIGNkcjogQ2hhbmdlRGV0ZWN0b3JSZWYsXG4gICAgcHJpdmF0ZSB2Y3I6IFZpZXdDb250YWluZXJSZWYsXG4gICAgcHJpdmF0ZSBvdmVybGF5OiBPdmVybGF5XG4gICkge1xuICB9XG5cbiAgQFZpZXdDaGlsZCgnbW9yZUJsb2NrQ29udGFpbmVyJykgbW9yZUJsb2NrQ29udGFpbmVyITogVGVtcGxhdGVSZWY8YW55PlxuXG4gIHByb3RlY3RlZCBiYXNlQmxvY2tMaXN0OiBJQ29udGV4dE1lbnVJdGVtW10gPSBbXVxuICBwcm90ZWN0ZWQgY29tbW9uQmxvY2tMaXN0OiBJQ29udGV4dE1lbnVJdGVtW10gPSBbXVxuICBwcm90ZWN0ZWQgdG9vbExpc3Q6IElDb250ZXh0TWVudUl0ZW1bXSA9IFtcbiAgICB7XG4gICAgICBmbGF2b3VyOiAnY3V0JyxcbiAgICAgIGljb246ICdiZl9pY29uIGJmX2ppYW5xaWUnLFxuICAgICAgbGFiZWw6ICfliarliIcnLFxuICAgIH0sXG4gICAge1xuICAgICAgZmxhdm91cjogJ2NvcHknLFxuICAgICAgaWNvbjogJ2JmX2ljb24gYmZfZnV6aGknLFxuICAgICAgbGFiZWw6ICflpI3liLYnLFxuICAgIH0sXG4gICAge1xuICAgICAgZmxhdm91cjogJ2RlbGV0ZScsXG4gICAgICBpY29uOiAnYmZfaWNvbiBiZl9zaGFuY2h1LTInLFxuICAgICAgbGFiZWw6ICfliKDpmaQnLFxuICAgIH1cbiAgXVxuXG4gIHByb3RlY3RlZCBoYXNDb250ZW50ID0gZmFsc2VcblxuICBwcm90ZWN0ZWQgbW9yZUJsb2NrVHByPzogRW1iZWRkZWRWaWV3UmVmPGFueT5cblxuICBASG9zdExpc3RlbmVyKCdjbGljaycsIFsnJGV2ZW50J10pXG4gIEBIb3N0TGlzdGVuZXIoJ21vdXNlZG93bicsIFsnJGV2ZW50J10pXG4gIG9uQ2xpY2soZXZlbnQ6IE1vdXNlRXZlbnQpIHtcbiAgICBldmVudC5zdG9wUHJvcGFnYXRpb24oKVxuICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KClcbiAgfVxuXG4gIG9uTW91c2VEb3duKGV2ZW50OiBNb3VzZUV2ZW50LCBpdGVtOiBJQ29udGV4dE1lbnVJdGVtLCB0eXBlOiAnYmxvY2snIHwgJ3Rvb2wnKSB7XG4gICAgaWYgKHR5cGUgPT09ICdibG9jaycgJiYgdGhpcy5hY3RpdmVCbG9jay5ub2RlVHlwZSA9PT0gXCJlZGl0YWJsZVwiICYmIHRoaXMuYWN0aXZlQmxvY2suZmxhdm91ciA9PT0gaXRlbS5mbGF2b3VyKSByZXR1cm5cbiAgICB0aGlzLm9uSXRlbUNsaWNrZWQoe2l0ZW0sIHR5cGV9KVxuICAgIHRoaXMuaXRlbUNsaWNrLmVtaXQoe2l0ZW0sIHR5cGV9KVxuICB9XG5cbiAgb25JdGVtQ2xpY2tlZCh2YWx1ZTogSUNvbnRleHRNZW51RXZlbnQpIHtcbiAgICBjb25zdCB7aXRlbSwgdHlwZX0gPSB2YWx1ZVxuXG4gICAgY29uc3Qgc2VsZWN0aW9uID0gdGhpcy5jb250cm9sbGVyLnNlbGVjdGlvbi5nZXRTZWxlY3Rpb24oKVxuXG4gICAgaWYgKHR5cGUgPT09ICd0b29sJykge1xuICAgICAgc3dpdGNoIChpdGVtLmZsYXZvdXIpIHtcbiAgICAgICAgY2FzZSAnY3V0JzpcbiAgICAgICAgY2FzZSAnY29weSc6XG4gICAgICAgICAgaWYgKHNlbGVjdGlvbj8uaXNBdFJvb3QgJiYgc2VsZWN0aW9uLnJvb3RSYW5nZSkge1xuICAgICAgICAgICAgdGhpcy5jb250cm9sbGVyLmNsaXBib2FyZC5leGVjQ29tbWFuZChpdGVtLmZsYXZvdXIpXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuY29udHJvbGxlci5jbGlwYm9hcmQud3JpdGVEYXRhKFtcbiAgICAgICAgICAgICAge3R5cGU6ICdibG9jaycsIGRhdGE6IFt0aGlzLmFjdGl2ZUJsb2NrLm1vZGVsLnRvSlNPTigpXX1cbiAgICAgICAgICAgIF0pXG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVyblxuICAgICAgICBjYXNlICdkZWxldGUnOlxuICAgICAgICAgIGlmICh0aGlzLmNvbnRyb2xsZXIucm9vdC5zZWxlY3RlZEJsb2NrUmFuZ2UpIHRoaXMuY29udHJvbGxlci5kZWxldGVTZWxlY3RlZEJsb2NrcygpXG4gICAgICAgICAgZWxzZSB0aGlzLmNvbnRyb2xsZXIuZGVsZXRlQmxvY2tCeUlkKHRoaXMuYWN0aXZlQmxvY2shLmlkKVxuICAgICAgICAgIHJldHVyblxuICAgICAgfVxuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgY29uc3Qgc2NoZW1hID0gaXRlbSBhcyBCbG9ja1NjaGVtYVxuXG4gICAgaWYgKHNjaGVtYS5ub2RlVHlwZSA9PT0gJ2VkaXRhYmxlJyAmJiBzZWxlY3Rpb24/LmlzQXRSb290ICYmIHNlbGVjdGlvbi5yb290UmFuZ2UpIHtcbiAgICAgIGNvbnN0IHNlbGVjdGVkQmxvY2tNb2RlbHMgPSB0aGlzLmNvbnRyb2xsZXIucm9vdE1vZGVsLnNsaWNlKHNlbGVjdGlvbi5yb290UmFuZ2Uuc3RhcnQsIHNlbGVjdGlvbi5yb290UmFuZ2UuZW5kKVxuXG4gICAgICBpZiAoc2VsZWN0ZWRCbG9ja01vZGVscy5maW5kKHYgPT4gdi5pZCA9PT0gdGhpcy5hY3RpdmVCbG9jay5pZCkpIHtcblxuICAgICAgICBjb25zdCBtb2RlbHNBcnIgPSBzZWxlY3RlZEJsb2NrTW9kZWxzLm1hcCgodiwgaSkgPT4ge1xuICAgICAgICAgIGlmICh2LmZsYXZvdXIgPT09IHNjaGVtYS5mbGF2b3VyIHx8IHYubm9kZVR5cGUgIT09ICdlZGl0YWJsZScpIHJldHVybiAtMVxuICAgICAgICAgIHJldHVybiBzZWxlY3Rpb24ucm9vdFJhbmdlIS5zdGFydCArIGlcbiAgICAgICAgfSkuZmlsdGVyKHYgPT4gdiA+PSAwKVxuXG4gICAgICAgIGlmIChtb2RlbHNBcnIubGVuZ3RoID4gMSkge1xuXG4gICAgICAgICAgY29uc3Qgc3BsaXRNb2RlbHNBcnI6IFtudW1iZXIsIG51bWJlcl1bXSA9IG1vZGVsc0Fyci5yZWR1Y2UoKGFjYywgY3VyLCBpKSA9PiB7XG4gICAgICAgICAgICBpZiAoY3VyIC0gYWNjW2FjYy5sZW5ndGggLSAxXVsxXSA+IDEpIHtcbiAgICAgICAgICAgICAgYWNjLnB1c2goW2N1ciwgY3VyXSlcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIGFjY1thY2MubGVuZ3RoIC0gMV1bMV0gPSBjdXJcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBhY2NcbiAgICAgICAgICB9LCBbW21vZGVsc0FyclswXSwgbW9kZWxzQXJyWzBdXV0pXG5cbiAgICAgICAgICB0aGlzLmNvbnRyb2xsZXIudHJhbnNhY3QoKCkgPT4ge1xuICAgICAgICAgICAgc3BsaXRNb2RlbHNBcnIuZm9yRWFjaCgoW3N0YXJ0LCBlbmRdKSA9PiB7XG5cbiAgICAgICAgICAgICAgY29uc3QgbmV3QmxvY2tzID0gW11cbiAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IHN0YXJ0OyBpIDw9IGVuZDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgYmxvY2sgPSB0aGlzLmNvbnRyb2xsZXIucm9vdE1vZGVsW2ldIGFzIEJsb2NrTW9kZWw8SUVkaXRhYmxlQmxvY2tNb2RlbD5cbiAgICAgICAgICAgICAgICBuZXdCbG9ja3MucHVzaCh0aGlzLmNvbnRyb2xsZXIuY3JlYXRlQmxvY2soc2NoZW1hLmZsYXZvdXIsIFtKU09OLnBhcnNlKEpTT04uc3RyaW5naWZ5KGJsb2NrLmNoaWxkcmVuKSksIGJsb2NrLnByb3BzXSkpXG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICB0aGlzLmNvbnRyb2xsZXIucmVwbGFjZUJsb2NrcyhzdGFydCwgbmV3QmxvY2tzLmxlbmd0aCwgbmV3QmxvY2tzKS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICB0aGlzLmNvbnRyb2xsZXIuc2VsZWN0aW9uLmFwcGx5UmFuZ2Uoc2VsZWN0aW9uKVxuICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgfSlcbiAgICAgICAgICB9LCBVU0VSX0NIQU5HRV9TSUdOQUwpXG5cbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgfVxuXG4gICAgfVxuXG4gICAgaWYgKHRoaXMuYWN0aXZlQmxvY2sgaW5zdGFuY2VvZiBFZGl0YWJsZUJsb2NrICYmIHNjaGVtYS5ub2RlVHlwZSA9PT0gJ2VkaXRhYmxlJykge1xuICAgICAgY29uc3QgZGVsdGFzID0gdGhpcy5hY3RpdmVCbG9jay5nZXRUZXh0RGVsdGEoKVxuICAgICAgY29uc3QgbmV3QmxvY2sgPSB0aGlzLmNvbnRyb2xsZXIuY3JlYXRlQmxvY2soc2NoZW1hLmZsYXZvdXIsIFtkZWx0YXMsIHRoaXMuYWN0aXZlQmxvY2sucHJvcHNdKVxuICAgICAgdGhpcy5jb250cm9sbGVyLnJlcGxhY2VXaXRoKHRoaXMuYWN0aXZlQmxvY2suaWQsIFtuZXdCbG9ja10pLnRoZW4oKCkgPT4ge1xuICAgICAgICB0aGlzLmNvbnRyb2xsZXIuc2VsZWN0aW9uLnNldFNlbGVjdGlvbihuZXdCbG9jay5pZCwgJ3N0YXJ0JylcbiAgICAgIH0pXG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICBjb25zdCBwb3NpdGlvbiA9IHRoaXMuY29udHJvbGxlci5nZXRCbG9ja1Bvc2l0aW9uKHRoaXMuYWN0aXZlQmxvY2shLmlkKVxuXG4gICAgaWYgKHNjaGVtYS5mbGF2b3VyID09PSAnaW1hZ2UnKSB7XG4gICAgICBjb25zdCBpbnB1dCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2lucHV0JylcbiAgICAgIGlucHV0LnR5cGUgPSAnZmlsZSdcbiAgICAgIGlucHV0LmFjY2VwdCA9ICdpbWFnZS8qJ1xuICAgICAgaW5wdXQubXVsdGlwbGUgPSBmYWxzZVxuICAgICAgaW5wdXQuY2xpY2soKVxuICAgICAgaW5wdXQub25jaGFuZ2UgPSAoKSA9PiB7XG4gICAgICAgIGNvbnN0IGZpbGUgPSBpbnB1dC5maWxlcyFbMF1cbiAgICAgICAgaWYgKCFmaWxlKSByZXR1cm5cbiAgICAgICAgY29uc3QgZmlsZVVwbG9hZGVyID0gdGhpcy5jb250cm9sbGVyLmluamVjdG9yLmdldChGSUxFX1VQTE9BREVSKVxuICAgICAgICBpZiAoIWZpbGUpIHRocm93IG5ldyBFcnJvcignZmlsZSBpcyByZXF1aXJlZCcpXG4gICAgICAgIGZpbGVVcGxvYWRlci51cGxvYWRJbWcoZmlsZSkudGhlbigoZmlsZVVyaSkgPT4ge1xuICAgICAgICAgIGNvbnN0IG5ld0Jsb2NrID0gdGhpcy5jb250cm9sbGVyLmNyZWF0ZUJsb2NrKHNjaGVtYS5mbGF2b3VyLCBbZmlsZVVyaV0pXG4gICAgICAgICAgdGhpcy5jb250cm9sbGVyLmluc2VydEJsb2Nrcyhwb3NpdGlvbi5pbmRleCArIDEsIFtuZXdCbG9ja10sIHBvc2l0aW9uLnBhcmVudElkKS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgIG5ld0Jsb2NrLm5vZGVUeXBlID09PSAnZWRpdGFibGUnICYmIHRoaXMuY29udHJvbGxlci5zZWxlY3Rpb24uc2V0U2VsZWN0aW9uKG5ld0Jsb2NrLmlkLCAnc3RhcnQnKVxuICAgICAgICAgIH0pXG4gICAgICAgIH0pXG4gICAgICB9XG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICBjb25zdCBuZXdCbG9jayA9IHRoaXMuY29udHJvbGxlci5jcmVhdGVCbG9jayhzY2hlbWEuZmxhdm91cilcbiAgICBpZiAoIXRoaXMuaGFzQ29udGVudClcbiAgICAgIHRoaXMuY29udHJvbGxlci5yZXBsYWNlV2l0aCh0aGlzLmFjdGl2ZUJsb2NrLmlkLCBbbmV3QmxvY2tdKS50aGVuKCgpID0+IHtcbiAgICAgICAgbmV3QmxvY2subm9kZVR5cGUgPT09ICdlZGl0YWJsZScgJiYgdGhpcy5jb250cm9sbGVyLnNlbGVjdGlvbi5zZXRTZWxlY3Rpb24obmV3QmxvY2suaWQsICdzdGFydCcpXG4gICAgICB9KVxuICAgIGVsc2VcbiAgICAgIHRoaXMuY29udHJvbGxlci5pbnNlcnRCbG9ja3MocG9zaXRpb24uaW5kZXggKyAxLCBbbmV3QmxvY2tdLCBwb3NpdGlvbi5wYXJlbnRJZCkudGhlbigoKSA9PiB7XG4gICAgICAgIG5ld0Jsb2NrLm5vZGVUeXBlID09PSAnZWRpdGFibGUnICYmIHRoaXMuY29udHJvbGxlci5zZWxlY3Rpb24uc2V0U2VsZWN0aW9uKG5ld0Jsb2NrLmlkLCAnc3RhcnQnKVxuICAgICAgfSlcbiAgfVxuXG4gIG9uU2hvd01vcmVCbG9jayhldmVudDogTW91c2VFdmVudCkge1xuICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KClcbiAgICBldmVudC5zdG9wUHJvcGFnYXRpb24oKVxuICAgIGlmICh0aGlzLm1vcmVCbG9ja1RwcikgcmV0dXJuXG4gICAgY29uc3QgdGFyZ2V0ID0gZXZlbnQudGFyZ2V0IGFzIEhUTUxFbGVtZW50XG4gICAgY29uc3QgcG9zaXRpb25TdHJhdGVneSA9IHRoaXMub3ZlcmxheS5wb3NpdGlvbigpLmZsZXhpYmxlQ29ubmVjdGVkVG8odGFyZ2V0KVxuICAgICAgLndpdGhQb3NpdGlvbnMoW1xuICAgICAgICB7b3JpZ2luWDogJ2VuZCcsIG9yaWdpblk6ICd0b3AnLCBvdmVybGF5WDogJ3N0YXJ0Jywgb3ZlcmxheVk6ICd0b3AnfSxcbiAgICAgICAge29yaWdpblg6ICdlbmQnLCBvcmlnaW5ZOiAnYm90dG9tJywgb3ZlcmxheVg6ICdzdGFydCcsIG92ZXJsYXlZOiAnYm90dG9tJ30sXG4gICAgICBdKS53aXRoUHVzaCh0cnVlKVxuICAgIGNvbnN0IG92ciA9IHRoaXMub3ZlcmxheS5jcmVhdGUoe1xuICAgICAgcG9zaXRpb25TdHJhdGVneSxcbiAgICAgIGhhc0JhY2tkcm9wOiBmYWxzZVxuICAgIH0pXG4gICAgdGhpcy5tb3JlQmxvY2tUcHIgPSBvdnIuYXR0YWNoKG5ldyBUZW1wbGF0ZVBvcnRhbCh0aGlzLm1vcmVCbG9ja0NvbnRhaW5lciwgdGhpcy52Y3IpKVxuICAgIGNvbnN0IHRwckVsID0gdGhpcy5tb3JlQmxvY2tUcHIucm9vdE5vZGVzWzBdIGFzIEhUTUxFbGVtZW50XG5cbiAgICBjb25zdCBsZWF2ZVN1YiA9IGZyb21FdmVudDxNb3VzZUV2ZW50Pih0YXJnZXQsICdtb3VzZWxlYXZlJylcbiAgICAgIC5zdWJzY3JpYmUoZSA9PiB7XG4gICAgICAgIGlmICh0cHJFbC5jb250YWlucyhlLnJlbGF0ZWRUYXJnZXQgYXMgSFRNTEVsZW1lbnQpKSByZXR1cm5cbiAgICAgICAgb3ZyLmRpc3Bvc2UoKVxuICAgICAgfSlcbiAgICBjb25zdCBsZWF2ZVN1YjIgPSBmcm9tRXZlbnQ8TW91c2VFdmVudD4odHByRWwsICdtb3VzZWxlYXZlJylcbiAgICAgIC5zdWJzY3JpYmUoZSA9PiB7XG4gICAgICAgIGlmICh0YXJnZXQuY29udGFpbnMoZS5yZWxhdGVkVGFyZ2V0IGFzIEhUTUxFbGVtZW50KSkgcmV0dXJuXG4gICAgICAgIG92ci5kaXNwb3NlKClcbiAgICAgIH0pXG5cbiAgICB0aGlzLm1vcmVCbG9ja1Rwci5vbkRlc3Ryb3koKCkgPT4ge1xuICAgICAgbGVhdmVTdWIudW5zdWJzY3JpYmUoKVxuICAgICAgbGVhdmVTdWIyLnVuc3Vic2NyaWJlKClcbiAgICAgIHRoaXMubW9yZUJsb2NrVHByID0gdW5kZWZpbmVkXG4gICAgICB0aGlzLmNkci5kZXRlY3RDaGFuZ2VzKClcbiAgICB9KVxuICB9XG5cbiAgbmdPbkRlc3Ryb3koKSB7XG4gICAgdGhpcy5kZXN0cm95LmVtaXQodHJ1ZSlcbiAgfVxuXG59XG4iXX0=