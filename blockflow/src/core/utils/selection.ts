/* 纯文本索引的焦点选区范围 */
export interface ICharacterRange {
  start: number,
  end: number,
}

/* 焦点选区 */
export interface IFocusSelection {
  // 聚焦的节点
  node: Node | ChildNode,
  // 聚焦的偏移量（相对于聚焦节点）
  offset: number
}

export type CharacterIndex = number | 'start' | 'end'

export const characterIndex2Number = (index: CharacterIndex, length: number) => {
  return typeof index === 'number' ? index : index === 'start' ? 0 : length
}

/*
* 光标是否聚焦在元素的开头，如果目前有range，则直接返回false
* */
export const isCursorAtElStart = (el: HTMLElement) => {
  const sel = document.getSelection()!
  if (!sel.isCollapsed || !el.contains(sel.anchorNode) || sel.anchorOffset !== 0) return false
  const _range = document.createRange()
  _range.setStart(el, 0)
  _range.setEnd(sel.anchorNode!, sel.anchorOffset)
  _range.detach()
  return _range.toString() === ''
}

/*
* 光标是否聚焦在元素的结尾，如果目前有range，则直接返回false
 */
export const isCursorAtElEnd = (el: HTMLElement) => {
  const sel = document.getSelection()!
  if (!sel.isCollapsed || !el.contains(sel.anchorNode)) return false
  const _range = document.createRange()
  _range.setEnd(el, el.childNodes.length)
  _range.setStart(sel.focusNode!, sel.focusOffset)
  _range.detach()
  return _range.toString() === ''
}

export const replaceSelectionInView = (range: Range) => {
  const sel = window.getSelection()!
  sel.removeAllRanges()
  sel.addRange(range)
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

/*
* 获取当前的选区
* @param {HTMLElement} containerEl - 选区所在的容器元素, 默认为当前焦点元素
* @returns {IRange} - 纯文本索引的选区
* */
export const getRange = (containerEl = document.activeElement as HTMLElement): ICharacterRange => {
  const sel = document.getSelection()!
  if(!containerEl.contentEditable) throw new Error('containerEl is not contentEditable')
  if (containerEl.localName === 'input' || containerEl.localName === 'textarea') {
    const inputEl = containerEl as HTMLInputElement
    return {
      start: inputEl.selectionStart!,
      end: inputEl.selectionEnd!,
    }
  }

  const start = findCharacterIndexByCursor(containerEl, sel.anchorNode!, sel.anchorOffset)
  const end = sel.isCollapsed ? start : findCharacterIndexByCursor(containerEl, sel.focusNode!, sel.focusOffset)
  return {
    // containerEl,
    start: Math.min(start, end),
    end: Math.max(start, end),
  }
}

/**
 * 获取选区的纯文本字符索引范围
 * @param containerEl 选区所在的容器元素
 * @param range 选区
 */
export const getCharacterRange = (containerEl: HTMLElement, range: Range) => {
  if (!range?.commonAncestorContainer || !containerEl.contains(range.commonAncestorContainer)) throw new Error('range is invalid')
  const start = findCharacterIndexByCursor(containerEl, range.startContainer, range.startOffset)
  const end = range.collapsed ? start : findCharacterIndexByCursor(containerEl, range.endContainer, range.endOffset)
  return {
    start: Math.min(start, end),
    end: Math.max(start, end),
  }
}

/*
* 恢复选区
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
  const pos1 = findTextNodeAndLastIndexByCharacterIndex(el, Math.max(0, range.start))
  rangeInstance.setStart(pos1.node, pos1.offset)
  if (range.start === range.end) {
    rangeInstance.setEnd(pos1.node, pos1.offset)
  } else {
    const pos2 = findTextNodeAndLastIndexByCharacterIndex(el, Math.min(range.end, el.textContent!.length))
    rangeInstance.setEnd(pos2.node, pos2.offset)
  }
  return rangeInstance
}

/**
 * 可以处理深层级节点
 * @param el 指定的节点
 * @param index 偏移量（相对于自身的innerText）
 * @returns
 */
export const setCursorByCharacterIndex = (el: HTMLElement, index?: CharacterIndex) => {
  // console.log('focus el with caret pos', el.firstChild, index)
  el.focus();
  if (!index || !el.innerText || (typeof index === 'number' && index > el.textContent!.length)) return
  // 1. 表单元素处理
  if (el.localName === 'input' || el.localName === 'textarea') {
    const endPos = (el as HTMLInputElement).value.length
    if (index === 'end') return (el as HTMLInputElement).setSelectionRange(endPos, endPos)
    if (index === 'start') return (el as HTMLInputElement).setSelectionRange(0, 0)
    return (el as HTMLInputElement).setSelectionRange(index, index)
  }
  const sel = window.getSelection()!
  // 2. 纯文本情况，如果内部包含子元素，需要另处理
  if (el.childNodes.length === 1 && el.firstChild!.nodeType === Node.TEXT_NODE) {
    const textNode = el.firstChild;
    sel.setPosition(textNode, index === 'end' ? textNode!.textContent!.length : index === 'start' ? 0 : index)
  } else {
    // 3. 有子元素的情况
    if (index === 'end') return sel.setPosition(el, el.childNodes.length)
    if (index === 'start') return sel.setPosition(el, 0)

    const res = findTextNodeAndLastIndexByCharacterIndex(el, index)
    return sel.setPosition(res.node, res.offset)
  }
}

/*
* 根据纯文本的字符索引找到DOM节点里所在的文本节点和索引
* @param {HTMLElement} element - 容器元素
* @param {number} index - 纯文本的字符索引
* @returns {IFocusSelection} - 文本节点和偏移量
 */
export const findTextNodeAndLastIndexByCharacterIndex = (element = document.activeElement!, index: number): IFocusSelection => {
  let foundNode: Node | null = null;
  let lastIndex = -1;
  if (index === 0) return {node: element, offset: 0}
  if (index === element.textContent!.length) return {node: element, offset: element.childNodes.length}

  function find(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (index <= (node as Text).length) {
        foundNode = node;
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

// 获取被光标分割的左右两边的dom片段
// export const getSplitFragmentByCursor = (el = document.activeElement as HTMLElement) => {
//   const selection = document.getSelection()!
//   const range = document.createRange()
//   const {anchorNode, anchorOffset, focusNode, focusOffset} = selection
//   range.setStart(focusNode!, focusOffset)
//   range.setEnd(el, el.childNodes.length)
//   range.detach()
//
//   const range2 = document.createRange()
//   range2.setStart(el, 0)
//   range2.setEnd(anchorNode!, anchorOffset)
//   range2.detach()
//
//   return {
//     left: range2.cloneContents(),
//     right: range.cloneContents()
//   }
// }

// 获取被光标分割的左右两边的HTML
// export const getSplitHTMLByCursor = (el = document.activeElement as HTMLElement) => {
//   const fragment = getSplitFragmentByCursor(el)
//   const div = document.createElement('div')
//   div.appendChild(fragment.left)
//   const leftHTML = div.innerHTML
//   div.innerHTML = ''
//   div.appendChild(fragment.right)
//   const rightHTML = div.innerHTML
//   return {leftHTML, rightHTML}
// }


