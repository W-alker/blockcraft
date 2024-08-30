import {ClipDataParser, Controller, DeltaOperation, genUniqueID} from "@core";

export const pasteHandler = (event: ClipboardEvent, controller: Controller) => {
  event.preventDefault()
  const clipboardData = event.clipboardData!
  const types = clipboardData.types!
  console.log('%cpaste========', 'background: yellow', event, types)

  const range = controller.getCurrentRange()!
  if (range.isAtRoot) return

  // only text/plain
  if (types.length === 1 && types[0] === 'text/plain') {
    const text = clipboardData.getData('text/plain')
    if (!text) return
    try {
      // assume data is bf-json
      const data = ClipDataParser.parseBFJSON(text)
      if (data.type === 'blocks') {
        if (!data.data.length) return
        const curIndex = controller.rootModel.findIndex(block => block.id === range.blockId)
        data.data.forEach((block, i) => {
          block.id = genUniqueID()
        })
        controller.transact(() => {
          controller.insertBlocks(curIndex + 1, data.data)
            .then(() => {
              controller.selectBlocks(curIndex + 1, curIndex + data.data.length)
            })
        })
        return;
      } else if (data.type === 'delta') {
        const deltas: DeltaOperation[] = [
          {retain: range.blockRange.start},
          ...data.data,
        ]
        if (range.blockRange.start !== range.blockRange.end) {
          deltas.splice(1, 0, {delete: range.blockRange.end - range.blockRange.start})
        }
        controller.transact(() => {
          controller.applyDeltaToEditableBlock(range.blockId, deltas)
        })
      }
      return;
    } catch (e) {
      // data is plain text
      const deltas: DeltaOperation[] = [
        {retain: range.blockRange.start},
        {insert: text},
      ]
      if (range.blockRange.start !== range.blockRange.end) {
        deltas.splice(1, 0, {delete: range.blockRange.end - range.blockRange.start})
      }
      controller.transact(() => {
        controller.applyDeltaToEditableBlock(range.blockId, deltas)
      })
    }
    return
  }

  // files
  if (types.includes('Files')) {
    if (!clipboardData.files.length) return
    const imgFiles = Array.from(clipboardData.files).filter(file => file.type.startsWith('image'))
    return
  }

  types.forEach(type => {
    console.log(type, event.clipboardData?.getData(type))
  })
}
