import {IInlineAttrs} from "@core";

export const getAttributesFrom = (node: HTMLElement): IInlineAttrs => {
  const attrs: IInlineAttrs = {}
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
  if (color) attrs['s:c'] = color
  if (backgroundColor) attrs['s:bc'] = backgroundColor
  if (fontSize) attrs['s:fs'] = parseInt(fontSize)
  if (fontFamily) attrs['s:ff'] = fontFamily
  return attrs
}
