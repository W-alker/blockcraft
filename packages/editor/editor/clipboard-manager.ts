import {ClipboardManager as CoreClipboardManager} from '../framework/modules/clipboard/clipboard-manager';
import {BUNDLED_CLIPBOARD_SOURCE_ADAPTERS} from './clipboard-source-adapters';

/** 保留公共构造器的默认来源；领域实现通过构造参数接收来源列表。 */
export class ClipboardManager extends CoreClipboardManager {
  constructor(doc: BlockCraft.Doc) {
    super(doc, BUNDLED_CLIPBOARD_SOURCE_ADAPTERS);
  }
}
