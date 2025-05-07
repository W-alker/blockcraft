import {DOC_FILE_SERVICE_TOKEN, DocAdapterService, IBlockSnapshot} from "../../framework";
import {HtmlAdapter} from "../../adapters";
import {inject, Injectable} from "@angular/core";

@Injectable()
export class AdapterService extends DocAdapterService {
  constructor(
  ) {
    super();
  }

  fileService = inject(DOC_FILE_SERVICE_TOKEN)

  htmlAdapter = new HtmlAdapter(this.fileService)

  html2snapshot(html: string) {
    return this.htmlAdapter.toBlockSnapshot(html)
  }

  snapshot2html(snapshot: IBlockSnapshot) {
    return this.htmlAdapter.toHtml(snapshot)
  }
}
