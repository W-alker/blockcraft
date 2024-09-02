import {DeltaInsert, IInlineAttrs} from "@core/types";
import setAttributes from "./setAttributes";
import {getAttributesFrom} from "./getAttributes";
import {compareAttributesWithEle} from "./compareAttributes";

export class BlockflowInline {

  static createView(insert: DeltaInsert) {
    const {insert: text, attributes} = insert
    const span = document.createElement('span')
    span.textContent = text.replace(/\s/g, '\u00a0')
    attributes && this.setAttributes(span, attributes)
    return span
  }

  static setAttributes(element: HTMLElement, attributes: IInlineAttrs) {
    return setAttributes(element, attributes)
  }

  static getAttributes(element: HTMLElement) {
    return getAttributesFrom(element)
  }

  static compareAttributesWithEle(element: HTMLElement, attributes?: IInlineAttrs) {
    return compareAttributesWithEle(element, attributes)
  }
}
