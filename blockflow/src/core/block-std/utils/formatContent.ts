import {IInlineAttrs} from "@core/types";
import {findTextNodeByIndex, ICharacterRange, setAttributes} from "@core";

export const formatContent = (node: HTMLElement, range: ICharacterRange, attrs: IInlineAttrs) => {
  // console.time('formatContent')

  const {start, end} = range
  if (start === end) return
  const first = findTextNodeByIndex(node, start)
  const last = findTextNodeByIndex(node, end, first)
  console.log(first, last)

  if (first.eleOffset === last.eleOffset) {
    if (first.offset === 0 && last.offset === last.textNode.length) {
      setAttributes(first.textNode.parentElement!, attrs)
      return
    }
  } else {
    const _range = document.createRange()
    if (first.offset === 0) _range.setStartBefore(node.children[first.eleOffset])
    else _range.setStart(first.textNode, first.offset)
    if (last.offset === last.textNode.length) _range.setEndAfter(node.children[last.eleOffset])
    else _range.setEnd(last.textNode, last.offset)
    const fragment = _range.extractContents()
    console.log(fragment)
    for (let i = 0; i < fragment.childNodes.length; i++) {
      const ele = fragment.children[i]
      if (ele instanceof Text || (ele instanceof HTMLElement && !ele.attributes?.length)) {
        if (i === 0) {
          ele.nextSibling!.textContent = ele.textContent! + ele.nextSibling!.textContent!
        } else {
          ele.previousSibling!.textContent += ele.textContent!
        }
        ele.remove()
      } else if (ele instanceof HTMLElement) setAttributes(ele, attrs)
    }
    _range.insertNode(fragment)
  }

  const formatElement = (ele: HTMLElement, from: number, to: number, attrs: IInlineAttrs) => {
    const text = ele.textContent!
    const textLen = text.length
    if (from === 0 && to === textLen) {
      setAttributes(ele, attrs)
      return;
    }
    const firstPart = text.slice(0, from)
    const middle = text.slice(from, to)
    const lastPart = text.slice(to, textLen)

    const fragment = document.createDocumentFragment()

    if (middle) {
      const span = ele.cloneNode() as HTMLElement
      span.textContent = middle
      setAttributes(span, attrs)
      fragment.appendChild(span)
    }
    if (lastPart) {
      const span = ele.cloneNode() as HTMLElement
      span.textContent = lastPart
      fragment.appendChild(span)
    }
    if (firstPart) {
      ele.textContent = firstPart
      ele.after(fragment)
    } else {
      ele.replaceWith(fragment)
    }
  }

  // console.timeEnd('formatContent')
}


