import {IInlineAttrs} from "@core";

export const compareAttributesWithEle = (ele: HTMLElement, attrs?: IInlineAttrs): boolean => {
  if (!ele.attributes && !attrs) return true
  if ((attrs && !ele.attributes) || (!attrs && ele.attributes)) return false
  for (const key in attrs) {
    // @ts-ignore
    const attr = attrs[key]
    if (key.startsWith('a:')) {
      if (ele.getAttribute(`bfi-${key.slice(2)}`) !== attr + '') return false
    }
    if (key.startsWith('d:')) {
      if (ele.dataset[key.slice(2)] !== attr + '') return false
    }
    switch (key) {
      case 's:c':
        if (ele.style.color !== attr) return false
        continue;
      case 's:bc':
        if (ele.style.backgroundColor !== attr) return false
        continue;
      case 's:fs':
        if (ele.style.fontSize !== attr + 'px') return false
        continue;
      case 's:ff':
        if (ele.style.fontFamily !== attr) return false
    }
  }
  return true
}

export const compareAttributesBetweenElements = (ele1: HTMLElement, ele2: HTMLElement): boolean => {
  if (!ele1.attributes && !ele2.attributes) return true
  if ((ele1.attributes && !ele2.attributes) || (!ele1.attributes && ele2.attributes)) return false
  let attrs


return true
}
