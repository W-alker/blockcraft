import {DeltaInsert} from "../../types";
import {BlockflowInline} from "../inline";
import {isEmbedElement} from "../../utils";
import {BlockFlowSelection} from "../../modules";

export const insertContent = (ele: HTMLElement, from: number, delta: DeltaInsert, viewCreator: (d: DeltaInsert) => HTMLElement) => {
  // console.time('insertContent')
  if (!ele.textContent?.length) {
    const span = viewCreator(delta as DeltaInsert)
    ele.innerHTML = span.outerHTML
    return
  }

  const {node, offset} = BlockFlowSelection.findNodeByIndex(ele, from)

  if (isEmbedElement(node)) {
    const embed = viewCreator(delta as DeltaInsert)
    offset === 0 ? node.before(embed) : node.after(embed)
    return
  }

  const textNode = node.firstChild as Text
  const isSame = BlockflowInline.compareAttributesWithEle(node as HTMLElement, delta.attributes)

  if (typeof delta.insert === 'object') {
    const embed = viewCreator(delta as DeltaInsert)
    if (offset > 0 && offset < textNode.length) return splitBy(node, offset, embed)
    return offset === 0 ? node.before(embed) : node.after(embed)
  }

  if (isSame) {
    textNode.insertData(offset, delta.insert)
  } else {
    const span = viewCreator(delta as DeltaInsert)
    if (offset === textNode.length) {
      if (!delta.attributes || !isSame) node.after(span)
      else textNode.insertData(offset, delta.insert)
    } else if (offset === 0) {
      if (!delta.attributes || !isSame) node.before(span)
      else textNode.insertData(offset, delta.insert)
    } else {
      splitBy(node, offset, span)
    }
  }
  // console.timeEnd('insertContent')
}

const splitBy = (ele: Element, index: number, insertEle: HTMLElement) => {
  const textNode = ele.firstChild as Text
  const fragment = document.createDocumentFragment()
  const clone = ele.cloneNode() as HTMLElement
  clone.textContent = textNode.data!.slice(index)
  fragment.appendChild(insertEle)
  fragment.appendChild(clone)
  ele.after(fragment)
  textNode.data = textNode.data!.slice(0, index)
}
