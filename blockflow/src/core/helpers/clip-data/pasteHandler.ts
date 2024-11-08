import {Controller} from "../../controller";
import {EditableBlock} from "../../block-std";
import {ClipDataParser} from "./parseClipData";
import {genUniqueID} from "../../utils";
import {BlockModel} from "../../yjs";
import {DeltaInsert, DeltaOperation} from "../../types";
import {FILE_UPLOADER} from "../../../blocks";

export const pasteHandler = (event: ClipboardEvent, controller: Controller) => {
  event.preventDefault()
  const clipboardData = event.clipboardData!
  const types = clipboardData.types!
  console.log('%cpaste========', 'background: yellow', event, types)

  const range = controller.getSelection()!
  if (range.isAtRoot) return

  const {blockId, blockRange} = range
  const {parentId, index} = controller.getBlockPosition(blockId)

  const pasteAsText = (text: string = clipboardData.getData('text/plain')) => {
    if (!text) return
    const blockRef = controller.getBlockRef(blockId) as EditableBlock
    const deltaInsert: DeltaInsert[] = [{insert: text}]
    applyPasteDeltaToBlock(blockRef, deltaInsert, blockRange)
  }

  // only text/plain
  if (types.length === 1 && types[0] === 'text/plain') {

    const text = clipboardData.getData('text/plain')
    if (!text) return
    const blockRef = controller.getBlockRef(blockId) as EditableBlock
    // assume data is bf-json
    const {data: jsonData, type: jsonType} = ClipDataParser.parseBFJSON(text)

    console.log(jsonType, jsonData)

    if (jsonType === 'blocks') {
      if (!jsonData.length) return
      if (parentId !== controller.rootId) return

      jsonData.forEach((block, i) => {
        block.id = genUniqueID()
      })
      controller.insertBlocks(index + 1, jsonData.map(BlockModel.fromModel))
        .then(() => {
          controller.setSelection(controller.rootId, index + 1, index + jsonData.length)
        })
      return;
    }

    if (jsonType === 'delta') {
      applyPasteDeltaToBlock(blockRef, jsonData, blockRange)

      if(controller.activeElement?.classList.contains('bf-plain-text-only')) {
        const text = jsonData.map(d => d.insert).join('')
        pasteAsText(text)
        return;
      }

      return;
    }

    // data is link
    if (jsonType === 'link' && jsonData) {
      if(controller.activeElement?.classList.contains('bf-plain-text-only')) {
        pasteAsText(jsonData)
        return;
      }

      const deltaInsert: DeltaInsert[] = [{insert: { link: jsonData }, attributes: { 'd:href' : jsonData } }]
      applyPasteDeltaToBlock(blockRef, deltaInsert, blockRange)
      return;
    }
    // data is plain text
    if (jsonType === 'text' && jsonData) {
      applyPasteDeltaToBlock(blockRef, [{insert: jsonData}], blockRange)
      return;
    }

    return;
  }

  // files
  if (types.includes('Files')) {
    if (!clipboardData.files.length || parentId !== controller.rootId) return
    const imgFiles = Array.from(clipboardData.files).filter(file => file.type.startsWith('image'))
    if (!imgFiles.length) return
    const imgUploader = controller.injector.get(FILE_UPLOADER)
    if (!imgUploader) throw new Error('imgUploader is required')
    imgUploader.uploadImg(imgFiles[0]).then((fileUri) => {
      const block = controller.createBlock('image', [fileUri])
      controller.insertBlocks(index, [block], controller.rootId)
    })
    return
  }

  // 保底方案
  if(types.includes('text/plain')) {
    pasteAsText()
    return
  }

  types.forEach(type => {
    console.log(type, event.clipboardData?.getData(type))
  })
}

const applyPasteDeltaToBlock = (blockRef: EditableBlock, deltaInsert: DeltaInsert[], range: {
  start: number,
  end: number
}) => {
  const deltas: DeltaOperation[] = [
    {retain: range.start},
    ...deltaInsert
  ]
  if (range.start !== range.end) {
    deltas.splice(1, 0, {delete: range.end - range.start})
  }
  // const oldTextLength = blockRef.textLength
  blockRef.applyDelta(deltas, true)
  // blockRef.setSelection(range.start, range.start + blockRef.textLength - oldTextLength)
}



