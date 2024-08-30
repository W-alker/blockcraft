import {DeltaInsert, IBlockModel, SIGN_CLIPBOARD_JSON_BLOCKS, SIGN_CLIPBOARD_JSON_DELTA} from "@core";

export const delta2ClipData = (delta: DeltaInsert[]) => {
    return SIGN_CLIPBOARD_JSON_DELTA + JSON.stringify(delta)
}

export const model2ClipData = (model: IBlockModel[]) => {
    return SIGN_CLIPBOARD_JSON_BLOCKS + JSON.stringify(model)
}

export const writeDeltaToClipboard = (delta: DeltaInsert[]) => {
    return writeClipData(delta2ClipData(delta))
}

export const writeModelToClipboard = (model: IBlockModel[]) => {
    return writeClipData(model2ClipData(model))
}

export const writeClipData = (data: string) => {
    const clipboardItem = new ClipboardItem({
        'text/plain': new Blob([data], {type: 'text/plain'}),
    }, {
        presentationStyle: 'unspecified'
    })
    return navigator.clipboard.write([clipboardItem])
}
