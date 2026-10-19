import type {ParagraphDecoration} from '../../../blocks/paragraph-block/decoration'
import type {
  IInlineNodeAttrs,
  IBlockProps,
  TypographyFontFamilyId,
} from "../../../framework";

export type FontSettingsTarget =
  | "font-size"
  | "font-family"
  | "font-scale"
  | "letter-spacing";

export type ParagraphSettingsTarget = "paragraph-align" | "line-height" | "paragraph-spacing";

export interface FontSettingsDialogData {
  target: FontSettingsTarget;
  /** Effective pixels; undefined means mixed. */
  fontSize?: number;
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
  /** Only present when the user edited the actual pixel size. null inherits. */
  fontSize?: number | null;
  typography: Partial<{
    ff: TypographyFontFamilyId | null;
    fs: number | null;
    ls: number | null;
  }>;
  attrs: IInlineNodeAttrs;
}

export interface ParagraphSettingsDialogData {
  decoration?: ParagraphDecoration | null;
  allowDecoration?: boolean;
  allowTextSettings?: boolean;
  target: ParagraphSettingsTarget;
  align: IBlockProps["textAlign"] | "left";
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
    decoration?: ParagraphDecoration | null;
    textAlign?: IBlockProps["textAlign"] | null;
    lh?: number | null;
    psb?: number | null;
    psa?: number | null;
  };
}
