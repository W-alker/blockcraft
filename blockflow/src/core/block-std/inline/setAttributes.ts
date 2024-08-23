import {IInlineAttrs} from "@core";

export const setAttributes = (element: HTMLElement, attributes: IInlineAttrs) => {
  for (const key in attributes) {
    // @ts-ignore
    const attr = attributes[key]
    if (key.startsWith('a:')) {
      const attrName = `bfi-${key.slice(2)}`
      attr ? element.setAttribute(attrName, attr + '') : element.removeAttribute(attrName)
      continue
    }
    if (key.startsWith('d:')) {
      attr ? element.dataset[key.slice(2)] = attr + '' : delete element.dataset[key.slice(2)]
      continue
    }
    switch (key) {
      case 's:c':
        element.style.color = attr
        continue;
      case 's:bc':
        element.style.backgroundColor = attr
        continue;
      case 's:fs':
        element.style.fontSize = attr + 'px'
        continue;
      case 's:ff':
        element.style.fontFamily = attr
    }
  }
}

export default setAttributes
