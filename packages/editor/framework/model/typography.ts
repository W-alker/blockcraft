/** Compact, semantic typography attributes persisted on inline Delta runs. */
export const INLINE_TYPOGRAPHY_ATTRS = {
  fontFamily: "t:ff",
  fontScale: "t:fs",
  /** Fixed base size in CSS pixels; composes with both paragraph and inline scales. */
  fontSize: "t:px",
  letterSpacing: "t:ls",
} as const;

export type InlineTypographyAttr =
  (typeof INLINE_TYPOGRAPHY_ATTRS)[keyof typeof INLINE_TYPOGRAPHY_ATTRS];

export type InlineTypographyKey = "ff" | "fs" | "px" | "ls";

export type TypographyFontFamilyId =
  | "sans"
  | "arial"
  | "calibri"
  | "verdana"
  | "tahoma"
  | "hei"
  | "yahei"
  | "pingfang"
  | "serif"
  | "times"
  | "georgia"
  | "simsun"
  | "kai"
  | "xingkai"
  | "fang"
  | "dengxian"
  | "lishu"
  | "youyuan"
  | "cambria"
  | "palatino"
  | "trebuchet"
  | "courier"
  | "mono";
