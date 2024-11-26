import {
  BlockModel,
  Controller,
  DeltaInsert, DeltaOperation,
  deltaToString,
  IBlockFlowRange, IBlockModel,
  isUrl,
  sliceDelta
} from "../../../core";
import {fromEvent, takeUntil} from "rxjs";
import {FILE_UPLOADER} from "../../../blocks";
import {HtmlConverter} from "./htmlConverter";

export class BlockFlowClipboard {
  public static CLIPBOARD_DATA_TYPE = '@bf/json'
  public static SIGN_CLIPBOARD_JSON_DELTA = '@bf-delta/json: '
  public static SIGN_CLIPBOARD_JSON_BLOCKS = '@bf-blocks/json: '

  protected readonly htmlConverter = new HtmlConverter(this.controller.schemas)

  constructor(
    public readonly controller: Controller
  ) {
    fromEvent<ClipboardEvent>(document, 'copy').pipe(takeUntil(controller.root.onDestroy)).subscribe(this.onCopy)
    fromEvent<ClipboardEvent>(document, 'cut').pipe(takeUntil(controller.root.onDestroy)).subscribe(this.onCut)
    fromEvent<DragEvent>(controller.rootElement, 'drop').pipe(takeUntil(controller.root.onDestroy)).subscribe(this.onDrop)
    fromEvent<ClipboardEvent>(controller.rootElement, 'paste').pipe(takeUntil(controller.root.onDestroy)).subscribe(this.onPaste)
  }

  execCommand(command: 'cut' | 'copy', range?: IBlockFlowRange) {
    if (range) {
      const selection = this.controller.selection.getSelection()
      this.controller.selection.applyRange(range)
      document.execCommand(command)
      selection && this.controller.selection.applyRange(selection)
      return
    }
    document.execCommand(command)
  }

  copy(range?: IBlockFlowRange) {
    this.execCommand('copy', range)
  }

  cut(range?: IBlockFlowRange) {
    this.execCommand('cut', range)
  }

  writeText(text: string) {
    return navigator.clipboard.writeText(text)
  }

  private _data_write: { data: DeltaInsert[] | IBlockModel[], type: 'delta' | 'block' } | null = null

  writeBlockFlowData(data: DeltaInsert[] | IBlockModel[], type: 'delta' | 'block') {
    console.log()
    this._data_write = {data, type}
    document.execCommand('copy')
  }

  private onCopy = (event: ClipboardEvent) => {
    if (this._data_write) {
      event.preventDefault()
      const clipboardData = event.clipboardData!
      const {data, type} = this._data_write
      type === 'delta' && clipboardData.setData('text/plain', deltaToString(data as DeltaInsert[]))
      clipboardData.setData(BlockFlowClipboard.CLIPBOARD_DATA_TYPE,
        type === 'delta' ? BlockFlowClipboard.SIGN_CLIPBOARD_JSON_DELTA : BlockFlowClipboard.SIGN_CLIPBOARD_JSON_BLOCKS + JSON.stringify(data)
      )
      this._data_write = null
      return
    }

    const curRange = this.controller.selection.getSelection()
    if (!curRange) return null
    event.preventDefault()
    const clipboardData = event.clipboardData!
    if (!curRange.isAtRoot) {
      const {blockRange: range, blockId} = curRange
      if (range.start === range.end) throw new Error('The range is collapsed')
      const bRef = this.controller.getBlockRef(blockId)
      if (!bRef || !this.controller.isEditableBlock(bRef)) throw new Error('The block is not editable')

      if (this.controller.activeElement?.classList.contains('bf-plain-text-only')) {
        clipboardData.setData('text/plain', bRef.getTextContent().slice(range.start, range.end))
        return {range: curRange, clipboardData}
      }

      const deltaConcat = sliceDelta(bRef.getTextDelta(), range.start, range.end)
      clipboardData.setData('text/plain', deltaToString(deltaConcat))
      clipboardData.setData(BlockFlowClipboard.CLIPBOARD_DATA_TYPE, BlockFlowClipboard.SIGN_CLIPBOARD_JSON_DELTA + JSON.stringify(deltaConcat))
      return {range: curRange, clipboardData}
    }

    const {rootRange} = curRange
    if (!rootRange) throw new Error('No range selected')
    const blocks = this.controller.rootModel.slice(rootRange.start, rootRange.end + 1).map((block) => block.toJSON())
    clipboardData.setData(BlockFlowClipboard.CLIPBOARD_DATA_TYPE, BlockFlowClipboard.SIGN_CLIPBOARD_JSON_BLOCKS + JSON.stringify(blocks))
    return {range: curRange, clipboardData}
  }

  private onCut = (event: ClipboardEvent) => {
    const res = this.onCopy(event)
    if (!res) return
    const {range} = res
    if (!range.isAtRoot) {
      const {blockRange, blockId} = range
      const bRef = this.controller.getBlockRef(blockId)
      if (!bRef || !this.controller.isEditableBlock(bRef)) throw new Error('The block is not editable')

      const deltas = [{retain: blockRange.start}, {delete: blockRange.end - blockRange.start}]
      bRef.applyDelta(deltas)
      return;
    }

    const rootRange = range.rootRange!
    this.controller.deleteBlocks(rootRange.start, rootRange.end - rootRange.start)
  }

  private uploadImg = async (file: File) => {
    const imgUploader = this.controller.injector.get(FILE_UPLOADER)
    if (!imgUploader) throw new Error('imgUploader is required')
    return await imgUploader.uploadImg(file)
  }

  private onPaste = async (event: ClipboardEvent) => {
    if (this.controller.readonly$.value) return
    event.preventDefault()
    const clipboardData = event.clipboardData!
    console.log(clipboardData.types)
    const curRange = this.controller.selection.getSelection()
    if (!curRange) return

    // files
    if (clipboardData.types.includes('Files')) {
      if (curRange.isAtRoot || !clipboardData.files.length) return;

      const imgFiles = Array.from(clipboardData.files).filter(file => file.type.startsWith('image'))
      if (!imgFiles.length) return
      const fileUri = await this.uploadImg(imgFiles[0])

      const bRef = this.controller.getBlockRef(curRange.blockId)
      if (!bRef || !this.controller.isEditableBlock(bRef)) throw new Error('The block is not editable')

      const {parentId, index} = bRef.getPosition()
      if (bRef.containerEle.classList.contains('bf-plain-text-only')) return
      if (bRef.containerEle.classList.contains('bf-multi-line')) {
        bRef.applyDelta([{retain: curRange.blockRange.start}, {insert: {image: fileUri}}])
        return
      }
      if (parentId === this.controller.rootId) {
        const block = this.controller.createBlock('image', [fileUri])
        this.controller.insertBlocks(index, [block], this.controller.rootId)
        return
      }
    }

    if (clipboardData.types.includes(BlockFlowClipboard.CLIPBOARD_DATA_TYPE)) {
      const data = clipboardData.getData(BlockFlowClipboard.CLIPBOARD_DATA_TYPE)
      if (data.startsWith(BlockFlowClipboard.SIGN_CLIPBOARD_JSON_DELTA)) {
        const deltas = JSON.parse(data.slice(BlockFlowClipboard.SIGN_CLIPBOARD_JSON_DELTA.length)) as DeltaInsert[]
        if (curRange.isAtRoot) return
        const bRef = this.controller.getBlockRef(curRange.blockId)
        if (!bRef || !this.controller.isEditableBlock(bRef)) throw new Error('The block is not editable')
        applyPasteDeltaToBlock(bRef, deltas, curRange.blockRange)
        return;
      }

      if (data.startsWith(BlockFlowClipboard.SIGN_CLIPBOARD_JSON_BLOCKS)) {
        const json = JSON.parse(data.slice(BlockFlowClipboard.SIGN_CLIPBOARD_JSON_BLOCKS.length)) as IBlockModel[]
        let index: number
        if (curRange.isAtRoot) {
          index = curRange.rootRange!.end
        } else {
          index = this.controller.getBlockPosition(curRange.blockId)!.index + 1
        }
        this.controller.insertBlocks(index, json.map(BlockModel.fromModel))
        return
      }
      return;
    }

    if (!curRange.isAtRoot && clipboardData.types.includes('text/html')) {

      if (!this.controller.activeElement?.classList.contains('bf-plain-text-only')) {
        const html = clipboardData.getData('text/html')
        console.log(html)
        const position = this.controller.getBlockPosition(curRange.blockId)!

        if (position.parentId === this.controller.rootId && !this.controller.activeElement?.classList.contains('bf-multi-line')) {
          const parseModels = this.htmlConverter.convertToBlocks(html)
          if (parseModels.length) {
            this.controller.insertBlocks(position.index + 1, parseModels.map(BlockModel.fromModel))
            return
          }
        } else {
          const deltas = this.htmlConverter.convertToDeltas(html)
          if (deltas.length) {
            const bRef = this.controller.getBlockRef(curRange.blockId)
            if (!bRef || !this.controller.isEditableBlock(bRef)) throw new Error('The block is not editable')
            applyPasteDeltaToBlock(bRef, deltas, curRange.blockRange)
          }
          return
        }

      }

    }

    const text = clipboardData.getData('text/plain')
    if (!text) return;
    if (curRange.isAtRoot) return;
    const bRef = this.controller.getBlockRef(curRange.blockId)
    if (!bRef || !this.controller.isEditableBlock(bRef)) throw new Error('The block is not editable')
    let deltaInsert: DeltaInsert[]
    if (isUrl(text) && !bRef.containerEle.classList.contains('bf-plain-text-only')) {
      deltaInsert = [{insert: {link: text}, attributes: {'d:href': text}}]
    } else {
      deltaInsert = [{insert: text}]
    }
    applyPasteDeltaToBlock(bRef, deltaInsert, curRange.blockRange)
  }

  private onDrop = async (event: DragEvent) => {
    event.preventDefault()
    if (!event.dataTransfer) return

    event.dataTransfer.types.forEach(type => console.log(type, event.dataTransfer!.getData(type)))
    const types = event.dataTransfer!.types

    if (event.dataTransfer.files) {
      const imgFiles = Array.from(event.dataTransfer.files).filter(file => file.type.startsWith('image'))
      if (!imgFiles.length) return
      const target = event.target as HTMLElement
      const blockId = target.closest('[bf-block-wrap]')?.getAttribute('data-block-id')
      if (!blockId) return
      const fileUri = await this.uploadImg(imgFiles[0])
      const bPos = this.controller.getBlockPosition(blockId)!
      const imgBlock = this.controller.createBlock('image', [fileUri])
      this.controller.insertBlocks(bPos.index + 1, [imgBlock])
    }

  }
}

const applyPasteDeltaToBlock = (blockRef: any, deltaInsert: DeltaInsert[], range: {
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
