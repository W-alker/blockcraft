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
  YneParseResult,
} from "./types";

export { rehostYneAttachments } from "./resource";
export { YNE_JSON_MIME, YNE_IMAGE_JSON_MIME } from "./types";
export type { YneParseResult, YneDeferredAttachment } from "./types";

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

export function parseYneClipboard(
  state: YneClipboardState,
  doc: BlockCraft.Doc
): YneParseResult | null {
  const raw = state.getData(YNE_JSON_MIME);
  if (!raw) return null;

  try {
    const blocks = JSON.parse(raw) as YneBlock[];
    if (!Array.isArray(blocks) || !blocks.length) return null;

    const ctx: YneConvertContext = {
      imageMap: parseImageMap(state.getData(YNE_IMAGE_JSON_MIME)),
      fileService: doc.injector.get(DOC_FILE_SERVICE_TOKEN),
      deferredAttachments: [],
    };

    const children: IBlockSnapshot[] = [];
    for (const block of blocks) {
      children.push(...convertBlock(block, ctx));
    }
    if (!children.length) return null;

    const snapshot = RootBlockSchema.createSnapshot(generateId(), children);
    return { snapshot, deferredAttachments: ctx.deferredAttachments };
  } catch (e) {
    doc.logger?.warn?.('parseYneClipboard failed', e);
    return null;
  }
}
