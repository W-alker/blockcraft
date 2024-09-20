import {DeltaInsert, IBlockModel} from "@core/types";
import {SIGN_CLIPBOARD_JSON_BLOCKS, SIGN_CLIPBOARD_JSON_DELTA} from "@core/helpers";

const urlPattern = /^https?:\/\/([a-zA-Z0-9]+\.)+[a-zA-Z0-9]+/;
// url转码
const urlEncode = (url: string) => {
  return encodeURIComponent(url);
}

export class ClipDataParser {

  static parseBFJSON(data: string): { type: 'blocks', data: IBlockModel[] } | { type: 'delta', data: DeltaInsert[] } | { type: 'text', data: string } | { type: 'link', data: string } {
    if (!data) return {type: 'text', data}
    if (data.startsWith(SIGN_CLIPBOARD_JSON_DELTA)) {
      const json = JSON.parse(data.slice(SIGN_CLIPBOARD_JSON_DELTA.length))
      if (!Array.isArray(json) && !json[0].insert) return {type: 'text', data}
      return {type: 'delta', data: json}
    }
    if (data.startsWith(SIGN_CLIPBOARD_JSON_BLOCKS)) {
      const json = JSON.parse(data.slice(SIGN_CLIPBOARD_JSON_BLOCKS.length))
      if (!Array.isArray(json) && !json[0].flavour) return {type: 'text', data}
      return {type: 'blocks', data: json}
    }
    if (urlPattern.test(data)) return {type: 'link', data: decodeURIComponent(data)}
    return {type: 'text', data}
  }

  static parseHTML(data: string) {

  }

}

