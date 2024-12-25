import {DeltaInsert} from "../../types";
import {BlockflowInline} from "../inline";
import {findNodeByIndex, isEmbedElement} from "../../utils";

export const insertContent = (ele: HTMLElement, from: number, delta: DeltaInsert, viewCreator: (d: DeltaInsert) => HTMLElement | Text) => {
  // console.time('insertContent')
  if (!ele.childNodes.length || from === 0) {
    return ele.prepend(viewCreator(delta))
  }

  const {node, offset} = findNodeByIndex(ele, from)

  if (node instanceof Text) {

    if (typeof delta.insert === 'string' && (!delta.attributes || Object.keys(delta.attributes).length === 0)) {
      node.insertData(offset, delta.insert)
      return
    }

    const span = viewCreator(delta)
    switch (offset) {
      case 0:
        node.before(span)
        break
      case node.length:
        node.after(span)
        break
      default:
        const newNode = node.splitText(offset)
        newNode.before(span)
        break
    }

    return
  }

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

const splitBy = (ele: Element, index: number, insertEle: HTMLElement | Text) => {
  const textNode = ele.firstChild as Text
  const fragment = document.createDocumentFragment()
  const clone = ele.cloneNode() as HTMLElement
  clone.textContent = textNode.data!.slice(index)
  fragment.appendChild(insertEle)
  fragment.appendChild(clone)
  ele.after(fragment)
  textNode.deleteData(index, textNode.length - index)
}
