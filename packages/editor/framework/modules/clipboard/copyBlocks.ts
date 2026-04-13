import {IBlockSnapshot} from "../../block-std";
import {ClipboardDataType, ClipboardManager} from "./index";
import {snapshots2Text} from "../../utils";

const STANDARD_CLIPBOARD_WRITE_TYPES = new Set<string>([
  ClipboardDataType.TEXT,
  ClipboardDataType.HTML,
  ClipboardDataType.IMAGE,
]);

function supportsClipboardWriteType(type: string) {
  if (STANDARD_CLIPBOARD_WRITE_TYPES.has(type)) {
    return true;
  }

  const clipboardItemCtor = globalThis.ClipboardItem as
    | (typeof ClipboardItem & {supports?: (type: string) => boolean})
    | undefined;

  if (typeof clipboardItemCtor?.supports === 'function') {
    return clipboardItemCtor.supports(type);
  }

  return false;
}

async function tryNavigator(this: ClipboardManager, snapshot: IBlockSnapshot) {
  const itemData: Record<string, Blob> = {
    [ClipboardDataType.TEXT]: new Blob([snapshots2Text([snapshot])], {type: ClipboardDataType.TEXT}),
  };

  try {
    for (const adp of this.adapter.supportedAdapters) {
      if (!supportsClipboardWriteType(adp.type)) continue;
      const str = await adp.fromSnapshot(snapshot)
      itemData[adp.type] = new Blob([str], {type: adp.type})
    }
  } catch (e) {
    return tryCommand.call(this, snapshot)
  }

  try {
    return await navigator.clipboard.write([new ClipboardItem(itemData)])
  } catch (e) {
    return tryCommand.call(this, snapshot)
  }
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

    document.body.addEventListener('copy', (e) => {
      if (range) {
        window.getSelection()?.removeAllRanges()
        window.getSelection()?.addRange(range)
      }

      e.preventDefault()
      e.stopPropagation()
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
  if (window.navigator?.clipboard) {
    return tryNavigator.call(this, snapshot)
  }
  return tryCommand.call(this, snapshot)
}
