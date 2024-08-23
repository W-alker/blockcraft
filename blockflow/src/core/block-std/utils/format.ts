import {IInlineAttrs} from "@core/types";
import {setAttributes} from "@core/block-std";
import {getCharacterRange, ICharacterRange, setRange} from "@core/utils";

export const formatWithAttrs = <T extends IInlineAttrs>(node: HTMLElement, characterRange: ICharacterRange, attrs: T) => {
  const range = setRange(characterRange, node)
  if (!range?.commonAncestorContainer || !node.contains(range.commonAncestorContainer)) throw new Error('range is invalid')
  console.log('format =============', range)

  // if(typeof characterRange.start) throw new Error('formatWithAttrs not implemented')

  if (range.startContainer instanceof HTMLElement && range.startContainer === node) {
    console.log('range.startContainer instanceof HTMLElement && range.endContainer === range.commonAncestorContainer && range.startContainer === node')
    range.selectNodeContents(node)
  }

  if (range.startContainer === range.endContainer) {
    console.log('same container !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!')

    if (range.startContainer instanceof Text) {
      console.log('text container !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!')

      if (range.startOffset === 0 && range.endOffset === range.startContainer.textContent!.length) {
        const parent = range.startContainer.parentNode!
        if (parent instanceof HTMLElement) {
          setAttributes(parent, attrs)
          return range
        }
      }
    }

    if(range.startContainer instanceof HTMLElement) {
      console.log('ele container !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!')
      if (range.startOffset === 0 && range.endOffset === range.startContainer.childNodes.length) {
        setAttributes(range.startContainer, attrs)
        return range
      }
    }

  }

  const cRange = getCharacterRange(node, range)
  const parent = range.startContainer.parentNode!
  // 如果range包裹的节点有父节点，那么需要将父节点拆分，确保commonAncestorContainer的子孙节点只有一层
  if (range.startContainer === range.endContainer && parent instanceof HTMLElement && !parent.getAttribute('bf-node-type')) {
    console.log('spalit parent node !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!')

    const splitText = parent.textContent!.slice(range.startOffset, range.endOffset)
    const leftText = parent.textContent!.slice(0, range.startOffset)
    const rightText = parent.textContent!.slice(range.endOffset)

    const cloneNodeRight = parent.cloneNode() as HTMLElement
    const cloneNodeCenter = parent.cloneNode() as HTMLElement
    parent.textContent = leftText
    cloneNodeRight.textContent = rightText
    setAttributes(cloneNodeCenter, attrs)
    cloneNodeCenter.textContent = splitText

    parent.after(cloneNodeRight)
    cloneNodeRight.before(cloneNodeCenter)

  } else {

    const selContent = range.cloneContents()
    const childNodes = selContent.childNodes

    for (let i = 0; i < childNodes.length; i++) {
      const node = childNodes[i]
      if (node instanceof Text) {
        const span = document.createElement('span')
        setAttributes(span, attrs)
        if (node.textContent === '') {
          selContent.removeChild(node)
          continue
        }
        span.textContent = node.textContent
        selContent.replaceChild(span, node)
      } else if (node instanceof HTMLElement) {
        setAttributes(node, attrs)
      }
    }

    range.deleteContents()
    range.insertNode(selContent)
  }

  mergeAdjacentSameStyleNode(node)
  setRange(cRange, node, range)
  return range
}

export const mergeAdjacentSameStyleNode = (container: HTMLElement) => {
  // 清理空文本节点
  for (let i = 0; i < container.childNodes.length; i++) {
    const node = container.childNodes[i]
    if (node.textContent === '') node.remove()
  }
  // 整理合并相邻的标签
  for (let i = 0; i < container.children.length; i++) {
    if (i === container.childNodes.length - 1) return
    const node = container.children[i]
    const nextNode = container.children[i + 1]
    if (node instanceof HTMLElement && nextNode instanceof HTMLElement && isSameStyle(node, nextNode)) {
      node.textContent! += nextNode.textContent
      nextNode.remove()
      i--
    }
  }
}

export const isSameStyle = (node: HTMLElement, node2: HTMLElement) => {
  const style1 = node.style
  const style2 = node2.style
  if (style1.length !== style2.length) return false
  if (style1.fontSize !== style2.fontSize) return false
  if (style1.fontWeight !== style2.fontWeight) return false
  if (style1.color !== style2.color) return false
  if (style1.backgroundColor !== style2.backgroundColor) return false
  const attrs = node.attributes
  const attrs2 = node2.attributes
  if (attrs.length !== attrs2.length) return false
  for (let i = 0; i < attrs.length; i++) {
    const attr = attrs[i]
    if (attr.value !== attrs2.getNamedItem(attr.name)?.value) return false
  }
  return true
}


