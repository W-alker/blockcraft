// packages/editor/adapters/yne-adapter/index.ts
import { generateId, IBlockSnapshot } from "../../framework";
import { DOC_FILE_SERVICE_TOKEN } from "../../framework";
import { RootBlockSchema } from "../../blocks";
import { convertBlock } from "./block-converters";
import {
  YNE_IMAGE_JSON_MIME,
  YNE_JSON_MIME,
  YneBlock,
  YneConvertContext,
  YneImageMap,
} from "./types";

export { rehostYneAttachments, collectAndStripRehostMarkers } from "./resource";
export { parseYoudaoHtml, isYoudaoHtml, ynedbg } from "./youdao-html";
export { YNE_JSON_MIME, YNE_IMAGE_JSON_MIME } from "./types";
export type { YneDeferredAttachment } from "./types";

interface YneClipboardState {
  dataTypes: readonly string[];
  getData: (type: string) => string | null;
}

function parseImageMap(raw: string | null): Map<string, string> {
  const map = new Map<string, string>();
  if (!raw) return map;
  try {
    const parsed = JSON.parse(raw) as YneImageMap;
    const data = parsed?.data ?? {};
    for (const [url, val] of Object.entries(data)) {
      if (val?.base64) map.set(url, val.base64);
    }
  } catch {
    // image bytes are best-effort; images fall back to their source URL
  }
  return map;
}

/**
 * Parse 有道云's `text/yne-json` clipboard payload into a root snapshot.
 * Attachment snapshots are tagged for re-host via a transient meta marker
 * ({@link collectAndStripRehostMarkers}); the clipboard re-hosts them post-insert.
 */
export function parseYneClipboard(
  state: YneClipboardState,
  doc: BlockCraft.Doc
): IBlockSnapshot | null {
  const raw = state.getData(YNE_JSON_MIME);
  if (!raw) return null;

  try {
    const blocks = JSON.parse(raw) as YneBlock[];
    if (!Array.isArray(blocks) || !blocks.length) return null;

    const ctx: YneConvertContext = {
      imageMap: parseImageMap(state.getData(YNE_IMAGE_JSON_MIME)),
      fileService: doc.injector.get(DOC_FILE_SERVICE_TOKEN),
    };

    const children: IBlockSnapshot[] = [];
    for (const block of blocks) {
      children.push(...convertBlock(block, ctx));
    }
    if (!children.length) return null;

    return RootBlockSchema.createSnapshot(generateId(), children);
  } catch (e) {
    doc.logger?.warn?.('parseYneClipboard failed', e);
    return null;
  }
}
