import type {IBlockSnapshot} from "../block-std/types/block.type";
import type {ClipboardDataType} from "../modules/clipboard/types";
import type {ClipboardSourceAdapter} from '../modules/clipboard/source-adapter';

export {DOC_ADAPTER_SERVICE_TOKEN} from '../angular/host-service-tokens';

export interface IAdapter {
  type: ClipboardDataType
  toSnapshot: (data: string) => Promise<IBlockSnapshot>
  fromSnapshot: (snapshot: IBlockSnapshot) => Promise<string>
}

export abstract class DocAdapterService {
  /** 缺省保留旧宿主的默认来源；显式列表（包括 []）完全替代默认来源。 */
  clipboardSourceAdapters?: readonly ClipboardSourceAdapter[]

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
