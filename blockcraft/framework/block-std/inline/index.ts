import {
  DeltaInsert,
  DeltaInsertEmbed,
  DeltaInsertText,
  DeltaOperation,
  DeltaRetain,
  IInlineNodeAttrs,
  InlineModel
} from "../types";
import {
  INLINE_ELEMENT_TAG, INLINE_END_BREAK_CLASS,
  INLINE_TEXT_NODE_TAG
} from "./const";
import {BlockCraftError, ErrorCode} from "../../../global";
import setAttributes from "./setAttributes";
import {compareAttributesWithEle} from "./compareAttributes";
import {createZeroSpace} from "../../utils";
import {getAttributesFrom} from "./getAttributes";

export type EmbedConverter = {
  toDelta: EmbedViewToDelta
  toView: CreateEmbedView
}
export type CreateEmbedView = (delta: DeltaInsertEmbed) => HTMLElement
export type EmbedViewToDelta = (ele: HTMLElement) => DeltaInsertEmbed

export class InlineManager {
  private _embedConverterMap: Map<string, EmbedConverter>

  constructor(readonly doc: BlockCraft.Doc) {
    this._embedConverterMap = new Map<string, EmbedConverter>(this.doc.config.embeds || [])
  }

  static setAttrs(element: HTMLElement, attributes?: IInlineNodeAttrs) {
    if (!attributes) return
    setAttributes(element, attributes)
  }

  static getAttrs(element: HTMLElement): IInlineNodeAttrs {
    return getAttributesFrom(element)
  }

  static createTextNode(text: string): HTMLElement {
    const node = document.createElement(INLINE_TEXT_NODE_TAG)
    node.textContent = text
    return node
  }

  static createTextElement(delta: DeltaInsertText): HTMLElement {
    const node = document.createElement(INLINE_ELEMENT_TAG)
    node.appendChild(InlineManager.createTextNode(delta.insert))
    delta.attributes && setAttributes(node, delta.attributes)
    return node
  }

  // static createAnchorElement(delta: DeltaInsertText): HTMLElement {
  //   const node = document.createElement(INLINE_ELEMENT_TAG)
  //   const anchor = document.createElement('a')
  //   anchor.textContent = delta.insert
  //   anchor.href = delta.attributes?.['a:link'] || ''
  //   node.appendChild(anchor)
  //   delta.attributes && setAttributes(node, delta.attributes)
  //   return node
  // }

  createInlineNode(delta: DeltaInsert): HTMLElement {
    if (typeof delta.insert === 'string') {
      // if(delta.attributes?.['a:link']) {
      //   return InlineManager.createAnchorElement(delta as DeltaInsertText)
      // }
      return InlineManager.createTextElement(delta as DeltaInsertText)
    }

    const converter = this._embedConverterMap.get(Object.keys(delta.insert)[0])
    if (!converter) {
      throw new BlockCraftError(ErrorCode.InlineEditorError, 'no embed registered for this type: ' + Object.keys(delta.insert)[0])
    }
    const node = document.createElement(INLINE_ELEMENT_TAG)
    const span = document.createElement('span')
    span.setAttribute('contenteditable', 'false')
    const embed = converter.toView(delta as DeltaInsertEmbed)
    span.appendChild(embed)
    node.append(span, createZeroSpace())
    return node
  }

  private _createEndBreak(): HTMLElement {
    const node = document.createElement(INLINE_ELEMENT_TAG)
    node.classList.add(INLINE_END_BREAK_CLASS)
    node.appendChild(document.createElement('br'))
    return node
  }

  createInlineNodeGroup(deltas: DeltaInsert[]): HTMLElement[] {
    return deltas.map(delta => this.createInlineNode(delta))
  }

  render(deltas: InlineModel, container: HTMLElement) {
    container.replaceChildren(createZeroSpace(), ...this.createInlineNodeGroup(deltas), this._createEndBreak())
  }

  applyDeltaToView(deltas: DeltaOperation[], container: HTMLElement) {
    const elementsNodes = Array.from(container.querySelectorAll(INLINE_ELEMENT_TAG)) as HTMLElement[]

    let nodeStep = {
      index: 0,
      indexInNode: 0
    }

    const sliceInlineElement = (ele: HTMLElement, index: number, len: number, attrs: IInlineNodeAttrs) => {
      const textNode = ele.firstElementChild!.firstChild as Text
      const splitTextContent = textNode.wholeText.slice(index, len + index)
      const clonedNode = ele.cloneNode(true) as HTMLElement
      setAttributes(clonedNode, attrs)
      textNode.deleteData(index, len)
      ;(clonedNode.firstElementChild?.firstChild as Text).textContent = splitTextContent
      return clonedNode
    }

    const stepRetain = (op: DeltaRetain) => {
      let len = op.retain

      while (len > 0) {

        const ele = elementsNodes[nodeStep.index]
        const eleLength = (ele.firstElementChild as HTMLElement).isContentEditable ? ele.textContent!.length : 1

        // AAAAAA|
        if (nodeStep.indexInNode === eleLength) {
          nodeStep = {
            index: nodeStep.index + 1,
            indexInNode: 0
          }
          continue
        }

        // |AAAAAA?
        if (nodeStep.indexInNode === 0) {
          // |AAAAA|A
          if (len < eleLength) {

            if (op.attributes) {
              const beforeNode = sliceInlineElement(ele, 0, len, op.attributes)
              ele.before(beforeNode)
              elementsNodes.splice(nodeStep.index, 0, beforeNode)
              nodeStep = {
                index: nodeStep.index + 1,
                indexInNode: eleLength - len
              }
              len = 0
              break
            }

            nodeStep.indexInNode = len
            len = 0
            break
          }

          // |AAAAAA|
          op.attributes && setAttributes(ele, op.attributes)
          len -= eleLength
          nodeStep = {
            index: nodeStep.index,
            indexInNode: eleLength
          }
          continue
        }

        // A|AAAAAA|
        if (len >= eleLength - nodeStep.indexInNode) {
          const restLen = eleLength - nodeStep.indexInNode
          if (op.attributes) {
            const node = sliceInlineElement(ele, nodeStep.indexInNode, restLen, op.attributes)
            ele.after(node)
            elementsNodes.splice(nodeStep.index + 1, 0, node)
            nodeStep = {
              index: nodeStep.index + 1,
              indexInNode: restLen
            }
            len -= restLen
            continue
          }

          len -= restLen
          nodeStep = {
            index: nodeStep.index + 1,
            indexInNode: 0
          }
          continue
        }

        // A|AAA|A
        if (op.attributes) {
          const textNode = ele.firstElementChild!.firstChild as Text
          const wholeText = textNode.wholeText

          const beforeNode = ele.cloneNode(false) as HTMLElement
          const afterNode = ele.cloneNode(false) as HTMLElement
          beforeNode.appendChild(InlineManager.createTextNode(wholeText.slice(0, nodeStep.indexInNode)))
          afterNode.appendChild(InlineManager.createTextNode(wholeText.slice(nodeStep.indexInNode + len)))

          textNode.deleteData(nodeStep.indexInNode + len, wholeText.length - nodeStep.indexInNode - len)
          textNode.deleteData(0, nodeStep.indexInNode)

          ele.before(beforeNode)
          ele.after(afterNode)
          setAttributes(ele, op.attributes)

          elementsNodes.splice(nodeStep.index, 0, beforeNode)
          elementsNodes.splice(nodeStep.index + 2, 0, afterNode)
          len = 0
          nodeStep = {
            index: nodeStep.index + 1,
            indexInNode: len
          }
          continue
        }

        nodeStep.indexInNode += len
        len = 0
        break
      }
    }

    const stepDelete = (len: number) => {
      if (!len) return;
      while (len > 0) {
        const ele = elementsNodes[nodeStep.index]
        const isElementEmbed = !(ele.firstElementChild as HTMLElement).isContentEditable
        const eleLength = isElementEmbed ? 1 : ele.textContent!.length

        if (nodeStep.indexInNode === eleLength) {
          nodeStep = {
            index: nodeStep.index + 1,
            indexInNode: 0
          }
          continue
        }

        if (nodeStep.indexInNode === 0 && len >= eleLength) {
          ele.remove()
          len -= eleLength
          elementsNodes.splice(nodeStep.index, 1)

          if (!elementsNodes.length) {
            nodeStep = {
              index: 0,
              indexInNode: 0
            }
            return
          }

          nodeStep = {
            index: nodeStep.index,
            indexInNode: 0
          }
          continue
        }

        const textNode = ele.firstElementChild?.firstChild as Text
        if (!(textNode instanceof Text)) {
          throw new BlockCraftError(ErrorCode.InlineEditorError, 'Error inline node match')
        }
        const maxDeleteLength = eleLength - nodeStep.indexInNode
        if (len >= maxDeleteLength) {
          textNode.deleteData(nodeStep.indexInNode, maxDeleteLength)
          len -= maxDeleteLength
          nodeStep = {
            index: nodeStep.index + 1,
            indexInNode: 0
          }
        } else {
          textNode.deleteData(nodeStep.indexInNode, len)
          len = 0
        }
      }
    }

    const stepInsert = (op: DeltaInsert) => {

      const isOpElementEmbed = typeof op.insert === 'object'
      const opLength = isOpElementEmbed ? 1 : (op.insert as string).length

      if (!elementsNodes.length) {
        const ele = this.createInlineNode(op)
        container.firstElementChild!.after(ele)
        elementsNodes.push(ele)
        nodeStep = {
          index: 0,
          indexInNode: opLength
        }
        return
      }

      let ele: HTMLElement
      let isElementEmbed: boolean
      let eleLength: number
      if (nodeStep.indexInNode === 0 && nodeStep.index >= elementsNodes.length) {
        ele = elementsNodes[elementsNodes.length - 1]
        isElementEmbed = !(ele.firstElementChild as HTMLElement).isContentEditable
        eleLength = isElementEmbed ? 1 : ele.textContent!.length
        nodeStep = {
          index: elementsNodes.length - 1,
          indexInNode: eleLength
        }
      } else {
        ele = elementsNodes[nodeStep.index]
        isElementEmbed = !(ele.firstElementChild as HTMLElement).isContentEditable
        eleLength = isElementEmbed ? 1 : ele.textContent!.length
      }

      // case 1 : embed node
      if (isElementEmbed) {
        const newNode = this.createInlineNode(op)
        if (nodeStep.indexInNode === 0) {
          ele.before(newNode)
          elementsNodes.splice(nodeStep.index, 0, newNode)
          nodeStep = {
            index: nodeStep.index,
            indexInNode: opLength
          }
          return
        }
        ele.after(newNode)
        elementsNodes.splice(nodeStep.index + 1, 0, newNode)
        nodeStep = {
          index: nodeStep.index + 1,
          indexInNode: opLength
        }
        return
      }

      // case 2 : text node
      // case 2.1: at text node begin
      if (nodeStep.indexInNode === 0) {

        // case 2.1.1: text node is first element
        if (nodeStep.index === 0) {
          const newNode = this.createInlineNode(op)
          ele.before(newNode)
          elementsNodes.splice(0, 0, newNode)
          nodeStep = {
            index: 0,
            indexInNode: opLength
          }
          return
        }

        // case 2.1.2: text node is not first element
        const prevNode = elementsNodes[nodeStep.index - 1]
        const isPrevEmbed = !(prevNode.firstElementChild as HTMLElement).isContentEditable
        const isPrevEqual = compareAttributesWithEle(prevNode, op.attributes)

        if (isPrevEmbed || !isPrevEqual || isOpElementEmbed) {

          const newNode = this.createInlineNode(op)
          ele.before(newNode)
          elementsNodes.splice(nodeStep.index, 0, newNode)
          nodeStep = {
            index: nodeStep.index,
            indexInNode: opLength
          }

          return
        }

        // case 2.1.3: text node is not first element and equal
        if (typeof op.insert === 'string') {
          const prevTextNode = prevNode.firstElementChild?.firstChild as Text
          if (!(prevTextNode instanceof Text)) {
            throw new BlockCraftError(ErrorCode.InlineEditorError, 'Error inline node match')
          }
          const prevLength = prevTextNode.length
          prevTextNode.insertData(prevLength, op.insert)
          nodeStep = {
            index: nodeStep.index - 1,
            indexInNode: prevLength + opLength
          }
          return
        }
      }

      // case 2.2
      const isEqual = compareAttributesWithEle(ele, op.attributes)
      // case 2.2.1: insert equal text to text node
      if (isEqual && typeof op.insert === 'string') {
        const textNode = ele.firstElementChild?.firstChild as Text
        if (!(textNode instanceof Text)) {
          throw new BlockCraftError(ErrorCode.InlineEditorError, 'Error inline node match')
        }
        textNode.insertData(nodeStep.indexInNode, op.insert)
        nodeStep.indexInNode += op.insert.length
        return;
      }

      // case 2.2.2: insert embed node or not equal text to text node
      const newNode = this.createInlineNode(op)

      // case 2.2.2.1: at last of text node
      if (nodeStep.indexInNode === eleLength) {
        // text-embed-gap
        ele.after(newNode)
        elementsNodes.splice(nodeStep.index + 1, 0, newNode)
        nodeStep = {
          index: nodeStep.index + 1,
          indexInNode: opLength
        }
        return
      }

      // case 2.2.2.2: at middle of text node
      // text-embed-text or text-text-text
      const textNode = ele.firstElementChild?.firstChild as Text
      if (!(textNode instanceof Text)) {
        throw new BlockCraftError(ErrorCode.InlineEditorError, 'Error inline node match')
      }
      const clonedNode = ele.cloneNode(true) as HTMLElement
      textNode.deleteData(nodeStep.indexInNode, eleLength - nodeStep.indexInNode);
      (clonedNode.firstElementChild?.firstChild as Text).deleteData(0, nodeStep.indexInNode)
      ele.after(newNode, clonedNode)
      elementsNodes.splice(nodeStep.index + 1, 0, newNode, clonedNode)
      nodeStep = {
        index: nodeStep.index + 1,
        indexInNode: opLength
      }
    }

    for (const delta of deltas) {
      if (delta.retain) {
        stepRetain(delta as DeltaRetain)
        continue
      }
      if (delta.delete) {
        stepDelete(delta.delete)
        continue
      }
      if (delta.insert) {
        stepInsert(delta as DeltaInsert)
      }
    }

    if (!elementsNodes.length) {
      container.replaceChildren(createZeroSpace())
      return
    }
  }

  queryNodePositionInlineByOffset(container: HTMLElement, offset: number): {
    node: HTMLElement | Text,
    offset: number
  } {
    if (offset === 0) {
      return {
        node: container.firstElementChild?.firstChild as Text,
        offset: 0
      }
    }

    const elementsNodes = Array.from(container.querySelectorAll(INLINE_ELEMENT_TAG)) as HTMLElement[]
    for (const ele of elementsNodes) {
      const isEmbed = !(ele.firstElementChild as HTMLElement).isContentEditable
      const eleLength = isEmbed ? 1 : ele.textContent!.length
      if (offset <= eleLength) {
        if (isEmbed && offset === 1) {
          return {
            node: ele.querySelector('[data-zero-space="true"]')!.firstChild as Text,
            offset: 0
          }
        }

        return {
          node: ele.firstElementChild!.firstChild as Text,
          offset: offset
        }
      }
      offset -= eleLength
    }
    throw new BlockCraftError(ErrorCode.InlineEditorError, `Error inline node position queried: character offset: ${offset}`)
  }

}

export * from './const'
export * from './compareAttributes'
