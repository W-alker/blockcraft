import setAttributes from "./setAttributes";
import {getAttributesFrom} from "./getAttributes";
import {compareAttributesWithEle} from "./compareAttributes";
import {DeltaInsert, IInlineAttrs} from "../../types";

export class BlockflowInline {

  static createView(delta: DeltaInsert) {
    const {insert, attributes} = delta
    const span = document.createElement('span')
    span.textContent = typeof insert === 'object' ? '\u200B' : insert
      // .replace(/\s/g, '\u00a0')
    typeof insert === 'object' && span.setAttribute('bf-embed', Object.keys(insert)[0])
    attributes && this.setAttributes(span, attributes, typeof insert === 'object')
    return span
  }

  static elementToDelta(ele: HTMLElement): DeltaInsert {
    const insert = ele.getAttribute('bf-embed') ? {[ele.getAttribute('bf-embed')!]: true} : ele.textContent
    const attributes = this.getAttributes(ele)
    // @ts-ignore
    return {insert, attributes}
  }

  static setAttributes(element: HTMLElement, attributes: IInlineAttrs, embed = false) {
    setAttributes(element, attributes)
    if (embed) element.setAttribute('contenteditable', 'false')
  }

  static getAttributes(element: HTMLElement) {
    return getAttributesFrom(element)
  }

  static compareAttributesWithEle(element: HTMLElement, attributes?: IInlineAttrs) {
    return compareAttributesWithEle(element, attributes)
  }
}
