import {
  INLINE_TYPOGRAPHY_ATTRS, inlineTypographyCssProperty, inlineTypographyDatasetKey,
  isTypographyFontFamilyId, normalizeInlineFontScale, normalizeInlineLetterSpacing,
  resolveTypographyFontFamily, type TypographyFontFamilyId,
} from './core';

/** Apply one compact typography attribute to a live or readonly inline shell. */
export const applyInlineTypographyAttribute = (
  element: HTMLElement,
  key: string,
  value: unknown,
): boolean => {
  const property = inlineTypographyCssProperty(key);
  const datasetKey = inlineTypographyDatasetKey(key);
  if (!property || !datasetKey) return false;

  let normalized: TypographyFontFamilyId | number | null = null;
  let cssValue: string | null = null;
  if (key === INLINE_TYPOGRAPHY_ATTRS.fontFamily) {
    normalized = isTypographyFontFamilyId(value) ? value : null;
    cssValue = normalized ? resolveTypographyFontFamily(normalized) : null;
  } else if (key === INLINE_TYPOGRAPHY_ATTRS.fontScale) {
    normalized = normalizeInlineFontScale(value);
    cssValue = normalized === null ? null : `${normalized}em`;
  } else {
    normalized = normalizeInlineLetterSpacing(value);
    cssValue = normalized === null ? null : `${normalized}em`;
  }

  if (normalized === null || cssValue === null) {
    delete element.dataset[datasetKey];
    element.style.removeProperty(property);
  } else {
    element.dataset[datasetKey] = `${normalized}`;
    element.style.setProperty(property, cssValue);
  }
  return true;
};
