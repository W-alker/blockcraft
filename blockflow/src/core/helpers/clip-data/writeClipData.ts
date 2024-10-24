import {DeltaInsert, IBlockModel} from "../../types";
import {SIGN_CLIPBOARD_JSON_BLOCKS, SIGN_CLIPBOARD_JSON_DELTA} from "./const";

export class ClipDataWriter {

  static delta2ClipData = (delta: DeltaInsert[]) => {
    return SIGN_CLIPBOARD_JSON_DELTA + JSON.stringify(delta)
  }

  static model2ClipData = (model: IBlockModel[]) => {
    return SIGN_CLIPBOARD_JSON_BLOCKS + JSON.stringify(model)
  }

  static writeDeltaToClipboard = (delta: DeltaInsert[]) => {
    return this.writeClipData(this.delta2ClipData(delta))
  }

  static writeModelToClipboard = (model: IBlockModel[]) => {
    return this.writeClipData(this.model2ClipData(model))
  }

  static writeClipData = (data: string) => {
    const clipboardItem = new ClipboardItem({
      'text/plain': new Blob([data], {type: 'text/plain'}),
    }, {
      presentationStyle: 'unspecified'
    })
    return navigator.clipboard.write([clipboardItem])
  }

}


