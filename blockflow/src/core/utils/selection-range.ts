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
  if (index === 0) {
    return {
      node: ele.firstChild as any,
      offset: 0,
      nodeOffset: 0,
      beforeNodeCharacterCount: 0
    }
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

export const createRangeByCharacterRange = (el: HTMLElement, start: CharacterIndex, end: CharacterIndex): Range => {
  const _range = document.createRange()

  if (!el.childNodes.length) {
    _range.setStart(el, 0)
    _range.setEnd(el, 0)
    return _range
  }

  if ((start === 'start' || start === 0) && end === 'end') {
    _range.selectNodeContents(el)
    return _range
  }

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
      if (startPos.node instanceof HTMLElement && !startPos.node.isContentEditable) {
        startPos.offset === 0 ? _range.setStartBefore(startPos.node) : _range.setStartAfter(startPos.node)
      } else {
        _range.setStart(startPos.node instanceof Text ? startPos.node : startPos.node.firstChild!, startPos.offset)
      }
      break
  }

  if (start === end) {
    _range.collapse(true)
    return _range
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
      if (endPos.node instanceof HTMLElement && !endPos.node.isContentEditable) {
        endPos.offset === 0 ? _range.setEndBefore(endPos.node) : _range.setEndAfter(endPos.node)
      } else {
        _range.setEnd(endPos.node instanceof Text ? endPos.node : endPos.node.lastChild!, endPos.offset)
      }
      break
  }
  return _range
}

export const setCharacterRange = (el: HTMLElement, start: CharacterIndex, end: CharacterIndex) => {
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
      sel.setPosition(el, nodeOffset + 1)
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
      if (startPos.node instanceof HTMLElement && !startPos.node.isContentEditable) {
        startPos.offset === 0 ? _range.setStartBefore(startPos.node) : _range.setStartAfter(startPos.node)
      } else {
        _range.setStart(startPos.node instanceof Text ? startPos.node : startPos.node.firstChild!, startPos.offset)
      }
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
      if (endPos.node instanceof HTMLElement && !endPos.node.isContentEditable) {
        endPos.offset === 0 ? _range.setEndBefore(endPos.node) : _range.setEndAfter(endPos.node)
      } else {
        _range.setEnd(endPos.node instanceof Text ? endPos.node : endPos.node.lastChild!, endPos.offset)
      }
      break
  }
  sel.removeAllRanges()
  sel.addRange(_range)
}

export const normalizeStaticRange = (container: HTMLElement, range: StaticRange): ICharacterRange => {
  return getCurrentCharacterRange(container, range)
}

export const getCurrentCharacterRange = (activeElement: HTMLElement, range?: StaticRange): ICharacterRange => {
  if (!range) {
    const sel = document.getSelection()
    if (!sel?.rangeCount) throw new Error('range is not defined')
    range = sel.getRangeAt(0)
  }
  let {startOffset, endOffset, startContainer, endContainer} = range

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

  // if (!startContainer.parentElement!.isContentEditable) {
  //   startContainer = startContainer.parentElement!
  //   startOffset = 0
  // }
  //
  // if (!endContainer.parentElement!.isContentEditable) {
  //   endContainer = endContainer.parentElement!
  //   endOffset = 1
  // }

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
  for (let i = 0; i < container.childNodes.length; i++) {
    const child = container.childNodes[i]
    if (child === ele) return cnt
    cnt += isEmbedElement(child) ? 1 : (child.textContent?.length || 0)
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
    range.setEndAfter(el)
    range.collapse(false)
    sel.removeAllRanges()
    sel.addRange(range)
    return
  }

  sel.setPosition(el.lastChild!, el.lastChild!.nodeValue!.length)
}

export const setCursorBefore = (el: Node, sel = document.getSelection()!) => {
  if (!el) return
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
  const {startContainer, startOffset} = sel.getRangeAt(0)
  if (!el.contains(startContainer) || startOffset !== 0) return false
  if (startContainer === el) {
    return startOffset === 0
  }
  let node = startContainer
  while (node && node !== el) {
    if (node.previousSibling) return false;
    if(node instanceof Text && sel.anchorOffset !== 0) return false
    node = node.parentNode!
  }
  return true;
}

export const isCursorAtElEnd = (el: HTMLElement) => {
  const selection = document.getSelection()!
  if (!selection.isCollapsed) return false
  const range = selection.getRangeAt(0)
  if (!el.contains(range.startContainer)) return false
  if (range.endContainer === el) {
    // 如果选区直接在编辑块，检查是否是最后一个字符
    return range.endOffset === el.childNodes.length;
  }
  // 如果选区在子节点，检查是否在最后一个字符之后
  let node = range.endContainer;
  while (node && node !== el) {
    if (node.nextSibling) return false;
    if(node instanceof Text && node.length !== range.endOffset) return false
    node = node.parentNode!
  }
  return true;
}

export const clearBreakElement = (container: HTMLElement) => {
  // console.time('clearBreakElement')
  for (let i = 0; i < container.children.length; i++) {
    const child = container.children[i]
    if (child instanceof HTMLElement && child.tagName === 'BR') {
      container.removeChild(child)
    }
  }
  // console.timeEnd('clearBreakElement')
}

export const adjustRangeEdges = (container: HTMLElement, range = document.getSelection()?.getRangeAt(0)) => {
  if(!range) return
  const {startContainer, endContainer, startOffset, endOffset} = range

  let flag = false
  if (startContainer instanceof Text && startOffset === 0 && startContainer.parentElement !== container) {
    range.setStartBefore(startContainer.parentElement!)
    flag = true
  }
  if (endContainer instanceof Text && endOffset === endContainer.length && endContainer.parentElement !== container) {
    range.setEndAfter(endContainer.parentElement!)
    flag = true
  }
  return flag
}
