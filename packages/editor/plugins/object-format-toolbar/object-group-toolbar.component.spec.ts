import { TestBed } from "@angular/core/testing";
import { ObjectGroupToolbarComponent } from "./object-group-toolbar.component";

describe("ObjectGroupToolbarComponent", () => {
  it("restores the compact horizontal multi-object toolbar", async () => {
    await TestBed.configureTestingModule({
      imports: [ObjectGroupToolbarComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(ObjectGroupToolbarComponent);
    fixture.componentRef.setInput("canGroup", true);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('[aria-label="左对齐"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="水平居中"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="组合"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="组合"] i')?.classList).toContain(
      "bc_combination",
    );
    expect(
      getComputedStyle(host.querySelector(".object-group-toolbar")!).display,
    ).toBe("flex");
  });

  it("restores group layout, hierarchy and ungroup actions", async () => {
    await TestBed.configureTestingModule({
      imports: [ObjectGroupToolbarComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(ObjectGroupToolbarComponent);
    fixture.componentRef.setInput("mode", "ungroup");
    fixture.componentRef.setInput("objectLayout", "top-bottom");
    fixture.componentRef.setInput("canUngroup", true);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;

    expect(
      host.querySelector('[aria-label="上下型"]')?.getAttribute("aria-pressed"),
    ).toBe("true");
    expect(host.querySelector('[aria-label="上移一层"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="下移一层"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="取消组合"]')).not.toBeNull();
  });
});
