import { Component, Input, } from "@angular/core";
import { NgForOf, NgIf } from "@angular/common";
import { BlockWrap } from "./block-wrap";
import { EditorRoot } from "./root";
import { BlockModel } from "../yjs";
import * as i0 from "@angular/core";
export class LazyEditorRoot extends EditorRoot {
    constructor() {
        super(...arguments);
        this.pagination = {
            totalCount: 1,
            pageNum: 1
        };
        this.lastEle = null;
        this.resizeObserver = new ResizeObserver((entries) => {
            const { height } = entries[0].contentRect;
            if (height < this.parentHeight) {
                this.loadMore(this.pagination.pageNum);
            }
            else {
                const lastIndex = this.model.length - 1;
                const id = this.model[lastIndex].id;
                this.lastEle && this.lastEleIntersection.unobserve(this.lastEle);
                const cpr = this.controller.getBlockRef(id);
                this.lastEleIntersection?.observe(cpr.hostEl.nativeElement);
                this.lastEle = cpr.hostEl.nativeElement;
            }
        });
    }
    get model() {
        return this.controller.rootModel;
    }
    loadMore(page) {
        console.log('loadMore', page, this.model);
        if (this.model.length >= this.pagination.totalCount) {
            this.unobserve();
            return;
        }
        return this.config.requester(page).then((res) => {
            const { data, totalCount } = res;
            this.pagination.totalCount = totalCount;
            this.pagination.pageNum++;
            this.controller.transact(() => {
                this.controller.insertBlocks(this.model.length, data.map(BlockModel.fromModel));
            }, Symbol('lazy-load'));
            this.cdr.detectChanges();
            console.log('res', res, this.pagination, this.model);
            return res;
        });
    }
    setController(controller) {
        super.setController(controller);
        this.observe();
    }
    observe() {
        this.parentEle = this.elementRef.nativeElement.parentElement;
        this.parentHeight = this.parentEle.clientHeight;
        this.lastEleIntersection = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting)
                this.loadMore(this.pagination.pageNum);
        }, {
            root: this.parentEle,
            rootMargin: '0px',
            threshold: 0.5
        });
        this.resizeObserver.observe(this.elementRef.nativeElement);
    }
    unobserve() {
        this.lastEleIntersection.disconnect();
        this.resizeObserver.disconnect();
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: LazyEditorRoot, deps: null, target: i0.ɵɵFactoryTarget.Component }); }
    static { this.ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "17.0.0", version: "17.3.12", type: LazyEditorRoot, isStandalone: true, selector: "div[bf-node-type=\"root\"][lazy-load=\"true\"]", inputs: { config: "config" }, host: { properties: { "attr.tabindex": "0" } }, usesInheritance: true, ngImport: i0, template: `
    @if (controller) {
      @for (model of controller.rootModel; track model.flavour + '-' + model.id + '-' + model.meta.createdTime) {
        <div bf-block-wrap contenteditable="false" [controller]="controller" [model]="model"></div>
      }
    }
  `, isInline: true, dependencies: [{ kind: "component", type: BlockWrap, selector: "div[bf-block-wrap]", inputs: ["controller", "model"] }] }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: LazyEditorRoot, decorators: [{
            type: Component,
            args: [{
                    selector: 'div[bf-node-type="root"][lazy-load="true"]',
                    template: `
    @if (controller) {
      @for (model of controller.rootModel; track model.flavour + '-' + model.id + '-' + model.meta.createdTime) {
        <div bf-block-wrap contenteditable="false" [controller]="controller" [model]="model"></div>
      }
    }
  `,
                    standalone: true,
                    imports: [
                        NgForOf,
                        NgIf,
                        BlockWrap,
                    ],
                    host: {
                        '[attr.tabindex]': '0'
                    }
                }]
        }], propDecorators: { config: [{
                type: Input,
                args: [{ required: true }]
            }] } });
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGF6eVJvb3QuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi9ibG9ja2Zsb3cvc3JjL2NvcmUvYmxvY2stcmVuZGVyL2xhenlSb290LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLE9BQU8sRUFBQyxTQUFTLEVBQUUsS0FBSyxHQUFFLE1BQU0sZUFBZSxDQUFDO0FBQ2hELE9BQU8sRUFBQyxPQUFPLEVBQUUsSUFBSSxFQUFDLE1BQU0saUJBQWlCLENBQUM7QUFFOUMsT0FBTyxFQUFDLFNBQVMsRUFBQyxNQUFNLGNBQWMsQ0FBQztBQUN2QyxPQUFPLEVBQUMsVUFBVSxFQUFDLE1BQU0sUUFBUSxDQUFDO0FBQ2xDLE9BQU8sRUFBQyxVQUFVLEVBQUMsTUFBTSxRQUFRLENBQUM7O0FBb0NsQyxNQUFNLE9BQU8sY0FBZSxTQUFRLFVBQVU7SUFuQjlDOztRQTBCVSxlQUFVLEdBQUc7WUFDbkIsVUFBVSxFQUFFLENBQUM7WUFDYixPQUFPLEVBQUUsQ0FBQztTQUNYLENBQUE7UUFFTyxZQUFPLEdBQXVCLElBQUksQ0FBQTtRQUtsQyxtQkFBYyxHQUFHLElBQUksY0FBYyxDQUFDLENBQUMsT0FBTyxFQUFFLEVBQUU7WUFDdEQsTUFBTSxFQUFDLE1BQU0sRUFBQyxHQUFHLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxXQUFXLENBQUE7WUFDdkMsSUFBSSxNQUFNLEdBQUcsSUFBSSxDQUFDLFlBQVksRUFBRSxDQUFDO2dCQUMvQixJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLENBQUE7WUFDeEMsQ0FBQztpQkFBTSxDQUFDO2dCQUNOLE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQTtnQkFDdkMsTUFBTSxFQUFFLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUMsQ0FBQyxFQUFFLENBQUE7Z0JBQ25DLElBQUksQ0FBQyxP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QUNmLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxVQUFVLEVBQUUsQ0FBQTtRQUNyQyxJQUFJLENBQUMsY0FBYyxDQUFDLFVBQVUsRUFBRSxDQUFBO0lBQ2xDLENBQUM7K0dBekVVLGNBQWM7bUdBQWQsY0FBYywrTUFqQmY7Ozs7OztHQU1ULDREQUtDLFNBQVM7OzRGQU1BLGNBQWM7a0JBbkIxQixTQUFTO21CQUFDO29CQUNULFFBQVEsRUFBRSw0Q0FBNEM7b0JBQ3RELFFBQVEsRUFBRTs7Ozs7O0dBTVQ7b0JBQ0QsVUFBVSxFQUFFLElBQUk7b0JBQ2hCLE9BQU8sRUFBRTt3QkFDUCxPQUFPO3dCQUNQLElBQUk7d0JBQ0osU0FBUztxQkFDVjtvQkFDRCxJQUFJLEVBQUU7d0JBQ0osaUJBQWlCLEVBQUUsR0FBRztxQkFDdkI7aUJBQ0Y7OEJBRTBCLE1BQU07c0JBQTlCLEtBQUs7dUJBQUMsRUFBQyxRQUFRLEVBQUUsSUFBSSxFQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHtDb21wb25lbnQsIElucHV0LH0gZnJvbSBcIkBhbmd1bGFyL2NvcmVcIjtcbmltcG9ydCB7TmdGb3JPZiwgTmdJZn0gZnJvbSBcIkBhbmd1bGFyL2NvbW1vblwiO1xuaW1wb3J0IHtJQmxvY2tNb2RlbH0gZnJvbSBcIi4uL3R5cGVzXCI7XG5pbXBvcnQge0Jsb2NrV3JhcH0gZnJvbSBcIi4vYmxvY2std3JhcFwiO1xuaW1wb3J0IHtFZGl0b3JSb290fSBmcm9tIFwiLi9yb290XCI7XG5pbXBvcnQge0Jsb2NrTW9kZWx9IGZyb20gXCIuLi95anNcIjtcbmltcG9ydCB7Q29udHJvbGxlcn0gZnJvbSBcIi4uL2NvbnRyb2xsZXJcIjtcblxuaW50ZXJmYWNlIElSZXF1ZXN0ZXIge1xuICAocGFnZTogbnVtYmVyKTogUHJvbWlzZTxJUmVzcG9uc2U+XG59XG5cbmludGVyZmFjZSBJUmVzcG9uc2Uge1xuICB0b3RhbENvdW50OiBudW1iZXJcbiAgZGF0YTogSUJsb2NrTW9kZWxbXVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIExhenlMb2FkQ29uZmlnIHtcbiAgcGFnZVNpemU6IG51bWJlclxuICByZXF1ZXN0ZXI6IElSZXF1ZXN0ZXJcbn1cblxuQENvbXBvbmVudCh7XG4gIHNlbGVjdG9yOiAnZGl2W2JmLW5vZGUtdHlwZT1cInJvb3RcIl1bbGF6eS1sb2FkPVwidHJ1ZVwiXScsXG4gIHRlbXBsYXRlOiBgXG4gICAgQGlmIChjb250cm9sbGVyKSB7XG4gICAgICBAZm9yIChtb2RlbCBvZiBjb250cm9sbGVyLnJvb3RNb2RlbDsgdHJhY2sgbW9kZWwuZmxhdm91ciArICctJyArIG1vZGVsLmlkICsgJy0nICsgbW9kZWwubWV0YS5jcmVhdGVkVGltZSkge1xuICAgICAgICA8ZGl2IGJmLWJsb2NrLXdyYXAgY29udGVudGVkaXRhYmxlPVwiZmFsc2VcIiBbY29udHJvbGxlcl09XCJjb250cm9sbGVyXCIgW21vZGVsXT1cIm1vZGVsXCI+PC9kaXY+XG4gICAgICB9XG4gICAgfVxuICBgLFxuICBzdGFuZGFsb25lOiB0cnVlLFxuICBpbXBvcnRzOiBbXG4gICAgTmdGb3JPZixcbiAgICBOZ0lmLFxuICAgIEJsb2NrV3JhcCxcbiAgXSxcbiAgaG9zdDoge1xuICAgICdbYXR0ci50YWJpbmRleF0nOiAnMCdcbiAgfVxufSlcbmV4cG9ydCBjbGFzcyBMYXp5RWRpdG9yUm9vdCBleHRlbmRzIEVkaXRvclJvb3Qge1xuICBASW5wdXQoe3JlcXVpcmVkOiB0cnVlfSkgY29uZmlnITogTGF6eUxvYWRDb25maWdcblxuICBnZXQgbW9kZWwoKSB7XG4gICAgcmV0dXJuIHRoaXMuY29udHJvbGxlci5yb290TW9kZWxcbiAgfVxuXG4gIHByaXZhdGUgcGFnaW5hdGlvbiA9IHtcbiAgICB0b3RhbENvdW50OiAxLFxuICAgIHBhZ2VOdW06IDFcbiAgfVxuXG4gIHByaXZhdGUgbGFzdEVsZTogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbFxuICBwcml2YXRlIHBhcmVudEVsZSE6IEhUTUxFbGVtZW50XG4gIHByaXZhdGUgcGFyZW50SGVpZ2h0ITogbnVtYmVyXG5cbiAgcHJpdmF0ZSBsYXN0RWxlSW50ZXJzZWN0aW9uITogSW50ZXJzZWN0aW9uT2JzZXJ2ZXJcbiAgcHJpdmF0ZSByZXNpemVPYnNlcnZlciA9IG5ldyBSZXNpemVPYnNlcnZlcigoZW50cmllcykgPT4ge1xuICAgIGNvbnN0IHtoZWlnaHR9ID0gZW50cmllc1swXS5jb250ZW50UmVjdFxuICAgIGlmIChoZWlnaHQgPCB0aGlzLnBhcmVudEhlaWdodCkge1xuICAgICAgdGhpcy5sb2FkTW9yZSh0aGlzLnBhZ2luYXRpb24ucGFnZU51bSlcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc3QgbGFzdEluZGV4ID0gdGhpcy5tb2RlbC5sZW5ndGggLSAxXG4gICAgICBjb25zdCBpZCA9IHRoaXMubW9kZWxbbGFzdEluZGV4XS5pZFxuICAgICAgdGhpcy5sYXN0RWxlICYmIHRoaXMubGFzdEVsZUludGVyc2VjdGlvbi51bm9ic2VydmUodGhpcy5sYXN0RWxlKVxuICAgICAgY29uc3QgY3ByID0gdGhpcy5jb250cm9sbGVyLmdldEJsb2NrUmVmKGlkKSFcbiAgICAgIHRoaXMubGFzdEVsZUludGVyc2VjdGlvbj8ub2JzZXJ2ZShjcHIuaG9zdEVsLm5hdGl2ZUVsZW1lbnQpXG4gICAgICB0aGlzLmxhc3RFbGUgPSBjcHIuaG9zdEVsLm5hdGl2ZUVsZW1lbnRcbiAgICB9XG4gIH0pXG5cbiAgcHJpdmF0ZSBsb2FkTW9yZShwYWdlOiBudW1iZXIpIHtcbiAgICBjb25zb2xlLmxvZygnbG9hZE1vcmUnLCBwYWdlLCB0aGlzLm1vZGVsKVxuICAgIGlmICh0aGlzLm1vZGVsLmxlbmd0aCA+PSB0aGlzLnBhZ2luYXRpb24udG90YWxDb3VudCkge1xuICAgICAgdGhpcy51bm9ic2VydmUoKVxuICAgICAgcmV0dXJuXG4gICAgfVxuICAgIHJldHVybiB0aGlzLmNvbmZpZy5yZXF1ZXN0ZXIocGFnZSkudGhlbigocmVzKSA9PiB7XG4gICAgICBjb25zdCB7ZGF0YSwgdG90YWxDb3VudH0gPSByZXNcbiAgICAgIHRoaXMucGFnaW5hdGlvbi50b3RhbENvdW50ID0gdG90YWxDb3VudFxuICAgICAgdGhpcy5wYWdpbmF0aW9uLnBhZ2VOdW0rK1xuICAgICAgdGhpcy5jb250cm9sbGVyLnRyYW5zYWN0KCgpID0+IHtcbiAgICAgICAgdGhpcy5jb250cm9sbGVyLmluc2VydEJsb2Nrcyh0aGlzLm1vZGVsLmxlbmd0aCwgZGF0YS5tYXAoQmxvY2tNb2RlbC5mcm9tTW9kZWwpKVxuICAgICAgfSwgU3ltYm9sKCdsYXp5LWxvYWQnKSlcbiAgICAgIHRoaXMuY2RyLmRldGVjdENoYW5nZXMoKVxuICAgICAgY29uc29sZS5sb2coJ3JlcycsIHJlcywgdGhpcy5wYWdpbmF0aW9uLCB0aGlzLm1vZGVsKVxuICAgICAgcmV0dXJuIHJlc1xuICAgIH0pXG4gIH1cblxuICBvdmVycmlkZSBzZXRDb250cm9sbGVyKGNvbnRyb2xsZXI6IENvbnRyb2xsZXIpIHtcbiAgICBzdXBlci5zZXRDb250cm9sbGVyKGNvbnRyb2xsZXIpXG4gICAgdGhpcy5vYnNlcnZlKClcbiAgfVxuXG4gIHByaXZhdGUgb2JzZXJ2ZSgpIHtcbiAgICB0aGlzLnBhcmVudEVsZSA9IHRoaXMuZWxlbWVudFJlZi5uYXRpdmVFbGVtZW50LnBhcmVudEVsZW1lbnQhXG4gICAgdGhpcy5wYXJlbnRIZWlnaHQgPSB0aGlzLnBhcmVudEVsZS5jbGllbnRIZWlnaHRcblxuICAgIHRoaXMubGFzdEVsZUludGVyc2VjdGlvbiA9IG5ldyBJbnRlcnNlY3Rpb25PYnNlcnZlcigoZW50cmllcykgPT4ge1xuICAgICAgaWYgKGVudHJpZXNbMF0uaXNJbnRlcnNlY3RpbmcpIHRoaXMubG9hZE1vcmUodGhpcy5wYWdpbmF0aW9uLnBhZ2VOdW0pXG4gICAgfSwge1xuICAgICAgcm9vdDogdGhpcy5wYXJlbnRFbGUsXG4gICAgICByb290TWFyZ2luOiAnMHB4JyxcbiAgICAgIHRocmVzaG9sZDogMC41XG4gICAgfSlcblxuICAgIHRoaXMucmVzaXplT2JzZXJ2ZXIub2JzZXJ2ZSh0aGlzLmVsZW1lbnRSZWYubmF0aXZlRWxlbWVudClcbiAgfVxuXG4gIHByaXZhdGUgdW5vYnNlcnZlKCkge1xuICAgIHRoaXMubGFzdEVsZUludGVyc2VjdGlvbi5kaXNjb25uZWN0KClcbiAgICB0aGlzLnJlc2l6ZU9ic2VydmVyLmRpc2Nvbm5lY3QoKVxuICB9XG59XG4iXX0=