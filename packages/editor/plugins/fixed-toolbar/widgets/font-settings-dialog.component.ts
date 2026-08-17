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
    return `${20 * (this.scale() ?? 1)}px`;
  }

  protected get previewLetterSpacing(): string {
    return `${this.spacing() ?? 0}em`;
  }

  protected get previewFontWeight(): string {
    return this.fontStyle().includes("bold") ? "700" : "400";
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
    this.scale.set(
      value === null || value === DEFAULT_SELECT_VALUE
        ? null
        : normalizeInlineFontScale(value),
    );
    this.dirty.add("fs");
  }

  protected setSpacing(value: unknown): void {
    this.spacing.set(value === null ? null : normalizeInlineLetterSpacing(value));
    this.dirty.add("ls");
  }

  protected setFontStyle(value: unknown): void {
    if (!this.isFontStyle(value)) return;
    this.fontStyle.set(value);
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
    if (this.dirty.has("ff")) result.typography.ff = this.family();
    if (this.dirty.has("fs")) result.typography.fs = this.scale();
    if (this.dirty.has("ls")) result.typography.ls = this.spacing();

    if (this.dirty.has("font-style")) {
      result.attrs["a:bold"] = this.fontStyle().includes("bold") || null;
      result.attrs["a:italic"] = this.fontStyle().includes("italic") || null;
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
