import {DocAdapterService, IBlockSnapshot} from "../framework";
import {HtmlAdapter} from "./html-adapter";

export * from './html-adapter'
export * from './types'
export * from './utils'

export class AdapterService extends DocAdapterService {
  constructor() {
    super();
  }

  htmlAdapter = new HtmlAdapter()

  html2snapshot(html: string) {
    return this.htmlAdapter.toBlockSnapshot(html)
  }

  snapshot2html(snapshot: IBlockSnapshot): string {
    return "";
  }
}
