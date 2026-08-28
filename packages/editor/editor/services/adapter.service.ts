import {ClipboardDataType, DOC_FILE_SERVICE_TOKEN, DocAdapterService, IAdapter, IBlockSnapshot} from "../../framework";
import {
  HtmlAdapter,
  MarkdownAdapter,
} from "../../adapters";
import {BUNDLED_ADAPTER_REGISTRY} from '../bundled-adapter-registry'
import {AdapterRegistry} from '../../adapters/registry'
import {inject, Injectable, InjectionToken} from "@angular/core";

/**
 * Registry used by the editor-level HTML/Markdown service.
 *
 * Hosts that register custom Schemas or Inline Embeds override this token with
 * `createBundledAdapterRegistry({additionalBlocks, additionalInlineEmbeds})`.
 */
export const EDITOR_ADAPTER_REGISTRY_TOKEN =
  new InjectionToken<AdapterRegistry>('EDITOR_ADAPTER_REGISTRY_TOKEN', {
    providedIn: 'root',
    factory: () => BUNDLED_ADAPTER_REGISTRY,
  })

@Injectable()
export class AdapterService extends DocAdapterService {
  fileService = inject(DOC_FILE_SERVICE_TOKEN)
  registry = inject(EDITOR_ADAPTER_REGISTRY_TOKEN)
  htmlAdapter = new HtmlAdapter(
    this.fileService,
    new Map(),
    this.registry,
  )
  markdownAdapter = new MarkdownAdapter(
    this.fileService,
    new Map(),
    this.registry,
  )

  supportedAdapters: IAdapter[] = [
    {
      type: ClipboardDataType.HTML,
      toSnapshot: (html: string) => this.htmlAdapter.toBlockSnapshot(html),
      fromSnapshot: (snapshot: IBlockSnapshot) => this.htmlAdapter.toHtml(snapshot)
    },
    {
      type: ClipboardDataType.MARKDOWN,
      toSnapshot: (markdown: string) => this.markdownAdapter.toBlockSnapshot(markdown),
      fromSnapshot: (snapshot: IBlockSnapshot) => this.markdownAdapter.toMarkdown(snapshot)
    }
  ]
}
