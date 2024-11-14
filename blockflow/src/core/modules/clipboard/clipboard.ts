import {
  BlockModel,
  Controller,
  DeltaInsert, DeltaOperation, deltaToString,
  EditableBlock, IBlockFlowRange, IBlockModel,
  isUrl,
  sliceDelta
} from "@core";
import {fromEvent, takeUntil} from "rxjs";
import {FILE_UPLOADER} from "@blocks";

export class BlockFlowClipboard {
  public static CLIPBOARD_DATA_TYPE = '@bf/json'
  public static SIGN_CLIPBOARD_JSON_DELTA = '@bf-delta/json: '
  public static SIGN_CLIPBOARD_JSON_BLOCKS = '@bf-blocks/json: '

  constructor(
    public readonly controller: Controller
  ) {
    fromEvent<ClipboardEvent>(controller.rootElement, 'copy').pipe(takeUntil(controller.root.onDestroy)).subscribe(this.onCopy)
    fromEvent<ClipboardEvent>(controller.rootElement, 'cut').pipe(takeUntil(controller.root.onDestroy)).subscribe(this.onCut)
    fromEvent<ClipboardEvent>(controller.rootElement, 'paste').pipe(takeUntil(controller.root.onDestroy)).subscribe(this.onPaste)
  }

  copy(range: IBlockFlowRange) {

  }

  private onCopy = (event: ClipboardEvent) => {
    event.preventDefault()
    const curRange = this.controller.getSelection()
    if (!curRange) throw new Error('No range selected')
    const clipboardData = event.clipboardData!
    if (!curRange.isAtRoot) {
      const {blockRange: range, blockId} = curRange
      if (range.start === range.end) throw new Error('The range is collapsed')
      const bRef = this.controller.getBlockRef(blockId) as EditableBlock

      clipboardData.setData('text/plain', bRef.getTextContent().slice(range.start, range.end))  // copy text
      if (this.controller.activeElement?.classList.contains('bf-plain-text-only'))
        return {range: curRange, clipboardData}

      const deltaConcat = sliceDelta(bRef.getTextDelta(), range.start, range.end)
      clipboardData.setData(BlockFlowClipboard.CLIPBOARD_DATA_TYPE, BlockFlowClipboard.SIGN_CLIPBOARD_JSON_DELTA + JSON.stringify(deltaConcat))
      return {range: curRange, clipboardData}
    }

    const {rootRange} = curRange
    if (!rootRange) throw new Error('No range selected')
    const blocks = this.controller.rootModel.slice(rootRange.start, rootRange.end + 1).map((block) => block.toJSON())
    clipboardData.setData('text/plain', window.getSelection()!.getRangeAt(0).toString())
    clipboardData.setData(BlockFlowClipboard.CLIPBOARD_DATA_TYPE, BlockFlowClipboard.SIGN_CLIPBOARD_JSON_BLOCKS + JSON.stringify(blocks))
    return {range: curRange, clipboardData}
  }

  private onCut = (event: ClipboardEvent) => {
    event.preventDefault()
    const res = this.onCopy(event)
    if (!res) return
    const {range} = res
    if (!range.isAtRoot) {
      const {blockRange, blockId} = range
      const bRef = this.controller.getBlockRef(blockId) as EditableBlock
      const deltas = [{retain: blockRange.start}, {delete: blockRange.end - blockRange.start}]
      bRef.applyDelta(deltas)
      return;
    }

    const rootRange = range.rootRange!
    this.controller.deleteBlocks(rootRange.start, rootRange.end + 1)
  }

  private onPaste = (event: ClipboardEvent) => {
    event.preventDefault()

    const clipboardData = event.clipboardData!
    const curRange = this.controller.getSelection()
    if (!curRange) return

    // files
    if (clipboardData.types.includes('Files')) {
      if (curRange.isAtRoot) return;
      const {parentId, index} = this.controller.getBlockPosition(curRange.blockId)
      if (!clipboardData.files.length || parentId !== this.controller.rootId) return
      const imgFiles = Array.from(clipboardData.files).filter(file => file.type.startsWith('image'))
      if (!imgFiles.length) return
      const imgUploader = this.controller.injector.get(FILE_UPLOADER)
      if (!imgUploader) throw new Error('imgUploader is required')
      imgUploader.uploadImg(imgFiles[0]).then((fileUri) => {
        const block = this.controller.createBlock('image', [fileUri])
        this.controller.insertBlocks(index, [block], this.controller.rootId)
      })
      return
    }

    if (clipboardData.types.includes(BlockFlowClipboard.CLIPBOARD_DATA_TYPE)) {
      const data = clipboardData.getData(BlockFlowClipboard.CLIPBOARD_DATA_TYPE)
      if (data.startsWith(BlockFlowClipboard.SIGN_CLIPBOARD_JSON_DELTA)) {
        const deltas = JSON.parse(data.slice(BlockFlowClipboard.SIGN_CLIPBOARD_JSON_DELTA.length)) as DeltaInsert[]
        if (curRange.isAtRoot) return
        const bRef = this.controller.getBlockRef(curRange.blockId) as EditableBlock
        applyPasteDeltaToBlock(bRef, deltas, curRange.blockRange)
        return;
      }

      if (data.startsWith(BlockFlowClipboard.SIGN_CLIPBOARD_JSON_BLOCKS)) {
        const json = JSON.parse(data.slice(BlockFlowClipboard.SIGN_CLIPBOARD_JSON_BLOCKS.length)) as IBlockModel[]
        console.log(json)
        let index: number
        if (curRange.isAtRoot) {
          index = curRange.rootRange!.start + 1
        } else {
          index = this.controller.getBlockPosition(curRange.blockId)!.index
        }
        this.controller.insertBlocks(index, json.map(BlockModel.fromModel))
        return
      }
      return;
    }

    const text = clipboardData.getData('text/plain')
    if (!text) return;
    if (curRange.isAtRoot) return;
    const bRef = this.controller.getBlockRef(curRange.blockId) as EditableBlock
    let deltaInsert: DeltaInsert[]
    if (isUrl(text) && !bRef.containerEle.classList.contains('bf-plain-text-only')) {
      deltaInsert = [{insert: {link: text}, attributes: {'d:href': text}}]
    } else {
      deltaInsert = [{insert: text}]
    }
    applyPasteDeltaToBlock(bRef, deltaInsert, curRange.blockRange)
  }
}

const applyPasteDeltaToBlock = (blockRef: EditableBlock, deltaInsert: DeltaInsert[], range: {
  start: number,
  end: number
}) => {
  let deltas: DeltaOperation[]
  if (blockRef.containerEle.classList.contains('bf-plain-text-only')) {
    deltas = [{retain: range.start}, {insert: deltaToString(deltaInsert)}]
  } else deltas = [{retain: range.start}, ...deltaInsert]
  if (range.start !== range.end) {
    deltas.splice(1, 0, {delete: range.end - range.start})
  }
  blockRef.applyDelta(deltas, true)
}
