import {NoopAnimationsModule} from "@angular/platform-browser/animations";
import {TestBed} from "@angular/core/testing";
import {CS_MODAL_DATA} from "@cses/ui";
import {FontSettingsDialogComponent} from "./font-settings-dialog.component";
import {ParagraphSettingsDialogComponent} from "./paragraph-settings-dialog.component";

describe("typography settings dialogs", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("keeps untouched mixed font fields out of the confirm patch", async () => {
    await TestBed.configureTestingModule({
      imports: [NoopAnimationsModule, FontSettingsDialogComponent],
      providers: [{
        provide: CS_MODAL_DATA,
        useValue: {
          target: "font-family",
          typography: {ff: undefined, fs: 1.25, ls: undefined},
          attrs: {
            bold: false,
            italic: false,
            underline: false,
            strike: false,
            code: false,
          },
          colors: {color: undefined, backColor: undefined},
        },
      }],
    }).compileComponents();
    const fixture = TestBed.createComponent(FontSettingsDialogComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance as any;

    expect((fixture.nativeElement as HTMLElement).getBoundingClientRect().width)
      .toBeLessThanOrEqual(320);
    expect(fixture.nativeElement.querySelectorAll("cs-select").length).toBe(2);
    expect(fixture.nativeElement.querySelector(".bc_xiahuaxian")).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain("效果");
    expect(fixture.nativeElement.textContent).not.toContain("文字缩放");
    expect(fixture.nativeElement.textContent).toContain("字符间距");
    expect(component.selectedTab()).toBe(0);
    expect(fixture.nativeElement.textContent).not.toContain("应用到：");
    expect(fixture.nativeElement.textContent).not.toContain("定位：");
    expect(fixture.nativeElement.textContent).not.toContain("恢复默认");
    expect(component.familySelectValue).toBeNull();
    expect(component.scalePercentValue).toBe(125);
    expect(component.spacingInputValue).toBeNull();
    expect(component.buildResult()).toEqual({typography: {}, attrs: {}});
    component.setFamily("kai");
    component.setFontStyle("bold-italic");

    expect(component.buildResult()).toEqual({
      typography: {ff: "kai"},
      attrs: {"a:bold": true, "a:italic": true},
    });
  });

  it("shows inherited font defaults without persisting untouched values", async () => {
    await TestBed.configureTestingModule({
      imports: [NoopAnimationsModule, FontSettingsDialogComponent],
      providers: [{
        provide: CS_MODAL_DATA,
        useValue: {
          target: "font-scale",
          typography: {ff: null, fs: null, ls: null},
          attrs: {
            bold: false,
            italic: false,
            underline: false,
            strike: false,
            code: false,
          },
          colors: {color: null, backColor: null},
        },
      }],
    }).compileComponents();
    const fixture = TestBed.createComponent(FontSettingsDialogComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance as any;

    expect(component.selectedTab()).toBe(1);
    expect(fixture.nativeElement.textContent).toContain("文字缩放");
    expect(
      fixture.nativeElement.querySelector('[data-setting-field="font-scale"]'),
    ).not.toBeNull();
    expect(component.familySelectValue).toBe(component.defaultSelectValue);
    expect(component.scalePercentValue).toBe(100);
    expect(component.spacingInputValue).toBe(0);
    expect(component.buildResult()).toEqual({typography: {}, attrs: {}});
  });

  it("builds one paragraph patch and preserves explicit zero after-spacing", async () => {
    await TestBed.configureTestingModule({
      imports: [NoopAnimationsModule, ParagraphSettingsDialogComponent],
      providers: [{
        provide: CS_MODAL_DATA,
        useValue: {
          target: "line-height",
          align: "left",
          defaults: {lineHeight: 1.5, spaceAfter: 7.5},
          paragraph: {
            lh: null,
            psb: null,
            psa: null,
          },
        },
      }],
    }).compileComponents();
    const fixture = TestBed.createComponent(ParagraphSettingsDialogComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance as any;

    expect((fixture.nativeElement as HTMLElement).getBoundingClientRect().width)
      .toBeLessThanOrEqual(640);
    expect(fixture.nativeElement.textContent).not.toContain("应用到：");
    expect(fixture.nativeElement.textContent).not.toContain("定位：");
    expect(fixture.nativeElement.querySelector(".bc_zuoduiqi")).not.toBeNull();
    expect(component.spaceBeforeValue).toBe(0);
    expect(component.spaceAfterValue).toBe(7.5);
    expect(component.lineHeightSelectValue).toBe(component.defaultLineHeightValue);
    expect(fixture.nativeElement.textContent).not.toContain("应用范围");
    expect(fixture.nativeElement.textContent).not.toContain("恢复默认");
    expect(fixture.nativeElement.textContent).not.toContain("缩进");
    expect(component.buildResult()).toEqual({patch: {}});
    component.setSpacing("psb", 12);
    component.setSpacing("psa", 0);
    component.setLineHeight(1.75);

    expect(component.buildResult()).toEqual({
      patch: {lh: 1.75, psb: 12, psa: 0},
    });
  });
});
