import {BlockCraftDoc as CoreDocument, type DocConfig} from '../framework/doc/document';
import type {DocumentRuntime} from '../framework/doc/runtime';
import {withDefaultEmbedConverters} from '../embeds/defaults';
import {ClipboardManager} from './clipboard-manager';

const DEFAULT_DOCUMENT_RUNTIME: DocumentRuntime = Object.freeze({
  createClipboard: (doc: BlockCraft.Doc) => new ClipboardManager(doc),
  resolveEmbeds: withDefaultEmbedConverters,
});

/** 公共文档装配：保持原构造参数、默认 Embed、剪贴板和生命周期。 */
export class BlockCraftDoc extends CoreDocument {
  constructor(config: DocConfig) {
    super(config, DEFAULT_DOCUMENT_RUNTIME);
  }
}
