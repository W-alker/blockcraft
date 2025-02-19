import {IInlineNodeAttrs} from "../types";

export const compareAttributesWithEle = (ele: HTMLElement, attrs?: IInlineNodeAttrs): boolean => {
  if (!attrs) return true

  const attrsEntries = Object.entries(attrs)
  if (!attrsEntries.length) return false  // {} is mean alone plain text element

  for (const [key, attr] of attrsEntries) {

    if (key.startsWith('a:')) {
      if (ele.getAttribute(`${key.slice(2)}`) !== attr + '') return false
    }
    if (key.startsWith('d:')) {
      if (ele.getAttribute('data-' + [key.slice(2)]) !== attr + '') return false
    }
    if (key.startsWith('s:')) {
      if (ele.style[key.slice(2) as any] !== attr + '') return false
    }

  }

  return true
}

