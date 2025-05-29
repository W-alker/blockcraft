import {
  BlockNodeType,
  DeltaInsert,
  DeltaOperation,
  DocEventRegister,
  EventListen,
  EventScopeSourceType,
  EventSourceState,
  IBlockSnapshot,
  UIEventState,
  UIEventStateContext
} from "../../block-std";
import {deltaToString, isUrl, sliceDelta} from "../../../global";
import {ClipboardDataType} from "./types";
import {generateId, replaceSnapshotsIdDeeply, snapshots2Text} from "../../utils";
import {ORIGIN_SKIP_SYNC} from "../../doc";
import {DOC_ADAPTER_SERVICE_TOKEN} from "../../services";

export * from './types'

@DocEventRegister
export class ClipboardManager {
  adapter = this.doc.injector.get(DOC_ADAPTER_SERVICE_TOKEN)

  constructor(public readonly doc: BlockCraft.Doc) {
  }

  copyText(text: string) {
    return navigator.clipboard.writeText(text)
  }

  copyBlocksModel = async (snapshots: IBlockSnapshot[]): Promise<void> => {
    const rootSnapshot = await this._wrapSnapshotsByRoot(snapshots)

    let clipboardItem: ClipboardItem
    try {
      const items: Partial<Record<ClipboardDataType, Blob>> = {}
      for (const adp of this.adapter.supportedAdapters) {
        const str = await adp.fromSnapshot(rootSnapshot)
        items[adp.type] = new Blob([str], {type: adp.type})
      }
      clipboardItem = new ClipboardItem({
        [ClipboardDataType.TEXT]: snapshots2Text(snapshots),
        ...items
      })
    } catch (e) {
      this.doc.logger.error('copyBlocksModel', e)
      clipboardItem = new ClipboardItem({
        [ClipboardDataType.TEXT]: snapshots2Text(snapshots),
      })
    }

    return navigator.clipboard.write([clipboardItem])
  }

  private async _wrapDeltaByRoot(deltas: DeltaInsert[]) {
    const p = this.doc.schemas.createSnapshot('paragraph', [deltas])
    return this.doc.schemas.createSnapshot('root', [generateId(), [p]])
  }

  private async _wrapSnapshotsByRoot(snapshots: IBlockSnapshot[]) {
    return this.doc.schemas.createSnapshot('root', [generateId(), snapshots])
  }

  copyFromSelection = async (selection: BlockCraft.Selection, clipboardData: DataTransfer) => {
    const {from, to} = selection
    if (!to) {
      let snapshot: IBlockSnapshot
      if (from.type === 'text') {
        const sliceDeltas = sliceDelta(from.block.textDeltas(), from.index, from.length + from.index)
        snapshot = await this._wrapDeltaByRoot(sliceDeltas)
        clipboardData.setData(ClipboardDataType.TEXT, deltaToString(sliceDeltas))
      } else {
        clipboardData.setData(ClipboardDataType.TEXT, from.block.textContent())
        snapshot = await this._wrapSnapshotsByRoot([from.block.toSnapshot()])
      }

      for (const adapter1 of this.adapter.supportedAdapters) {
        clipboardData.setData(adapter1.type, await adapter1.fromSnapshot(snapshot))
      }
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
      if (from.index < from.block.textLength) {
        const sliceDeltas = sliceDelta(from.block.textDeltas(), from.index, from.length + from.index)
        const snapshot = from.block.toSnapshot()
        snapshot.children = sliceDeltas
        snapshots.unshift(snapshot)
        plainText = deltaToString(sliceDeltas) + plainText
      }
    } else {
      snapshots.unshift(from.block.toSnapshot())
      plainText = from.block.textContent() + plainText
    }

    if (to.type === 'text') {
      if (to.length > 0) {
        const sliceDeltas = sliceDelta(to.block.textDeltas(), to.index, to.length + to.index)
        const snapshot = to.block.toSnapshot()
        snapshot.children = sliceDeltas
        snapshots.push(snapshot)
        plainText += deltaToString(sliceDeltas)
      }
    } else {
      snapshots.push(to.block.toSnapshot())
      plainText = to.block.textContent() + plainText
    }

    clipboardData.setData(ClipboardDataType.TEXT, plainText)
    // clipboardData.setData(ClipboardDataType.BLOCK_SNAPSHOTS, JSON.stringify(snapshots))
    const rootSnapshot = await this._wrapSnapshotsByRoot(snapshots)
    for (const adapter1 of this.adapter.supportedAdapters) {
      clipboardData.setData(adapter1.type, await adapter1.fromSnapshot(rootSnapshot))
    }
  }

  deleteContentFromSelection = (selection: BlockCraft.Selection) => {
    const event = new InputEvent('beforeinput', {
      inputType: 'deleteByCut',
      targetRanges: [new StaticRange(selection.raw)],
    })
    this.doc.event.run(
      'beforeInput',
      UIEventStateContext.from(
        new UIEventState(event),
        new EventSourceState({event, sourceType: EventScopeSourceType.Selection})
      )
    )
  }

  @EventListen('copy')
  async onCopy(context: UIEventStateContext) {
    const state = context.get('clipboardState')
    state.raw.preventDefault()
    this.copyFromSelection(state.selection, state.clipboardData!)
    return true
  }

  @EventListen('cut')
  onCut(context: UIEventStateContext) {
    const state = context.get('clipboardState')
    context.preventDefault()

    this.copyFromSelection(state.selection, state.clipboardData!).then(() => {
      // 继续触发deleteByCut input事件, 让默认处理程序删除选区内容
      this.deleteContentFromSelection(state.selection)
    })

  }

  @EventListen('paste',)
  async onPaste(context: UIEventStateContext) {
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
      selection.from.block.replaceText(selection.from.index, selection.from.length, text)
      return true
    }

    // file
    if (state.dataTypes.includes(ClipboardDataType.FILES)) {
      return false
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
      const htmlAdapter = this.adapter?.getAdapter(ClipboardDataType.HTML)
      if (!htmlAdapter) return
      if (htmlString) {

        try {
          const rootSnapshot = await htmlAdapter.toSnapshot(htmlString)
          if (!rootSnapshot.children?.length || rootSnapshot.nodeType !== BlockNodeType.root) return

          const snapshots: IBlockSnapshot[] = rootSnapshot.children
          const fromIndex = selection.from.index
          const fromLength = selection.from.length
          const textLength = selection.from.block.textLength
          const editableBlock = selection.from.block

          replaceSnapshotsIdDeeply(snapshots)

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
              if (snapshots[0].nodeType === BlockNodeType.editable && (snapshots[0].flavour === 'paragraph' || snapshots[0].flavour === editableBlock.flavour)) {
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
        } catch (e) {
          this.doc.logger.warn('html2snapshot error', e)
        }
      }
    }

    // plain-text
    if (state.dataTypes.includes(ClipboardDataType.TEXT)) {
      const text = state.getData(ClipboardDataType.TEXT)
      if (!text) return false
      if (isUrl(text) && isSameTextBlock) {
        selection.collapsed ?
          selection.from.block.insertText(selection.from.index, text, {'a:link': text})
          : selection.from.block.formatText(selection.from.index, selection.from.length, {'a:link': text})
        return true
      }

      if (isSameTextBlock) {
        selection.from.block.replaceText(selection.from.index, selection.from.length, text)
        return true
      }

      this.deleteContentFromSelection(state.selection)
      selection.from.block.applyDeltaOperation([{retain: selection.from.index}, {insert: text}])
      return true
    }

    return false
  }
}


export * from './types'
