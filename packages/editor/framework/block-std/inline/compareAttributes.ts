import {IInlineNodeAttrs} from "../types";
import {
  INLINE_TYPOGRAPHY_ATTRS,
  inlineTypographyCssProperty,
  inlineTypographyDatasetKey,
  normalizeInlineFontScale,
  normalizeInlineLetterSpacing,
  resolveTypographyFontFamily,
} from '../typography'
import {getAttributesFrom} from './getAttributes'

export const compareAttributesWithEle = (ele: HTMLElement, attrs?: IInlineNodeAttrs): boolean => {
  const expected = Object.entries(attrs ?? {}).filter(([, value]) =>
    value !== null && value !== undefined && value !== false && value !== '',
  )
  const actual = getAttributesFrom(ele)
  if (expected.length !== Object.keys(actual).length) return false

  for (const [key, attr] of expected) {

    if (key.startsWith('a:')) {
      if (ele.getAttribute(`${key.slice(2)}`) !== attr + '') return false
    }
    if (key.startsWith('d:')) {
      if (ele.getAttribute('data-' + [key.slice(2)]) !== attr + '') return false
    }
    if (key.startsWith('s:')) {
      const raw = key.slice(2)
      const property = raw.startsWith('--')
        ? raw
        : raw.replace(/[A-Z]/g, value => `-${value.toLowerCase()}`)
      if (ele.style.getPropertyValue(property) !== attr + '') return false
    }
    if (key.startsWith('t:')) {
      const property = inlineTypographyCssProperty(key)
      const datasetKey = inlineTypographyDatasetKey(key)
      if (!property || !datasetKey) return false
      const dataValue = ele.dataset[datasetKey]
      if (`${attr}` !== dataValue) return false
      const cssValue = key === INLINE_TYPOGRAPHY_ATTRS.fontFamily
        ? resolveTypographyFontFamily(attr)
        : key === INLINE_TYPOGRAPHY_ATTRS.fontScale
          ? `${normalizeInlineFontScale(attr)}em`
          : `${normalizeInlineLetterSpacing(attr)}em`
      if (!cssValue || ele.style.getPropertyValue(property) !== cssValue) return false
    }

    if (!(key in actual)) return false
    if (`${actual[key]}` !== `${attr}`) return false

  }

  return true
}

export const compareAttributes = (attrs1?: IInlineNodeAttrs, attrs2?: IInlineNodeAttrs): boolean => {
  if(!attrs1 && !attrs2) return true
  if(!attrs1 || !attrs2) return false
  const attrs1Entries = Object.entries(attrs1)
  const attrs2Entries = Object.entries(attrs2)
  if (attrs1Entries.length !== attrs2Entries.length) return false
  for (const [key, attr] of attrs1Entries) {
    // @ts-ignore
    if (attrs2[key] !== attr) return false
  }
  return true
}
