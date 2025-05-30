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
import {deltaStrLength, deltaToString, isUrl, nextTick, sliceDelta} from "../../../global";
import {ClipboardDataType} from "./types";
import {
  generateId,
  replaceSnapshotsDepths,
  replaceSnapshotsIdDeeply,
  snapshots2Text
} from "../../utils";
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
    const selFrom = selection.from

    // 纯文本块
    if (selFrom.block.plainTextOnly) {
      const text = state.clipboardData?.getData(ClipboardDataType.TEXT)
      if (!text) return false
      selFrom.block.replaceText(selection.from.index, selection.from.length, text)
      nextTick().then(() => {
        selFrom.block.setInlineRange(selFrom.index, text.length)
      })
      return true
    }

    // file
    if (state.dataTypes.includes(ClipboardDataType.FILES)) {
      return false
    }

    // uri ---- 似乎可以删除
    if (isSameTextBlock && state.dataTypes.includes(ClipboardDataType.URI)) {
      const uri = state.getData(ClipboardDataType.URI)?.split('\n')[0]
      if (uri && isUrl(uri)) {
        selFrom.length ? selFrom.block.formatText(selFrom.index, selFrom.length, {'a:link': uri})
          : selFrom.block.insertText(selFrom.index, uri, {'a:link': uri})
        nextTick().then(() => {
          selFrom.block.setInlineRange(selFrom.index + uri.length, 0)
        })
        return true
      }
    }

    // html
    if (state.dataTypes.includes(ClipboardDataType.HTML)) {
      const htmlString = state.getData(ClipboardDataType.HTML)
      const htmlAdapter = this.adapter?.getAdapter(ClipboardDataType.HTML)
      if (htmlAdapter && htmlString) {

        try {
          const rootSnapshot = await htmlAdapter.toSnapshot(htmlString)
          if (!rootSnapshot.children?.length || rootSnapshot.nodeType !== BlockNodeType.root) return

          const snapshots: IBlockSnapshot[] = rootSnapshot.children
          const fromIndex = selection.from.index
          const fromLength = selection.from.length
          const textLength = selection.from.block.textLength
          const editableBlock = selection.from.block

          replaceSnapshotsIdDeeply(snapshots)
          replaceSnapshotsDepths(snapshots, editableBlock.props.depth)

          this.doc.crud.transact(() => {

            // 同一文本块
            if (isSameTextBlock) {
              const ops: DeltaOperation[] = [{retain: fromIndex}]

              let insertLength = 0
              // 是否需要和本段合并
              if (snapshots[0].nodeType === BlockNodeType.editable
                && (snapshots[0].flavour === 'paragraph' || snapshots[0].flavour === editableBlock.flavour)
                && snapshots[0].children.length) {
                insertLength = deltaStrLength(snapshots[0].children)
                ops.push(...snapshots[0].children)
                snapshots.shift()
              }
              // 不需要拆分
              if (!snapshots.length) {
                fromLength > 0 && ops.splice(1, 0, {delete: fromLength - fromIndex})
                editableBlock.applyDeltaOperation(ops)
                insertLength > 0 && selFrom.block.setInlineRange(fromIndex, insertLength)
                return;
              }

              // 文本中间位置
              if (fromIndex + fromLength < textLength) {
                ops.push({delete: textLength - fromIndex})
                // 拆分
                const sliceDeltas = sliceDelta(editableBlock.textDeltas(), fromIndex + fromLength, textLength)
                const splitSnapshot = this.doc.schemas.createSnapshot('paragraph', [sliceDeltas, editableBlock.props])
                this.doc.crud.insertBlocksAfter(editableBlock, [splitSnapshot])
              }
              editableBlock.applyDeltaOperation(ops)
            } else {
              // 删除区间内容
              this.deleteContentFromSelection(state.selection)

              // 是否需要和本段合并
              if (snapshots[0].nodeType === BlockNodeType.editable
                && (snapshots[0].flavour === 'paragraph' || snapshots[0].flavour === editableBlock.flavour)
                && snapshots[0].children.length) {
                const insertLength = deltaStrLength(snapshots[0].children)
                editableBlock.applyDeltaOperation([{retain: fromIndex}, ...snapshots[0].children])
                snapshots.shift()

                if (!snapshots.length) {
                  insertLength > 0 && selFrom.block.setInlineRange(fromIndex, insertLength)
                  return
                }
              }
            }

            // 新增blocks
            this.doc.crud.insertBlocksAfter(editableBlock, snapshots).then(() => {
              const endBlock = this.doc.getBlockById(snapshots[snapshots.length - 1].id)
              this.doc.selection.setSelection({
                blockId: editableBlock.id,
                index: fromIndex,
                length: editableBlock.textLength,
                type: 'text'
              }, this.doc.isEditable(endBlock) ? {
                blockId: endBlock.id,
                index: 0,
                length: endBlock.textLength,
                type: 'text'
              } : {
                blockId: endBlock.id,
                type: 'selected'
              })
            })
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
          selFrom.block.insertText(selFrom.index, text, {'a:link': text})
          : selFrom.block.formatText(selFrom.index, selFrom.length, {'a:link': text})
        selection.collapsed && nextTick().then(() => {
          selFrom.block.setInlineRange(selFrom.index, text.length)
        })
        return true
      }

      if (isSameTextBlock) {
        selFrom.block.replaceText(selFrom.index, selFrom.length, text)
      } else {
        this.deleteContentFromSelection(state.selection)
        selFrom.block.applyDeltaOperation([{retain: selFrom.index}, {insert: text}])
      }
      nextTick().then(() => {
        selFrom.block.setInlineRange(selFrom.index, text.length)
      })
      return true
    }

    return false
  }
}


export * from './types'
