import {IBlockSnapshot} from "../../block-std";
import {ClipboardDataType, ClipboardManager} from "./index";
import {snapshots2Text} from "../../utils";

async function tryNavigator(this: ClipboardManager, snapshot: IBlockSnapshot) {
  let clipboardItem: ClipboardItem
  try {
    const items: Partial<Record<ClipboardDataType, Blob>> = {}
    for (const adp of this.adapter.supportedAdapters) {
      const str = await adp.fromSnapshot(snapshot)
      items[adp.type] = new Blob([str], {type: adp.type})
    }
    clipboardItem = new ClipboardItem({
      [ClipboardDataType.TEXT]: new Blob([snapshots2Text([snapshot])], {type: 'text/plain'}),
      ...items
    })

  } catch (e) {
    clipboardItem = new ClipboardItem({
      [ClipboardDataType.TEXT]: new Blob([snapshots2Text([snapshot])], {type: 'text/plain'}),
    })
  }

  return navigator.clipboard.write([clipboardItem])
}

async function tryCommand(this: ClipboardManager, rootSnapshot: IBlockSnapshot) {
  return new Promise<void>(async (resolve, reject) => {
    const items: Partial<Record<ClipboardDataType, string | Blob>> = {}
    try {
      for (const adp of this.adapter.supportedAdapters) {
        items[adp.type] = await adp.fromSnapshot(rootSnapshot)
      }
    } catch (e) {
      console.error(e)
    } finally {
      items[ClipboardDataType.TEXT] = snapshots2Text([rootSnapshot])
    }

    let range: Range
    const selection = window.getSelection()
    if (selection && selection.rangeCount) {
      range = selection.getRangeAt(0)?.cloneRange()
      selection.removeAllRanges()
    }

    document.addEventListener('copy', (e) => {
      if (range) {
        window.getSelection()?.removeAllRanges()
        window.getSelection()?.addRange(range)
      }

      e.preventDefault()
      if (!e.clipboardData) {
        reject('clipboardData is null')
      }

      for (let itemsKey in items) {
        /// @ts-ignore
        e.clipboardData?.setData(itemsKey, items[itemsKey])
      }
      resolve()
    }, {once: true})
    document.execCommand('copy')
  })
}

export function copyBlocks(this: ClipboardManager, snapshot: IBlockSnapshot) {
  // if (window.navigator.clipboard) {
  //   return tryNavigator.call(this, snapshot)
  // }
  return tryCommand.call(this, snapshot)
}
