import {IInlineNodeAttrs} from "../types";

export const getAttributesFrom = (node: HTMLElement): IInlineNodeAttrs => {
  const attrs: IInlineNodeAttrs = {}
  const {attributes, dataset} = node
  for (let i = 0; i < attributes.length; i++) {
    const attr = attributes[i]
    if (attr.name.startsWith('bfi-')) {
      attrs[`a:${attr.name.slice(4)}`] = attr.value
    }
  }
  for (const key in dataset) {
    attrs[`d:${key}`] = dataset[key] as string
  }
  const {color, backgroundColor, fontSize, fontFamily} = node.style
  if (color) attrs['s:color'] = color
  if (backgroundColor) attrs['s:backgroundColor'] = backgroundColor
  if (fontSize) attrs['s:fontSize'] = parseInt(fontSize)
  if (fontFamily) attrs['s:fontFamily'] = fontFamily
  return attrs
}
