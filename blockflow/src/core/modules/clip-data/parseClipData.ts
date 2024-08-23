import {SIGN_CLIPBOARD_JSON_BLOCKS, SIGN_CLIPBOARD_JSON_DELTA} from "@core/modules";
import {DeltaInsert, IBlockModel} from "@core/types";

export class ClipDataParser {

  static parseBFJSON(data: string): { type: 'blocks', data: IBlockModel[] } | { type: 'delta', data: DeltaInsert[] } {
    if (!data) throw new Error('Invalid: no data.')
    if (data.startsWith(SIGN_CLIPBOARD_JSON_DELTA)) {
      const json = JSON.parse(data.slice(SIGN_CLIPBOARD_JSON_DELTA.length))
      if (!Array.isArray(json) && !json[0].insert) throw new Error('Invalid: not a delta JSON data.')
      return {type: 'delta', data: json}
    }
    if (data.startsWith(SIGN_CLIPBOARD_JSON_BLOCKS)) {
      const json = JSON.parse(data.slice(SIGN_CLIPBOARD_JSON_BLOCKS.length))
      if (!Array.isArray(json) && !json[0].flavour) throw new Error('Invalid: not a blockflow JSON data.')
      return {type: 'blocks', data: json}
    }
    throw new Error('Invalid: not a blockflow JSON data.')
  }

  static parseHTML(data: string) {

  }

}

