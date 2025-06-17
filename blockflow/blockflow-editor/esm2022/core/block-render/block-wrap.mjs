import { Component, Input, ViewChild, ViewContainerRef } from "@angular/core";
import * as i0 from "@angular/core";
export class BlockWrap {
    constructor(hostEl) {
        this.hostEl = hostEl;
    }
    ngAfterViewInit() {
        const schema = this.controller.schemas.get(this.model.flavour);
        if (!schema)
            throw new Error(`Schema not found for flavour: ${this.model.flavour}`);
        const cpr = this.container.createComponent(schema.render);
        cpr.instance.controller = this.controller;
        cpr.setInput('model', this.model);
        cpr.changeDetectorRef.detectChanges();
        cpr.instance.cdr.detectChanges();
        this.hostEl.nativeElement.setAttribute('data-block-id', this.model.id);
    }
    onAppendAfter(e) {
        e.stopPropagation();
        e.preventDefault();
        const pos = this.controller.getBlockPosition(this.model.id);
        const np = this.controller.createBlock('paragraph');
        this.controller.insertBlocks(pos.index + 1, [np]).then(() => {
            this.controller.selection.setSelection(np.id, 0);
        });
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: BlockWrap, deps: [{ token: i0.ElementRef }], target: i0.ɵɵFactoryTarget.Component }); }
    static { this.ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "14.0.0", version: "17.3.12", type: BlockWrap, isStandalone: true, selector: "div[bf-block-wrap]", inputs: { controller: "controller", model: "model" }, viewQueries: [{ propertyName: "container", first: true, predicate: ["container"], descendants: true, read: ViewContainerRef, static: true }], ngImport: i0, template: `
    <ng-container #container></ng-container>
<!--    <span style="display: block; cursor: text;" (mousedown)="onAppendAfter($event)">&ZeroWidthSpace;</span>-->
  `, isInline: true }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: BlockWrap, decorators: [{
            type: Component,
            args: [{
                    selector: 'div[bf-block-wrap]',
                    template: `
    <ng-container #container></ng-container>
<!--    <span style="display: block; cursor: text;" (mousedown)="onAppendAfter($event)">&ZeroWidthSpace;</span>-->
  `,
                    standalone: true,
                }]
        }], ctorParameters: () => [{ type: i0.ElementRef }], propDecorators: { controller: [{
                type: Input,
                args: [{ required: true }]
            }], model: [{
                type: Input,
                args: [{ required: true }]
            }], container: [{
                type: ViewChild,
                args: ['container', { read: ViewContainerRef, static: true }]
            }] } });
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmxvY2std3JhcC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uL2Jsb2NrZmxvdy9zcmMvY29yZS9ibG9jay1yZW5kZXIvYmxvY2std3JhcC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxPQUFPLEVBQUMsU0FBUyxFQUFjLEtBQUssRUFBRSxTQUFTLEVBQUUsZ0JBQWdCLEVBQUMsTUFBTSxlQUFlLENBQUM7O0FBWXhGLE1BQU0sT0FBTyxTQUFTO0lBTXBCLFlBQ1UsTUFBK0I7UUFBL0IsV0FBTSxHQUFOLE1BQU0sQ0FBeUI7SUFFekMsQ0FBQztJQUVELGVBQWU7UUFDYixNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQTtRQUM5RCxJQUFJLENBQUMsTUFBTTtZQUFFLE1BQU0sSUFBSSxLQUFLLENBQUMsaUNBQWlDLElBQUksQ0FBQyxLQUFLLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQTtRQUNuRixNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLGVBQWUsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUE7UUFDekQsR0FBRyxDQUFDLFFBQVEsQ0FBQyxVQUFVLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQTtRQUN6QyxHQUFHLENBQUMsUUFBUSxDQUFDLE9BQU8sRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUE7UUFDakMsR0FBRyxDQUFDLGlCQUFpQixDQUFDLGFBQWEsRUFBRSxDQUFBO1FBQ3JDLEdBQUcsQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLGFBQWEsRUFBRSxDQUFBO1FBRWhDLElBQUksQ0FBQyxNQUFNLENBQUMsYUFBYSxDQUFDLFlBQVksQ0FBQyxlQUFlLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQTtJQUN4RSxDQUFDO0lBRUQsYUFBYSxDQUFDLENBQVE7UUFDcEIsQ0FBQyxDQUFDLGVBQWUsRUFBRSxDQUFBO1FBQ25CLENBQUMsQ0FBQyxjQUFjLEVBQUUsQ0FBQTtRQUNsQixNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLENBQUE7UUFDM0QsTUFBTSxFQUFFLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLENBQUE7UUFDbkQsSUFBSSxDQUFDLFVBQVUsQ0FBQyxZQUFZLENBQUMsR0FBRyxDQUFDLEtBQUssR0FBRyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUU7WUFDMUQsSUFBSSxDQUFDLFVBQVUsQ0FBQyxTQUFTLENBQUMsWUFBWSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUE7UUFDbEQsQ0FBQyxDQUFDLENBQUE7SUFDSixDQUFDOytHQS9CVSxTQUFTO21HQUFULFNBQVMsdU5BSVcsZ0JBQWdCLDJDQVZyQzs7O0dBR1Q7OzRGQUdVLFNBQVM7a0JBUnJCLFNBQVM7bUJBQUM7b0JBQ1QsUUFBUSxFQUFFLG9CQUFvQjtvQkFDOUIsUUFBUSxFQUFFOzs7R0FHVDtvQkFDRCxVQUFVLEVBQUUsSUFBSTtpQkFDakI7K0VBRTBCLFVBQVU7c0JBQWxDLEtBQUs7dUJBQUMsRUFBQyxRQUFRLEVBQUUsSUFBSSxFQUFDO2dCQUNFLEtBQUs7c0JBQTdCLEtBQUs7dUJBQUMsRUFBQyxRQUFRLEVBQUUsSUFBSSxFQUFDO2dCQUV5QyxTQUFTO3NCQUF4RSxTQUFTO3VCQUFDLFdBQVcsRUFBRSxFQUFDLElBQUksRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHtDb21wb25lbnQsIEVsZW1lbnRSZWYsIElucHV0LCBWaWV3Q2hpbGQsIFZpZXdDb250YWluZXJSZWZ9IGZyb20gXCJAYW5ndWxhci9jb3JlXCI7XG5pbXBvcnQge0NvbnRyb2xsZXJ9IGZyb20gXCIuLi9jb250cm9sbGVyXCI7XG5pbXBvcnQge0Jsb2NrTW9kZWx9IGZyb20gXCIuLi95anNcIjtcblxuQENvbXBvbmVudCh7XG4gIHNlbGVjdG9yOiAnZGl2W2JmLWJsb2NrLXdyYXBdJyxcbiAgdGVtcGxhdGU6IGBcbiAgICA8bmctY29udGFpbmVyICNjb250YWluZXI+PC9uZy1jb250YWluZXI+XG48IS0tICAgIDxzcGFuIHN0eWxlPVwiZGlzcGxheTogYmxvY2s7IGN1cnNvcjogdGV4dDtcIiAobW91c2Vkb3duKT1cIm9uQXBwZW5kQWZ0ZXIoJGV2ZW50KVwiPiZaZXJvV2lkdGhTcGFjZTs8L3NwYW4+LS0+XG4gIGAsXG4gIHN0YW5kYWxvbmU6IHRydWUsXG59KVxuZXhwb3J0IGNsYXNzIEJsb2NrV3JhcCB7XG4gIEBJbnB1dCh7cmVxdWlyZWQ6IHRydWV9KSBjb250cm9sbGVyITogQ29udHJvbGxlclxuICBASW5wdXQoe3JlcXVpcmVkOiB0cnVlfSkgbW9kZWwhOiBCbG9ja01vZGVsXG5cbiAgQFZpZXdDaGlsZCgnY29udGFpbmVyJywge3JlYWQ6IFZpZXdDb250YWluZXJSZWYsIHN0YXRpYzogdHJ1ZX0pIGNvbnRhaW5lciE6IFZpZXdDb250YWluZXJSZWZcblxuICBjb25zdHJ1Y3RvcihcbiAgICBwcml2YXRlIGhvc3RFbDogRWxlbWVudFJlZjxIVE1MRWxlbWVudD5cbiAgKSB7XG4gIH1cblxuICBuZ0FmdGVyVmlld0luaXQoKSB7XG4gICAgY29uc3Qgc2NoZW1hID0gdGhpcy5jb250cm9sbGVyLnNjaGVtYXMuZ2V0KHRoaXMubW9kZWwuZmxhdm91cilcbiAgICBpZiAoIXNjaGVtYSkgdGhyb3cgbmV3IEVycm9yKGBTY2hlbWEgbm90IGZvdW5kIGZvciBmbGF2b3VyOiAke3RoaXMubW9kZWwuZmxhdm91cn1gKVxuICAgIGNvbnN0IGNwciA9IHRoaXMuY29udGFpbmVyLmNyZWF0ZUNvbXBvbmVudChzY2hlbWEucmVuZGVyKVxuICAgIGNwci5pbnN0YW5jZS5jb250cm9sbGVyID0gdGhpcy5jb250cm9sbGVyXG4gICAgY3ByLnNldElucHV0KCdtb2RlbCcsIHRoaXMubW9kZWwpXG4gICAgY3ByLmNoYW5nZURldGVjdG9yUmVmLmRldGVjdENoYW5nZXMoKVxuICAgIGNwci5pbnN0YW5jZS5jZHIuZGV0ZWN0Q2hhbmdlcygpXG5cbiAgICB0aGlzLmhvc3RFbC5uYXRpdmVFbGVtZW50LnNldEF0dHJpYnV0ZSgnZGF0YS1ibG9jay1pZCcsIHRoaXMubW9kZWwuaWQpXG4gIH1cblxuICBvbkFwcGVuZEFmdGVyKGU6IEV2ZW50KSB7XG4gICAgZS5zdG9wUHJvcGFnYXRpb24oKVxuICAgIGUucHJldmVudERlZmF1bHQoKVxuICAgIGNvbnN0IHBvcyA9IHRoaXMuY29udHJvbGxlci5nZXRCbG9ja1Bvc2l0aW9uKHRoaXMubW9kZWwuaWQpXG4gICAgY29uc3QgbnAgPSB0aGlzLmNvbnRyb2xsZXIuY3JlYXRlQmxvY2soJ3BhcmFncmFwaCcpXG4gICAgdGhpcy5jb250cm9sbGVyLmluc2VydEJsb2Nrcyhwb3MuaW5kZXggKyAxLCBbbnBdKS50aGVuKCgpID0+IHtcbiAgICAgIHRoaXMuY29udHJvbGxlci5zZWxlY3Rpb24uc2V0U2VsZWN0aW9uKG5wLmlkLCAwKVxuICAgIH0pXG4gIH1cbn1cbiJdfQ==