import {DeltaInsert} from "@core/types";
import {setAttributes} from "./setAttributes";

/**
 * {insert: 'text', attributes: {'s:c': 'red'}}  ===> <span style="color: red">text</span>
 * {insert: 'text', attributes: {'a:bold': true}} ===> <span bfi-bold="true">text</span>
 * {insert: 'text', attributes: {'d:id': '123'}}  ===> <span data-id="123">text</span>
 */
export const createInlineView = (insert: DeltaInsert) => {
  const {insert: text, attributes} = insert
  const span = document.createElement('span')
  span.textContent = text.replace(/\s/g, '\u00a0')
  attributes && setAttributes(span, attributes)
  return span
}

export default createInlineView
