import { Component, EventEmitter, Input, Output, ViewChild } from "@angular/core";
import { NgForOf, NgIf, NgSwitch } from "@angular/common";
import { Controller, EditorRoot, LazyEditorRoot } from "../../core";
import * as i0 from "@angular/core";
export class BlockFlowEditor {
    set globalConfig(config) {
        this._globalConfig = config;
        !this.controller && this.createController(this.globalConfig);
    }
    get globalConfig() {
        return this._globalConfig;
    }
    get controller() {
        return this._controller;
    }
    constructor(injector) {
        this.injector = injector;
        this.onReady = new EventEmitter();
        this.mouseDownEventPhase = -1;
    }
    ngAfterViewInit() {
        !this.controller && this.createController(this.globalConfig);
    }
    createController(config) {
        if (!config || !this.root)
            return;
        this._globalConfig = config;
        this._controller = new Controller(config, this.injector);
        this._controller.attach(this.root).then(() => {
            this.onReady.emit(this._controller);
        });
    }
    onMouseDown(event) {
        this.mouseDownEventPhase = event.eventPhase;
    }
    onMouseUp(event) {
        if (this.mouseDownEventPhase !== event.eventPhase)
            return;
        this.mouseDownEventPhase = -1;
        if (this.controller.readonly$.value || this.controller.root.selectedBlockRange)
            return;
        const lastBm = this.controller.rootModel.at(-1);
        if (lastBm && lastBm.nodeType === 'editable' && !['code', 'mermaid', 'callout', 'blockquote'].includes(lastBm.flavour)) {
            this.controller.selection.setSelection(lastBm.id, 'end');
            return;
        }
        const p = this.controller.createBlock('paragraph');
        this.controller.insertBlocks(this.controller.rootModel.length, [p]).then(() => {
            this.controller.selection.setSelection(p.id, 'start');
        });
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: BlockFlowEditor, deps: [{ token: i0.Injector }], target: i0.ɵɵFactoryTarget.Component }); }
    static { this.ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "17.0.0", version: "17.3.12", type: BlockFlowEditor, isStandalone: true, selector: "bf-editor", inputs: { globalConfig: ["config", "globalConfig"] }, outputs: { onReady: "onReady" }, viewQueries: [{ propertyName: "root", first: true, predicate: ["root"], descendants: true }], ngImport: i0, template: `
    @if (!globalConfig.lazyload) {
      <div bf-node-type="root" lazy-load="false" #root></div>
    } @else {
      <div bf-node-type="root" lazy-load="true" [config]="globalConfig.lazyload!" #root></div>
    }
    <div class="expand" (mousedown)="onMouseDown($event)" (mouseup)="onMouseUp($event)"></div>
  `, isInline: true, styles: [":host{display:flex;flex-direction:column;height:100%}:host>.expand{flex:1;min-height:60px}\n"], dependencies: [{ kind: "component", type: EditorRoot, selector: "div[bf-node-type=\"root\"][lazy-load=\"false\"]", outputs: ["onDestroy"] }, { kind: "component", type: LazyEditorRoot, selector: "div[bf-node-type=\"root\"][lazy-load=\"true\"]", inputs: ["config"] }] }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: BlockFlowEditor, decorators: [{
            type: Component,
            args: [{ selector: 'bf-editor', standalone: true, template: `
    @if (!globalConfig.lazyload) {
      <div bf-node-type="root" lazy-load="false" #root></div>
    } @else {
      <div bf-node-type="root" lazy-load="true" [config]="globalConfig.lazyload!" #root></div>
    }
    <div class="expand" (mousedown)="onMouseDown($event)" (mouseup)="onMouseUp($event)"></div>
  `, imports: [
                        NgIf,
                        NgForOf,
                        EditorRoot,
                        LazyEditorRoot,
                        NgSwitch,
                    ], styles: [":host{display:flex;flex-direction:column;height:100%}:host>.expand{flex:1;min-height:60px}\n"] }]
        }], ctorParameters: () => [{ type: i0.Injector }], propDecorators: { globalConfig: [{
                type: Input,
                args: [{ required: true, alias: 'config' }]
            }], onReady: [{
                type: Output
            }], root: [{
                type: ViewChild,
                args: ['root']
            }] } });
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdG9yLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vYmxvY2tmbG93L3NyYy9lZGl0b3IvY29tcG9uZW50cy9lZGl0b3IudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsT0FBTyxFQUFDLFNBQVMsRUFBRSxZQUFZLEVBQVksS0FBSyxFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUMsTUFBTSxlQUFlLENBQUM7QUFDMUYsT0FBTyxFQUFDLE9BQU8sRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFDLE1BQU0saUJBQWlCLENBQUM7QUFDeEQsT0FBTyxFQUFDLFVBQVUsRUFBRSxVQUFVLEVBQUUsY0FBYyxFQUFDLE1BQU0sWUFBWSxDQUFDOztBQWtDbEUsTUFBTSxPQUFPLGVBQWU7SUFHMUIsSUFDSSxZQUFZLENBQUMsTUFBb0I7UUFDbkMsSUFBSSxDQUFDLGFBQWEsR0FBRyxNQUFNLENBQUE7UUFDM0IsQ0FBQyxJQUFJLENBQUMsVUFBVSxJQUFJLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUE7SUFDOUQsQ0FBQztJQUVELElBQUksWUFBWTtRQUNkLE9BQU8sSUFBSSxDQUFDLGFBQWEsQ0FBQTtJQUMzQixDQUFDO0lBT0QsSUFBSSxVQUFVO1FBQ1osT0FBTyxJQUFJLENBQUMsV0FBVyxDQUFBO0lBQ3pCLENBQUM7SUFFRCxZQUNVLFFBQWtCO1FBQWxCLGFBQVEsR0FBUixRQUFRLENBQVU7UUFWbEIsWUFBTyxHQUFHLElBQUksWUFBWSxFQUFjLENBQUE7UUEyQjFDLHdCQUFtQixHQUFHLENBQUMsQ0FBQyxDQUFBO0lBZmhDLENBQUM7SUFFRCxlQUFlO1FBQ2IsQ0FBQyxJQUFJLENBQUMsVUFBVSxJQUFJLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUE7SUFDOUQsQ0FBQztJQUVPLGdCQUFnQixDQUFDLE1BQW9CO1FBQzNDLElBQUksQ0FBQyxNQUFNLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSTtZQUFFLE9BQU07UUFDakMsSUFBSSxDQUFDLGFBQWEsR0FBRyxNQUFNLENBQUE7UUFDM0IsSUFBSSxDQUFDLFdBQVcsR0FBRyxJQUFJLFVBQVUsQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFBO1FBQ3hELElBQUksQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFO1lBQzNDLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQTtRQUNyQyxDQUFDLENBQUMsQ0FBQTtJQUNKLENBQUM7SUFJRCxXQUFXLENBQUMsS0FBaUI7UUFDM0IsSUFBSSxDQUFDLG1CQUFtQixHQUFHLEtBQUssQ0FBQyxVQUFVLENBQUE7SUFDN0MsQ0FBQztJQUVELFNBQVMsQ0FBQyxLQUFpQjtRQUN6QixJQUFJLElBQUksQ0FBQyxtQkFBbUIsS0FBSyxLQUFLLENBQUMsVUFBVTtZQUFFLE9BQU07UUFDekQsSUFBSSxDQUFDLG1CQUFtQixHQUFHLENBQUMsQ0FBQyxDQUFBO1FBQzdCLElBQUksSUFBSSxDQUFDLFVBQVUsQ0FBQyxTQUFTLENBQUMsS0FBSyxJQUFJLElBQUksQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLGtCQUFrQjtZQUFFLE9BQU07UUFDdEYsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUE7UUFDL0MsSUFBSSxNQUFNLElBQUksTUFBTSxDQUFDLFFBQVEsS0FBSyxVQUFVLElBQUksQ0FBQyxDQUFDLE1BQU0sRUFBRSxTQUFTLEVBQUUsU0FBUyxFQUFFLFlBQVksQ0FBQyxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztZQUN2SCxJQUFJLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxZQUFZLENBQUMsTUFBTSxDQUFDLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQTtZQUN4RCxPQUFNO1FBQ1IsQ0FBQztRQUNELE1BQU0sQ0FBQyxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxDQUFBO1FBQ2xELElBQUksQ0FBQyxVQUFVLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRTtZQUM1RSxJQUFJLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxPQUFPLENBQUMsQ0FBQTtRQUN2RCxDQUFDLENBQUMsQ0FBQTtJQUNKLENBQUM7K0dBM0RVLGVBQWU7bUdBQWYsZUFBZSwwUEE1QmhCOzs7Ozs7O0dBT1Qsc0tBZ0JDLFVBQVUsb0hBQ1YsY0FBYzs7NEZBSUwsZUFBZTtrQkEvQjNCLFNBQVM7K0JBQ0UsV0FBVyxjQUNULElBQUksWUFDTjs7Ozs7OztHQU9ULFdBYVE7d0JBQ1AsSUFBSTt3QkFDSixPQUFPO3dCQUNQLFVBQVU7d0JBQ1YsY0FBYzt3QkFDZCxRQUFRO3FCQUNUOzZFQU1HLFlBQVk7c0JBRGYsS0FBSzt1QkFBQyxFQUFDLFFBQVEsRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUFFLFFBQVEsRUFBQztnQkFVOUIsT0FBTztzQkFBaEIsTUFBTTtnQkFFWSxJQUFJO3NCQUF0QixTQUFTO3VCQUFDLE1BQU0iLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQge0NvbXBvbmVudCwgRXZlbnRFbWl0dGVyLCBJbmplY3RvciwgSW5wdXQsIE91dHB1dCwgVmlld0NoaWxkfSBmcm9tIFwiQGFuZ3VsYXIvY29yZVwiO1xuaW1wb3J0IHtOZ0Zvck9mLCBOZ0lmLCBOZ1N3aXRjaH0gZnJvbSBcIkBhbmd1bGFyL2NvbW1vblwiO1xuaW1wb3J0IHtDb250cm9sbGVyLCBFZGl0b3JSb290LCBMYXp5RWRpdG9yUm9vdH0gZnJvbSBcIi4uLy4uL2NvcmVcIjtcbmltcG9ydCB7R2xvYmFsQ29uZmlnfSBmcm9tIFwiLi4vdHlwZXNcIjtcblxuQENvbXBvbmVudCh7XG4gIHNlbGVjdG9yOiAnYmYtZWRpdG9yJyxcbiAgc3RhbmRhbG9uZTogdHJ1ZSxcbiAgdGVtcGxhdGU6IGBcbiAgICBAaWYgKCFnbG9iYWxDb25maWcubGF6eWxvYWQpIHtcbiAgICAgIDxkaXYgYmYtbm9kZS10eXBlPVwicm9vdFwiIGxhenktbG9hZD1cImZhbHNlXCIgI3Jvb3Q+PC9kaXY+XG4gICAgfSBAZWxzZSB7XG4gICAgICA8ZGl2IGJmLW5vZGUtdHlwZT1cInJvb3RcIiBsYXp5LWxvYWQ9XCJ0cnVlXCIgW2NvbmZpZ109XCJnbG9iYWxDb25maWcubGF6eWxvYWQhXCIgI3Jvb3Q+PC9kaXY+XG4gICAgfVxuICAgIDxkaXYgY2xhc3M9XCJleHBhbmRcIiAobW91c2Vkb3duKT1cIm9uTW91c2VEb3duKCRldmVudClcIiAobW91c2V1cCk9XCJvbk1vdXNlVXAoJGV2ZW50KVwiPjwvZGl2PlxuICBgLFxuICBzdHlsZXM6IFtgXG4gICAgOmhvc3Qge1xuICAgICAgZGlzcGxheTogZmxleDtcbiAgICAgIGZsZXgtZGlyZWN0aW9uOiBjb2x1bW47XG4gICAgICBoZWlnaHQ6IDEwMCU7XG5cbiAgICAgID4gLmV4cGFuZCB7XG4gICAgICAgIGZsZXg6IDE7XG4gICAgICAgIG1pbi1oZWlnaHQ6IDYwcHg7XG4gICAgICB9XG4gICAgfVxuICBgXSxcbiAgaW1wb3J0czogW1xuICAgIE5nSWYsXG4gICAgTmdGb3JPZixcbiAgICBFZGl0b3JSb290LFxuICAgIExhenlFZGl0b3JSb290LFxuICAgIE5nU3dpdGNoLFxuICBdXG59KVxuZXhwb3J0IGNsYXNzIEJsb2NrRmxvd0VkaXRvciB7XG5cbiAgcHJpdmF0ZSBfZ2xvYmFsQ29uZmlnITogR2xvYmFsQ29uZmlnXG4gIEBJbnB1dCh7cmVxdWlyZWQ6IHRydWUsIGFsaWFzOiAnY29uZmlnJ30pXG4gIHNldCBnbG9iYWxDb25maWcoY29uZmlnOiBHbG9iYWxDb25maWcpIHtcbiAgICB0aGlzLl9nbG9iYWxDb25maWcgPSBjb25maWdcbiAgICAhdGhpcy5jb250cm9sbGVyICYmIHRoaXMuY3JlYXRlQ29udHJvbGxlcih0aGlzLmdsb2JhbENvbmZpZylcbiAgfVxuXG4gIGdldCBnbG9iYWxDb25maWcoKSB7XG4gICAgcmV0dXJuIHRoaXMuX2dsb2JhbENvbmZpZ1xuICB9XG5cbiAgQE91dHB1dCgpIG9uUmVhZHkgPSBuZXcgRXZlbnRFbWl0dGVyPENvbnRyb2xsZXI+KClcblxuICBAVmlld0NoaWxkKCdyb290Jykgcm9vdCE6IEVkaXRvclJvb3RcblxuICBwcm90ZWN0ZWQgX2NvbnRyb2xsZXIhOiBDb250cm9sbGVyXG4gIGdldCBjb250cm9sbGVyKCkge1xuICAgIHJldHVybiB0aGlzLl9jb250cm9sbGVyXG4gIH1cblxuICBjb25zdHJ1Y3RvcihcbiAgICBwcml2YXRlIGluamVjdG9yOiBJbmplY3RvclxuICApIHtcbiAgfVxuXG4gIG5nQWZ0ZXJWaWV3SW5pdCgpIHtcbiAgICAhdGhpcy5jb250cm9sbGVyICYmIHRoaXMuY3JlYXRlQ29udHJvbGxlcih0aGlzLmdsb2JhbENvbmZpZylcbiAgfVxuXG4gIHByaXZhdGUgY3JlYXRlQ29udHJvbGxlcihjb25maWc6IEdsb2JhbENvbmZpZykge1xuICAgIGlmICghY29uZmlnIHx8ICF0aGlzLnJvb3QpIHJldHVyblxuICAgIHRoaXMuX2dsb2JhbENvbmZpZyA9IGNvbmZpZ1xuICAgIHRoaXMuX2NvbnRyb2xsZXIgPSBuZXcgQ29udHJvbGxlcihjb25maWcsIHRoaXMuaW5qZWN0b3IpXG4gICAgdGhpcy5fY29udHJvbGxlci5hdHRhY2godGhpcy5yb290KS50aGVuKCgpID0+IHtcbiAgICAgIHRoaXMub25SZWFkeS5lbWl0KHRoaXMuX2NvbnRyb2xsZXIpXG4gICAgfSlcbiAgfVxuXG4gIHByaXZhdGUgbW91c2VEb3duRXZlbnRQaGFzZSA9IC0xXG5cbiAgb25Nb3VzZURvd24oZXZlbnQ6IE1vdXNlRXZlbnQpIHtcbiAgICB0aGlzLm1vdXNlRG93bkV2ZW50UGhhc2UgPSBldmVudC5ldmVudFBoYXNlXG4gIH1cblxuICBvbk1vdXNlVXAoZXZlbnQ6IE1vdXNlRXZlbnQpIHtcbiAgICBpZiAodGhpcy5tb3VzZURvd25FdmVudFBoYXNlICE9PSBldmVudC5ldmVudFBoYXNlKSByZXR1cm5cbiAgICB0aGlzLm1vdXNlRG93bkV2ZW50UGhhc2UgPSAtMVxuICAgIGlmICh0aGlzLmNvbnRyb2xsZXIucmVhZG9ubHkkLnZhbHVlIHx8IHRoaXMuY29udHJvbGxlci5yb290LnNlbGVjdGVkQmxvY2tSYW5nZSkgcmV0dXJuXG4gICAgY29uc3QgbGFzdEJtID0gdGhpcy5jb250cm9sbGVyLnJvb3RNb2RlbC5hdCgtMSlcbiAgICBpZiAobGFzdEJtICYmIGxhc3RCbS5ub2RlVHlwZSA9PT0gJ2VkaXRhYmxlJyAmJiAhWydjb2RlJywgJ21lcm1haWQnLCAnY2FsbG91dCcsICdibG9ja3F1b3RlJ10uaW5jbHVkZXMobGFzdEJtLmZsYXZvdXIpKSB7XG4gICAgICB0aGlzLmNvbnRyb2xsZXIuc2VsZWN0aW9uLnNldFNlbGVjdGlvbihsYXN0Qm0uaWQsICdlbmQnKVxuICAgICAgcmV0dXJuXG4gICAgfVxuICAgIGNvbnN0IHAgPSB0aGlzLmNvbnRyb2xsZXIuY3JlYXRlQmxvY2soJ3BhcmFncmFwaCcpXG4gICAgdGhpcy5jb250cm9sbGVyLmluc2VydEJsb2Nrcyh0aGlzLmNvbnRyb2xsZXIucm9vdE1vZGVsLmxlbmd0aCwgW3BdKS50aGVuKCgpID0+IHtcbiAgICAgIHRoaXMuY29udHJvbGxlci5zZWxlY3Rpb24uc2V0U2VsZWN0aW9uKHAuaWQsICdzdGFydCcpXG4gICAgfSlcbiAgfVxuXG59XG4iXX0=