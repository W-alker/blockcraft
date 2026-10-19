import type {ClipboardSourceAdapter} from '../../../framework/modules/clipboard/source-adapter';
import {DOC_FILE_SERVICE_TOKEN} from '../../../framework/angular/host-service-tokens';
import {parseYneClipboard} from './index';
import {YNE_JSON_MIME} from './types';
import {isYoudaoHtml, parseYoudaoHtml} from './youdao-html';
import {collectAndStripRehostMarkers, rehostYneAttachments} from './resource';

/** 无可变实例状态；临时附件引用仅保存在每次粘贴的闭包中。 */
export const YNE_CLIPBOARD_SOURCE_ADAPTER: ClipboardSourceAdapter = Object.freeze<ClipboardSourceAdapter>({
  parseStructured(data, doc) {
    return data.dataTypes.includes(YNE_JSON_MIME) ? parseYneClipboard(data, doc) : null;
  },
  parseHtml(html, doc) {
    return isYoudaoHtml(html) ? parseYoudaoHtml(html, doc.injector.get(DOC_FILE_SERVICE_TOKEN)) : null;
  },
  prepareSnapshot(snapshot, doc) {
    const deferred = collectAndStripRehostMarkers(snapshot);
    return deferred.length ? () => rehostYneAttachments(doc, deferred) : undefined;
  },
});
