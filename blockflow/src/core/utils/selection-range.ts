/* 纯文本索引的焦点选区范围 */
export interface ICharacterRange {
  start: number,
  end: number,
}

export interface ICharacterPosition {
  textNode: Text,
  offset: number,
  eleOffset: number,
  beforeEleOffset: number
}

export type CharacterIndex = number | 'start' | 'end'

export const characterIndex2Number = (index: CharacterIndex, length: number) => {
  return typeof index === 'number' ? index : index === 'start' ? 0 : length
}

export const getCurrentCharacterRange = (): ICharacterRange => {
  return getRange()
  // const sel = document.getSelection()
  // const activeElement = document.activeElement
  // if (!sel || !activeElement) throw new Error('No selection or active element')
  // if(!activeElement.childElementCount) return {start: 0, end: 0}
  // let start = 0, end = 0, cnt = 0
  // const children = activeElement.children
  // for (let i = 0; i < children.length; i++) {
  //   const child = children[i]
  //   const textNode = child.firstChild as Text
  //   if (textNode === sel.anchorNode) {
  //     start = cnt + sel.anchorOffset
  //   }
  //   if (textNode === sel.focusNode) {
  //     end = cnt + sel.focusOffset
  //     break
  //   }
  //   cnt += textNode.data!.length
  // }
  // return {
  //   start: Math.min(start, end),
  //   end: Math.max(start, end)
  // }
}

export const getRange = (containerEl = document.activeElement as HTMLElement): ICharacterRange => {
  const sel = document.getSelection()!
  if (!containerEl.contentEditable) throw new Error('containerEl is not contentEditable')
  if (containerEl.localName === 'input' || containerEl.localName === 'textarea') {
    const inputEl = containerEl as HTMLInputElement
    return {
      start: inputEl.selectionStart!,
      end: inputEl.selectionEnd!,
    }
  }

  const start = findCharacterIndexByCursor(containerEl, sel.anchorNode!, sel.anchorOffset)
  const end = sel.isCollapsed ? start : (sel.anchorNode === sel.focusNode ? sel.focusOffset - sel.anchorOffset + start : findCharacterIndexByCursor(containerEl, sel.focusNode!, sel.focusOffset))
  return {
    // containerEl,
    start: Math.min(start, end),
    end: Math.max(start, end),
  }
}

/* 根据光标所在节点及文本偏移量找到在ContainerEl上纯文本的字符索引
  * @param {HTMLElement} containerEl - 光标所在的容器元素
  * @param {Node} node - 光标所在的节点, 一般为文本节点
  * @param {number} offset - 光标所在的文本偏移量
  * @returns {number} - 纯文本的字符索引
 */
const findCharacterIndexByCursor = (containerEl: HTMLElement, node: Node, offset: number) => {
  const range = document.createRange()
  range.setStart(containerEl, 0)
  range.setEnd(node, offset)
  const len = range.toString().length
  range.detach()
  return len
}

export const isCursorAtElStart = (el: HTMLElement) => {
  const sel = document.getSelection()!
  if (!el.firstElementChild || !el.textContent) return true
  return sel.isCollapsed && el.firstElementChild!.contains(sel.anchorNode) && sel.anchorOffset === 0
}

export const isCursorAtElEnd = (el: HTMLElement) => {
  const sel = document.getSelection()!
  if (!el.lastElementChild || !el.textContent) return true
  return sel.isCollapsed && el.lastElementChild!.contains(sel.anchorNode) && sel.anchorOffset === sel.anchorNode!.textContent!.length
}

export const setSelection = (el: HTMLElement, start: CharacterIndex, end: CharacterIndex) => {
  const sel = document.getSelection()!
  if (!el.textContent) {
    sel.setPosition(el, 0)
  } else if (start === end) {
    start = characterIndex2Number(start, el.textContent!.length)
    const pos = findTextNodeByIndex(el, start)
    sel.setPosition(pos.textNode, pos.offset)
  } else {
    start = characterIndex2Number(start, el.textContent!.length)
    end = characterIndex2Number(end, el.textContent!.length)
    const startNode = findTextNodeByIndex(el, start)
    const endNode = findTextNodeByIndex(el, end, startNode)
    sel.setBaseAndExtent(startNode.textNode, startNode.offset, endNode.textNode, endNode.offset)
  }
}

/*
* 根据纯文本的字符索引设置选区
* @param {IRange} range - 纯文本索引的选区
* @param {HTMLElement} el - 恢复选区的容器元素
* @param {Range} rangeInstance - Range实例, 如果没有则默认使用document.createRange()
*/
export const setRange = (range: ICharacterRange, el: HTMLElement, rangeInstance: Range = document.createRange()) => {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    rangeInstance.setStart(el, range.start)
    rangeInstance.setEnd(el, range.end)
    return rangeInstance
  }

  if (!el.childElementCount) {
    rangeInstance.setStart(el, 0)
    rangeInstance.setEnd(el, 0)
    return rangeInstance
  }

  const pos1 = findTextNodeByIndex(el, range.start)
  rangeInstance.setStart(pos1.textNode, pos1.offset)
  if (range.start === range.end) {
    rangeInstance.setEnd(pos1.textNode, pos1.offset)
  } else {
    const pos2 = findTextNodeByIndex(el, range.end)
    rangeInstance.setEnd(pos2.textNode, pos2.offset)
  }
  return rangeInstance
}

export const replaceRangeInView = (range: Range) => {
  const sel = window.getSelection()!
  sel.removeAllRanges()
  sel.addRange(range)
}

export const findTextNodeByIndex = (ele: HTMLElement, index: number, findFrom?: ICharacterPosition): ICharacterPosition => {
  if (!ele.children.length) throw new Error('no children')

  let cnt = findFrom?.beforeEleOffset || 0
  if (index === 0) return {
    textNode: ele.firstChild!.firstChild as Text,
    offset: 0,
    eleOffset: 0,
    beforeEleOffset: -1
  }
  if (index === ele.textContent!.length) return {
    textNode: ele.lastChild!.lastChild as Text,
    offset: ele.lastChild!.textContent!.length,
    eleOffset: ele.children.length - 1,
    beforeEleOffset: ele.textContent!.length
  }

  const childElements = ele.children
  for (let i = findFrom?.eleOffset || 0; i < childElements.length; i++) {
    const child = childElements[i]
    const childTextLength = child.textContent!.length
    if (cnt + childTextLength >= index) {
      return {
        textNode: child.firstChild as Text,
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
