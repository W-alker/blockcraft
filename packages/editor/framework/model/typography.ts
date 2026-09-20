/** Compact, semantic typography attributes persisted on inline Delta runs. */
export const INLINE_TYPOGRAPHY_ATTRS = {
  fontFamily: "t:ff",
  fontScale: "t:fs",
  letterSpacing: "t:ls",
} as const;

export type InlineTypographyAttr =
  (typeof INLINE_TYPOGRAPHY_ATTRS)[keyof typeof INLINE_TYPOGRAPHY_ATTRS];

export type InlineTypographyKey = "ff" | "fs" | "ls";

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
  | "fang"
  | "mono";
