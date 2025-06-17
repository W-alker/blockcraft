import { ChangeDetectionStrategy, Component, HostBinding, HostListener } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FloatToolbar } from "../../components";
import { EditableBlock } from "../../core";
import { fromEvent, Subject, take, takeUntil } from "rxjs";
import { ComponentPortal } from "@angular/cdk/portal";
import { ColorPalette } from "../../components/color-palette/color-palette";
import * as i0 from "@angular/core";
import * as i1 from "@angular/cdk/overlay";
const TOOLBAR_LIST = [
    {
        id: 'color',
        icon: 'bf_icon bf_yanse',
        name: 'color',
        title: '更换颜色',
        divide: true
    },
    {
        id: 'copy',
        icon: 'bf_icon bf_fuzhi',
        name: 'copy',
        title: '复制文本'
    }
];
const COPIED_TOOLBAR_LIST = [...TOOLBAR_LIST].slice(0, TOOLBAR_LIST.length - 1).concat({
    id: 'copied',
    icon: 'bf_icon bf_fuzhi',
    name: 'copied',
    title: '复制文本',
    text: '已复制',
});
const POSITIONS = [
    { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top' },
    { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom' },
];
export class CalloutBlock extends EditableBlock {
    constructor(overlay) {
        super();
        this.overlay = overlay;
        this._backgroundColor = '#dc9b9b';
        this._borderColor = '#FFE6CD';
        this._toolbarDispose$ = new Subject();
        this.closeToolbar = () => {
            this.toolbarOverlayRef?.dispose();
            this.toolbarOverlayRef = undefined;
            this._toolbarDispose$.next(true);
            this.closeColorPicker();
        };
        this.closeColorPicker = () => {
            this._colorPickerOverlayRef?.dispose();
            this._colorPickerOverlayRef = undefined;
        };
    }
    ngOnInit() {
        super.ngOnInit();
        this.setStyle();
        this.model.update$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(v => {
            if (v.type === 'props')
                this.setStyle();
        });
    }
    setStyle() {
        this._backgroundColor !== this.props.bc && (this._backgroundColor = this.props.bc);
        this._borderColor !== this.props.ec && (this._borderColor = this.props.ec);
        this.cdr.markForCheck();
    }
    showToolbar(e) {
        if (this.toolbarOverlayRef)
            return;
        this.toolbarOverlayRef = this.overlay.create({
            positionStrategy: this.overlay.position().flexibleConnectedTo(this.hostEl.nativeElement).withPositions(POSITIONS),
            scrollStrategy: this.overlay.scrollStrategies.close()
        });
        this.toolbarOverlayRef.backdropClick().pipe(take(1)).subscribe(this.closeToolbar);
        const cpr = this.toolbarOverlayRef.attach(new ComponentPortal(FloatToolbar));
        cpr.setInput('toolbarList', TOOLBAR_LIST);
        fromEvent(this.hostEl.nativeElement, 'mouseleave').pipe(takeUntil(this._toolbarDispose$)).subscribe(e => {
            if (!cpr.location.nativeElement.contains(e.relatedTarget))
                this.closeToolbar();
        });
        fromEvent(cpr.location.nativeElement, 'mouseleave').pipe(takeUntil(this._toolbarDispose$)).subscribe(e => {
            if (e.relatedTarget !== this.hostEl.nativeElement && !e.relatedTarget.closest('.cdk-overlay-container'))
                this.closeToolbar();
        });
        cpr.instance.itemClick.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(({ item, event }) => {
            switch (item.name) {
                case 'color':
                    this.showColorPicker(event.target);
                    break;
                case 'copy':
                    navigator.clipboard.writeText(this.getTextContent()).then(() => {
                        cpr.setInput('toolbarList', COPIED_TOOLBAR_LIST);
                        setTimeout(() => {
                            cpr.setInput('toolbarList', TOOLBAR_LIST);
                        }, 2000);
                    });
            }
        });
    }
    showColorPicker(target) {
        if (this._colorPickerOverlayRef)
            return;
        const positionStrategy = this.overlay.position().flexibleConnectedTo(target).withPositions([
            { originX: 'center', originY: 'bottom', overlayX: 'center', overlayY: 'top', offsetY: 8 },
            { originX: 'center', originY: 'top', overlayX: 'center', overlayY: 'bottom', offsetY: -8 },
        ]).withPush(false);
        this._colorPickerOverlayRef = this.overlay.create({
            positionStrategy,
            hasBackdrop: true,
            backdropClass: 'cdk-overlay-transparent-backdrop',
            scrollStrategy: this.overlay.scrollStrategies.close()
        });
        this._colorPickerOverlayRef.backdropClick().pipe(take(1)).subscribe(this.closeColorPicker);
        const cpr = this._colorPickerOverlayRef.attach(new ComponentPortal(ColorPalette));
        cpr.setInput('activeColor', this.props.c);
        cpr.setInput('activeBgColor', this.props.bc);
        cpr.setInput('activeEdgeColor', this.props.ec);
        cpr.setInput('showEdgeColor', true);
        cpr.instance.colorChange.pipe(takeUntil(cpr.instance.close)).subscribe(({ type, value }) => {
            this.setProp(type, value);
        });
    }
    ngOnDestroy() {
        super.ngOnDestroy();
        this.closeToolbar();
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: CalloutBlock, deps: [{ token: i1.Overlay }], target: i0.ɵɵFactoryTarget.Component }); }
    static { this.ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "14.0.0", version: "17.3.12", type: CalloutBlock, isStandalone: true, selector: "div.callout-block", host: { listeners: { "mouseenter": "showToolbar()" }, properties: { "style.backgroundColor": "this._backgroundColor", "style.borderColor": "this._borderColor" } }, usesInheritance: true, ngImport: i0, template: `
    <span class="callout-block__emoji">{{ props.emoji }}</span>
    <div class="editable-container bf-multi-line" [style.color]="props.c" contenteditable="true"
         (blur)="closeToolbar()"></div>
  `, isInline: true, styles: [":host{border:1px solid transparent;padding:8px 8px 8px 42px;border-radius:4px;position:relative}:host.selected{background-color:var(--bf-selected)!important;border:1px solid var(--bf-selected-border)!important}.callout-block__emoji{position:absolute;left:12px;top:8px;font-size:18px;text-indent:0;cursor:pointer}.callout-block__emoji:hover{background-color:#4857e24d;border-radius:4px}\n"], changeDetection: i0.ChangeDetectionStrategy.OnPush }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: CalloutBlock, decorators: [{
            type: Component,
            args: [{ selector: 'div.callout-block', template: `
    <span class="callout-block__emoji">{{ props.emoji }}</span>
    <div class="editable-container bf-multi-line" [style.color]="props.c" contenteditable="true"
         (blur)="closeToolbar()"></div>
  `, standalone: true, changeDetection: ChangeDetectionStrategy.OnPush, styles: [":host{border:1px solid transparent;padding:8px 8px 8px 42px;border-radius:4px;position:relative}:host.selected{background-color:var(--bf-selected)!important;border:1px solid var(--bf-selected-border)!important}.callout-block__emoji{position:absolute;left:12px;top:8px;font-size:18px;text-indent:0;cursor:pointer}.callout-block__emoji:hover{background-color:#4857e24d;border-radius:4px}\n"] }]
        }], ctorParameters: () => [{ type: i1.Overlay }], propDecorators: { _backgroundColor: [{
                type: HostBinding,
                args: ['style.backgroundColor']
            }], _borderColor: [{
                type: HostBinding,
                args: ['style.borderColor']
            }], showToolbar: [{
                type: HostListener,
                args: ['mouseenter']
            }] } });
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2FsbG91dC5ibG9jay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uL2Jsb2NrZmxvdy9zcmMvYmxvY2tzL2NhbGxvdXQvY2FsbG91dC5ibG9jay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxPQUFPLEVBQUMsdUJBQXVCLEVBQUUsU0FBUyxFQUFFLFdBQVcsRUFBRSxZQUFZLEVBQUMsTUFBTSxlQUFlLENBQUM7QUFDNUYsT0FBTyxFQUFDLGtCQUFrQixFQUFDLE1BQU0sNEJBQTRCLENBQUM7QUFDOUQsT0FBTyxFQUFDLFlBQVksRUFBZSxNQUFNLGtCQUFrQixDQUFDO0FBRTVELE9BQU8sRUFBQyxhQUFhLEVBQUMsTUFBTSxZQUFZLENBQUM7QUFFekMsT0FBTyxFQUFDLFNBQVMsRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBQyxNQUFNLE1BQU0sQ0FBQztBQUN6RCxPQUFPLEVBQUMsZUFBZSxFQUFDLE1BQU0scUJBQXFCLENBQUM7QUFDcEQsT0FBTyxFQUFDLFlBQVksRUFBQyxNQUFNLDhDQUE4QyxDQUFDOzs7QUFFMUUsTUFBTSxZQUFZLEdBQW1CO0lBQ25DO1FBQ0UsRUFBRSxFQUFFLE9BQU87UUFDWCxJQUFJLEVBQUUsa0JBQWtCO1FBQ3hCLElBQUksRUFBRSxPQUFPO1FBQ2IsS0FBSyxFQUFFLE1BQU07UUFDYixNQUFNLEVBQUUsSUFBSTtLQUNiO0lBQ0Q7UUFDRSxFQUFFLEVBQUUsTUFBTTtRQUNWLElBQUksRUFBRSxrQkFBa0I7UUFDeEIsSUFBSSxFQUFFLE1BQU07UUFDWixLQUFLLEVBQUUsTUFBTTtLQUNkO0NBQ0YsQ0FBQTtBQUVELE1BQU0sbUJBQW1CLEdBQW1CLENBQUMsR0FBRyxZQUFZLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLFlBQVksQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDO0lBQ3JHLEVBQUUsRUFBRSxRQUFRO0lBQ1osSUFBSSxFQUFFLGtCQUFrQjtJQUN4QixJQUFJLEVBQUUsUUFBUTtJQUNkLEtBQUssRUFBRSxNQUFNO0lBQ2IsSUFBSSxFQUFFLEtBQUs7Q0FDWixDQUFDLENBQUE7QUFFRixNQUFNLFNBQVMsR0FBd0I7SUFDckMsRUFBQyxPQUFPLEVBQUUsS0FBSyxFQUFFLE9BQU8sRUFBRSxRQUFRLEVBQUUsUUFBUSxFQUFFLEtBQUssRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFDO0lBQ3JFLEVBQUMsT0FBTyxFQUFFLEtBQUssRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLFFBQVEsRUFBRSxLQUFLLEVBQUUsUUFBUSxFQUFFLFFBQVEsRUFBQztDQUN0RSxDQUFBO0FBdUNELE1BQU0sT0FBTyxZQUFhLFNBQVEsYUFBaUM7SUFXakUsWUFDVSxPQUFnQjtRQUV4QixLQUFLLEVBQUUsQ0FBQztRQUZBLFlBQU8sR0FBUCxPQUFPLENBQVM7UUFWaEIscUJBQWdCLEdBQWtCLFNBQVMsQ0FBQTtRQUczQyxpQkFBWSxHQUFrQixTQUFTLENBQUE7UUFFekMscUJBQWdCLEdBQUcsSUFBSSxPQUFPLEVBQVcsQ0FBQTtRQW1GakQsaUJBQVksR0FBRyxHQUFHLEVBQUU7WUFDbEIsSUFBSSxDQUFDLGlCQUFpQixFQUFFLE9BQU8sRUFBRSxDQUFBO1lBQ2pDLElBQUksQ0FBQyxpQkFBaUIsR0FBRyxTQUFTLENBQUE7WUFDbEMsSUFBSSxDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQTtZQUNoQyxJQUFJLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQTtRQUN6QixDQUFDLENBQUE7UUFFRCxxQkFBZ0IsR0FBRyxHQUFHLEVBQUU7WUFDdEIsSUFBSSxDQUFDLHNCQUFzQixFQUFFLE9BQU8sRUFBRSxDQUFBO1lBQ3RDLElBQUksQ0FBQyxzQkFBc0IsR0FBRyxTQUFTLENBQUE7UUFDekMsQ0FBQyxDQUFBO0lBckZELENBQUM7SUFFUSxRQUFRO1FBQ2YsS0FBSyxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBQ2pCLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztRQUVoQixJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsa0JBQWtCLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxFQUFFO1lBQ3pFLElBQUksQ0FBQyxDQUFDLElBQUksS0FBSyxPQUFPO2dCQUFFLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztRQUMxQyxDQUFDLENBQUMsQ0FBQTtJQUNKLENBQUM7SUFFRCxRQUFRO1FBQ04sSUFBSSxDQUFDLGdCQUFnQixLQUFLLElBQUksQ0FBQyxLQUFLLENBQUMsRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLGdCQUFnQixHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDbkYsSUFBSSxDQUFDLFlBQVksS0FBSyxJQUFJLENBQUMsS0FBSyxDQUFDLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxZQUFZLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUMzRSxJQUFJLENBQUMsR0FBRyxDQUFDLFlBQVksRUFBRSxDQUFDO0lBQzFCLENBQUM7SUFHRCxXQUFXLENBQUMsQ0FBYTtRQUN2QixJQUFJLElBQUksQ0FBQyxpQkFBaUI7WUFBRSxPQUFNO1FBQ2xDLElBQUksQ0FBQyxpQkFBaUIsR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQztZQUMzQyxnQkFBZ0IsRUFBRSxJQUFJLENBQUMsT0FBTyxDQUFDLFFBQVEsRUFBRSxDQUFDLG1CQUFtQixDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsYUFBYSxDQUFDLENBQUMsYUFBYSxDQUFDLFNBQVMsQ0FBQztZQUNqSCxjQUFjLEVBQUUsSUFBSSxDQUFDLE9BQU8sQ0FBQyxnQkFBZ0IsQ0FBQyxLQUFLLEVBQUU7U0FDdEQsQ0FBQyxDQUFBO1FBQ0YsSUFBSSxDQUFDLGlCQUFpQixDQUFDLGFBQWEsRUFBRSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFBO1FBQ2pGLE1BQU0sR0FBRyxHQUFHLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxNQUFNLENBQUMsSUFBSSxlQUFlLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQTtRQUM1RSxHQUFHLENBQUMsUUFBUSxDQUFDLGFBQWEsRUFBRSxZQUFZLENBQUMsQ0FBQTtRQUV6QyxTQUFTLENBQWEsSUFBSSxDQUFDLE1BQU0sQ0FBQyxhQUFhLEVBQUUsWUFBWSxDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsRUFBRTtZQUNsSCxJQUFJLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxhQUFhLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxhQUFhLENBQUM7Z0JBQUUsSUFBSSxDQUFDLFlBQVksRUFBRSxDQUFBO1FBQ2hGLENBQUMsQ0FBQyxDQUFBO1FBQ0YsU0FBUyxDQUFhLEdBQUcsQ0FBQyxRQUFRLENBQUMsYUFBYSxFQUFFLFlBQVksQ0FBQyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLGdCQUFnQixDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLEVBQUU7WUFDbkgsSUFBSSxDQUFDLENBQUMsYUFBYSxLQUFLLElBQUksQ0FBQyxNQUFNLENBQUMsYUFBYSxJQUFJLENBQUUsQ0FBQyxDQUFDLGFBQTZCLENBQUMsT0FBTyxDQUFDLHdCQUF3QixDQUFDO2dCQUFFLElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQTtRQUMvSSxDQUFDLENBQUMsQ0FBQTtRQUVGLEdBQUcsQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxFQUFDLElBQUksRUFBRSxLQUFLLEVBQUMsRUFBRSxFQUFFO1lBQzNGLFFBQVEsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO2dCQUNsQixLQUFLLE9BQU87b0JBQ1YsSUFBSSxDQUFDLGVBQWUsQ0FBQyxLQUFLLENBQUMsTUFBcUIsQ0FBQyxDQUFBO29CQUNqRCxNQUFLO2dCQUNQLEtBQUssTUFBTTtvQkFDVCxTQUFTLENBQUMsU0FBUyxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsY0FBYyxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFO3dCQUM3RCxHQUFHLENBQUMsUUFBUSxDQUFDLGFBQWEsRUFBRSxtQkFBbUIsQ0FBQyxDQUFBO3dCQUNoRCxVQUFVLENBQUMsR0FBRyxFQUFFOzRCQUNkLEdBQUcsQ0FBQyxRQUFRLENBQUMsYUFBYSxFQUFFLFlBQVksQ0FBQyxDQUFBO3dCQUMzQyxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUE7b0JBQ1YsQ0FBQyxDQUFDLENBQUE7WUFDTixDQUFDO1FBQ0gsQ0FBQyxDQUFDLENBQUE7SUFFSixDQUFDO0lBRUQsZUFBZSxDQUFDLE1BQW1CO1FBQ2pDLElBQUksSUFBSSxDQUFDLHNCQUFzQjtZQUFFLE9BQU07UUFDdkMsTUFBTSxnQkFBZ0IsR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLFFBQVEsRUFBRSxDQUFDLG1CQUFtQixDQUFDLE1BQU0sQ0FBQyxDQUFDLGFBQWEsQ0FBQztZQUN6RixFQUFDLE9BQU8sRUFBRSxRQUFRLEVBQUUsT0FBTyxFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQUUsUUFBUSxFQUFFLFFBQVEsRUFBRSxLQUFLLEVBQUUsT0FBTyxFQUFFLENBQUMsRUFBQztZQUN2RixFQUFDLE9BQU8sRUFBRSxRQUFRLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxRQUFRLEVBQUUsUUFBUSxFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQUUsT0FBTyxFQUFFLENBQUMsQ0FBQyxFQUFDO1NBQ3pGLENBQUMsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUE7UUFDbEIsSUFBSSxDQUFDLHNCQUFzQixHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDO1lBQ2hELGdCQUFnQjtZQUNoQixXQUFXLEVBQUUsSUFBSTtZQUNqQixhQUFhLEVBQUUsa0NBQWtDO1lBQ2pELGNBQWMsRUFBRSxJQUFJLENBQUMsT0FBTyxDQUFDLGdCQUFnQixDQUFDLEtBQUssRUFBRTtTQUN0RCxDQUFDLENBQUE7UUFDRixJQUFJLENBQUMsc0JBQXNCLENBQUMsYUFBYSxFQUFFLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsQ0FBQTtRQUMxRixNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsc0JBQXNCLENBQUMsTUFBTSxDQUFDLElBQUksZUFBZSxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUE7UUFDakYsR0FBRyxDQUFDLFFBQVEsQ0FBQyxhQUFhLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQTtRQUN6QyxHQUFHLENBQUMsUUFBUSxDQUFDLGVBQWUsRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxDQUFBO1FBQzVDLEdBQUcsQ0FBQyxRQUFRLENBQUMsaUJBQWlCLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQTtRQUM5QyxHQUFHLENBQUMsUUFBUSxDQUFDLGVBQWUsRUFBRSxJQUFJLENBQUMsQ0FBQTtRQUNuQyxHQUFHLENBQUMsUUFBUSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxFQUFDLElBQUksRUFBRSxLQUFLLEVBQUMsRUFBRSxFQUFFO1lBQ3ZGLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLEtBQVksQ0FBQyxDQUFBO1FBQ2xDLENBQUMsQ0FBQyxDQUFBO0lBQ0osQ0FBQztJQWNRLFdBQVc7UUFDbEIsS0FBSyxDQUFDLFdBQVcsRUFBRSxDQUFDO1FBQ3BCLElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQTtJQUNyQixDQUFDOytHQXpHVSxZQUFZO21HQUFaLFlBQVksd1FBbkNiOzs7O0dBSVQ7OzRGQStCVSxZQUFZO2tCQXJDeEIsU0FBUzsrQkFDRSxtQkFBbUIsWUFDbkI7Ozs7R0FJVCxjQTRCVyxJQUFJLG1CQUNDLHVCQUF1QixDQUFDLE1BQU07NEVBSXJDLGdCQUFnQjtzQkFEekIsV0FBVzt1QkFBQyx1QkFBdUI7Z0JBSTFCLFlBQVk7c0JBRHJCLFdBQVc7dUJBQUMsbUJBQW1CO2dCQTZCaEMsV0FBVztzQkFEVixZQUFZO3VCQUFDLFlBQVkiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQge0NoYW5nZURldGVjdGlvblN0cmF0ZWd5LCBDb21wb25lbnQsIEhvc3RCaW5kaW5nLCBIb3N0TGlzdGVuZXJ9IGZyb20gXCJAYW5ndWxhci9jb3JlXCI7XG5pbXBvcnQge3Rha2VVbnRpbERlc3Ryb3llZH0gZnJvbSBcIkBhbmd1bGFyL2NvcmUvcnhqcy1pbnRlcm9wXCI7XG5pbXBvcnQge0Zsb2F0VG9vbGJhciwgSVRvb2xiYXJJdGVtfSBmcm9tIFwiLi4vLi4vY29tcG9uZW50c1wiO1xuaW1wb3J0IHtJQ2FsbG91dEJsb2NrTW9kZWx9IGZyb20gXCIuL3R5cGVcIjtcbmltcG9ydCB7RWRpdGFibGVCbG9ja30gZnJvbSBcIi4uLy4uL2NvcmVcIjtcbmltcG9ydCB7Q29ubmVjdGVkUG9zaXRpb24sIE92ZXJsYXksIE92ZXJsYXlSZWZ9IGZyb20gXCJAYW5ndWxhci9jZGsvb3ZlcmxheVwiO1xuaW1wb3J0IHtmcm9tRXZlbnQsIFN1YmplY3QsIHRha2UsIHRha2VVbnRpbH0gZnJvbSBcInJ4anNcIjtcbmltcG9ydCB7Q29tcG9uZW50UG9ydGFsfSBmcm9tIFwiQGFuZ3VsYXIvY2RrL3BvcnRhbFwiO1xuaW1wb3J0IHtDb2xvclBhbGV0dGV9IGZyb20gXCIuLi8uLi9jb21wb25lbnRzL2NvbG9yLXBhbGV0dGUvY29sb3ItcGFsZXR0ZVwiO1xuXG5jb25zdCBUT09MQkFSX0xJU1Q6IElUb29sYmFySXRlbVtdID0gW1xuICB7XG4gICAgaWQ6ICdjb2xvcicsXG4gICAgaWNvbjogJ2JmX2ljb24gYmZfeWFuc2UnLFxuICAgIG5hbWU6ICdjb2xvcicsXG4gICAgdGl0bGU6ICfmm7TmjaLpopzoibInLFxuICAgIGRpdmlkZTogdHJ1ZVxuICB9LFxuICB7XG4gICAgaWQ6ICdjb3B5JyxcbiAgICBpY29uOiAnYmZfaWNvbiBiZl9mdXpoaScsXG4gICAgbmFtZTogJ2NvcHknLFxuICAgIHRpdGxlOiAn5aSN5Yi25paH5pysJ1xuICB9XG5dXG5cbmNvbnN0IENPUElFRF9UT09MQkFSX0xJU1Q6IElUb29sYmFySXRlbVtdID0gWy4uLlRPT0xCQVJfTElTVF0uc2xpY2UoMCwgVE9PTEJBUl9MSVNULmxlbmd0aCAtIDEpLmNvbmNhdCh7XG4gIGlkOiAnY29waWVkJyxcbiAgaWNvbjogJ2JmX2ljb24gYmZfZnV6aGknLFxuICBuYW1lOiAnY29waWVkJyxcbiAgdGl0bGU6ICflpI3liLbmlofmnKwnLFxuICB0ZXh0OiAn5bey5aSN5Yi2Jyxcbn0pXG5cbmNvbnN0IFBPU0lUSU9OUzogQ29ubmVjdGVkUG9zaXRpb25bXSA9IFtcbiAge29yaWdpblg6ICdlbmQnLCBvcmlnaW5ZOiAnYm90dG9tJywgb3ZlcmxheVg6ICdlbmQnLCBvdmVybGF5WTogJ3RvcCd9LFxuICB7b3JpZ2luWDogJ2VuZCcsIG9yaWdpblk6ICd0b3AnLCBvdmVybGF5WDogJ2VuZCcsIG92ZXJsYXlZOiAnYm90dG9tJ30sXG5dXG5cbkBDb21wb25lbnQoe1xuICBzZWxlY3RvcjogJ2Rpdi5jYWxsb3V0LWJsb2NrJyxcbiAgdGVtcGxhdGU6IGBcbiAgICA8c3BhbiBjbGFzcz1cImNhbGxvdXQtYmxvY2tfX2Vtb2ppXCI+e3sgcHJvcHMuZW1vamkgfX08L3NwYW4+XG4gICAgPGRpdiBjbGFzcz1cImVkaXRhYmxlLWNvbnRhaW5lciBiZi1tdWx0aS1saW5lXCIgW3N0eWxlLmNvbG9yXT1cInByb3BzLmNcIiBjb250ZW50ZWRpdGFibGU9XCJ0cnVlXCJcbiAgICAgICAgIChibHVyKT1cImNsb3NlVG9vbGJhcigpXCI+PC9kaXY+XG4gIGAsXG4gIHN0eWxlczogW2BcbiAgICA6aG9zdCB7XG4gICAgICBib3JkZXI6IDFweCBzb2xpZCB0cmFuc3BhcmVudDtcbiAgICAgIHBhZGRpbmc6IDhweCA4cHggOHB4IDQycHg7XG4gICAgICBib3JkZXItcmFkaXVzOiA0cHg7XG4gICAgICBwb3NpdGlvbjogcmVsYXRpdmU7XG5cbiAgICAgICYuc2VsZWN0ZWQge1xuICAgICAgICBiYWNrZ3JvdW5kLWNvbG9yOiB2YXIoLS1iZi1zZWxlY3RlZCkgIWltcG9ydGFudDtcbiAgICAgICAgYm9yZGVyOiAxcHggc29saWQgdmFyKC0tYmYtc2VsZWN0ZWQtYm9yZGVyKSAhaW1wb3J0YW50O1xuICAgICAgfVxuICAgIH1cblxuICAgIC5jYWxsb3V0LWJsb2NrX19lbW9qaSB7XG4gICAgICBwb3NpdGlvbjogYWJzb2x1dGU7XG4gICAgICBsZWZ0OiAxMnB4O1xuICAgICAgdG9wOiA4cHg7XG4gICAgICBmb250LXNpemU6IDE4cHg7XG4gICAgICB0ZXh0LWluZGVudDogMDtcbiAgICAgIGN1cnNvcjogcG9pbnRlcjtcbiAgICB9XG5cbiAgICAuY2FsbG91dC1ibG9ja19fZW1vamk6aG92ZXIge1xuICAgICAgYmFja2dyb3VuZC1jb2xvcjogcmdiYSg3MiwgODcsIDIyNiwgMC4zKTtcbiAgICAgIGJvcmRlci1yYWRpdXM6IDRweDtcbiAgICB9XG4gIGBdLFxuICBzdGFuZGFsb25lOiB0cnVlLFxuICBjaGFuZ2VEZXRlY3Rpb246IENoYW5nZURldGVjdGlvblN0cmF0ZWd5Lk9uUHVzaFxufSlcbmV4cG9ydCBjbGFzcyBDYWxsb3V0QmxvY2sgZXh0ZW5kcyBFZGl0YWJsZUJsb2NrPElDYWxsb3V0QmxvY2tNb2RlbD4ge1xuICBASG9zdEJpbmRpbmcoJ3N0eWxlLmJhY2tncm91bmRDb2xvcicpXG4gIHByb3RlY3RlZCBfYmFja2dyb3VuZENvbG9yOiBzdHJpbmcgfCBudWxsID0gJyNkYzliOWInXG5cbiAgQEhvc3RCaW5kaW5nKCdzdHlsZS5ib3JkZXJDb2xvcicpXG4gIHByb3RlY3RlZCBfYm9yZGVyQ29sb3I6IHN0cmluZyB8IG51bGwgPSAnI0ZGRTZDRCdcblxuICBwcml2YXRlIF90b29sYmFyRGlzcG9zZSQgPSBuZXcgU3ViamVjdDxib29sZWFuPigpXG4gIHByaXZhdGUgdG9vbGJhck92ZXJsYXlSZWY/OiBPdmVybGF5UmVmXG4gIHByaXZhdGUgX2NvbG9yUGlja2VyT3ZlcmxheVJlZj86IE92ZXJsYXlSZWZcblxuICBjb25zdHJ1Y3RvcihcbiAgICBwcml2YXRlIG92ZXJsYXk6IE92ZXJsYXlcbiAgKSB7XG4gICAgc3VwZXIoKTtcbiAgfVxuXG4gIG92ZXJyaWRlIG5nT25Jbml0KCkge1xuICAgIHN1cGVyLm5nT25Jbml0KCk7XG4gICAgdGhpcy5zZXRTdHlsZSgpO1xuXG4gICAgdGhpcy5tb2RlbC51cGRhdGUkLnBpcGUodGFrZVVudGlsRGVzdHJveWVkKHRoaXMuZGVzdHJveVJlZikpLnN1YnNjcmliZSh2ID0+IHtcbiAgICAgIGlmICh2LnR5cGUgPT09ICdwcm9wcycpIHRoaXMuc2V0U3R5bGUoKTtcbiAgICB9KVxuICB9XG5cbiAgc2V0U3R5bGUoKSB7XG4gICAgdGhpcy5fYmFja2dyb3VuZENvbG9yICE9PSB0aGlzLnByb3BzLmJjICYmICh0aGlzLl9iYWNrZ3JvdW5kQ29sb3IgPSB0aGlzLnByb3BzLmJjKTtcbiAgICB0aGlzLl9ib3JkZXJDb2xvciAhPT0gdGhpcy5wcm9wcy5lYyAmJiAodGhpcy5fYm9yZGVyQ29sb3IgPSB0aGlzLnByb3BzLmVjKTtcbiAgICB0aGlzLmNkci5tYXJrRm9yQ2hlY2soKTtcbiAgfVxuXG4gIEBIb3N0TGlzdGVuZXIoJ21vdXNlZW50ZXInKVxuICBzaG93VG9vbGJhcihlOiBGb2N1c0V2ZW50KSB7XG4gICAgaWYgKHRoaXMudG9vbGJhck92ZXJsYXlSZWYpIHJldHVyblxuICAgIHRoaXMudG9vbGJhck92ZXJsYXlSZWYgPSB0aGlzLm92ZXJsYXkuY3JlYXRlKHtcbiAgICAgIHBvc2l0aW9uU3RyYXRlZ3k6IHRoaXMub3ZlcmxheS5wb3NpdGlvbigpLmZsZXhpYmxlQ29ubmVjdGVkVG8odGhpcy5ob3N0RWwubmF0aXZlRWxlbWVudCkud2l0aFBvc2l0aW9ucyhQT1NJVElPTlMpLFxuICAgICAgc2Nyb2xsU3RyYXRlZ3k6IHRoaXMub3ZlcmxheS5zY3JvbGxTdHJhdGVnaWVzLmNsb3NlKClcbiAgICB9KVxuICAgIHRoaXMudG9vbGJhck92ZXJsYXlSZWYuYmFja2Ryb3BDbGljaygpLnBpcGUodGFrZSgxKSkuc3Vic2NyaWJlKHRoaXMuY2xvc2VUb29sYmFyKVxuICAgIGNvbnN0IGNwciA9IHRoaXMudG9vbGJhck92ZXJsYXlSZWYuYXR0YWNoKG5ldyBDb21wb25lbnRQb3J0YWwoRmxvYXRUb29sYmFyKSlcbiAgICBjcHIuc2V0SW5wdXQoJ3Rvb2xiYXJMaXN0JywgVE9PTEJBUl9MSVNUKVxuXG4gICAgZnJvbUV2ZW50PE1vdXNlRXZlbnQ+KHRoaXMuaG9zdEVsLm5hdGl2ZUVsZW1lbnQsICdtb3VzZWxlYXZlJykucGlwZSh0YWtlVW50aWwodGhpcy5fdG9vbGJhckRpc3Bvc2UkKSkuc3Vic2NyaWJlKGUgPT4ge1xuICAgICAgaWYgKCFjcHIubG9jYXRpb24ubmF0aXZlRWxlbWVudC5jb250YWlucyhlLnJlbGF0ZWRUYXJnZXQpKSB0aGlzLmNsb3NlVG9vbGJhcigpXG4gICAgfSlcbiAgICBmcm9tRXZlbnQ8TW91c2VFdmVudD4oY3ByLmxvY2F0aW9uLm5hdGl2ZUVsZW1lbnQsICdtb3VzZWxlYXZlJykucGlwZSh0YWtlVW50aWwodGhpcy5fdG9vbGJhckRpc3Bvc2UkKSkuc3Vic2NyaWJlKGUgPT4ge1xuICAgICAgaWYgKGUucmVsYXRlZFRhcmdldCAhPT0gdGhpcy5ob3N0RWwubmF0aXZlRWxlbWVudCAmJiAhKGUucmVsYXRlZFRhcmdldCBhcyBIVE1MRWxlbWVudCkuY2xvc2VzdCgnLmNkay1vdmVybGF5LWNvbnRhaW5lcicpKSB0aGlzLmNsb3NlVG9vbGJhcigpXG4gICAgfSlcblxuICAgIGNwci5pbnN0YW5jZS5pdGVtQ2xpY2sucGlwZSh0YWtlVW50aWxEZXN0cm95ZWQodGhpcy5kZXN0cm95UmVmKSkuc3Vic2NyaWJlKCh7aXRlbSwgZXZlbnR9KSA9PiB7XG4gICAgICBzd2l0Y2ggKGl0ZW0ubmFtZSkge1xuICAgICAgICBjYXNlICdjb2xvcic6XG4gICAgICAgICAgdGhpcy5zaG93Q29sb3JQaWNrZXIoZXZlbnQudGFyZ2V0IGFzIEhUTUxFbGVtZW50KVxuICAgICAgICAgIGJyZWFrXG4gICAgICAgIGNhc2UgJ2NvcHknOlxuICAgICAgICAgIG5hdmlnYXRvci5jbGlwYm9hcmQud3JpdGVUZXh0KHRoaXMuZ2V0VGV4dENvbnRlbnQoKSkudGhlbigoKSA9PiB7XG4gICAgICAgICAgICBjcHIuc2V0SW5wdXQoJ3Rvb2xiYXJMaXN0JywgQ09QSUVEX1RPT0xCQVJfTElTVClcbiAgICAgICAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICAgICAgICBjcHIuc2V0SW5wdXQoJ3Rvb2xiYXJMaXN0JywgVE9PTEJBUl9MSVNUKVxuICAgICAgICAgICAgfSwgMjAwMClcbiAgICAgICAgICB9KVxuICAgICAgfVxuICAgIH0pXG5cbiAgfVxuXG4gIHNob3dDb2xvclBpY2tlcih0YXJnZXQ6IEhUTUxFbGVtZW50KSB7XG4gICAgaWYgKHRoaXMuX2NvbG9yUGlja2VyT3ZlcmxheVJlZikgcmV0dXJuXG4gICAgY29uc3QgcG9zaXRpb25TdHJhdGVneSA9IHRoaXMub3ZlcmxheS5wb3NpdGlvbigpLmZsZXhpYmxlQ29ubmVjdGVkVG8odGFyZ2V0KS53aXRoUG9zaXRpb25zKFtcbiAgICAgIHtvcmlnaW5YOiAnY2VudGVyJywgb3JpZ2luWTogJ2JvdHRvbScsIG92ZXJsYXlYOiAnY2VudGVyJywgb3ZlcmxheVk6ICd0b3AnLCBvZmZzZXRZOiA4fSxcbiAgICAgIHtvcmlnaW5YOiAnY2VudGVyJywgb3JpZ2luWTogJ3RvcCcsIG92ZXJsYXlYOiAnY2VudGVyJywgb3ZlcmxheVk6ICdib3R0b20nLCBvZmZzZXRZOiAtOH0sXG4gICAgXSkud2l0aFB1c2goZmFsc2UpXG4gICAgdGhpcy5fY29sb3JQaWNrZXJPdmVybGF5UmVmID0gdGhpcy5vdmVybGF5LmNyZWF0ZSh7XG4gICAgICBwb3NpdGlvblN0cmF0ZWd5LFxuICAgICAgaGFzQmFja2Ryb3A6IHRydWUsXG4gICAgICBiYWNrZHJvcENsYXNzOiAnY2RrLW92ZXJsYXktdHJhbnNwYXJlbnQtYmFja2Ryb3AnLFxuICAgICAgc2Nyb2xsU3RyYXRlZ3k6IHRoaXMub3ZlcmxheS5zY3JvbGxTdHJhdGVnaWVzLmNsb3NlKClcbiAgICB9KVxuICAgIHRoaXMuX2NvbG9yUGlja2VyT3ZlcmxheVJlZi5iYWNrZHJvcENsaWNrKCkucGlwZSh0YWtlKDEpKS5zdWJzY3JpYmUodGhpcy5jbG9zZUNvbG9yUGlja2VyKVxuICAgIGNvbnN0IGNwciA9IHRoaXMuX2NvbG9yUGlja2VyT3ZlcmxheVJlZi5hdHRhY2gobmV3IENvbXBvbmVudFBvcnRhbChDb2xvclBhbGV0dGUpKVxuICAgIGNwci5zZXRJbnB1dCgnYWN0aXZlQ29sb3InLCB0aGlzLnByb3BzLmMpXG4gICAgY3ByLnNldElucHV0KCdhY3RpdmVCZ0NvbG9yJywgdGhpcy5wcm9wcy5iYylcbiAgICBjcHIuc2V0SW5wdXQoJ2FjdGl2ZUVkZ2VDb2xvcicsIHRoaXMucHJvcHMuZWMpXG4gICAgY3ByLnNldElucHV0KCdzaG93RWRnZUNvbG9yJywgdHJ1ZSlcbiAgICBjcHIuaW5zdGFuY2UuY29sb3JDaGFuZ2UucGlwZSh0YWtlVW50aWwoY3ByLmluc3RhbmNlLmNsb3NlKSkuc3Vic2NyaWJlKCh7dHlwZSwgdmFsdWV9KSA9PiB7XG4gICAgICB0aGlzLnNldFByb3AodHlwZSwgdmFsdWUgYXMgYW55KVxuICAgIH0pXG4gIH1cblxuICBjbG9zZVRvb2xiYXIgPSAoKSA9PiB7XG4gICAgdGhpcy50b29sYmFyT3ZlcmxheVJlZj8uZGlzcG9zZSgpXG4gICAgdGhpcy50b29sYmFyT3ZlcmxheVJlZiA9IHVuZGVmaW5lZFxuICAgIHRoaXMuX3Rvb2xiYXJEaXNwb3NlJC5uZXh0KHRydWUpXG4gICAgdGhpcy5jbG9zZUNvbG9yUGlja2VyKClcbiAgfVxuXG4gIGNsb3NlQ29sb3JQaWNrZXIgPSAoKSA9PiB7XG4gICAgdGhpcy5fY29sb3JQaWNrZXJPdmVybGF5UmVmPy5kaXNwb3NlKClcbiAgICB0aGlzLl9jb2xvclBpY2tlck92ZXJsYXlSZWYgPSB1bmRlZmluZWRcbiAgfVxuXG4gIG92ZXJyaWRlIG5nT25EZXN0cm95KCkge1xuICAgIHN1cGVyLm5nT25EZXN0cm95KCk7XG4gICAgdGhpcy5jbG9zZVRvb2xiYXIoKVxuICB9XG5cbn1cbiJdfQ==