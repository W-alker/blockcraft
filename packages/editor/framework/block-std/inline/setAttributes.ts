import {IInlineNodeAttrs} from "../types";
import {applyInlineTypographyAttribute, INLINE_TYPOGRAPHY_ATTRS} from '../typography'

export const setAttributes = (element: HTMLElement, attributes: IInlineNodeAttrs) => {
  const hasCompactFontFamily = INLINE_TYPOGRAPHY_ATTRS.fontFamily in attributes
  const hasCompactFontScale = INLINE_TYPOGRAPHY_ATTRS.fontScale in attributes
  const hasCompactLetterSpacing = INLINE_TYPOGRAPHY_ATTRS.letterSpacing in attributes
  for (const key in attributes) {
    // @ts-ignore
    const attr = attributes[key]
    if (applyInlineTypographyAttribute(element, key, attr)) {
      continue
    }
    if (key.startsWith('a:')) {
      const attrName = `${key.slice(2)}`
      attr ? element.setAttribute(attrName, attr + '') : element.removeAttribute(attrName)
      continue
    }
    if (key.startsWith('d:')) {
      attr ? element.dataset[key.slice(2)] = attr + '' : delete element.dataset[key.slice(2)]
      continue
    }
    if (key.startsWith('s:')) {
      // Compact semantic keys own the property when both aliases appear in a
      // transition patch, independent of object key order.
      if (
        (key === 's:fontFamily' && hasCompactFontFamily) ||
        (key === 's:fontSize' && hasCompactFontScale) ||
        (key === 's:letterSpacing' && hasCompactLetterSpacing)
      ) continue
      // `setProperty` 只认连字符式属性名（font-size），驼峰名（fontSize）会被静默忽略。
      // 把 `s:fontSize` / `s:fontFamily` 等驼峰 key 转成连字符再写入；
      // 自定义属性（--foo）大小写敏感，保持原样。
      const raw = key.slice(2)
      const k = raw.startsWith('--') ? raw : raw.replace(/[A-Z]/g, m => '-' + m.toLowerCase())
      attr ? element.style.setProperty(k, attr + '') : element.style.removeProperty(k)
    }
  }
}

export default setAttributes
