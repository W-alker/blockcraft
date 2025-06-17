import { NgForOf } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, TemplateRef, ViewChild } from '@angular/core';
import { EditableBlock } from '../../core';
import { TEMPLATE_LIST } from './const';
import { TemplatePortal } from '@angular/cdk/portal';
import mermaid from 'mermaid';
import { take } from 'rxjs';
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import * as i0 from "@angular/core";
import * as i1 from "@angular/cdk/overlay";
mermaid.initialize({ startOnLoad: false });
export class MermaidBlock extends EditableBlock {
    constructor(overlay, vcr) {
        super();
        this.overlay = overlay;
        this.vcr = vcr;
        this.templateList = TEMPLATE_LIST;
        this._viewMode = 'text';
        this.isIntersecting = false;
        this.renderGraph = async () => {
            // console.time('renderGraph')
            if (!this.textLength)
                return;
            const graphDefinition = this.getTextContent();
            const verify = await mermaid.parse(graphDefinition, { suppressErrors: true });
            if (verify) {
                const { svg } = await mermaid.render(this.id.replace(/\d/g, '') + 'graphDiv', graphDefinition);
                this.graph.nativeElement.innerHTML = svg;
            }
            else {
                this.graph.nativeElement.innerHTML = `<span style="color: red;">语法错误！</span>`;
            }
            // console.timeEnd('renderGraph')
        };
        this.dialogFlag = 'template';
    }
    ngAfterViewInit() {
        super.ngAfterViewInit();
        this.setView(this.props.view);
        this.intersectionObserver = new IntersectionObserver(([entry]) => {
            this.isIntersecting = entry.isIntersecting;
            if (this.isIntersecting && this._viewMode !== this.props.view) {
                this.setView(this.props.view);
            }
        }, {
            threshold: [0, 1]
        });
        this.intersectionObserver.observe(this.hostEl.nativeElement);
        this.model.update$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(v => {
            if (v.type === 'props' && this._viewMode !== this.props.view) {
                this.setView(this.props.view);
            }
        });
    }
    onSwitchView() {
        this.setProp('view', this._viewMode === 'graph' ? 'text' : 'graph');
    }
    setView(view) {
        if (this._viewMode === view || !this.isIntersecting)
            return;
        // console.log('切换视图', view)
        this.hostEl.nativeElement.setAttribute('data-view-mode', this._viewMode = view);
        if (view === 'graph') {
            this.renderGraph();
        }
        else {
            this.graph.nativeElement.innerHTML = '';
        }
    }
    onShowTemplateList(e, flag) {
        const target = e.target;
        const portal = new TemplatePortal(this.templateListTpl, this.vcr);
        const positionStrategy = this.overlay.position().flexibleConnectedTo(target).withPositions([
            { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top' }
        ]);
        this.modalRef = this.overlay.create({
            positionStrategy,
            hasBackdrop: true,
            backdropClass: 'cdk-overlay-transparent-backdrop',
        });
        this.modalRef.backdropClick().pipe(take(1)).subscribe(() => {
            this.modalRef?.dispose();
        });
        this.modalRef.attach(portal);
        this.dialogFlag = flag;
    }
    useTemplate(item) {
        if (this.dialogFlag === 'template') {
            const deltas = [{ insert: item.prefix + item.template }];
            if (this.textLength) {
                deltas.unshift({ delete: this.textLength });
            }
            this.applyDelta(deltas);
        }
        else {
            this.applyDelta([
                { insert: item.prefix }
            ]);
        }
        this.modalRef?.dispose();
    }
    ngOnDestroy() {
        super.ngOnDestroy();
        this.intersectionObserver.disconnect();
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: MermaidBlock, deps: [{ token: i1.Overlay }, { token: i0.ViewContainerRef }], target: i0.ɵɵFactoryTarget.Component }); }
    static { this.ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "14.0.0", version: "17.3.12", type: MermaidBlock, isStandalone: true, selector: "div.mermaid", viewQueries: [{ propertyName: "graph", first: true, predicate: ["graph"], descendants: true, read: ElementRef }, { propertyName: "templateListTpl", first: true, predicate: ["templateListTpl"], descendants: true, read: TemplateRef }], usesInheritance: true, ngImport: i0, template: "<div class=\"head\">\n  <div class=\"btn\" style=\"color: #999;\">Mermaid</div>\n  <div class=\"template-btn btn\" (click)=\"onShowTemplateList($event, 'prefix')\">\u7C7B\u578B <i class=\"bf_icon bf_xiajaintou\" style=\"font-size: .8em\"></i></div>\n\n  <div class=\"template-btn btn\" (click)=\"onShowTemplateList($event, 'template')\">\u6A21\u677F <i class=\"bf_icon bf_xiajaintou\"></i></div>\n  <div class=\"switch-btn btn\" (click)=\"onSwitchView()\"><i class=\"bf_icon bf_qiehuan\"></i></div>\n</div>\n\n<div class=\"container\">\n  <div class=\"editable-container bf-multi-line bf-plain-text-only\"></div>\n  <div class=\"graph-con\" #graph></div>\n</div>\n\n<ng-template #templateListTpl>\n  <div class=\"template-list\">\n    <div class=\"template-list_item\" *ngFor=\"let item of templateList\"\n      (click)=\"useTemplate(item)\">\n      {{item.name}}\n    </div>\n  </div>\n</ng-template>\n", styles: [":host{display:block;border-radius:4px;overflow:hidden;border:1px solid #e6e6e6}:host.selected{border-color:var(--bf-selected-border);background-color:var(--bf-selected)}:host[data-view-mode=text] .graph-con{visibility:hidden;height:0;overflow:hidden}:host[data-view-mode=graph] .editable-container{visibility:hidden;height:0;overflow:hidden;min-height:0}:host .head{background-color:var(--bf-bg);display:flex;align-items:center;position:relative;padding:8px 20px;border-bottom:1px solid #e6e6e6}:host .head .btn{padding:4px 8px;cursor:pointer;border-radius:4px;display:flex;align-items:center;gap:4px;font-size:small}:host .head .btn:hover{background-color:#9999991a}:host .head .btn>*{pointer-events:none}:host .head .switch-btn{position:absolute;top:50%;right:var(--bf-lh);transform:translateY(-50%)}:host .container{padding:20px;font-family:DM Mono,monospace;color:var(--bf-c)}:host .graph-con{overflow-x:auto}::ng-deep .template-list{background-color:#fff;border:1px solid #f5f2f0;border-radius:4px;padding:4px}::ng-deep .template-list_item{padding:0 4px;height:calc(var(--bf-lh) * 1.5);line-height:calc(var(--bf-lh) * 1.5);text-align:center;font-size:calc(var(--bf-fs) * .8);color:#999;cursor:pointer;border-radius:4px}::ng-deep .template-list_item:hover{background-color:#9999991a}\n"], dependencies: [{ kind: "directive", type: NgForOf, selector: "[ngFor][ngForOf]", inputs: ["ngForOf", "ngForTrackBy", "ngForTemplate"] }], changeDetection: i0.ChangeDetectionStrategy.OnPush }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: MermaidBlock, decorators: [{
            type: Component,
            args: [{ selector: 'div.mermaid', standalone: true, imports: [
                        NgForOf
                    ], changeDetection: ChangeDetectionStrategy.OnPush, template: "<div class=\"head\">\n  <div class=\"btn\" style=\"color: #999;\">Mermaid</div>\n  <div class=\"template-btn btn\" (click)=\"onShowTemplateList($event, 'prefix')\">\u7C7B\u578B <i class=\"bf_icon bf_xiajaintou\" style=\"font-size: .8em\"></i></div>\n\n  <div class=\"template-btn btn\" (click)=\"onShowTemplateList($event, 'template')\">\u6A21\u677F <i class=\"bf_icon bf_xiajaintou\"></i></div>\n  <div class=\"switch-btn btn\" (click)=\"onSwitchView()\"><i class=\"bf_icon bf_qiehuan\"></i></div>\n</div>\n\n<div class=\"container\">\n  <div class=\"editable-container bf-multi-line bf-plain-text-only\"></div>\n  <div class=\"graph-con\" #graph></div>\n</div>\n\n<ng-template #templateListTpl>\n  <div class=\"template-list\">\n    <div class=\"template-list_item\" *ngFor=\"let item of templateList\"\n      (click)=\"useTemplate(item)\">\n      {{item.name}}\n    </div>\n  </div>\n</ng-template>\n", styles: [":host{display:block;border-radius:4px;overflow:hidden;border:1px solid #e6e6e6}:host.selected{border-color:var(--bf-selected-border);background-color:var(--bf-selected)}:host[data-view-mode=text] .graph-con{visibility:hidden;height:0;overflow:hidden}:host[data-view-mode=graph] .editable-container{visibility:hidden;height:0;overflow:hidden;min-height:0}:host .head{background-color:var(--bf-bg);display:flex;align-items:center;position:relative;padding:8px 20px;border-bottom:1px solid #e6e6e6}:host .head .btn{padding:4px 8px;cursor:pointer;border-radius:4px;display:flex;align-items:center;gap:4px;font-size:small}:host .head .btn:hover{background-color:#9999991a}:host .head .btn>*{pointer-events:none}:host .head .switch-btn{position:absolute;top:50%;right:var(--bf-lh);transform:translateY(-50%)}:host .container{padding:20px;font-family:DM Mono,monospace;color:var(--bf-c)}:host .graph-con{overflow-x:auto}::ng-deep .template-list{background-color:#fff;border:1px solid #f5f2f0;border-radius:4px;padding:4px}::ng-deep .template-list_item{padding:0 4px;height:calc(var(--bf-lh) * 1.5);line-height:calc(var(--bf-lh) * 1.5);text-align:center;font-size:calc(var(--bf-fs) * .8);color:#999;cursor:pointer;border-radius:4px}::ng-deep .template-list_item:hover{background-color:#9999991a}\n"] }]
        }], ctorParameters: () => [{ type: i1.Overlay }, { type: i0.ViewContainerRef }], propDecorators: { graph: [{
                type: ViewChild,
                args: ['graph', { read: ElementRef }]
            }], templateListTpl: [{
                type: ViewChild,
                args: ['templateListTpl', { read: TemplateRef }]
            }] } });
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWVybWFpZC5ibG9jay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uL2Jsb2NrZmxvdy9zcmMvYmxvY2tzL21lcm1haWQvbWVybWFpZC5ibG9jay50cyIsIi4uLy4uLy4uLy4uLy4uL2Jsb2NrZmxvdy9zcmMvYmxvY2tzL21lcm1haWQvbWVybWFpZC5ibG9jay5odG1sIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUNBLE9BQU8sRUFBQyxPQUFPLEVBQUMsTUFBTSxpQkFBaUIsQ0FBQztBQUN4QyxPQUFPLEVBQUMsdUJBQXVCLEVBQUUsU0FBUyxFQUFFLFVBQVUsRUFBRSxXQUFXLEVBQUUsU0FBUyxFQUFDLE1BQU0sZUFBZSxDQUFDO0FBQ3JHLE9BQU8sRUFBaUIsYUFBYSxFQUFDLE1BQU0sWUFBWSxDQUFDO0FBQ3pELE9BQU8sRUFBQyxhQUFhLEVBQVksTUFBTSxTQUFTLENBQUE7QUFDaEQsT0FBTyxFQUFDLGNBQWMsRUFBQyxNQUFNLHFCQUFxQixDQUFDO0FBR25ELE9BQU8sT0FBTyxNQUFNLFNBQVMsQ0FBQTtBQUM3QixPQUFPLEVBQUMsSUFBSSxFQUFDLE1BQU0sTUFBTSxDQUFDO0FBQzFCLE9BQU8sRUFBQyxrQkFBa0IsRUFBQyxNQUFNLDRCQUE0QixDQUFDOzs7QUFFOUQsT0FBTyxDQUFDLFVBQVUsQ0FBQyxFQUFDLFdBQVcsRUFBRSxLQUFLLEVBQUMsQ0FBQyxDQUFBO0FBWXhDLE1BQU0sT0FBTyxZQUFhLFNBQVEsYUFBaUM7SUFhakUsWUFDVSxPQUFnQixFQUNoQixHQUFxQjtRQUU3QixLQUFLLEVBQUUsQ0FBQTtRQUhDLFlBQU8sR0FBUCxPQUFPLENBQVM7UUFDaEIsUUFBRyxHQUFILEdBQUcsQ0FBa0I7UUFiWixpQkFBWSxHQUFHLGFBQWEsQ0FBQTtRQUtyQyxjQUFTLEdBQUcsTUFBTSxDQUFBO1FBR2xCLG1CQUFjLEdBQUcsS0FBSyxDQUFBO1FBZ0NoQyxnQkFBVyxHQUFHLEtBQUssSUFBSSxFQUFFO1lBQ3ZC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LENBQUM7WUFDbkMsTUFBTSxNQUFNLEdBQXFCLENBQUMsRUFBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUMsUUFBUSxFQUFDLENBQUMsQ0FBQTtZQUN4RSxJQUFJLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztnQkFDcEIsTUFBTSxDQUFDLE9BQU8sQ0FBQyxFQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsVUFBVSxFQUFDLENBQUMsQ0FBQTtZQUMzQyxDQUFDO1lBQ0QsSUFBSSxDQUFDLFVBQVUsQ0FBQyxNQUFNLENBQUMsQ0FBQTtRQUN6QixDQUFDO2FBQU0sQ0FBQztZQUNOLElBQUksQ0FBQyxVQUFVLENBQUM7Z0JBQ2QsRUFBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLE1BQU0sRUFBQzthQUN0QixDQUFDLENBQUE7UUFDSixDQUFDO1FBQ0QsSUFBSSxDQUFDLFFBQVEsRUFBRSxPQUFPLEVBQUUsQ0FBQTtJQUMxQixDQUFDO0lBRVEsV0FBVztRQUNsQixLQUFLLENBQUMsV0FBVyxFQUFFLENBQUM7UUFDcEIsSUFBSSxDQUFDLG9CQUFvQixDQUFDLFVBQVUsRUFBRSxDQUFBO0lBQ3hDLENBQUM7K0dBN0dVLFlBQVk7bUdBQVosWUFBWSxrSkFJSSxVQUFVLDZHQUNBLFdBQVcsb0RDN0JsRCx5NEJBcUJBLG0wQ0RISSxPQUFPOzs0RkFNRSxZQUFZO2tCQVZ4QixTQUFTOytCQUNFLGFBQWEsY0FDWCxJQUFJLFdBQ1A7d0JBQ1AsT0FBTztxQkFDUixtQkFHZ0IsdUJBQXVCLENBQUMsTUFBTTsyR0FNUCxLQUFLO3NCQUE1QyxTQUFTO3VCQUFDLE9BQU8sRUFBRSxFQUFDLElBQUksRUFBRSxVQUFVLEVBQUM7Z0JBQ2EsZUFBZTtzQkFBakUsU0FBUzt1QkFBQyxpQkFBaUIsRUFBRSxFQUFDLElBQUksRUFBRSxXQUFXLEVBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQge092ZXJsYXksIE92ZXJsYXlSZWZ9IGZyb20gJ0Bhbmd1bGFyL2Nkay9vdmVybGF5JztcbmltcG9ydCB7TmdGb3JPZn0gZnJvbSAnQGFuZ3VsYXIvY29tbW9uJztcbmltcG9ydCB7Q2hhbmdlRGV0ZWN0aW9uU3RyYXRlZ3ksIENvbXBvbmVudCwgRWxlbWVudFJlZiwgVGVtcGxhdGVSZWYsIFZpZXdDaGlsZH0gZnJvbSAnQGFuZ3VsYXIvY29yZSc7XG5pbXBvcnQge0RlbHRhT3BlcmF0aW9uLCBFZGl0YWJsZUJsb2NrfSBmcm9tICcuLi8uLi9jb3JlJztcbmltcG9ydCB7VEVNUExBVEVfTElTVCwgSVRlbXBsYXRlfSBmcm9tICcuL2NvbnN0J1xuaW1wb3J0IHtUZW1wbGF0ZVBvcnRhbH0gZnJvbSAnQGFuZ3VsYXIvY2RrL3BvcnRhbCc7XG5pbXBvcnQge1ZpZXdDb250YWluZXJSZWZ9IGZyb20gJ0Bhbmd1bGFyL2NvcmUnO1xuaW1wb3J0IHtJTWVybWFpZEJsb2NrTW9kZWx9IGZyb20gJy4vdHlwZSc7XG5pbXBvcnQgbWVybWFpZCBmcm9tICdtZXJtYWlkJ1xuaW1wb3J0IHt0YWtlfSBmcm9tICdyeGpzJztcbmltcG9ydCB7dGFrZVVudGlsRGVzdHJveWVkfSBmcm9tIFwiQGFuZ3VsYXIvY29yZS9yeGpzLWludGVyb3BcIjtcblxubWVybWFpZC5pbml0aWFsaXplKHtzdGFydE9uTG9hZDogZmFsc2V9KVxuXG5AQ29tcG9uZW50KHtcbiAgc2VsZWN0b3I6ICdkaXYubWVybWFpZCcsXG4gIHN0YW5kYWxvbmU6IHRydWUsXG4gIGltcG9ydHM6IFtcbiAgICBOZ0Zvck9mXG4gIF0sXG4gIHRlbXBsYXRlVXJsOiAnLi9tZXJtYWlkLmJsb2NrLmh0bWwnLFxuICBzdHlsZVVybDogJy4vbWVybWFpZC5ibG9jay5zY3NzJyxcbiAgY2hhbmdlRGV0ZWN0aW9uOiBDaGFuZ2VEZXRlY3Rpb25TdHJhdGVneS5PblB1c2hcbn0pXG5leHBvcnQgY2xhc3MgTWVybWFpZEJsb2NrIGV4dGVuZHMgRWRpdGFibGVCbG9jazxJTWVybWFpZEJsb2NrTW9kZWw+IHtcblxuICBwcm90ZWN0ZWQgcmVhZG9ubHkgdGVtcGxhdGVMaXN0ID0gVEVNUExBVEVfTElTVFxuXG4gIEBWaWV3Q2hpbGQoJ2dyYXBoJywge3JlYWQ6IEVsZW1lbnRSZWZ9KSBncmFwaCE6IEVsZW1lbnRSZWY8SFRNTEVsZW1lbnQ+XG4gIEBWaWV3Q2hpbGQoJ3RlbXBsYXRlTGlzdFRwbCcsIHtyZWFkOiBUZW1wbGF0ZVJlZn0pIHRlbXBsYXRlTGlzdFRwbCE6IFRlbXBsYXRlUmVmPGFueT5cblxuICBwcm90ZWN0ZWQgX3ZpZXdNb2RlID0gJ3RleHQnXG4gIHByaXZhdGUgbW9kYWxSZWY/OiBPdmVybGF5UmVmXG5cbiAgcHJvdGVjdGVkIGlzSW50ZXJzZWN0aW5nID0gZmFsc2VcbiAgcHJvdGVjdGVkIGludGVyc2VjdGlvbk9ic2VydmVyITogSW50ZXJzZWN0aW9uT2JzZXJ2ZXJcblxuICBjb25zdHJ1Y3RvcihcbiAgICBwcml2YXRlIG92ZXJsYXk6IE92ZXJsYXksXG4gICAgcHJpdmF0ZSB2Y3I6IFZpZXdDb250YWluZXJSZWZcbiAgKSB7XG4gICAgc3VwZXIoKVxuICB9XG5cbiAgb3ZlcnJpZGUgbmdBZnRlclZpZXdJbml0KCk6IHZvaWQge1xuICAgIHN1cGVyLm5nQWZ0ZXJWaWV3SW5pdCgpXG5cbiAgICB0aGlzLnNldFZpZXcodGhpcy5wcm9wcy52aWV3KVxuXG4gICAgdGhpcy5pbnRlcnNlY3Rpb25PYnNlcnZlciA9IG5ldyBJbnRlcnNlY3Rpb25PYnNlcnZlcigoW2VudHJ5XSkgPT4ge1xuICAgICAgdGhpcy5pc0ludGVyc2VjdGluZyA9IGVudHJ5LmlzSW50ZXJzZWN0aW5nXG4gICAgICBpZiAodGhpcy5pc0ludGVyc2VjdGluZyAmJiB0aGlzLl92aWV3TW9kZSAhPT0gdGhpcy5wcm9wcy52aWV3KSB7XG4gICAgICAgIHRoaXMuc2V0Vmlldyh0aGlzLnByb3BzLnZpZXcpXG4gICAgICB9XG4gICAgfSwge1xuICAgICAgdGhyZXNob2xkOiBbMCwgMV1cbiAgICB9KVxuICAgIHRoaXMuaW50ZXJzZWN0aW9uT2JzZXJ2ZXIub2JzZXJ2ZSh0aGlzLmhvc3RFbC5uYXRpdmVFbGVtZW50KVxuXG4gICAgdGhpcy5tb2RlbC51cGRhdGUkLnBpcGUodGFrZVVudGlsRGVzdHJveWVkKHRoaXMuZGVzdHJveVJlZikpLnN1YnNjcmliZSh2ID0+IHtcbiAgICAgIGlmICh2LnR5cGUgPT09ICdwcm9wcycgJiYgdGhpcy5fdmlld01vZGUgIT09IHRoaXMucHJvcHMudmlldykge1xuICAgICAgICB0aGlzLnNldFZpZXcodGhpcy5wcm9wcy52aWV3KVxuICAgICAgfVxuICAgIH0pXG4gIH1cblxuICByZW5kZXJHcmFwaCA9IGFzeW5jICgpID0+IHtcbiAgICAvLyBjb25zb2xlLnRpbWUoJ3JlbmRlckdyYXBoJylcbiAgICBpZiAoIXRoaXMudGV4dExlbmd0aCkgcmV0dXJuXG4gICAgY29uc3QgZ3JhcGhEZWZpbml0aW9uID0gdGhpcy5nZXRUZXh0Q29udGVudCgpO1xuICAgIGNvbnN0IHZlcmlmeSA9IGF3YWl0IG1lcm1haWQucGFyc2UoZ3JhcGhEZWZpbml0aW9uLCB7c3VwcHJlc3NFcnJvcnM6IHRydWV9KVxuICAgIGlmICh2ZXJpZnkpIHtcbiAgICAgIGNvbnN0IHtzdmd9ID0gYXdhaXQgbWVybWFpZC5yZW5kZXIodGhpcy5pZC5yZXBsYWNlKC9cXGQvZywgJycpICsgJ2dyYXBoRGl2JywgZ3JhcGhEZWZpbml0aW9uKTtcbiAgICAgIHRoaXMuZ3JhcGgubmF0aXZlRWxlbWVudC5pbm5lckhUTUwgPSBzdmdcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5ncmFwaC5uYXRpdmVFbGVtZW50LmlubmVySFRNTCA9IGA8c3BhbiBzdHlsZT1cImNvbG9yOiByZWQ7XCI+6K+t5rOV6ZSZ6K+v77yBPC9zcGFuPmBcbiAgICB9XG4gICAgLy8gY29uc29sZS50aW1lRW5kKCdyZW5kZXJHcmFwaCcpXG4gIH1cblxuICBvblN3aXRjaFZpZXcoKSB7XG4gICAgdGhpcy5zZXRQcm9wKCd2aWV3JywgdGhpcy5fdmlld01vZGUgPT09ICdncmFwaCcgPyAndGV4dCcgOiAnZ3JhcGgnKVxuICB9XG5cbiAgc2V0Vmlldyh2aWV3OiAnZ3JhcGgnIHwgJ3RleHQnKSB7XG4gICAgaWYodGhpcy5fdmlld01vZGUgPT09IHZpZXcgfHwgIXRoaXMuaXNJbnRlcnNlY3RpbmcpIHJldHVyblxuICAgIC8vIGNvbnNvbGUubG9nKCfliIfmjaLop4blm74nLCB2aWV3KVxuICAgIHRoaXMuaG9zdEVsLm5hdGl2ZUVsZW1lbnQuc2V0QXR0cmlidXRlKCdkYXRhLXZpZXctbW9kZScsIHRoaXMuX3ZpZXdNb2RlID0gdmlldylcbiAgICBpZiAodmlldyA9PT0gJ2dyYXBoJykge1xuICAgICAgdGhpcy5yZW5kZXJHcmFwaCgpXG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuZ3JhcGgubmF0aXZlRWxlbWVudC5pbm5lckhUTUwgPSAnJ1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgZGlhbG9nRmxhZzogJ3RlbXBsYXRlJyB8ICdwcmVmaXgnID0gJ3RlbXBsYXRlJ1xuXG4gIG9uU2hvd1RlbXBsYXRlTGlzdChlOiBFdmVudCwgZmxhZzogJ3RlbXBsYXRlJyB8ICdwcmVmaXgnKSB7XG4gICAgY29uc3QgdGFyZ2V0ID0gZS50YXJnZXQgYXMgSFRNTEVsZW1lbnRcbiAgICBjb25zdCBwb3J0YWwgPSBuZXcgVGVtcGxhdGVQb3J0YWwodGhpcy50ZW1wbGF0ZUxpc3RUcGwsIHRoaXMudmNyKVxuICAgIGNvbnN0IHBvc2l0aW9uU3RyYXRlZ3kgPSB0aGlzLm92ZXJsYXkucG9zaXRpb24oKS5mbGV4aWJsZUNvbm5lY3RlZFRvKHRhcmdldCkud2l0aFBvc2l0aW9ucyhbXG4gICAgICB7b3JpZ2luWDogJ3N0YXJ0Jywgb3JpZ2luWTogJ2JvdHRvbScsIG92ZXJsYXlYOiAnc3RhcnQnLCBvdmVybGF5WTogJ3RvcCd9XG4gICAgXSlcbiAgICB0aGlzLm1vZGFsUmVmID0gdGhpcy5vdmVybGF5LmNyZWF0ZSh7XG4gICAgICBwb3NpdGlvblN0cmF0ZWd5LFxuICAgICAgaGFzQmFja2Ryb3A6IHRydWUsXG4gICAgICBiYWNrZHJvcENsYXNzOiAnY2RrLW92ZXJsYXktdHJhbnNwYXJlbnQtYmFja2Ryb3AnLFxuICAgIH0pXG4gICAgdGhpcy5tb2RhbFJlZi5iYWNrZHJvcENsaWNrKCkucGlwZSh0YWtlKDEpKS5zdWJzY3JpYmUoKCkgPT4ge1xuICAgICAgdGhpcy5tb2RhbFJlZj8uZGlzcG9zZSgpXG4gICAgfSlcbiAgICB0aGlzLm1vZGFsUmVmLmF0dGFjaChwb3J0YWwpXG4gICAgdGhpcy5kaWFsb2dGbGFnID0gZmxhZ1xuICB9XG5cbiAgdXNlVGVtcGxhdGUoaXRlbTogSVRlbXBsYXRlKSB7XG4gICAgaWYgKHRoaXMuZGlhbG9nRmxhZyA9PT0gJ3RlbXBsYXRlJykge1xuICAgICAgY29uc3QgZGVsdGFzOiBEZWx0YU9wZXJhdGlvbltdID0gW3tpbnNlcnQ6IGl0ZW0ucHJlZml4ICsgaXRlbS50ZW1wbGF0ZX1dXG4gICAgICBpZiAodGhpcy50ZXh0TGVuZ3RoKSB7XG4gICAgICAgIGRlbHRhcy51bnNoaWZ0KHtkZWxldGU6IHRoaXMudGV4dExlbmd0aH0pXG4gICAgICB9XG4gICAgICB0aGlzLmFwcGx5RGVsdGEoZGVsdGFzKVxuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLmFwcGx5RGVsdGEoW1xuICAgICAgICB7aW5zZXJ0OiBpdGVtLnByZWZpeH1cbiAgICAgIF0pXG4gICAgfVxuICAgIHRoaXMubW9kYWxSZWY/LmRpc3Bvc2UoKVxuICB9XG5cbiAgb3ZlcnJpZGUgbmdPbkRlc3Ryb3koKSB7XG4gICAgc3VwZXIubmdPbkRlc3Ryb3koKTtcbiAgICB0aGlzLmludGVyc2VjdGlvbk9ic2VydmVyLmRpc2Nvbm5lY3QoKVxuICB9XG59XG4iLCI8ZGl2IGNsYXNzPVwiaGVhZFwiPlxuICA8ZGl2IGNsYXNzPVwiYnRuXCIgc3R5bGU9XCJjb2xvcjogIzk5OTtcIj5NZXJtYWlkPC9kaXY+XG4gIDxkaXYgY2xhc3M9XCJ0ZW1wbGF0ZS1idG4gYnRuXCIgKGNsaWNrKT1cIm9uU2hvd1RlbXBsYXRlTGlzdCgkZXZlbnQsICdwcmVmaXgnKVwiPuexu+WeiyA8aSBjbGFzcz1cImJmX2ljb24gYmZfeGlhamFpbnRvdVwiIHN0eWxlPVwiZm9udC1zaXplOiAuOGVtXCI+PC9pPjwvZGl2PlxuXG4gIDxkaXYgY2xhc3M9XCJ0ZW1wbGF0ZS1idG4gYnRuXCIgKGNsaWNrKT1cIm9uU2hvd1RlbXBsYXRlTGlzdCgkZXZlbnQsICd0ZW1wbGF0ZScpXCI+5qih5p2/IDxpIGNsYXNzPVwiYmZfaWNvbiBiZl94aWFqYWludG91XCI+PC9pPjwvZGl2PlxuICA8ZGl2IGNsYXNzPVwic3dpdGNoLWJ0biBidG5cIiAoY2xpY2spPVwib25Td2l0Y2hWaWV3KClcIj48aSBjbGFzcz1cImJmX2ljb24gYmZfcWllaHVhblwiPjwvaT48L2Rpdj5cbjwvZGl2PlxuXG48ZGl2IGNsYXNzPVwiY29udGFpbmVyXCI+XG4gIDxkaXYgY2xhc3M9XCJlZGl0YWJsZS1jb250YWluZXIgYmYtbXVsdGktbGluZSBiZi1wbGFpbi10ZXh0LW9ubHlcIj48L2Rpdj5cbiAgPGRpdiBjbGFzcz1cImdyYXBoLWNvblwiICNncmFwaD48L2Rpdj5cbjwvZGl2PlxuXG48bmctdGVtcGxhdGUgI3RlbXBsYXRlTGlzdFRwbD5cbiAgPGRpdiBjbGFzcz1cInRlbXBsYXRlLWxpc3RcIj5cbiAgICA8ZGl2IGNsYXNzPVwidGVtcGxhdGUtbGlzdF9pdGVtXCIgKm5nRm9yPVwibGV0IGl0ZW0gb2YgdGVtcGxhdGVMaXN0XCJcbiAgICAgIChjbGljayk9XCJ1c2VUZW1wbGF0ZShpdGVtKVwiPlxuICAgICAge3tpdGVtLm5hbWV9fVxuICAgIDwvZGl2PlxuICA8L2Rpdj5cbjwvbmctdGVtcGxhdGU+XG4iXX0=