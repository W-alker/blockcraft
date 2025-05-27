import {IInlineNodeAttrs} from "../types";

export const getAttributesFrom = (ele: HTMLElement): IInlineNodeAttrs => {
  const attributeNames = ele.getAttributeNames()
  const attributes: IInlineNodeAttrs = {};
  for (const name of attributeNames) {
    if (name.startsWith("data-")) {
      attributes[`d:${name.slice(5)}`] = ele.getAttribute(name)
      continue
    }
    attributes[`a:${name}`] = ele.getAttribute(name)
  }
  const css = ele.style
  for (const key in css) {
    attributes[`s:${key}`] = css[key]
  }
  return attributes
}
