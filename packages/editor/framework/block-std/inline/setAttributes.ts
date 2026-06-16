import {IInlineNodeAttrs} from "../types";

export const setAttributes = (element: HTMLElement, attributes: IInlineNodeAttrs) => {
  for (const key in attributes) {
    // @ts-ignore
    const attr = attributes[key]
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
