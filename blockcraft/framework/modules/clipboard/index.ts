import {
  BlockNodeType, DeltaInsert,
  DeltaOperation,
  DocEventRegister,
  EventListen,
  EventNames,
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
import {fromEvent, Subject, take, takeUntil} from "rxjs";

export * from './types'

@DocEventRegister
export class ClipboardManager {
  adapter = this.doc.injector.get(DOC_ADAPTER_SERVICE_TOKEN)

  private readonly onCopied$ = new Subject<boolean>()

  constructor(public readonly doc: BlockCraft.Doc) {
    fromEvent<ClipboardEvent>(document, 'copy').pipe(takeUntil(this.doc.onDestroy$)).subscribe(async e => {
      console.log('-------on copy')
      if (!this._tempData) return this.onCopied$.next(false)
      e.preventDefault()
      const clipboardData = e.clipboardData
      if (!clipboardData) return this.onCopied$.next(false)
      if (this._tempData[ClipboardDataType.DELTAS]) {
        const delta = this._tempData[ClipboardDataType.DELTAS]
        const html = await this._delta2Html(delta)
        clipboardData.setData(ClipboardDataType.TEXT, deltaToString(delta))
        clipboardData.setData(ClipboardDataType.DELTAS, JSON.stringify(delta))
        clipboardData.setData(ClipboardDataType.HTML, html)
        this._tempData = null
        return this.onCopied$.next(true)
      }

      if (this._tempData[ClipboardDataType.BLOCK_SNAPSHOTS]) {
        const snapshots = this._tempData[ClipboardDataType.BLOCK_SNAPSHOTS]
        const html = await this._snapshots2Html(snapshots)
        clipboardData.setData(ClipboardDataType.TEXT, snapshots2Text(snapshots))
        clipboardData.setData(ClipboardDataType.BLOCK_SNAPSHOTS, JSON.stringify(snapshots))
        clipboardData.setData(ClipboardDataType.HTML, html)
        this._tempData = null
        return this.onCopied$.next(true)
      }
    })
  }

  private _tempData: { [K in `${ClipboardDataType}`]: any } | null = null

  copyText(text: string) {
    return navigator.clipboard.writeText(text)
  }

  copyDeltas(deltas: DeltaOperation[]) {
    // @ts-ignore
    this._tempData = {[ClipboardDataType.DELTAS]: deltas}
    document.execCommand('copy')
    return this.onCopied$.toPromise()
  }

  // TODO
  copyBlocksModel = async (snapshots: IBlockSnapshot[]): Promise<boolean> => {
    // @ts-ignore
    this._tempData = {[ClipboardDataType.BLOCK_SNAPSHOTS]: snapshots}
    document.execCommand('copy')
    console.log(this._tempData)
    return new Promise((resolve, reject) => {
      this.onCopied$.pipe(take(1)).subscribe(v => {
        v && resolve(v)
      })
    })
  }

  private async _delta2Html(deltas: DeltaInsert[]) {
    const p = this.doc.schemas.createSnapshot('paragraph', [deltas])
    const root = this.doc.schemas.createSnapshot('root', [generateId(), [p]])
    return await this.adapter.snapshot2html(root)
  }

  private async _snapshots2Html(snapshots: IBlockSnapshot[]) {
    const root = this.doc.schemas.createSnapshot('root', [generateId(), snapshots])
    return await this.adapter.snapshot2html(root)
  }

  private copyFromSelection = async (selection: BlockCraft.Selection, clipboardData: DataTransfer) => {
    const {from, to} = selection
    if (!to) {
      if (from.type === 'text') {
        const sliceDeltas = sliceDelta(from.block.textDeltas(), from.index, from.length + from.index)
        const html = await this._delta2Html(sliceDeltas)
        clipboardData.setData(ClipboardDataType.TEXT, deltaToString(sliceDeltas))
        clipboardData.setData(ClipboardDataType.DELTAS, JSON.stringify(sliceDeltas))
        clipboardData.setData(ClipboardDataType.HTML, html)
        return;
      }

      const html = await this._snapshots2Html([from.block.toSnapshot()])
      clipboardData.setData(ClipboardDataType.TEXT, from.block.textContent())
      clipboardData.setData(ClipboardDataType.BLOCK_SNAPSHOTS, JSON.stringify(from.block.toSnapshot()))
      clipboardData.setData(ClipboardDataType.HTML, html)
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

    const html = await this._snapshots2Html(snapshots)
    clipboardData.setData(ClipboardDataType.TEXT, plainText)
    clipboardData.setData(ClipboardDataType.BLOCK_SNAPSHOTS, JSON.stringify(snapshots))
    clipboardData.setData(ClipboardDataType.HTML, html)
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
      selection.from.block.replaceText(selection.from.index, selection.from.length, text)
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
      const deltas: DeltaOperation[] = JSON.parse(state.getData(ClipboardDataType.DELTAS)!)

      if (isSameTextBlock) {
        selection.from.index && deltas.unshift({retain: selection.from.index})
        selection.from.length && deltas.unshift({delete: selection.from.length})
        selection.from.block.applyDeltaOperation(deltas)
        return true
      }

      this.deleteContentFromSelection(state.selection)
      selection.from.block.applyDeltaOperation([{retain: selection.from.index}, ...deltas])
      return true
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
      if (!this.adapter) return
      if (htmlString) {
        this.adapter.html2snapshot(htmlString).then(snapshot => {
          if (!snapshot.children.length || snapshot.nodeType !== BlockNodeType.root) return
          const first = snapshot.children[0]
          if (first.nodeType === BlockNodeType.editable && selection.from.type === 'text') {
            const deltas: DeltaOperation[] = first.children
            if (selection.from.index > 0) {
              deltas.unshift({retain: selection.from.index})
            }
            selection.from.block.applyDeltaOperation(deltas)
            snapshot.children.shift()
          }
          snapshot.children.length > 0 && this.doc.crud.insertBlocksAfter(selection.from.block, snapshot.children)
        })
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
