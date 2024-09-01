import {IInlineAttrs} from "@core/types";
import {BlockflowInline, findTextNodeByIndex, ICharacterRange} from "@core";

export const formatContent = (node: HTMLElement, range: ICharacterRange, attrs: IInlineAttrs) => {
  // console.time('formatContent')

  const {start, end} = range
  if (start === end) return
  const first = findTextNodeByIndex(node, start)
  const last = findTextNodeByIndex(node, end, first)
  console.log(first, last)

  if (first.eleOffset === last.eleOffset) {
    if (first.offset === 0 && last.offset === last.textNode.length) {
      BlockflowInline.setAttributes(first.textNode.parentElement!, attrs)
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

  // console.timeEnd('formatContent')
}


