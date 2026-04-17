import {IBlockSnapshot} from "../../block-std";
import {ClipboardDataType, ClipboardManager} from "./index";
import {snapshots2Text} from "../../utils";
import {
  BLOCKCRAFT_WEB_SNAPSHOT_MIME,
  buildClipboardItems,
} from "./internal-clipboard";

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
  const supportedAdapterTypes = new Set<string>();
  for (const adapter of this.adapter.supportedAdapters) {
    if (supportsClipboardWriteType(adapter.type)) {
      supportedAdapterTypes.add(adapter.type);
    }
  }

  const items = await buildClipboardItems(
    this.adapter.supportedAdapters,
    snapshot,
    snapshots2Text([snapshot]),
    supportedAdapterTypes
  );
  const itemData: Record<string, Blob> = {};

  try {
    for (const [type, value] of Object.entries(items)) {
      if (supportsClipboardWriteType(type)) {
        itemData[type] = new Blob([value], {type});
        continue;
      }

      if (type === ClipboardDataType.BLOCKCRAFT_SNAPSHOT && supportsClipboardWriteType(BLOCKCRAFT_WEB_SNAPSHOT_MIME)) {
        itemData[BLOCKCRAFT_WEB_SNAPSHOT_MIME] = new Blob([value], {type: BLOCKCRAFT_WEB_SNAPSHOT_MIME});
      }
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
    const items = await buildClipboardItems(this.adapter.supportedAdapters, rootSnapshot, snapshots2Text([rootSnapshot]));

    let range: Range | undefined
    const selection = window.getSelection()
    if (selection && selection.rangeCount) {
      range = selection.getRangeAt(0)?.cloneRange()
      selection.removeAllRanges()
    }

    let copyHandled = false
    document.body.addEventListener('copy', (e) => {
      copyHandled = true
      if (range) {
        window.getSelection()?.removeAllRanges()
        window.getSelection()?.addRange(range)
      }

      e.preventDefault()
      e.stopPropagation()
      if (!e.clipboardData) {
        reject('clipboardData is null')
        return
      }

      for (const [type, value] of Object.entries(items)) {
        e.clipboardData.setData(type, value)
      }
      resolve()
    }, {once: true})

    const success = document.execCommand('copy')
    if (!success && !copyHandled) {
      reject('execCommand copy failed')
    }
  })
}

export function copyBlocks(this: ClipboardManager, snapshot: IBlockSnapshot) {
  if (window.navigator?.clipboard) {
    return tryNavigator.call(this, snapshot)
  }
  return tryCommand.call(this, snapshot)
}
