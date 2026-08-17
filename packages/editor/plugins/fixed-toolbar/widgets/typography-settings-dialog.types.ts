import type {
  IInlineNodeAttrs,
  TypographyFontFamilyId,
} from "../../../framework";

export type FontSettingsTarget =
  | "font-family"
  | "font-scale"
  | "letter-spacing";

export type ParagraphSettingsTarget = "paragraph-align" | "line-height";

export interface FontSettingsDialogData {
  target: FontSettingsTarget;
  typography: {
    ff: TypographyFontFamilyId | null | undefined;
    fs: number | null | undefined;
    ls: number | null | undefined;
  };
  attrs: Readonly<Record<"bold" | "italic" | "underline" | "strike" | "code", boolean>>;
  colors: {
    color: string | null | undefined;
    backColor: string | null | undefined;
  };
}

export interface FontSettingsDialogResult {
  typography: Partial<{
    ff: TypographyFontFamilyId | null;
    fs: number | null;
    ls: number | null;
  }>;
  attrs: IInlineNodeAttrs;
}

export interface ParagraphSettingsDialogData {
  target: ParagraphSettingsTarget;
  align: "left" | "center" | "right" | undefined;
  defaults: {
    /** Resolved document line-height ratio. Display-only until changed. */
    lineHeight: number;
    /** Resolved document segment gap converted from CSS px to typographic pt. */
    spaceAfter: number;
  };
  paragraph: {
    lh: number | null | undefined;
    psb: number | null | undefined;
    psa: number | null | undefined;
  };
}

export interface ParagraphSettingsDialogResult {
  patch: {
    textAlign?: "center" | "right" | null;
    lh?: number | null;
    psb?: number | null;
    psa?: number | null;
  };
}
