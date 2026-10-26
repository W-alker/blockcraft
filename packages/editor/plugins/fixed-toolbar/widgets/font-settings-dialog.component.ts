import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  signal,
} from "@angular/core";
import {
  CS_MODAL_DATA,
  CsColorPickerComponent,
  CsInputNumberComponent,
  CsOptionComponent,
  CsSelectComponent,
  CsTabComponent,
  CsTabsComponent,
} from "@cses/ui";
import {
  TYPOGRAPHY_FONT_FAMILIES,
  isTypographyFontFamilyId,
  normalizeInlineFontScale,
  normalizeInlineFontWeight,
  normalizeFontSizePixels,
  normalizeInlineLetterSpacing,
  resolveTypographyFontFamily,
  type TypographyFontFamilyId,
} from "../../../framework";
import type {
  FontSettingsDialogData,
  FontSettingsDialogResult,
} from "./typography-settings-dialog.types";

type FontStyleValue = "regular" | "bold" | "italic" | "bold-italic";
const DEFAULT_SELECT_VALUE = "__bc_document_default__" as const;

@Component({
  selector: "bc-font-settings-dialog",
  standalone: true,
  imports: [
    CsColorPickerComponent,
    CsInputNumberComponent,
    CsOptionComponent,
    CsSelectComponent,
    CsTabComponent,
    CsTabsComponent,
  ],
  templateUrl: "./font-settings-dialog.component.html",
  styleUrl: "./font-settings-dialog.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {contenteditable: "false"},
})
export class FontSettingsDialogComponent {
  private readonly data = inject(CS_MODAL_DATA) as FontSettingsDialogData;
  private readonly host = inject(ElementRef) as ElementRef<HTMLElement>;
  private readonly dirty = new Set<string>();

  protected readonly fonts = TYPOGRAPHY_FONT_FAMILIES;
  protected readonly defaultSelectValue = DEFAULT_SELECT_VALUE;
  protected readonly selectedTab = signal(
    this.isCharacterSpacingTarget() ? 1 : 0,
  );
  protected readonly family = signal<TypographyFontFamilyId | null>(
    this.data.typography.ff ?? null,
  );
  protected readonly fontSize = signal<number | null>(this.data.fontSize ?? null);
  protected readonly weight = signal<number | null>(
    'fontWeight' in this.data ? this.data.fontWeight ?? null : this.data.attrs.bold ? 700 : null,
  );
  private readonly weightInitiallyMixed = 'fontWeight' in this.data && this.data.fontWeight === undefined;
  protected readonly weightOptions = [
    {value: 100, label: '极细 100'}, {value: 200, label: '特细 200'},
    {value: 300, label: '细体 300'}, {value: 400, label: '常规 400'},
    {value: 500, label: '中等 500'}, {value: 600, label: '半粗 600'},
    {value: 700, label: '粗体 700'}, {value: 800, label: '特粗 800'},
    {value: 900, label: '极粗 900'},
  ];
  protected get weightSelectValue(): number | string | null {
    return this.weightInitiallyMixed && !this.dirty.has('font-weight')
      ? null : this.weight() ?? DEFAULT_SELECT_VALUE;
  }
  protected get weightPlaceholder(): string {
    return this.weightInitiallyMixed && !this.dirty.has('font-weight') ? '多种字重' : '文档默认';
  }
  protected get customWeight(): number | null {
    const weight = this.weight();
    return weight !== null && !this.weightOptions.some(option => option.value === weight) ? weight : null;
  }
  protected setWeight(value: unknown): void {
    const weight = value === DEFAULT_SELECT_VALUE ? null : normalizeInlineFontWeight(value);
    if (value !== DEFAULT_SELECT_VALUE && weight === null) return;
    this.weight.set(weight);
    this.dirty.add('font-weight');
    this.fontStyle.set(this.resolveFontStyle(weight !== null && weight >= 600, this.fontStyle().includes('italic')));
  }
  protected readonly scale = signal<number | null>(
    this.data.typography.fs ?? null,
  );
  protected readonly spacing = signal<number | null>(
    this.data.typography.ls ?? null,
  );
  protected readonly color = signal<string | null>(this.data.colors.color ?? null);
  protected readonly highlight = signal<string | null>(
    this.data.colors.backColor ?? null,
  );
  protected readonly fontStyle = signal<FontStyleValue>(
    this.resolveFontStyle(this.data.attrs.bold, this.data.attrs.italic),
  );
  protected readonly underline = signal(this.data.attrs.underline);
  protected readonly strike = signal(this.data.attrs.strike);
  protected readonly code = signal(this.data.attrs.code);

  private readonly familyInitiallyMixed = this.data.typography.ff === undefined;
  private readonly scaleInitiallyMixed = this.data.typography.fs === undefined;
  private readonly spacingInitiallyMixed = this.data.typography.ls === undefined;

  protected readonly styleOptions: readonly {
    label: string;
    value: FontStyleValue;
  }[] = [
    {label: "常规", value: "regular"},
    {label: "加粗", value: "bold"},
    {label: "倾斜", value: "italic"},
    {label: "粗斜体", value: "bold-italic"},
  ];
  protected get familySelectValue(): TypographyFontFamilyId | typeof DEFAULT_SELECT_VALUE | null {
    if (this.familyInitiallyMixed && !this.dirty.has("ff")) return null;
    return this.family() ?? DEFAULT_SELECT_VALUE;
  }

  protected get scalePercentValue(): number | null {
    if (this.scaleInitiallyMixed && !this.dirty.has("fs")) return null;
    return (this.scale() ?? 1) * 100;
  }

  protected get spacingInputValue(): number | null {
    if (this.spacingInitiallyMixed && !this.dirty.has("ls")) return null;
    return this.spacing() ?? 0;
  }

  protected get familyPlaceholder(): string {
    return this.familyInitiallyMixed && !this.dirty.has("ff")
      ? "多种字体"
      : "文档默认";
  }

  protected get scalePlaceholder(): string {
    return this.scaleInitiallyMixed && !this.dirty.has("fs")
      ? "多种缩放"
      : "文档默认";
  }

  protected get spacingPlaceholder(): string {
    return this.spacingInitiallyMixed && !this.dirty.has("ls")
      ? "多种间距"
      : "0";
  }

  protected get previewFontFamily(): string {
    return this.code()
      ? '"SFMono-Regular", Consolas, "Liberation Mono", monospace'
      : resolveTypographyFontFamily(this.family()) ?? "inherit";
  }

  protected get previewFontSize(): string {
    return `${this.fontSize() ?? 20 * (this.scale() ?? 1)}px`;
  }

  protected setFontSize(value: unknown): void {
    this.fontSize.set(value === null ? null : normalizeFontSizePixels(value));
    this.dirty.add('fontSize');
  }

  protected get previewLetterSpacing(): string {
    return `${this.spacing() ?? 0}em`;
  }

  protected get previewFontWeight(): string {
    return String(this.weight() ?? (this.fontStyle().includes("bold") ? 700 : 400));
  }

  protected get previewFontStyle(): string {
    return this.fontStyle().includes("italic") ? "italic" : "normal";
  }

  protected get previewDecoration(): string {
    return [
      this.underline() ? "underline" : "",
      this.strike() ? "line-through" : "",
    ].filter(Boolean).join(" ") || "none";
  }

  protected setFamily(value: unknown): void {
    this.family.set(isTypographyFontFamilyId(value) ? value : null);
    this.dirty.add("ff");
  }

  protected setScale(value: unknown): void {
    const previous = this.scale() ?? 1;
    const next = value === null || value === DEFAULT_SELECT_VALUE ? null : normalizeInlineFontScale(value);
    const pixels = this.fontSize();
    if (pixels !== null) this.fontSize.set(Math.round(pixels / previous * (next ?? 1) * 1000) / 1000);
    this.scale.set(next);
    this.dirty.add("fs");
  }

  protected setSpacing(value: unknown): void {
    this.spacing.set(value === null ? null : normalizeInlineLetterSpacing(value));
    this.dirty.add("ls");
  }

  protected setFontStyle(value: unknown): void {
    if (!this.isFontStyle(value)) return;
    const wasBold = this.fontStyle().includes('bold');
    this.fontStyle.set(value);
    if (wasBold !== value.includes('bold')) this.setWeight(value.includes('bold') ? 700 : 400);
    this.dirty.add("font-style");
  }

  protected setColor(value: string | null): void {
    this.color.set(value);
    this.dirty.add("color");
  }

  protected setHighlight(value: string | null): void {
    this.highlight.set(value);
    this.dirty.add("highlight");
  }

  focusTarget(): void {
    this.selectedTab.set(this.isCharacterSpacingTarget() ? 1 : 0);
    queueMicrotask(() => {
      const field = this.host.nativeElement.querySelector<HTMLElement>(
        `[data-setting-field="${this.data.target}"]`,
      );
      if (!field) return;
      field.classList.add("bc-settings-field--located");
      field.scrollIntoView({block: "center"});
      const focusable = field.matches("button,input,[tabindex]")
        ? field
        : field.querySelector<HTMLElement>(
            "input,button,[tabindex]:not([tabindex='-1']),cs-select,cs-input-number",
          );
      focusable?.focus();
      setTimeout(() => field.classList.remove("bc-settings-field--located"), 1400);
    });
  }

  buildResult(): FontSettingsDialogResult {
    const result: FontSettingsDialogResult = {typography: {}, attrs: {}};
    if (this.dirty.has('fontSize')) result.fontSize = this.fontSize();
    if (this.dirty.has("ff")) result.typography.ff = this.family();
    if (this.dirty.has("fs")) result.typography.fs = this.scale();
    if (this.dirty.has("ls")) result.typography.ls = this.spacing();

    if (this.dirty.has("font-style")) {
      result.attrs["a:italic"] = this.fontStyle().includes("italic") || null;
    }
    if (this.dirty.has('font-weight')) {
      const weight = this.weight();
      result.attrs['s:fontWeight'] = weight === null ? null : String(weight);
      result.attrs['a:bold'] = weight !== null && weight >= 600 ? true : null;
    }
    if (this.dirty.has("color")) result.attrs["s:color"] = this.color();
    if (this.dirty.has("highlight")) {
      result.attrs["s:background"] = this.highlight();
    }
    return result;
  }

  private resolveFontStyle(bold: boolean, italic: boolean): FontStyleValue {
    if (bold && italic) return "bold-italic";
    if (bold) return "bold";
    if (italic) return "italic";
    return "regular";
  }

  private isFontStyle(value: unknown): value is FontStyleValue {
    return value === "regular" || value === "bold" ||
      value === "italic" || value === "bold-italic";
  }

  private isCharacterSpacingTarget(): boolean {
    return this.data.target === "font-scale" ||
      this.data.target === "letter-spacing";
  }
}
