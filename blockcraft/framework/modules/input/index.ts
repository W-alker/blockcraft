import {fromEvent} from "rxjs";
import {BlockCraftError, ErrorCode} from "../../../global";
import {EditableBlockComponent} from "../../block";
import {ORIGIN_SKIP_SYNC} from "../../doc";
import {DeltaOperation} from "../../types";
import {
  INLINE_ELEMENT_TAG,
  INLINE_EMBED_GAP_TAG,
  INLINE_EMBED_NODE_TAG,
  INLINE_TEXT_NODE_TAG,
  ZERO_WIDTH_SPACE
} from "../../inline";

interface IInlineRange {
  index: number
  length: number
}

interface IBlockInlineRange extends IInlineRange {
  blockId: string
  block: EditableBlockComponent
}

interface INormalizedRange {
  from: IBlockInlineRange,
  to: IBlockInlineRange | null,
  collapsed: boolean
}

export class InputTransformer {

  isComposing = false
  private _composeRange: INormalizedRange | null = null

  constructor(public readonly doc: BlockCraft.Doc) {
    this.doc.afterInit(() => this._init(this.doc.root.hostElement))
  }

  private _init(rootEl: HTMLElement) {
    fromEvent<CompositionEvent>(rootEl, 'compositionstart').subscribe(ev => {
      this.isComposing = true
      const range = document.getSelection()!.getRangeAt(0)
      this._composeRange = this.normalizeRange(range)
      if (!this._composeRange.collapsed) {
        this._replaceText(this._composeRange)
      }
    })
    fromEvent<CompositionEvent>(rootEl, 'compositionend').subscribe(ev => {
      this.isComposing = false
      ev.preventDefault()
      this.doc.crud.transact(() => {
        this._composeRange!.from.block.yText.insert(this._composeRange!.from.index, ev.data)
        // TODO: 更好的中文输入法反显渲染
        // const start = performance.now()
        this._composeRange!.from.block.rerender()
        this.setSelection(this._composeRange!.from.block.hostElement, this._composeRange!.from.index + ev.data.length)
        // console.log('input time', performance.now() - start)
        this._composeRange = null
      }, ORIGIN_SKIP_SYNC)
    })
    fromEvent<InputEvent>(rootEl, 'beforeinput').subscribe(this._handleBeforeInput)
    fromEvent<KeyboardEvent>(rootEl, 'keydown').subscribe(ev => {
      if (ev.isComposing) return
      const start = performance.now()
      const selection = document.getSelection()!
      const anchorNode = selection.anchorNode
      if (selection.isCollapsed && anchorNode instanceof Text && anchorNode.parentElement?.localName === INLINE_EMBED_GAP_TAG) {
        switch (ev.key) {
          case 'Backspace':
          case 'ArrowLeft':
            if(selection.anchorOffset > 0) {
              selection.modify('move', 'backward', 'character')
            }
            break
          case 'ArrowRight':
          case 'Delete':
            if(selection.anchorOffset === 0) {
              selection.modify('move', 'forward', 'character')
            }
            break
        }
      }
      console.log('getSelection', performance.now() - start)
    })
  }

  private _closetEditableBlockId(node: Node) {
    return node.parentElement?.closest('[node-type="editable"]')?.id
  }

  private _searchEditableBlockByNode(node: Node) {
    const editableBlockId = this._closetEditableBlockId(node)
    if (!editableBlockId) {
      throw new BlockCraftError(ErrorCode.SyncInputError, 'Cannot find active block id when user input')
    }
    const block = this.doc.getBlockById(editableBlockId)
    if (!block || !(block instanceof EditableBlockComponent)) {
      throw new BlockCraftError(ErrorCode.SyncInputError, 'Fatal active editable block was found when user input')
    }
    return block
  }

  private _handleBeforeInput = (ev: InputEvent) => {
    console.log('%cbeoforeinput', 'color: red; font-size: 20px', ev, this.isComposing)

    if (ev.isComposing || ev.defaultPrevented) {
      return
    }

    const staticRange = ev.getTargetRanges
      ? ev.getTargetRanges()[0]
      : null;
    if (!staticRange) {
      return;
    }

    const normalizeRange = this.normalizeRange(staticRange)

    const {from, to} = normalizeRange
    const text = getPlainTextFromInputEvent(ev)

    if (!normalizeRange.collapsed) {
      ev.preventDefault()
      this._replaceText(normalizeRange, text)
      this.setSelection(from.block.hostElement, from.index + (text || '').length)
      return;
    }
    // in zero text
    if (staticRange.startContainer instanceof Text && staticRange.startContainer.parentElement?.localName === INLINE_EMBED_GAP_TAG) {
      const zeroTextEle = staticRange.startContainer.parentElement
      // <c-element><embed></embed><c-zero-text>ZWS;↓</c-zero-text></c-element>
      const textElement: HTMLElement = document.createElement(INLINE_TEXT_NODE_TAG)
      textElement.textContent = ZERO_WIDTH_SPACE
      if (zeroTextEle.parentElement?.localName === INLINE_ELEMENT_TAG) {
        const cloneElement = zeroTextEle.parentElement.cloneNode(false) as HTMLElement
        cloneElement.replaceChildren(textElement)
        zeroTextEle.parentElement.after(cloneElement)
      } else {
        // <paragraph><c-zero-text>ZWS;↓</c-zero-text></paragraph>
        const cElement = document.createElement(INLINE_ELEMENT_TAG)
        cElement.replaceChildren(textElement)
        zeroTextEle.after(cElement)
      }
      document.getSelection()!.selectAllChildren(textElement)
    }

    if (!text) return;
    this.doc.crud.transact(() => {
      from.block.yText.insert(from.index, text)
    }, ORIGIN_SKIP_SYNC)
  }

  setSelection(container: HTMLElement, position: number) {
    const selection = document.getSelection()!

    if (position === 0) {
      selection.setPosition(container.firstElementChild!.firstChild, 0)
    }

    const elements = Array.from(container.querySelectorAll(INLINE_ELEMENT_TAG)) as HTMLElement[]
    for (let i = 0; i < elements.length; i++) {
      const ele = elements[i]

      const isEmbed = !(ele.firstElementChild as HTMLElement).isContentEditable
      const eleLength = isEmbed ? 1 : ele.textContent!.length
      if (position <= eleLength) {
        if (isEmbed && position === 1) {
          selection.setPosition(ele.querySelector(INLINE_EMBED_GAP_TAG)!.firstChild, 0)
          return
        }
        const textNode = ele.firstElementChild!.firstChild as Text
        selection.setPosition(textNode, position)
        return
      }
      position -= eleLength
    }
  }

  private _replaceText(range: INormalizedRange, text?: string | null) {
    const {from, to} = range
    if (!to) {
      const delta: DeltaOperation[] = [{delete: from.length}]
      from.index > 0 && delta.unshift({retain: from.index})
      text && delta.push({insert: text})
      from.block.applyDeltaOperation(delta)
      return
    }

    this.doc.crud.transact(() => {
    }, ORIGIN_SKIP_SYNC)
  }

  normalizeRange(range: StaticRange): INormalizedRange {
    const {startContainer, endContainer, startOffset, endOffset, collapsed} = range
    console.log('normalizeRange', startContainer, startOffset, endContainer, endOffset, collapsed)
    const startBlock = this._searchEditableBlockByNode(startContainer)

    const getPosition = (block: EditableBlockComponent, node: Node, offset: number) => {

      const elements = block.hostElement.querySelectorAll(INLINE_ELEMENT_TAG)
      if (elements.length === 0) {
        return 0
      }

      const isCElement = node instanceof HTMLElement && node.localName === INLINE_ELEMENT_TAG
      const isGap = node instanceof HTMLElement ? node.localName === INLINE_EMBED_GAP_TAG : node.parentElement!.localName === INLINE_EMBED_GAP_TAG

      // if first zero text
      if (isGap && (node instanceof HTMLElement ? node.parentElement === block.hostElement : node.parentElement!.parentElement === block.hostElement)) {
        return 0
      }

      const cElement = isCElement ? node : node.parentElement!.closest(INLINE_ELEMENT_TAG)!

      let pos = 0
      for (let i = 0; i < elements.length; i++) {
        const isEmbed = elements[i].firstElementChild!.localName === INLINE_EMBED_NODE_TAG
        if (elements[i] === cElement) {
          return pos + (isGap ? 1 : offset)
        }
        pos += isEmbed ? 1 : elements[i].textContent!.length
      }

      throw new BlockCraftError(ErrorCode.InlineEditorError, 'Fatal range position')
    }

    const startPos = getPosition(startBlock, startContainer, startOffset)
    const from = {
      blockId: startBlock.id,
      block: startBlock,
      length: 0,
      index: startPos
    }

    if (collapsed) {
      return {
        from,
        to: null,
        collapsed: true
      }
    }

    const endBlock = this._searchEditableBlockByNode(endContainer)
    const endPos = getPosition(endBlock, endContainer, endOffset)

    if (endBlock === startBlock) {
      from.length = endPos - startPos
      return {
        from,
        to: null,
        collapsed: false
      }
    }

    from.length = startBlock.textLength - startPos
    return {
      from,
      to: {
        blockId: endBlock.id,
        block: endBlock,
        index: 0,
        length: endPos,
      },
      collapsed: false
    }

  }

}


function getPlainTextFromInputEvent(event: InputEvent) {
  // When `inputType` is "insertText":
  // - `event.data` should be string (Safari uses `event.dataTransfer`).
  // - `event.dataTransfer` should be null.
  // When `inputType` is "insertReplacementText":
  // - `event.data` should be null.
  // - `event.dataTransfer` should contain "text/plain" data.

  if (typeof event.data === 'string') {
    return event.data;
  }
  if (event.dataTransfer?.types.includes('text/plain')) {
    return event.dataTransfer.getData('text/plain');
  }
  return null;
}

