import {InjectionToken} from "@angular/core";
import {IBlockSnapshot} from "../block-std";
import {ClipboardDataType} from "../modules";

export const DOC_ADAPTER_SERVICE_TOKEN = new InjectionToken<DocAdapterService>("DOC_ADAPTER_SERVICE_TOKEN")

export interface IAdapter {
  type: ClipboardDataType
  toSnapshot: (data: string) => Promise<IBlockSnapshot>
  fromSnapshot: (snapshot: IBlockSnapshot) => Promise<string>
}

export abstract class DocAdapterService {
  abstract supportedAdapters: IAdapter[]

  getAdapter(type: ClipboardDataType) {
    return this.supportedAdapters.find(adapter => adapter.type === type)
  }

  registerAdapter(adapter: IAdapter) {
    this.supportedAdapters.push(adapter)
  }

  getSupportedTypes() {
    return this.supportedAdapters.map(adapter => adapter.type)
  }

}
