import {ChangeDetectorRef} from "@angular/core";
import {DemoControlBarComponent} from "./demo-control-bar.component";

describe("DemoControlBarComponent", () => {
  it("emits paginated zoom actions", () => {
    const component = new DemoControlBarComponent({
      markForCheck: jasmine.createSpy("markForCheck"),
    } as unknown as ChangeDetectorRef);
    component.pinned = true;
    const actions: string[] = [];
    component.zoomIn.subscribe(() => actions.push("in"));
    component.zoomOut.subscribe(() => actions.push("out"));
    component.fitPage.subscribe(() => actions.push("fit"));

    component.onZoomIn();
    component.onZoomOut();
    component.onFitPage();

    expect(actions).toEqual(["in", "out", "fit"]);
  });
});
