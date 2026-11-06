import type {ClipboardSourceAdapter} from '../framework/modules/clipboard/source-adapter';
import {YNE_CLIPBOARD_SOURCE_ADAPTER} from '../adapters/sources/yne/clipboard-source-adapter';

/** 默认编辑器的来源组合；宿主可在自己的 DocAdapterService 中提供完整列表。 */
export const BUNDLED_CLIPBOARD_SOURCE_ADAPTERS: readonly ClipboardSourceAdapter[] =
  Object.freeze([YNE_CLIPBOARD_SOURCE_ADAPTER]);
