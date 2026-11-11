import { TestBed } from "@angular/core/testing";
import { ObjectGroupToolbarComponent } from "./object-group-toolbar.component";

describe("ObjectGroupToolbarComponent", () => {
  it("restores the compact horizontal multi-object toolbar", async () => {
    await TestBed.configureTestingModule({
      imports: [ObjectGroupToolbarComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(ObjectGroupToolbarComponent);
    fixture.componentRef.setInput("mode", "group");
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

  it("opens group layout and hierarchy from the two-entry rail", async () => {
    await TestBed.configureTestingModule({
      imports: [ObjectGroupToolbarComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(ObjectGroupToolbarComponent);
    fixture.componentRef.setInput("mode", "ungroup");
    fixture.componentRef.setInput("objectLayout", "top-bottom");
    fixture.componentRef.setInput("canUngroup", true);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelectorAll('.object-format__rail button').length).toBe(2);
    expect(host.querySelector('.object-format__panel')).toBeNull();
    const layout = host.querySelector<HTMLButtonElement>('[aria-label="布局"]')!;
    layout.click();
    fixture.detectChanges();
    expect(layout.getAttribute('aria-expanded')).toBe('true');
    expect(
      host.querySelector('[aria-label="上下型"]')?.getAttribute("aria-pressed"),
    ).toBe("true");
    expect(host.querySelector('[aria-label="上移一层"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="下移一层"]')).not.toBeNull();
    const actions = spyOn(fixture.componentInstance.action, 'emit');
    host.querySelector<HTMLButtonElement>('[aria-label="上下型"]')!.click();
    expect(actions).toHaveBeenCalledWith({name: 'object-layout', value: 'top-bottom'});
    expect(host.querySelector<HTMLButtonElement>('[aria-label="上移一层"]')!.disabled).toBeTrue();
    host.querySelector<HTMLButtonElement>('[aria-label="解除组合"]')!.click();
    expect(actions).toHaveBeenCalledWith('ungroup');
    layout.click();
    fixture.detectChanges();
    expect(host.querySelector('.object-format__panel')).toBeNull();
    expect(layout.getAttribute('aria-expanded')).toBe('false');
  });
  it("clears secondary settings when the shared state collapses and hides unavailable ungroup", async () => {
    await TestBed.configureTestingModule({imports: [ObjectGroupToolbarComponent]}).compileComponents();
    const fixture = TestBed.createComponent(ObjectGroupToolbarComponent);
    fixture.componentRef.setInput('mode', 'ungroup');
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const state = fixture.componentInstance.toolbarState;
    host.querySelector<HTMLButtonElement>('[aria-label="布局"]')!.click();
    fixture.detectChanges();
    expect(host.querySelector('.object-format__panel')).not.toBeNull();
    expect(host.querySelector('[aria-label="解除组合"]')).toBeNull();
    state.setCollapsed(true);
    fixture.detectChanges();
    expect(host.querySelector('[data-bc-group-format-toolbar]')).toBeNull();
    state.setCollapsed(false);
    fixture.detectChanges();
    expect(host.querySelector('.object-format__panel')).toBeNull();
    expect(host.querySelectorAll('.object-format__rail button').length).toBe(1);
    fixture.componentRef.setInput('canUngroup', true);
    fixture.detectChanges();
    expect(host.querySelector('[aria-label="解除组合"]')).not.toBeNull();
  });
});
