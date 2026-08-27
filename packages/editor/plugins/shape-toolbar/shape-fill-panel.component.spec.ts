import { TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { CsSelectComponent } from "@cses/ui";
import {
  createObjectPaint,
  DEFAULT_OBJECT_PAINT,
  type ObjectPaint,
} from "../../framework";
import { SHAPE_FILL_GRADIENT_PRESETS } from "../../blocks/shape-block";
import { ShapeFillPanelComponent } from "./shape-fill-panel.component";

describe("ShapeFillPanelComponent unified paint adapter", () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ShapeFillPanelComponent],
    }).compileComponents();
  });

  it("keeps the established preset surface and emits one canonical paint value", () => {
    const fixture = TestBed.createComponent(ShapeFillPanelComponent);
    const paint: ObjectPaint = {
      type: "linear-gradient",
      opacity: 1,
      angle: 180,
      stops: [
        { color: "#FFFFFF", offset: 0, opacity: 1 },
        { color: "#000000", offset: 1, opacity: 1 },
      ],
    };
    fixture.componentRef.setInput("paint", paint);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(fixture.debugElement.query(By.directive(CsSelectComponent))).not.toBeNull();
    expect(host.textContent).toContain("起始颜色");
    expect(host.textContent).toContain("结束颜色");
    expect(host.textContent).toContain("渐变角度");
    expect(
      host.querySelectorAll(".shape-fill-panel__preset").length,
    ).toBe(SHAPE_FILL_GRADIENT_PRESETS.length);

    let emitted: ObjectPaint | undefined;
    fixture.componentInstance.paintChange.subscribe((value) => {
      emitted = value;
    });
    fixture.componentInstance.applyPreset(SHAPE_FILL_GRADIENT_PRESETS[0]);

    expect(emitted?.type).toBe("linear-gradient");
    if (emitted?.type !== "linear-gradient") return;
    expect(emitted.stops.map((stop) => stop.color)).toEqual([
      ...SHAPE_FILL_GRADIENT_PRESETS[0].colors,
    ]);
    expect(emitted.stops.map((stop) => stop.offset)).toEqual([
      ...SHAPE_FILL_GRADIENT_PRESETS[0].stops,
    ]);
  });

  it("switches the complete paint mode from the CSES select value", () => {
    const fixture = TestBed.createComponent(ShapeFillPanelComponent);
    fixture.componentRef.setInput("paint", {
      ...DEFAULT_OBJECT_PAINT,
      type: "solid",
    });
    fixture.detectChanges();

    let emitted: ObjectPaint | undefined;
    fixture.componentInstance.paintChange.subscribe((value) => {
      emitted = value;
    });
    fixture.componentInstance.setFillType("picture");

    expect(emitted).toEqual(createObjectPaint("picture"));
  });
});
