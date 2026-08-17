import {FormsModule} from "@angular/forms";
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  signal,
} from "@angular/core";
import {
  CS_MODAL_DATA,
  CsInputNumberComponent,
  CsOptionComponent,
  CsSegmentedComponent,
  CsSegmentedItemComponent,
  CsSelectComponent,
} from "@cses/ui";
import {
  PARAGRAPH_LINE_HEIGHT_PRESETS,
  normalizeParagraphSpacing,
  normalizeTypographyLineHeight,
} from "../../../framework";
import type {
  ParagraphSettingsDialogData,
  ParagraphSettingsDialogResult,
} from "./typography-settings-dialog.types";

type ParagraphAlign = "left" | "center" | "right";
const DEFAULT_LINE_HEIGHT_VALUE = "__bc_document_default__" as const;

@Component({
  selector: "bc-paragraph-settings-dialog",
  standalone: true,
  imports: [
    FormsModule,
    CsInputNumberComponent,
    CsOptionComponent,
    CsSegmentedComponent,
    CsSegmentedItemComponent,
    CsSelectComponent,
  ],
  templateUrl: "./paragraph-settings-dialog.component.html",
  styleUrl: "./paragraph-settings-dialog.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {contenteditable: "false"},
})
export class ParagraphSettingsDialogComponent {
  private readonly data = inject(CS_MODAL_DATA) as ParagraphSettingsDialogData;
  private readonly host = inject(ElementRef) as ElementRef<HTMLElement>;
  private readonly dirty = new Set<string>();

  protected readonly lineHeights = PARAGRAPH_LINE_HEIGHT_PRESETS;
  protected readonly defaultLineHeightValue = DEFAULT_LINE_HEIGHT_VALUE;
  protected readonly align = signal<ParagraphAlign>(this.data.align ?? "left");
  protected readonly spaceBefore = signal<number | null>(
    this.data.paragraph.psb ?? null,
  );
  protected readonly spaceAfter = signal<number | null>(
    this.data.paragraph.psa ?? null,
  );
  protected readonly lineHeight = signal<number | null>(
    this.data.paragraph.lh ?? null,
  );

  private readonly spaceBeforeInitiallyMixed = this.data.paragraph.psb === undefined;
  private readonly spaceAfterInitiallyMixed = this.data.paragraph.psa === undefined;
  private readonly lineHeightInitiallyMixed = this.data.paragraph.lh === undefined;

  protected get spaceBeforeValue(): number | null {
    if (this.spaceBeforeInitiallyMixed && !this.dirty.has("psb")) return null;
    return this.spaceBefore() ?? 0;
  }

  protected get spaceAfterValue(): number | null {
    if (this.spaceAfterInitiallyMixed && !this.dirty.has("psa")) return null;
    return this.spaceAfter() ?? this.data.defaults.spaceAfter;
  }

  protected get lineHeightSelectValue(): number | typeof DEFAULT_LINE_HEIGHT_VALUE | null {
    if (this.lineHeightInitiallyMixed && !this.dirty.has("lh")) return null;
    return this.lineHeight() ?? DEFAULT_LINE_HEIGHT_VALUE;
  }

  protected get defaultLineHeightLabel(): string {
    return `文档默认（${this.data.defaults.lineHeight} 倍）`;
  }

  protected get lineHeightPlaceholder(): string {
    return this.lineHeightInitiallyMixed && !this.dirty.has("lh")
      ? "多种行距"
      : this.defaultLineHeightLabel;
  }

  protected get mixedNumberPlaceholder(): string {
    return "多种值";
  }

  protected get previewTextAlign(): string {
    return this.align();
  }

  protected get previewLineHeight(): string {
    return `${this.lineHeight() ?? this.data.defaults.lineHeight}`;
  }

  protected get previewSpaceBefore(): string {
    return `${this.spaceBefore() ?? 0}pt`;
  }

  protected get previewSpaceAfter(): string {
    return `${this.spaceAfter() ?? this.data.defaults.spaceAfter}pt`;
  }

  protected setAlign(value: unknown): void {
    if (value !== "left" && value !== "center" && value !== "right") return;
    this.align.set(value);
    this.dirty.add("textAlign");
  }

  protected setSpacing(key: "psb" | "psa", value: unknown): void {
    const normalized = value === null ? null : normalizeParagraphSpacing(value);
    (key === "psb" ? this.spaceBefore : this.spaceAfter).set(normalized);
    this.dirty.add(key);
  }

  protected setLineHeight(value: unknown): void {
    this.lineHeight.set(
      value === null || value === DEFAULT_LINE_HEIGHT_VALUE
        ? null
        : normalizeTypographyLineHeight(value),
    );
    this.dirty.add("lh");
  }

  focusTarget(): void {
    queueMicrotask(() => {
      const field = this.host.nativeElement.querySelector<HTMLElement>(
        `[data-setting-field="${this.data.target}"]`,
      );
      if (!field) return;
      field.classList.add("bc-settings-field--located");
      field.scrollIntoView({block: "center"});
      const focusable = field.querySelector<HTMLElement>(
        "input,button,[tabindex]:not([tabindex='-1']),cs-select,cs-input-number,cs-segmented",
      ) ?? field;
      focusable.focus();
      setTimeout(() => field.classList.remove("bc-settings-field--located"), 1400);
    });
  }

  buildResult(): ParagraphSettingsDialogResult {
    const patch: ParagraphSettingsDialogResult["patch"] = {};
    if (this.dirty.has("textAlign")) {
      const align = this.align();
      patch.textAlign = align === "left" ? null : align;
    }
    if (this.dirty.has("lh")) patch.lh = this.lineHeight();
    if (this.dirty.has("psb")) {
      patch.psb = this.spaceBefore() === 0 ? null : this.spaceBefore();
    }
    if (this.dirty.has("psa")) patch.psa = this.spaceAfter();
    return {patch};
  }
}
