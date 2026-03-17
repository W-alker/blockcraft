import {ClipboardDataType, DOC_FILE_SERVICE_TOKEN, DocAdapterService, IAdapter, IBlockSnapshot} from "../../framework";
import {HtmlAdapter, MarkdownAdapter} from "../../adapters";
import {inject, Injectable} from "@angular/core";

@Injectable()
export class AdapterService extends DocAdapterService {
  fileService = inject(DOC_FILE_SERVICE_TOKEN)
  htmlAdapter = new HtmlAdapter(this.fileService)
  markdownAdapter = new MarkdownAdapter(this.fileService)

  supportedAdapters: IAdapter[] = [
    {
      type: ClipboardDataType.HTML,
      toSnapshot: (html: string) => this.htmlAdapter.toBlockSnapshot(html),
      fromSnapshot: (snapshot: IBlockSnapshot) => this.htmlAdapter.toHtml(snapshot)
    },
    {
      type: ClipboardDataType.RTF,
      toSnapshot: (rtf: string) => this.markdownAdapter.toBlockSnapshot(rtf),
      fromSnapshot: (snapshot: IBlockSnapshot) => this.markdownAdapter.toMarkdown(snapshot)
    }
  ]
}
