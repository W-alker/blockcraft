import {IBlockSnapshot} from "../../block-std";
import {ClipboardDataType, ClipboardManager} from "./index";
import {snapshots2Text} from "../../utils";
import {nextTick} from "../../../global";

async function tryNavigator(this: ClipboardManager, snapshot: IBlockSnapshot) {
  let clipboardItem: ClipboardItem
  try {
    const items: Partial<Record<ClipboardDataType, Blob>> = {}
    for (const adp of this.adapter.supportedAdapters) {
      const str = await adp.fromSnapshot(snapshot)
      items[adp.type] = new Blob([str], {type: adp.type})
    }
    clipboardItem = new ClipboardItem({
      [ClipboardDataType.TEXT]: snapshots2Text([snapshot]),
      ...items
    })

  } catch (e) {
    clipboardItem = new ClipboardItem({
      [ClipboardDataType.TEXT]: snapshots2Text([snapshot]),
    })
  }

  return navigator.clipboard.write([clipboardItem])
}

async function tryCommand(this: ClipboardManager, rootSnapshot: IBlockSnapshot) {
  return new Promise<void>(async (resolve, reject) => {
    const items: Partial<Record<ClipboardDataType, string>> = {}
    try {
      for (const adp of this.adapter.supportedAdapters) {
        items[adp.type] = await adp.fromSnapshot(rootSnapshot)
      }
    } catch (e) {
      items[ClipboardDataType.TEXT] = snapshots2Text([rootSnapshot])
    }

    const fn = (e: ClipboardEvent) => {
      document.removeEventListener('copy', fn)

      e.preventDefault()
      if (!e.clipboardData) {
        reject('clipboardData is null')
      }

      for (let itemsKey in items) {
        /// @ts-ignore
        e.clipboardData?.setData(itemsKey, items[itemsKey])
      }
      resolve()
    }

    document.addEventListener('copy', fn)
    document.execCommand('copy')
  })
}

export function copyBlocks(this: ClipboardManager, snapshot: IBlockSnapshot) {
  if (window.navigator.clipboard) {
    return tryNavigator.call(this, snapshot)
  }
  return tryCommand.call(this, snapshot)
}
