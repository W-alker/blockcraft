import {isEmbedElement} from "./isEmbedNode";
import {CharacterIndex, ICharacterPosition, ICharacterRange} from "../types";

export const characterIndex2Number = (index: CharacterIndex, length: number) => {
  return typeof index === 'number' ? index : index === 'start' ? 0 : length
}

export const findNodeByIndex = (ele: HTMLElement, index: number, findFrom?: ICharacterPosition): ICharacterPosition => {
  if (!ele.children.length) throw new Error('no children')

  let cnt = findFrom?.beforeEleOffset || 0
  if (index === 0) return {
    node: ele.firstElementChild!,
    offset: 0,
    eleOffset: 0,
    beforeEleOffset: 0
  }

  const childElements = ele.children
  for (let i = findFrom?.eleOffset || 0; i < childElements.length; i++) {
    const child = childElements[i]
    if (child.tagName === 'BR') {
      child.remove()
      i--
      continue
    }
    const childTextLength = isEmbedElement(child) ? 1 : child.textContent?.length || 1
    if (cnt + childTextLength >= index) {
      return {
        node: child,
        offset: index - cnt,
        eleOffset: i,
        beforeEleOffset: cnt
      }
    }
    cnt += childTextLength
  }

  throw new Error('index out of range')
}

export const setCharacterRange = (el: HTMLElement, start: CharacterIndex, end: CharacterIndex) => {
  const sel = document.getSelection()!
  if (document.activeElement !== el) el.focus({preventScroll: true})

  const textContent = el.textContent
  if (!textContent || !textContent.length) {
    sel.setPosition(el, 0)
    return
  }

  if ((start === 'start' || start === 0) && end === 'end') {
    sel.selectAllChildren(el)
    return
  }

  if (typeof start === 'number' && start > textContent.length) {
    start = textContent.length
  }

  if (typeof end === 'number' && end > textContent.length) {
    end = textContent.length
  }

  if (start === end) {
    if (start === 'start' || start === 0) {
      sel.setPosition(el, 0)
      return
    } else if (start === 'end') {
      sel.setPosition(el, el.childElementCount)
      return
    }
    const {node, offset, eleOffset} = findNodeByIndex(el, start)
    if (isEmbedElement(node)) sel.setPosition(el, eleOffset)
    else sel.setPosition(node.firstChild!, offset)
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
      _range.setStart(startPos.node.firstChild!, startPos.offset)
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
      _range.setEnd(endPos.node.firstChild!, endPos.offset)
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
  for (let i = 0; i < children.length; i++) {
    const child = children[i]

    if (child instanceof Text) {

      if (child === startContainer) {
        startPos = cnt + startOffset
      }

      if (child === endContainer) {
        endPos = cnt + endOffset
        break
      }

      cnt += child.length
    } else {

      const isEmbed = isEmbedElement(child)
      const textNode = child.firstChild! as Text

      if (child === startContainer) {
        startPos = cnt + (isEmbed ? startOffset : (startOffset === 0 ? 0 : textNode.length))
      }

      if (child === endContainer) {
        endPos = cnt + (isEmbed ? endOffset : (endOffset === 0 ? 0 : textNode.length))
        break
      }

      if (startContainer === textNode) {
        startPos = cnt + startOffset
      }

      if (endContainer === textNode) {
        endPos = cnt + endOffset
        break
      }

      cnt += isEmbed ? 1 : textNode.length
    }
  }

  return {start: startPos, end: endPos}
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
