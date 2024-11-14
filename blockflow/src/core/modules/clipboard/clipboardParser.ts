import {DeltaInsert, IBlockModel, isUrl} from "@core";
import {BlockFlowClipboard} from "@core/modules/clipboard/clipboard";

export class ClipDataParser {

  static parseBFJSON(data: string): { type: 'blocks', data: IBlockModel[] } | { type: 'delta', data: DeltaInsert[] } | { type: 'text', data: string } | { type: 'link', data: string } {
    if (data.startsWith(BlockFlowClipboard.SIGN_CLIPBOARD_JSON_DELTA)) {
      const json = JSON.parse(data.slice(BlockFlowClipboard.SIGN_CLIPBOARD_JSON_DELTA.length))
      if (!Array.isArray(json) && !json[0].insert) return {type: 'text', data}
      return {type: 'delta', data: json}
    }
    if (data.startsWith(BlockFlowClipboard.SIGN_CLIPBOARD_JSON_BLOCKS)) {
      const json = JSON.parse(data.slice(BlockFlowClipboard.SIGN_CLIPBOARD_JSON_BLOCKS.length))
      if (!Array.isArray(json) && !json[0].flavour) return {type: 'text', data}
      return {type: 'blocks', data: json}
    }
    if (isUrl(data)) return {type: 'link', data: decodeURIComponent(data)}
    return {type: 'text', data}
  }

}
