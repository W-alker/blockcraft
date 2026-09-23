import {PARAGRAPH_ALIGNMENT_OPTIONS} from '../../paragraph-alignment-options';
import {paragraphAlignmentStyles} from '../../../framework/block-std/typography';
import {NgStyle} from '@angular/common';
import {normalizeParagraphDecoration, paragraphDecorationStyles, ParagraphDecoration, decorationLengthMode, decorationLengthValue} from '../../../blocks/paragraph-block/decoration';
import {FormsModule} from "@angular/forms";
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  signal,
  computed,
} from "@angular/core";
import {
  CS_MODAL_DATA,
  CsColorPickerComponent,
  CsInputNumberComponent,
  CsOptionComponent,
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

type ParagraphAlign = NonNullable<ParagraphSettingsDialogData["align"]>;
const DEFAULT_LINE_HEIGHT_VALUE = "__bc_document_default__" as const;

@Component({
  selector: "bc-paragraph-settings-dialog",
  standalone: true,
  imports: [
    FormsModule,
    NgStyle,
    CsColorPickerComponent,
    CsInputNumberComponent,
    CsOptionComponent,
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
  protected readonly lengthMode = decorationLengthMode;
  protected readonly lengthValue = decorationLengthValue;
  protected readonly allowDecoration = this.data.allowDecoration ?? false;
  protected readonly decoration = signal(normalizeParagraphDecoration(this.data.decoration));
  protected readonly decorationStyle = computed(() => paragraphDecorationStyles(this.decoration(), this.align()));
  protected readonly positions = [
    {value: 'none', label: '无装饰'}, {value: 'after', label: '右侧横线'},
    {value: 'before', label: '左侧横线'}, {value: 'both', label: '两侧横线'},
    {value: 'above', label: '上方横线'}, {value: 'below', label: '下方横线'},
  ];
  protected readonly lineStyles = ['solid', 'dashed', 'dotted', 'double'];
  protected readonly lineLabels = ['实线', '虚线', '点线', '双线'];
  protected readonly sides = [{key: 'before' as const, label: '前侧'}, {key: 'after' as const, label: '后侧'}];
  protected setDecoration(key: keyof ParagraphDecoration, value: unknown): void {
    this.decoration.set(value === 'none' ? null : normalizeParagraphDecoration({
      ...(this.decoration() ?? {position: 'after'}), [key]: value,
    }));
    this.dirty.add('decoration');
  }
  protected setDecorationLength(side: 'before' | 'after', key: 'mode' | 'value', value: unknown): void {
    const current = this.decoration()?.[side];
    const mode = key === 'mode' ? value : decorationLengthMode(current);
    const amount = key === 'value' ? Number(value) : decorationLengthValue(current);
    this.setDecoration(side, mode === 'auto' ? 'auto' : `${amount}${mode === 'px' ? 'px' : '%'}`);
  }

  protected readonly alignOptions = PARAGRAPH_ALIGNMENT_OPTIONS;
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

  protected get previewAlignment() {
    return paragraphAlignmentStyles(this.align());
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
    const option = this.alignOptions.find(item => item.value === value);
    if (!option) return;
    this.align.set(option.value);
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
    if (this.allowDecoration && this.dirty.has('decoration')) patch.decoration = this.decoration();
    return {patch};
  }
}
