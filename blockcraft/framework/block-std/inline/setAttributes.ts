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
      const k = key.slice(2)
      attr ? element.style.setProperty(k, attr + '') : element.style.removeProperty(k)
    }
  }
}

export default setAttributes
