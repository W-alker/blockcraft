import {IBlockSnapshot} from "../../block-std";
import {ClipboardDataType, ClipboardManager} from "./index";
import {snapshots2Text} from "../../utils";
import {
  BLOCKCRAFT_WEB_SNAPSHOT_MIME,
  buildClipboardItems,
  supportsClipboardWriteType,
} from "./internal-clipboard";
import {getClipboardNavigator, getClipboardOwnerDocument} from "./dom-context";

async function tryNavigator(this: ClipboardManager, snapshot: IBlockSnapshot) {
  const ownerNavigator = getClipboardNavigator(this.doc)
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
    return await ownerNavigator.clipboard.write([new ClipboardItem(itemData)])
  } catch (e) {
    return tryCommand.call(this, snapshot)
  }
}

async function tryCommand(this: ClipboardManager, rootSnapshot: IBlockSnapshot) {
  return new Promise<void>(async (resolve, reject) => {
    const items = await buildClipboardItems(this.adapter.supportedAdapters, rootSnapshot, snapshots2Text([rootSnapshot]));
    const ownerDocument = getClipboardOwnerDocument(this.doc)

    let range: Range | undefined
    const selection = ownerDocument.getSelection()
    if (selection && selection.rangeCount) {
      range = selection.getRangeAt(0)?.cloneRange()
      selection.removeAllRanges()
    }

    let copyHandled = false
    const handler = (e: ClipboardEvent) => {
      copyHandled = true
      if (range) {
        ownerDocument.getSelection()?.removeAllRanges()
        ownerDocument.getSelection()?.addRange(range)
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
    }
    ownerDocument.body.addEventListener('copy', handler, {once: true})

    let success = false
    try {
      success = ownerDocument.execCommand('copy')
    } catch (e) {
      // execCommand 抛错时清理 listener，避免下次 copy 事件触发陈旧回调
      ownerDocument.body.removeEventListener('copy', handler)
      reject(e)
      return
    }
    if (!copyHandled) {
      // copy 事件未触发：listener 仍挂在 ownerDocument.body 上，必须显式移除
      // 否则会成为孤儿，下一次任意 copy 事件会以陈旧的 items/range 闭包错误地 resolve
      ownerDocument.body.removeEventListener('copy', handler)
      reject(success ? 'copy event did not fire' : 'execCommand copy failed')
    }
  })
}

export function copyBlocks(this: ClipboardManager, snapshot: IBlockSnapshot) {
  const ownerNavigator = getClipboardNavigator(this.doc)
  if (ownerNavigator.clipboard) {
    return tryNavigator.call(this, snapshot)
  }
  return tryCommand.call(this, snapshot)
}
