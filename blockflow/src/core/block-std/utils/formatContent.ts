import {IInlineAttrs} from "@core/types";
import {BlockflowInline, findTextNodeByIndex, ICharacterRange} from "@core";

export const formatContent = (node: HTMLElement, range: ICharacterRange, attrs: IInlineAttrs) => {
  console.time('formatContent')

  const {start, end} = range
  if (start === end) return
  const first = findTextNodeByIndex(node, start)
  const last = findTextNodeByIndex(node, end, first)
  console.log( range, first, last)
  if(first.offset === first.textNode.length) {
    first.eleOffset++
    first.offset = 0
    first.textNode = first.textNode.parentElement!.nextElementSibling!.firstChild as Text
  }

  if (first.eleOffset === last.eleOffset) {
    const parent = first.textNode.parentElement!
    if (first.offset === 0 && last.offset === last.textNode.length) {
      BlockflowInline.setAttributes(parent, attrs)
      return
    } else {
      const text = parent.textContent!
      const fragment = document.createDocumentFragment()
      const clone = parent.cloneNode() as HTMLElement
      clone.innerHTML = text.slice(first.offset, last.offset)
      BlockflowInline.setAttributes(clone, attrs)
      fragment.appendChild(clone)
      if(last.offset !== text.length) {
        const clone2 = parent.cloneNode() as HTMLElement
        clone2.textContent = text.slice(last.offset)
        fragment.appendChild(clone2)
      }
      if(first.offset !== 0) {
        parent.textContent = text.slice(0, first.offset)
        parent.after(fragment)
      } else {
        parent.replaceWith(fragment)
      }
    }
  } else {
    const _range = document.createRange()
    if (first.offset === 0) _range.setStartBefore(node.children[first.eleOffset])
    else _range.setStart(first.textNode, first.offset)
    if (last.offset === last.textNode.length) _range.setEndAfter(node.children[last.eleOffset])
    else _range.setEnd(last.textNode, last.offset)
    const fragment = _range.extractContents()
    for (let i = 0; i < fragment.childNodes.length; i++) {
      const ele = fragment.children[i]
      if (ele instanceof Text || (ele instanceof HTMLElement && !ele.attributes?.length)) {
        if (i === 0) {
          ele.nextSibling!.textContent = ele.textContent! + ele.nextSibling!.textContent!
        } else {
          ele.previousSibling!.textContent += ele.textContent!
        }
        ele.remove()
      } else if (ele instanceof HTMLElement) BlockflowInline.setAttributes(ele, attrs)
    }
    _range.insertNode(fragment)
  }

  console.timeEnd('formatContent')
}


