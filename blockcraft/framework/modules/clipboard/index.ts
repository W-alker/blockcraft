import {
  BindHotKey,
  BlockNodeType,
  DeltaInsert,
  DeltaOperation,
  DocEventRegister,
  EventListen,
  IBlockSnapshot, STR_LINE_BREAK,
  UIEventStateContext
} from "../../block-std";
import {
  compareSimpleValue,
  deltaStrLength,
  deltaToString,
  isUrl,
  nextTick, SimpleBasicType,
  sliceDelta
} from "../../../global";
import {ClipboardDataType} from "./types";
import {
  generateId,
  replaceSnapshotsIdDeeply,
} from "../../utils";
import {DOC_ADAPTER_SERVICE_TOKEN} from "../../services";
import {copyBlocks} from "./copyBlocks";

export * from './types'

@DocEventRegister
export class ClipboardManager {
  adapter = this.doc.injector.get(DOC_ADAPTER_SERVICE_TOKEN)

  constructor(public readonly doc: BlockCraft.Doc) {
  }

  copyText(text: string) {
    return navigator.clipboard.writeText(text)
  }

  copyBlocksModel = (snapshots: IBlockSnapshot[]): Promise<void> => {
    if (!snapshots?.length) return Promise.reject('no blocks to copy')
    const rootSnapshot = this._wrapSnapshotsByRoot(snapshots)
    return copyBlocks.call(this, rootSnapshot)
  }

  private _wrapDeltaByRoot(deltas: DeltaInsert[]) {
    const p = this.doc.schemas.createSnapshot('paragraph', [deltas])
    return this.doc.schemas.createSnapshot('root', [generateId(), [p]])
  }

  private _wrapSnapshotsByRoot(snapshots: IBlockSnapshot[]) {
    return this.doc.schemas.createSnapshot('root', [generateId(), snapshots])
  }

  copyFromSelection = async (selection: BlockCraft.Selection, clipboardData: DataTransfer) => {
    const {from, to} = selection
    if (!to) {
      let snapshot: IBlockSnapshot
      if (from.type === 'text') {
        const sliceDeltas = sliceDelta(from.block.textDeltas(), from.index, from.length + from.index)
        snapshot = this._wrapDeltaByRoot(sliceDeltas)
        clipboardData.setData(ClipboardDataType.TEXT, deltaToString(sliceDeltas))
      } else {
        clipboardData.setData(ClipboardDataType.TEXT, from.block.textContent())
        snapshot = this._wrapSnapshotsByRoot([from.block.toSnapshot()])
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
      plainText += (this.doc.getBlockById(bid).textContent() + STR_LINE_BREAK)
    }

    if (from.type === 'text') {
      if (from.index < from.block.textLength) {
        const sliceDeltas = sliceDelta(from.block.textDeltas(), from.index, from.length + from.index)
        const snapshot = from.block.toSnapshot()
        snapshot.children = sliceDeltas
        snapshots.unshift(snapshot)
        plainText = deltaToString(sliceDeltas) + STR_LINE_BREAK + plainText
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
    this.doc.inputManger.deleteByRange(selection)
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
      this.deleteContentFromSelection(state.selection)
      state.selection.raw.collapse(true)
    })

  }

  @EventListen('paste')
  async onPaste(context: UIEventStateContext) {
    context.preventDefault()
    const state = context.get('clipboardState')
    state.dataTypes.forEach(v => {
      console.log(`%c${v}`, 'color: red; font-size: large;', state.clipboardData?.getData(v), state.clipboardData?.files)
    })

    const selection = state.selection
    if (selection.from.type !== 'text') return

    const {from: selFrom, isInSameBlock, collapsed} = selection

    // 纯文本块
    if (selFrom.block.plainTextOnly) {
      const text = state.clipboardData?.getData(ClipboardDataType.TEXT)
      if (!text) return false
      selFrom.block.replaceText(selection.from.index, selection.from.length, text)
      nextTick().then(() => {
        collapsed ? selFrom.block.setInlineRange(selFrom.index + text.length)
          : selFrom.block.setInlineRange(selFrom.index, text.length)
      })
      return true
    }

    // file
    if (state.dataTypes.includes(ClipboardDataType.FILES)) {
      return false
    }

    let rootSnapshot: IBlockSnapshot | undefined
    // rtf
    // if (state.dataTypes.includes(ClipboardDataType.RTF)) {
    //   const rtfString = state.getData(ClipboardDataType.RTF)
    //   const rtfAdapter = this.adapter?.getAdapter(ClipboardDataType.RTF)
    //   if (rtfAdapter && rtfString) {
    //     try {
    //       rootSnapshot = await rtfAdapter.toSnapshot(rtfString)
    //       console.log(`%crtf2snapshot`, 'color: red; font-size: large;', rootSnapshot)
    //     } catch (e) {
    //       this.doc.logger.warn('rtf2snapshot error', e)
    //     }
    //   }
    // }

    // html
    if (!rootSnapshot && state.dataTypes.includes(ClipboardDataType.HTML)) {
      const htmlString = state.getData(ClipboardDataType.HTML)
      const htmlAdapter = this.adapter?.getAdapter(ClipboardDataType.HTML)
      if (htmlAdapter && htmlString) {
        try {
          rootSnapshot = await htmlAdapter.toSnapshot(htmlString)
        } catch (e) {
          this.doc.logger.warn('html2snapshot error', e)
        }
      }
    }

    console.log('---------------html2snapshot', rootSnapshot)

    if (rootSnapshot && rootSnapshot.children.length && rootSnapshot.nodeType === BlockNodeType.root) {
      const snapshots: IBlockSnapshot[] = rootSnapshot.children as IBlockSnapshot[]
      const {index: fromIndex, length: fromLength, block: editableBlock} = selFrom
      const textLength = editableBlock.textLength

      replaceSnapshotsIdDeeply(snapshots)

      // 同一文本块
      if (isInSameBlock) {
        const ops: DeltaOperation[] = [{retain: fromIndex}]

        let insertLength = 0
        // 是否需要和本段合并
        if (snapshots[0].nodeType === BlockNodeType.editable
          && (snapshots[0].flavour === 'paragraph' || snapshots[0].flavour === editableBlock.flavour)
          && compareSimpleValue(snapshots[0].props['heading'] as SimpleBasicType, editableBlock.props['heading']) <= 0
        ) {
          insertLength = deltaStrLength(snapshots[0].children)
          ops.push(...snapshots[0].children)
          snapshots.shift()
        }

        // 不需要拆分, 代表这是一个行内操作
        if (!snapshots.length) {
          editableBlock.deleteText(fromIndex, fromLength)
          editableBlock.applyDeltaOperations(ops)
          insertLength > 0 && nextTick().then(() => {
            collapsed ? editableBlock.setInlineRange(fromIndex + insertLength) : editableBlock.setInlineRange(fromIndex, insertLength)
          })
          return;
        }

        // 文本中间位置
        if (fromIndex + fromLength < textLength) {
          ops.push({delete: textLength - fromIndex})
          // 拆分
          const sliceDeltas = sliceDelta(editableBlock.textDeltas(), fromIndex + fromLength, textLength)
          const splitSnapshot = this.doc.schemas.createSnapshot('paragraph', [sliceDeltas, editableBlock.props])
          this.doc.crud.insertBlocksAfter(editableBlock, [splitSnapshot])
        } else {
          editableBlock.deleteText(fromIndex, fromLength)
        }
        editableBlock.applyDeltaOperations(ops)
      } else {
        // 删除区间内容
        this.deleteContentFromSelection(state.selection)

        // 是否需要和本段合并
        if (snapshots[0].nodeType === BlockNodeType.editable && (snapshots[0].flavour === 'paragraph' || snapshots[0].flavour === editableBlock.flavour)) {
          const insertLength = deltaStrLength(snapshots[0].children)
          editableBlock.applyDeltaOperations([{retain: fromIndex}, ...snapshots[0].children])
          snapshots.shift()

          if (!snapshots.length) {
            insertLength > 0 && nextTick().then(() => {
              collapsed ? editableBlock.setInlineRange(fromIndex + insertLength) : editableBlock.setInlineRange(fromIndex, insertLength)
            })
            return
          }
        }
      }

      // 新增blocks
      this.doc.crud.insertBlocksAfter(editableBlock, snapshots).then(() => {
        if (collapsed) return
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
      return true
    }

    // plain-text
    if (state.dataTypes.includes(ClipboardDataType.TEXT)) {
      let text = state.getData(ClipboardDataType.TEXT)
      if (!text) return false
      text = text.replace(/\n$/g, '')
      if (isUrl(text) && isInSameBlock) {
        selection.collapsed ?
          selFrom.block.insertText(selFrom.index, text, {'a:link': text})
          : selFrom.block.formatText(selFrom.index, selFrom.length, {'a:link': text})
        nextTick().then(() => {
          collapsed ? selFrom.block.setInlineRange(selFrom.index + text.length)
            : selFrom.block.setInlineRange(selFrom.index, selFrom.length)
        })
        return true
      }

      this.doc.crud.transact(() => {
        // const text_lines = text.split('\n')
        if (isInSameBlock) {
          selFrom.block.replaceText(selFrom.index, selFrom.length, text)
        } else {
          this.deleteContentFromSelection(state.selection)
          selFrom.block.applyDeltaOperations([{retain: selFrom.index}, {insert: text}])
        }
        // if(text_lines.length > 1) {
        //   const snapshots = text_lines.slice(1).map(line => this.doc.schemas.createSnapshot('paragraph', [[{insert: line}], {}]))
        //   this.doc.crud.insertBlocksAfter(selFrom.block, snapshots)
        // }
      })
      nextTick().then(() => {
        collapsed ? selFrom.block.setInlineRange(selFrom.index + text.length)
          : selFrom.block.setInlineRange(selFrom.index, text.length)
      })
      return true
    }

    return false
  }
}

export * from './types'
