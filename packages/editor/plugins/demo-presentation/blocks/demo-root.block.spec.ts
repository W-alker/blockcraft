import {reflectComponentType} from "@angular/core";
import {RootBlockComponent} from "../../../blocks/root-block/root.block";
import {BaseBlockComponent} from "../../../framework";
import {DemoRootComponent} from "./demo-root.block";

describe("DemoRootComponent", () => {
  it("uses a presentation-only root instead of inheriting editor root behavior", () => {
    expect(DemoRootComponent.prototype instanceof BaseBlockComponent).toBeTrue();
    expect(DemoRootComponent.prototype instanceof RootBlockComponent).toBeFalse();
    const selector = reflectComponentType(DemoRootComponent)?.selector ?? '';
    expect(selector).toContain('div');
    expect(selector).toContain('.demo-root');
    expect(selector).toContain('[data-blockcraft-root="true"]');
    expect(selector).toContain('[data-bc-surface="presentation"]');
  });

  it("projects the same compact document typography as the authoring root", () => {
    const component = Object.create(DemoRootComponent.prototype) as any;
    component._native = {
      props: {ff: "kai", fs: 18, lh: 1.75},
    };

    expect(component.documentFontFamily).toContain("Kaiti SC");
    expect(component.documentFontSize).toBe("18px");
    expect(component.documentLineHeight).toBe("1.75");
  });
});
