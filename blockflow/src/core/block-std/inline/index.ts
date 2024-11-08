import setAttributes from "./setAttributes";
import {getAttributesFrom} from "./getAttributes";
import {compareAttributesWithEle} from "./compareAttributes";
import {DeltaInsert, DeltaInsertEmbed, IInlineAttrs} from "../../types";

export type EmbedConverter = {
  toDelta: EmbedViewToDelta
  toView: CreateEmbedView
}
export type CreateEmbedView = (delta: DeltaInsertEmbed) => HTMLElement
export type EmbedViewToDelta = (ele: HTMLElement) => DeltaInsertEmbed

export class BlockflowInline {

  constructor(
    public readonly embedConverterMap: Map<string, EmbedConverter> = new Map()
  ) {
  }

  createView(delta: DeltaInsert) {
    const {insert, attributes} = delta
    if (typeof insert === 'object') {
      const key = Object.keys(insert)[0]
      const embedCreator = this.embedConverterMap.get(key)
      if (!embedCreator) throw new Error(`Embed creator for key ${key} not found`)
      const node = embedCreator.toView(delta as DeltaInsertEmbed)
      node.setAttribute('bf-embed', key)
      node.setAttribute('contenteditable', 'false')
      return node
    }

    const span = document.createElement('span')
    span.textContent = insert
    attributes && setAttributes(span, attributes)
    return span
  }

  elementToDelta(ele: HTMLElement): DeltaInsert {
    const attributes = getAttributesFrom(ele)
    const embed = ele.getAttribute('bf-embed')
    if (embed) {
      const embedCreator = this.embedConverterMap.get(embed)
      if (!embedCreator) throw new Error(`Embed creator for key ${embed} not found`)
      const delta = embedCreator.toDelta(ele)
      delta.attributes = {
        ...delta.attributes,
        ...attributes
      }
      return delta
    }

    const insert = ele.textContent
    // @ts-ignore
    return {insert, attributes}
  }

  static setAttributes(element: HTMLElement, attributes?: IInlineAttrs, embed = false) {
    if (embed) element.setAttribute('contenteditable', 'false')
    if (attributes) setAttributes(element, attributes)
  }

  static getAttributes(element: HTMLElement) {
    return getAttributesFrom(element)
  }

  static compareAttributesWithEle(element: HTMLElement, attributes?: IInlineAttrs) {
    return compareAttributesWithEle(element, attributes)
  }
}
