import {UIEventState, UIEventStateContext} from "../../event/base";
import {DocEventRegister, EventListen, EventNames, EventScopeSourceType, EventSourceState} from "../../event";
import {deltaToString, isUrl, sliceDelta} from "../../../global";
import {ClipboardDataType} from "./types";
import {BlockNodeType, DeltaOperation, IBlockSnapshot} from "../../types";
import {generateId} from "../../utils";
import {ORIGIN_SKIP_SYNC} from "../../doc";

@DocEventRegister
export class ClipboardManager {

  constructor(public readonly doc: BlockCraft.Doc) {
  }

  copyText(text: string) {
    return navigator.clipboard.writeText(text)
  }

  copyFromSelection = (selection: BlockCraft.Selection, clipboardData: DataTransfer) => {
    const {from, to} = selection
    if (!to) {
      if (from.type === 'text') {
        const sliceDeltas = sliceDelta(from.block.textDeltas(), from.index, from.length + from.index)
        clipboardData.setData(ClipboardDataType.TEXT, deltaToString(sliceDeltas))
        clipboardData.setData(ClipboardDataType.DELTAS, JSON.stringify(sliceDeltas))
        return;
      }

      clipboardData.setData(ClipboardDataType.TEXT, from.block.textContent())
      clipboardData.setData(ClipboardDataType.BLOCK_SNAPSHOTS, JSON.stringify(from.block.toSnapshot()))
      return
    }

    const snapshots: IBlockSnapshot[] = []
    let plainText = ''
    const betweenBlocks = this.doc.queryBlocksBetween(from.block, to.block)
    for (const bid of betweenBlocks) {
      snapshots.push(this.doc.getBlockById(bid).toSnapshot())
      plainText += this.doc.getBlockById(bid).textContent()
    }
    if (from.type === 'text') {
      const sliceDeltas = sliceDelta(from.block.textDeltas(), from.index, from.length + from.index)
      const snapshot = from.block.toSnapshot()
      snapshot.children = sliceDeltas
      snapshots.unshift(snapshot)
      plainText = deltaToString(sliceDeltas) + plainText
    } else {
      snapshots.unshift(from.block.toSnapshot())
      plainText = from.block.textContent() + plainText
    }

    if (to.type === 'text') {
      const sliceDeltas = sliceDelta(to.block.textDeltas(), to.index, to.length + to.index)
      const snapshot = to.block.toSnapshot()
      snapshot.children = sliceDeltas
      snapshots.push(snapshot)
      plainText += deltaToString(sliceDeltas)
    } else {
      snapshots.push(to.block.toSnapshot())
      plainText = to.block.textContent() + plainText
    }

    clipboardData.setData(ClipboardDataType.TEXT, plainText)
    clipboardData.setData(ClipboardDataType.BLOCK_SNAPSHOTS, JSON.stringify(snapshots))
  }

  deleteContentFromSelection = (selection: BlockCraft.Selection) => {
    const event = new InputEvent('beforeinput', {
      inputType: 'deleteByCut',
      targetRanges: [new StaticRange(selection.raw)]
    })
    this.doc.event.run(
      EventNames.beforeInput,
      UIEventStateContext.from(
        new UIEventState(event),
        new EventSourceState({event, sourceType: EventScopeSourceType.Selection})
      )
    )
  }

  @EventListen(EventNames.copy, {flavour: 'root'})
  onCopy(context: UIEventStateContext) {
    const state = context.get('clipboardState')
    context.preventDefault()
    this.copyFromSelection(state.selection, state.clipboardData!)
    return true
  }

  @EventListen(EventNames.cut, {flavour: 'root'})
  onCut(context: UIEventStateContext) {
    const state = context.get('clipboardState')
    context.preventDefault()

    this.copyFromSelection(state.selection, state.clipboardData!)

    // 继续触发deleteByCut input事件, 让默认处理程序删除选区内容
    this.deleteContentFromSelection(state.selection)
  }

  @EventListen(EventNames.paste, {flavour: 'root'})
  onPaste(context: UIEventStateContext) {
    context.preventDefault()
    const state = context.get('clipboardState')
    state.dataTypes.forEach(v => {
      console.log(`%c${v}`, 'color: red; font-size: large;', state.clipboardData?.getData(v), state.clipboardData?.files)
    })

    const selection = state.selection
    if (selection.from.type !== 'text') return

    const isSameTextBlock = selection.isInSameBlock

    // 纯文本块
    if (selection.from.block.plainTextOnly) {
      const text = state.clipboardData?.getData(ClipboardDataType.TEXT)
      if (!text) return false
      selection.from.block.applyDeltaOperation([{retain: selection.from.index}, {delete: selection.from.length}, {insert: text}])
      return true
    }

    // file
    if (state.dataTypes.includes(ClipboardDataType.FILES)) {
      return false
    }

    // block snapshot mime type
    if (state.dataTypes.includes(ClipboardDataType.BLOCK_SNAPSHOTS)) {
      const snapshots: IBlockSnapshot[] = JSON.parse(state.getData(ClipboardDataType.BLOCK_SNAPSHOTS)!)
      const fromIndex = selection.from.index
      const fromLength = selection.from.length
      const textLength = selection.from.block.textLength
      const editableBlock = selection.from.block

      replaceIdDeeply(snapshots)

      this.doc.crud.transact(() => {

        // 同一文本块
        if (isSameTextBlock) {
          // 文本中间位置
          if (fromIndex + fromLength < textLength) {
            // 拆分
            const sliceDeltas = sliceDelta(editableBlock.textDeltas(), fromIndex + fromLength, textLength)
            const splitSnapshot = this.doc.schemas.createSnapshot(editableBlock.flavour, [sliceDeltas])
            snapshots.push(splitSnapshot)
          }

          const ops: DeltaOperation[] = [{retain: fromIndex}, {delete: textLength - fromIndex}]

          // 是否需要和本段合并
          if (snapshots[0].nodeType === BlockNodeType.editable) {
            ops.push(...snapshots[0].children)
            snapshots.shift()
          }

          // 删除之后的内容
          editableBlock.applyDeltaOperation(ops)
          // 新增blocks
          this.doc.crud.insertBlocksAfter(editableBlock, snapshots)
          return
        }

        // 删除区间内容
        this.deleteContentFromSelection(state.selection)

        // 是否需要和本段合并
        if (snapshots[0].nodeType === BlockNodeType.editable) {
          editableBlock.applyDeltaOperation([{retain: fromIndex}, ...snapshots[0].children])
          snapshots.shift()
        }

        // 新增blocks
        this.doc.crud.insertBlocksAfter(editableBlock, snapshots)

      }, ORIGIN_SKIP_SYNC)

      return true
    }

    // 行内delta
    if (state.dataTypes.includes(ClipboardDataType.DELTAS)) {
      const deltas = JSON.parse(state.getData(ClipboardDataType.DELTAS)!)

      if (isSameTextBlock) {
        selection.from.block.applyDeltaOperation([
          {retain: selection.from.index},
          {delete: selection.from.length},
          ...deltas
        ])
        return;
      }

      this.deleteContentFromSelection(state.selection)
      selection.from.block.applyDeltaOperation([{retain: selection.from.index}, ...deltas])
      return;
    }

    // uri
    if (isSameTextBlock && state.dataTypes.includes(ClipboardDataType.URI)) {
      const uri = state.getData(ClipboardDataType.URI)?.split('\n')[0]
      if (uri) {
        selection.from.block.formatText(selection.from.index, selection.from.length, {link: uri})
        return true
      }
    }

    // html
    if (state.dataTypes.includes(ClipboardDataType.HTML)) {
      const htmlString = state.getData(ClipboardDataType.HTML)
      if (htmlString) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlString, 'text/html');
        return true
      }
    }

    // plain-text
    if (state.dataTypes.includes(ClipboardDataType.TEXT)) {
      const text = state.getData(ClipboardDataType.TEXT)
      if (!text) return false
      if (isUrl(text) && isSameTextBlock) {
        selection.from.block.formatText(selection.from.index, selection.from.length, {'a:link': text})
      }

      if (isSameTextBlock) {
        selection.from.block.applyDeltaOperation([{retain: selection.from.index}, {delete: selection.from.length}, {insert: text}])
        return true
      }

      this.deleteContentFromSelection(state.selection)
      selection.from.block.applyDeltaOperation([{retain: selection.from.index}, {insert: text}])
      return true
    }

    return false
  }
}

const replaceIdDeeply = (snapshots: IBlockSnapshot[]) => {
  snapshots.forEach(v => {
    v.id = generateId()

    if ((v.nodeType === BlockNodeType.root || v.nodeType === BlockNodeType.block) && v.children.length) {
      replaceIdDeeply(v.children)
    }
  })
}

export * from './types'
