import {IInlineAttrs} from "@core";

export const compareAttributesWithEle = (ele: HTMLElement, attrs?: IInlineAttrs): boolean => {
  const eleAttrs = ele.attributes
  if (!attrs) return true
  if ((attrs && !eleAttrs.length) || (!attrs && eleAttrs.length)) return false

  const attrsEntries = Object.entries(attrs)
  if (!attrsEntries.length) return false  // {} is mean alone plain text element

  for (const [key, attr] of attrsEntries) {

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
