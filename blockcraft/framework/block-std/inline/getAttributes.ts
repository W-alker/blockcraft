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
  for (let i = 0; i < css.length; i++) {
    const key = css[i];
    attributes[`s:${key}`] = css.getPropertyValue(key);
  }
  return attributes
}
