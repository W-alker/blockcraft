import {isEmbedElement} from "./isEmbedNode";

/* 纯文本索引的焦点选区范围 */
export interface ICharacterRange {
  start: number,
  end: number,
}

export interface ICharacterPosition {
  node: Element,
  offset: number,
  eleOffset: number,
  beforeEleOffset: number
}

export type CharacterIndex = number | 'start' | 'end'

export const characterIndex2Number = (index: CharacterIndex, length: number) => {
  return typeof index === 'number' ? index : index === 'start' ? 0 : length
}

export const getCurrentCharacterRange = (): ICharacterRange => {
  const sel = document.getSelection()
  const activeElement = document.activeElement
  if (!sel || !activeElement) throw new Error('No selection or active element')
  if (!activeElement.childElementCount) return {start: 0, end: 0}
  const nativeRange = sel.getRangeAt(0)
  let startNode = nativeRange.startContainer === activeElement ? activeElement.children[nativeRange.startOffset > 0 ? nativeRange.startOffset - 1 : 0] : nativeRange.startContainer
  let endNode = nativeRange.collapsed ? startNode : nativeRange.endContainer === activeElement ? activeElement.children[nativeRange.endOffset > 0 ? nativeRange.endOffset - 1 : 0] : nativeRange.endContainer
  startNode = startNode.parentElement === activeElement ? startNode : startNode.parentElement!
  endNode = endNode.parentElement === activeElement ? endNode : endNode.parentElement!
  const startOffset = nativeRange.startOffset > 0 ? isEmbedElement(<Element>startNode) ? 1 : nativeRange.startOffset : 0
  const endOffset = nativeRange.collapsed ? startOffset : (nativeRange.endOffset > 0 ? isEmbedElement(<Element>endNode) ? 1 : nativeRange.endOffset : 0)

  let pos1 = 0, pos2 = 0, cnt = 0
  const children = activeElement.children
  for (let i = 0; i < children.length; i++) {
    const child = children[i]
    const isEmbed = isEmbedElement(child)
    if(child === startNode) {
      pos1 = cnt + startOffset
    }
    if(child === endNode) {
      pos2 = cnt + endOffset
      break
    }
    cnt += isEmbed ? 1 : child.textContent!.length
  }
  return {
    start: pos1,
    end: pos2
  }
}

export const getCharacterOffset = (ele: HTMLElement, container: HTMLElement) => {
  let cnt = 0
  for (let i = 0; i < container.children.length; i++) {
    const child = container.children[i]
    if (child === ele) return cnt
    cnt += isEmbedElement(child) ? 1 : child.textContent!.length
  }
  return -1
}


// export const getRange = (containerEl = document.activeElement as HTMLElement): ICharacterRange => {
//   const sel = document.getSelection()!
//   if (!containerEl.contentEditable) throw new Error('containerEl is not contentEditable')
//   if (containerEl.localName === 'input' || containerEl.localName === 'textarea') {
//     const inputEl = containerEl as HTMLInputElement
//     return {
//       start: inputEl.selectionStart!,
//       end: inputEl.selectionEnd!,
//     }
//   }
//
//   const start = findCharacterIndexByCursor(containerEl, sel.anchorNode!, sel.anchorOffset)
//   const end = sel.isCollapsed ? start : (sel.anchorNode === sel.focusNode ? sel.focusOffset - sel.anchorOffset + start : findCharacterIndexByCursor(containerEl, sel.focusNode!, sel.focusOffset))
//   return {
//     // containerEl,
//     start: Math.min(start, end),
//     end: Math.max(start, end),
//   }
// }
//
// const findCharacterIndexByCursor = (containerEl: HTMLElement, node: Node, offset: number) => {
//   if (!containerEl.isContentEditable) throw new Error('containerEl is not contentEditable')
//   const range = document.createRange()
//   range.setStart(containerEl, 0)
//   range.setEnd(node, offset)
//   const len = range.toString().length
//   range.detach()
//   return len
// }

export const isCursorAtElStart = (el: HTMLElement) => {
  const sel = document.getSelection()!
  if (!el.firstElementChild) return true
  return sel.isCollapsed && el.firstElementChild!.contains(sel.anchorNode) && sel.anchorOffset === 0
}

export const isCursorAtElEnd = (el: HTMLElement) => {
  const sel = document.getSelection()!
  if (!el.lastElementChild) return true
  return sel.isCollapsed && el.lastElementChild!.contains(sel.anchorNode) && sel.anchorOffset === sel.anchorNode!.textContent!.length
}

export const setSelection = (el: HTMLElement, start: CharacterIndex, end: CharacterIndex) => {
  const sel = document.getSelection()!
  if (!el.textContent) {
    sel.setPosition(el, 0)
    return
  }

  if ((start === 'start' || start === 0) && end === 'end') {
    sel.selectAllChildren(el)
    return
  }

  if (start === end) {
    if(start === 'start' || start === 0) {
      sel.setPosition(el, 0)
      return
    } else if (start === 'end') {
      sel.setPosition(el, el.childElementCount)
      return
    }
    const {node, offset, eleOffset} =  findNodeByIndex(el, start)
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
  }
  sel.removeAllRanges()
  sel.addRange(_range)
}

const findNodeByCharacterIndex = (index: CharacterIndex, container: HTMLElement) => {
  if(index === 'start') return {
    node: container.firstElementChild!,
    offset: 0
  }
  if(index === 'end') return {
    node: container.lastElementChild!,
    offset: container.childElementCount
  }
  return findNodeByIndex(container, index)
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

/*
* @desc handle the deep level
* 根据纯文本的字符索引找到DOM节点里所在的文本节点和索引
* @param {HTMLElement} element - 容器元素
* @param {number} index - 纯文本的字符索引
* @returns {IFocusSelection} - 文本节点和偏移量
 */
const findTextNodeAndLastIndexByCharacterIndex = (element = document.activeElement!, pos: number): {
  node: Text | Node,
  offset: number
} => {

  if (pos === 0) return {node: element.firstChild!.firstChild!, offset: 0}
  if (pos === element.textContent!.length) return {
    node: element.lastChild!.lastChild!,
    offset: element.lastChild!.textContent!.length
  }

  let foundNode: Text
  let lastIndex = -1;
  let index = pos;

  function find(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (index <= (node as Text).length) {
        foundNode = node as Text;
        lastIndex = index;
      } else {
        index -= (node as Text).length;
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      if (!(node as HTMLElement).isContentEditable) {
        index -= node.textContent!.length
      } else {
        for (let i = 0; i < node.childNodes.length; i++) {
          find(node.childNodes[i]);
          if (foundNode) return;
        }
      }
    }
  }

  find(element);
  return {
    node: foundNode!,
    offset: lastIndex
  };
}
