import {Controller, isEmbedElement} from "../../../core";

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

export type IBlockFlowRange = { rootRange?: ICharacterRange, isAtRoot: true, rootId: string }
  | { blockRange: ICharacterRange, blockId: string, isAtRoot: false }

export class BlockFlowSelection {
  static characterIndex2Number = (index: CharacterIndex, length: number) => {
    return typeof index === 'number' ? index : index === 'start' ? 0 : length
  }

  constructor(
    public readonly controller: Controller
  ) {
  }

  get activeElement() {
    return this.controller.activeElement
  }

  get root() {
    return this.controller.root
  }

  getSelection(): IBlockFlowRange | null {
    if (!this.activeElement) return null
    if (this.activeElement === this.root.rootElement) {
      return {
        rootRange: this.root.selectedBlockRange,
        isAtRoot: true,
        rootId: this.controller.rootId,
      }
    }
    return {
      blockRange: BlockFlowSelection.getCurrentCharacterRange(this.activeElement),
      isAtRoot: false,
      blockId: this.root.getActiveBlockId()!,
    }
  }

  setSelection(target: string, from: CharacterIndex, to?: CharacterIndex) {
    if (target === this.controller.rootId) {
      this.root.selectBlocks(from, to ?? from)
    } else {
      const bRef = this.controller.getBlockRef(target)
      if (!bRef || bRef.nodeType !== 'editable') return
      // @ts-ignore
      bRef.setSelection(from, to ?? from)
    }
  }

  applyRange(range: IBlockFlowRange) {
    if (!range) return
    if (range.isAtRoot) {
      if (!range.rootRange) this.root.rootElement.focus({preventScroll: true})
      else this.setSelection(range.rootId, range.rootRange!.start, range.rootRange!.end)
    } else {
      this.setSelection(range.blockId, range.blockRange!.start, range.blockRange!.end)
    }
  }

  static isCursorAtElStart = (el: HTMLElement) => {
    const sel = document.getSelection()!
    if (!sel.isCollapsed) return false
    if (!el.childNodes || el.childNodes[0] === sel.focusNode) return true
    return el.firstElementChild!.contains(sel.anchorNode) && sel.anchorOffset === 0
  }

  static isCursorAtElEnd = (el: HTMLElement) => {
    const sel = document.getSelection()!
    if (!sel.isCollapsed) return false
    if (!el.childNodes || el.childNodes[el.childNodes.length - 1] === sel.focusNode) return true
    return el.lastElementChild!.contains(sel.anchorNode) && sel.anchorOffset === el.lastElementChild!.textContent!.length
  }

  static getCurrentCharacterRange = (activeElement: HTMLElement): ICharacterRange => {
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

        const textNode = child.firstChild! as Text

        if (child === startContainer || startContainer === textNode) {
          startPos = cnt + startOffset
        }

        if (child === endContainer || endContainer === textNode) {
          endPos = cnt + endOffset
          break
        }

        cnt += isEmbedElement(child) ? 1 : textNode.length
      }
    }

    return {start: startPos, end: endPos}
  }

  static findNodeByIndex = (ele: HTMLElement, index: number, findFrom?: ICharacterPosition): ICharacterPosition => {
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

  static getElementCharacterOffset = (ele: HTMLElement, container: HTMLElement) => {
    let cnt = 0
    for (let i = 0; i < container.children.length; i++) {
      const child = container.children[i]
      if (child === ele) return cnt
      cnt += isEmbedElement(child) ? 1 : child.textContent!.length
    }
    return -1
  }
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
    const {node, offset, eleOffset} = BlockFlowSelection.findNodeByIndex(el, start)
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
      const startPos = BlockFlowSelection.findNodeByIndex(el, start)
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
      const endPos = BlockFlowSelection.findNodeByIndex(el, end)
      _range.setEnd(endPos.node.firstChild!, endPos.offset)
      break
  }
  sel.removeAllRanges()
  sel.addRange(_range)
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
