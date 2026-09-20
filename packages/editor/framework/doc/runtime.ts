import type {DocConfig} from './document';
import type {ClipboardManager} from '../modules/clipboard/clipboard-manager';

/** 内部装配端口。默认产品能力由 editor 提供，不写入持久化 DocConfig。 */
export interface DocumentRuntime {
  createClipboard(doc: BlockCraft.Doc): ClipboardManager;
  resolveEmbeds(embeds: DocConfig['embeds']): NonNullable<DocConfig['embeds']>;
}
