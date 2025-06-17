import { ChangeDetectorRef, Component, DestroyRef, ElementRef, EventEmitter, inject, Input, Output, } from "@angular/core";
import { DOCUMENT } from "@angular/common";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import * as i0 from "@angular/core";
export class BaseBlock {
    constructor() {
        this.onDestroy = new EventEmitter();
        this.destroyRef = inject(DestroyRef);
        this.cdr = inject(ChangeDetectorRef);
        this.hostEl = inject(ElementRef);
        this.DOCUMENT = inject(DOCUMENT);
    }
    get id() {
        return this.model.id;
    }
    get nodeType() {
        return this.model.nodeType;
    }
    get flavour() {
        return this.model.flavour;
    }
    get props() {
        return this.model.props;
    }
    get children() {
        return this.model.children;
    }
    setProp(key, value) {
        this.model.setProp(key, value);
    }
    deleteProp(key) {
        this.model.deleteProp(key);
    }
    ngOnInit() {
        this.model.update$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(t => {
            // this.controller.blockUpdate$.next({
            //   ...t,
            //   block: this
            // })
            if (t.event.transaction.origin === this.controller.historyManager)
                return;
            if (t.event.transaction.local) {
                this.setModifyRecord();
            }
            const pid = this.model.getParentId();
            if (!pid)
                return;
            const parentModel = this.controller.getBlockModel(pid);
            if (!parentModel)
                return;
            // @ts-ignore
            parentModel.update$.next({ type: 'children', event: t.event });
        });
    }
    ngAfterViewInit() {
        this.controller.storeBlockRef(this);
        this.hostEl.nativeElement.setAttribute('id', this.model.id);
        this.hostEl.nativeElement.setAttribute('bf-node-type', this.model.nodeType);
    }
    ngOnDestroy() {
        this.onDestroy.emit();
    }
    setModifyRecord(time = Date.now()) {
        const m = {
            time,
            ...this.controller.config.localUser
        };
        this.model.setMeta('lastModified', m);
    }
    getParentId() {
        return this.model.getParentId() || this.controller.rootId;
    }
    getPosition() {
        const pos = this.model.getPosition();
        return {
            parentId: pos.parentId || this.controller.rootId,
            index: pos.index
        };
    }
    destroySelf() {
        const { parentId, index } = this.getPosition();
        if (parentId === this.controller.rootId && index > 0) {
            const prevEditable = this.controller.findPrevEditableBlock(this.id);
            prevEditable && prevEditable.setSelection('end');
        }
        this.controller.deleteBlocks(index, 1, parentId);
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: BaseBlock, deps: [], target: i0.ɵɵFactoryTarget.Component }); }
    static { this.ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "14.0.0", version: "17.3.12", type: BaseBlock, isStandalone: true, selector: "[bf-base-block]", inputs: { controller: "controller", model: "model" }, outputs: { onDestroy: "onDestroy" }, ngImport: i0, template: ``, isInline: true }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: BaseBlock, decorators: [{
            type: Component,
            args: [{
                    selector: '[bf-base-block]',
                    standalone: true,
                    template: ``,
                }]
        }], propDecorators: { controller: [{
                type: Input,
                args: [{ required: true }]
            }], model: [{
                type: Input,
                args: [{ required: true }]
            }], onDestroy: [{
                type: Output
            }] } });
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmFzZS1ibG9jay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uLy4uL2Jsb2NrZmxvdy9zcmMvY29yZS9ibG9jay1zdGQvY29tcG9uZW50cy9iYXNlLWJsb2NrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLE9BQU8sRUFDTCxpQkFBaUIsRUFDakIsU0FBUyxFQUFFLFVBQVUsRUFDckIsVUFBVSxFQUFFLFlBQVksRUFDeEIsTUFBTSxFQUNOLEtBQUssRUFBRSxNQUFNLEdBQ2QsTUFBTSxlQUFlLENBQUM7QUFDdkIsT0FBTyxFQUFDLFFBQVEsRUFBQyxNQUFNLGlCQUFpQixDQUFDO0FBSXpDLE9BQU8sRUFBQyxrQkFBa0IsRUFBQyxNQUFNLDRCQUE0QixDQUFDOztBQU85RCxNQUFNLE9BQU8sU0FBUztJQUx0QjtRQVNZLGNBQVMsR0FBRyxJQUFJLFlBQVksRUFBUSxDQUFBO1FBc0I5QixlQUFVLEdBQUcsTUFBTSxDQUFDLFVBQVUsQ0FBQyxDQUFBO1FBQy9CLFFBQUcsR0FBRyxNQUFNLENBQUMsaUJBQWlCLENBQUMsQ0FBQTtRQUMvQixXQUFNLEdBQTRCLE1BQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQTtRQUMxRCxhQUFRLEdBQUcsTUFBTSxDQUFDLFFBQVEsQ0FBQyxDQUFBO0tBb0V0QztJQTNGQyxJQUFJLEVBQUU7UUFDSixPQUFPLElBQUksQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFBO0lBQ3RCLENBQUM7SUFFRCxJQUFJLFFBQVE7UUFDVixPQUFPLElBQUksQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFBO0lBQzVCLENBQUM7SUFFRCxJQUFJLE9BQU87UUFDVCxPQUFPLElBQUksQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFBO0lBQzNCLENBQUM7SUFFRCxJQUFJLEtBQUs7UUFDUCxPQUFPLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBaUMsQ0FBQTtJQUNyRCxDQUFDO0lBRUQsSUFBSSxRQUFRO1FBQ1YsT0FBTyxJQUFJLENB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Q0FBQyxVQUFVLENBQUMsTUFBTSxJQUFJLEtBQUssR0FBRyxDQUFDLEVBQUUsQ0FBQztZQUNyRCxNQUFNLFlBQVksR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLHFCQUFxQixDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQTtZQUNuRSxZQUFZLElBQUksWUFBWSxDQUFDLFlBQVksQ0FBQyxLQUFLLENBQUMsQ0FBQTtRQUNsRCxDQUFDO1FBQ0QsSUFBSSxDQUFDLFVBQVUsQ0FBQyxZQUFZLENBQUMsS0FBSyxFQUFFLENBQUMsRUFBRSxRQUFRLENBQUMsQ0FBQTtJQUNsRCxDQUFDOytHQS9GVSxTQUFTO21HQUFULFNBQVMsc0tBRlYsRUFBRTs7NEZBRUQsU0FBUztrQkFMckIsU0FBUzttQkFBQztvQkFDVCxRQUFRLEVBQUUsaUJBQWlCO29CQUMzQixVQUFVLEVBQUUsSUFBSTtvQkFDaEIsUUFBUSxFQUFFLEVBQUU7aUJBQ2I7OEJBRTBCLFVBQVU7c0JBQWxDLEtBQUs7dUJBQUMsRUFBQyxRQUFRLEVBQUUsSUFBSSxFQUFDO2dCQUNFLEtBQUs7c0JBQTdCLEtBQUs7dUJBQUMsRUFBQyxRQUFRLEVBQUUsSUFBSSxFQUFDO2dCQUViLFNBQVM7c0JBQWxCLE1BQU0iLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQge1xuICBDaGFuZ2VEZXRlY3RvclJlZixcbiAgQ29tcG9uZW50LCBEZXN0cm95UmVmLFxuICBFbGVtZW50UmVmLCBFdmVudEVtaXR0ZXIsXG4gIGluamVjdCxcbiAgSW5wdXQsIE91dHB1dCxcbn0gZnJvbSBcIkBhbmd1bGFyL2NvcmVcIjtcbmltcG9ydCB7RE9DVU1FTlR9IGZyb20gXCJAYW5ndWxhci9jb21tb25cIjtcbmltcG9ydCB7SUJhc2VNZXRhZGF0YSwgSUJsb2NrTW9kZWwsIElFZGl0YWJsZUJsb2NrTW9kZWx9IGZyb20gXCIuLi8uLi90eXBlc1wiO1xuaW1wb3J0IHtDb250cm9sbGVyfSBmcm9tIFwiLi4vLi4vY29udHJvbGxlclwiO1xuaW1wb3J0IHtCbG9ja01vZGVsfSBmcm9tIFwiLi4vLi4veWpzXCI7XG5pbXBvcnQge3Rha2VVbnRpbERlc3Ryb3llZH0gZnJvbSBcIkBhbmd1bGFyL2NvcmUvcnhqcy1pbnRlcm9wXCI7XG5cbkBDb21wb25lbnQoe1xuICBzZWxlY3RvcjogJ1tiZi1iYXNlLWJsb2NrXScsXG4gIHN0YW5kYWxvbmU6IHRydWUsXG4gIHRlbXBsYXRlOiBgYCxcbn0pXG5leHBvcnQgY2xhc3MgQmFzZUJsb2NrPE1vZGVsIGV4dGVuZHMgSUJsb2NrTW9kZWwgfCBJRWRpdGFibGVCbG9ja01vZGVsID0gSUJsb2NrTW9kZWw+IHtcbiAgQElucHV0KHtyZXF1aXJlZDogdHJ1ZX0pIGNvbnRyb2xsZXIhOiBDb250cm9sbGVyXG4gIEBJbnB1dCh7cmVxdWlyZWQ6IHRydWV9KSBtb2RlbCE6IEJsb2NrTW9kZWw8TW9kZWw+XG5cbiAgQE91dHB1dCgpIG9uRGVzdHJveSA9IG5ldyBFdmVudEVtaXR0ZXI8dm9pZD4oKVxuXG4gIGdldCBpZCgpIHtcbiAgICByZXR1cm4gdGhpcy5tb2RlbC5pZFxuICB9XG5cbiAgZ2V0IG5vZGVUeXBlKCkge1xuICAgIHJldHVybiB0aGlzLm1vZGVsLm5vZGVUeXBlXG4gIH1cblxuICBnZXQgZmxhdm91cigpIHtcbiAgICByZXR1cm4gdGhpcy5tb2RlbC5mbGF2b3VyXG4gIH1cblxuICBnZXQgcHJvcHMoKSB7XG4gICAgcmV0dXJuIHRoaXMubW9kZWwucHJvcHMgYXMgUmVhZG9ubHk8TW9kZWxbJ3Byb3BzJ10+XG4gIH1cblxuICBnZXQgY2hpbGRyZW4oKSB7XG4gICAgcmV0dXJuIHRoaXMubW9kZWwuY2hpbGRyZW5cbiAgfVxuXG4gIHB1YmxpYyByZWFkb25seSBkZXN0cm95UmVmID0gaW5qZWN0KERlc3Ryb3lSZWYpXG4gIHB1YmxpYyByZWFkb25seSBjZHIgPSBpbmplY3QoQ2hhbmdlRGV0ZWN0b3JSZWYpXG4gIHB1YmxpYyByZWFkb25seSBob3N0RWw6IEVsZW1lbnRSZWY8SFRNTEVsZW1lbnQ+ID0gaW5qZWN0KEVsZW1lbnRSZWYpXG4gIHByb3RlY3RlZCBET0NVTUVOVCA9IGluamVjdChET0NVTUVOVClcblxuICBzZXRQcm9wPFQgZXh0ZW5kcyBrZXlvZiBNb2RlbFsncHJvcHMnXT4oa2V5OiBULCB2YWx1ZTogTW9kZWxbJ3Byb3BzJ11bVF0pIHtcbiAgICB0aGlzLm1vZGVsLnNldFByb3Aoa2V5LCB2YWx1ZSlcbiAgfVxuXG4gIGRlbGV0ZVByb3A8VCBleHRlbmRzIGtleW9mIE1vZGVsWydwcm9wcyddPihrZXk6IFQpIHtcbiAgICB0aGlzLm1vZGVsLmRlbGV0ZVByb3Aoa2V5KVxuICB9XG5cbiAgbmdPbkluaXQoKSB7XG4gICAgdGhpcy5tb2RlbC51cGRhdGUkLnBpcGUodGFrZVVudGlsRGVzdHJveWVkKHRoaXMuZGVzdHJveVJlZikpLnN1YnNjcmliZSh0ID0+IHtcbiAgICAgIC8vIHRoaXMuY29udHJvbGxlci5ibG9ja1VwZGF0ZSQubmV4dCh7XG4gICAgICAvLyAgIC4uLnQsXG4gICAgICAvLyAgIGJsb2NrOiB0aGlzXG4gICAgICAvLyB9KVxuICAgICAgaWYodC5ldmVudC50cmFuc2FjdGlvbi5vcmlnaW4gPT09IHRoaXMuY29udHJvbGxlci5oaXN0b3J5TWFuYWdlcikgcmV0dXJuO1xuICAgICAgaWYgKHQuZXZlbnQudHJhbnNhY3Rpb24ubG9jYWwpIHtcbiAgICAgICAgdGhpcy5zZXRNb2RpZnlSZWNvcmQoKVxuICAgICAgfVxuICAgICAgY29uc3QgcGlkID0gdGhpcy5tb2RlbC5nZXRQYXJlbnRJZCgpXG4gICAgICBpZighcGlkKSByZXR1cm5cbiAgICAgIGNvbnN0IHBhcmVudE1vZGVsID0gdGhpcy5jb250cm9sbGVyLmdldEJsb2NrTW9kZWwocGlkKVxuICAgICAgaWYoIXBhcmVudE1vZGVsKSByZXR1cm5cbiAgICAgIC8vIEB0cy1pZ25vcmVcbiAgICAgIHBhcmVudE1vZGVsLnVwZGF0ZSQubmV4dCh7dHlwZTogJ2NoaWxkcmVuJywgZXZlbnQ6IHQuZXZlbnR9KVxuICAgIH0pXG4gIH1cblxuICBuZ0FmdGVyVmlld0luaXQoKSB7XG4gICAgdGhpcy5jb250cm9sbGVyLnN0b3JlQmxvY2tSZWYodGhpcylcbiAgICB0aGlzLmhvc3RFbC5uYXRpdmVFbGVtZW50LnNldEF0dHJpYnV0ZSgnaWQnLCB0aGlzLm1vZGVsLmlkKVxuICAgIHRoaXMuaG9zdEVsLm5hdGl2ZUVsZW1lbnQuc2V0QXR0cmlidXRlKCdiZi1ub2RlLXR5cGUnLCB0aGlzLm1vZGVsLm5vZGVUeXBlKVxuICB9XG5cbiAgbmdPbkRlc3Ryb3koKSB7XG4gICAgdGhpcy5vbkRlc3Ryb3kuZW1pdCgpXG4gIH1cblxuICBwcml2YXRlIHNldE1vZGlmeVJlY29yZCh0aW1lOiBudW1iZXIgPSBEYXRlLm5vdygpKSB7XG4gICAgY29uc3QgbTogSUJhc2VNZXRhZGF0YVsnbGFzdE1vZGlmaWVkJ10gPSB7XG4gICAgICB0aW1lLFxuICAgICAgLi4udGhpcy5jb250cm9sbGVyLmNvbmZpZy5sb2NhbFVzZXJcbiAgICB9XG4gICAgdGhpcy5tb2RlbC5zZXRNZXRhKCdsYXN0TW9kaWZpZWQnLCBtKVxuICB9XG5cbiAgZ2V0UGFyZW50SWQoKSB7XG4gICAgcmV0dXJuIHRoaXMubW9kZWwuZ2V0UGFyZW50SWQoKSB8fCB0aGlzLmNvbnRyb2xsZXIucm9vdElkXG4gIH1cblxuICBnZXRQb3NpdGlvbigpIHtcbiAgICBjb25zdCBwb3MgPSB0aGlzLm1vZGVsLmdldFBvc2l0aW9uKClcbiAgICByZXR1cm4ge1xuICAgICAgcGFyZW50SWQ6IHBvcy5wYXJlbnRJZCB8fCB0aGlzLmNvbnRyb2xsZXIucm9vdElkLFxuICAgICAgaW5kZXg6IHBvcy5pbmRleFxuICAgIH1cbiAgfVxuXG4gIGRlc3Ryb3lTZWxmKCkge1xuICAgIGNvbnN0IHtwYXJlbnRJZCwgaW5kZXh9ID0gdGhpcy5nZXRQb3NpdGlvbigpXG4gICAgaWYgKHBhcmVudElkID09PSB0aGlzLmNvbnRyb2xsZXIucm9vdElkICYmIGluZGV4ID4gMCkge1xuICAgICAgY29uc3QgcHJldkVkaXRhYmxlID0gdGhpcy5jb250cm9sbGVyLmZpbmRQcmV2RWRpdGFibGVCbG9jayh0aGlzLmlkKVxuICAgICAgcHJldkVkaXRhYmxlICYmIHByZXZFZGl0YWJsZS5zZXRTZWxlY3Rpb24oJ2VuZCcpXG4gICAgfVxuICAgIHRoaXMuY29udHJvbGxlci5kZWxldGVCbG9ja3MoaW5kZXgsIDEsIHBhcmVudElkKVxuICB9XG5cbn1cbiJdfQ==