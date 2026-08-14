import {IInlineNodeAttrs} from "../types";
import {toCamelCase} from "../../../global";
import {
  INLINE_TYPOGRAPHY_ATTRS,
  normalizeInlineFontScale,
  normalizeInlineLetterSpacing,
  isTypographyFontFamilyId,
} from '../typography'

const COMPACT_DATA_ATTRIBUTES = new Set(['data-bc-ff', 'data-bc-fs', 'data-bc-ls'])

export const getAttributesFrom = (ele: HTMLElement): IInlineNodeAttrs => {
  const attributeNames = ele.getAttributeNames()
  const attributes: IInlineNodeAttrs = {};
  for (const name of attributeNames) {
    if (name === 'style') continue
    if (COMPACT_DATA_ATTRIBUTES.has(name)) continue
    if (name.startsWith("data-")) {
      attributes[`d:${toCamelCase(name.slice(5))}`] = ele.getAttribute(name)
      continue
    }
    attributes[`a:${name}`] = ele.getAttribute(name)
  }
  const ff = ele.dataset['bcFf']
  const hasCompactFontFamily = isTypographyFontFamilyId(ff)
  const fs = normalizeInlineFontScale(ele.dataset['bcFs'])
  const ls = normalizeInlineLetterSpacing(ele.dataset['bcLs'])
  if (hasCompactFontFamily) attributes[INLINE_TYPOGRAPHY_ATTRS.fontFamily] = ff
  if (fs !== null) attributes[INLINE_TYPOGRAPHY_ATTRS.fontScale] = fs
  if (ls !== null) attributes[INLINE_TYPOGRAPHY_ATTRS.letterSpacing] = ls

  const css = ele.style
  for (let i = 0; i < css.length; i++) {
    const key = css[i];
    if (
      (key === 'font-family' && hasCompactFontFamily) ||
      (key === 'font-size' && fs !== null) ||
      (key === 'letter-spacing' && ls !== null)
    ) continue
    // Keep the public inline contract canonical (`font-size` → `fontSize`).
    attributes[`s:${toCamelCase(key)}`] = css.getPropertyValue(key);
  }
  return attributes
}
