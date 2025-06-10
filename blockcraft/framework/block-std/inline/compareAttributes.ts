import {IInlineNodeAttrs} from "../types";

export const compareAttributesWithEle = (ele: HTMLElement, attrs?: IInlineNodeAttrs): boolean => {
  const eleAttrKeys = ele.getAttributeNames()
  if (!attrs) {
    return !eleAttrKeys.length
  }

  const attrsEntries = Object.entries(attrs)
  if (attrsEntries.length !== eleAttrKeys.length) return false  // {} is mean alone plain text element

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


