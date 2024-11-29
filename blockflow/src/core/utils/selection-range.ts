import {isEmbedElement} from "./isEmbedNode";
import {CharacterIndex, ICharacterRange} from "../types";

export interface ICharacterPosition {
  node: Text | Element,
  offset: number,
  nodeOffset: number,
  beforeNodeCharacterCount: number
}

export const characterIndex2Number = (index: CharacterIndex, length: number) => {
  return typeof index === 'number' ? index : index === 'start' ? 0 : length
}

export const findNodeByIndex = (ele: HTMLElement, index: number, findFrom?: ICharacterPosition): ICharacterPosition => {
  if (!ele.childNodes.length) throw new Error('no childNodes')

  let cnt = findFrom?.beforeNodeCharacterCount || 0
  if (index === 0) return {
    node: ele.firstChild as any,
    offset: 0,
    nodeOffset: 0,
    beforeNodeCharacterCount: 0
  }

  const childNodes = ele.childNodes
  for (let i = findFrom?.nodeOffset || 0; i < childNodes.length; i++) {
    const child = childNodes[i]

    if (child instanceof Text) {
      const childTextLength = child.length || 1
      if (cnt + childTextLength >= index) {
        return {
          node: child,
          offset: index - cnt,
          nodeOffset: i,
          beforeNodeCharacterCount: cnt
        }
      }
      cnt += childTextLength
      continue
    }

    if ((child as HTMLElement).tagName === 'BR') {
      child.remove()
      i--
      continue
    }

    const childTextLength = isEmbedElement(child) ? 1 : child.textContent?.length || 1
    if (cnt + childTextLength >= index) {
      return {
        node: child as any,
        offset: index - cnt,
        nodeOffset: i,
        beforeNodeCharacterCount: cnt
      }
    }
    cnt += childTextLength
  }

  throw new Error('index out of range')
}

export const setCharacterRange = (el: HTMLElement, start: CharacterIndex, end: CharacterIndex) => {
  if(!el.isContentEditable) return;
  const sel = document.getSelection()!
  if (document.activeElement !== el) el.focus()

  if (!el.childNodes.length) {
    sel.setPosition(el, 0)
    return
  }

  if ((start === 'start' || start === 0) && end === 'end') {
    sel.selectAllChildren(el)
    return
  }

  if (start === end) {

    if (start === 'start' || start === 0) {
      setCursorBefore(el.firstChild!, sel)
      return
    } else if (start === 'end') {
      setCursorAfter(el.lastChild!, sel)
      return
    }

    const {node, offset, nodeOffset} = findNodeByIndex(el, start)
    if (isEmbedElement(node)) {
      sel.setPosition(el, nodeOffset)
    } else {
      sel.setPosition(node instanceof Text ? node : node.firstChild!, offset)
    }
    return;
  }

  const _range = document.createRange()
  switch (start) {
    case 0:
    case 'start':
      _range.setStart(el, 0)
      break
    case 'end':
      _range.setStart(el, el.childElementCount)
      break
    default:
      const startPos = findNodeByIndex(el, start)
      _range.setStart(startPos.node instanceof Text ? startPos.node : startPos.node.firstChild!, startPos.offset)
      break
  }
  switch (end) {
    case 0:
    case 'start':
      _range.setEnd(el, 0)
      break
    case 'end':
      _range.setEnd(el, el.childElementCount)
      break
    default:
      const endPos = findNodeByIndex(el, end)
      _range.setEnd(endPos.node instanceof Text ? endPos.node : endPos.node.firstChild!, endPos.offset)
      break
  }
  sel.removeAllRanges()
  sel.addRange(_range)
}

export const getCurrentCharacterRange = (activeElement: HTMLElement): ICharacterRange => {
  const sel = document.getSelection()
  if (!activeElement || !sel) throw new Error('No selection or active element')

  let {startOffset, endOffset, startContainer, endContainer} = sel.getRangeAt(0)

  if (!activeElement.contains(startContainer)) throw new Error('Anchor node is not in active element')

  const children = activeElement.childNodes
  if (!children.length) return {start: 0, end: 0}

  if (startContainer === activeElement) {
    if (startOffset >= children.length) {
      startOffset = 1
      startContainer = children[children.length - 1]
    } else {
      startContainer = children[startOffset]
      startOffset = 0
    }
  }

  if (endContainer === activeElement) {
    if (endOffset >= children.length) {
      endOffset = 1
      endContainer = children[children.length - 1]
    } else {
      endContainer = children[endOffset]
      endOffset = 0
    }
  }

  let startPos = -1, endPos = -1, cnt = 0

  const childNodes = activeElement.childNodes
  for (let i = 0; i < childNodes.length; i++) {
    const child = childNodes[i]

    if (child instanceof Text) {

      if (child === startContainer) {
        startPos = cnt + startOffset
      }

      if (child === endContainer) {
        endPos = cnt + endOffset
        return {start: startPos, end: endPos}
      }

      cnt += child.length
      continue
    }

    const isEmbed = isEmbedElement(child)
    const textLength = isEmbed ? 1 : child.textContent?.length || 0

    if (child === startContainer) {
      startPos = cnt + (isEmbed ? startOffset : (startOffset === 0 ? 0 : textLength))
    }

    if (child === endContainer) {
      endPos = cnt + (isEmbed ? endOffset : (endOffset === 0 ? 0 : textLength))
      return {start: startPos, end: endPos}
    }

    if (!isEmbed) {

      for (let j = 0; j < child.childNodes.length; j++) {
        const grandChild = child.childNodes[j] as Text

        if (grandChild === startContainer) {
          startPos = cnt + startOffset
        }

        if (grandChild === endContainer) {
          endPos = cnt + endOffset
          return {start: startPos, end: endPos}
        }

      }

    }

    cnt += textLength
  }

  throw new Error('Cannot find range')
}

export const getElementCharacterOffset = (ele: HTMLElement, container: HTMLElement) => {
  let cnt = 0
  for (let i = 0; i < container.children.length; i++) {
    const child = container.children[i]
    if (child === ele) return cnt
    cnt += isEmbedElement(child) ? 1 : child.textContent!.length
  }
  return -1
}

export const setCursorAfter = (el: Node, sel = document.getSelection()!) => {
  if (!el) return
  if (el instanceof Text) {
    sel.setPosition(el, el.length)
    return
  }

  if (!(el instanceof Element)) return;

  if (isEmbedElement(el)) {
    const range = document.createRange()
    range.setStartAfter(el)
    range.collapse(true)
    sel.removeAllRanges()
    sel.addRange(range)
    return
  }

  sel.setPosition(el.lastChild!, el.lastChild!.nodeValue!.length)
}

export const setCursorBefore = (el: Node, sel = document.getSelection()!) => {
  if(!el) return
  console.log(el)
  if (el instanceof Text) {
    sel.setPosition(el, 0)
    return
  }

  if (!(el instanceof Element)) return;

  if (isEmbedElement(el)) {
    const range = document.createRange()
    range.setStartBefore(el)
    range.collapse(true)
    sel.removeAllRanges()
    sel.addRange(range)
    return
  }

  sel.setPosition(el.firstChild!, 0)
}

export const isCursorAtElStart = (el: HTMLElement) => {
  const sel = document.getSelection()!
  if (!sel.isCollapsed) return false
  if (!el.childNodes || el.childNodes[0] === sel.focusNode) return true
  return el.firstElementChild!.contains(sel.anchorNode) && sel.anchorOffset === 0
}

export const isCursorAtElEnd = (el: HTMLElement) => {
  const sel = document.getSelection()!
  if (!sel.isCollapsed) return false
  if (!el.childNodes || el.childNodes[el.childNodes.length - 1] === sel.focusNode) return true
  return el.lastElementChild!.contains(sel.anchorNode) && sel.anchorOffset === el.lastElementChild!.textContent!.length
}
