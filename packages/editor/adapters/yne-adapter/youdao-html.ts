// packages/editor/adapters/yne-adapter/youdao-html.ts
//
// 有道云 HTML paste path. WKWebView (Tauri) and some browsers strip 有道云's
// custom clipboard MIME types (text/yne-json, text/yne-image-json), leaving only
// text/html. But the full high-fidelity structure survives inside that HTML as
// `<article data-content="[…bulb JSON…]">` (an HTML attribute), and image bytes
// survive as visible `<img data-media-type="image" src="data:…">`.
//
// Lives in the Adapter layer: HtmlAdapter.toBlockSnapshot short-circuits here when
// isYoudaoHtml() matches, so all HTML→snapshot conversion stays in one place.
// Attachment re-host (a post-insertion, collaboration-sensitive side effect) is
// NOT done here — attachment snapshots are tagged via buildAttachmentSnapshot and
// the clipboard re-hosts them after insertion.

import { DocFileService, IBlockSnapshot, generateId } from "../../framework";
import { RootBlockSchema } from "../../blocks";
import { BulbConvertContext, BulbNode, convertBulbBlock } from "./bulb-converter";

/** Cheap marker check before paying for DOMParser. */
export function isYoudaoHtml(html: string): boolean {
  return html.includes('yne-bulb-block') || /<article[^>]*\bdata-content=/.test(html);
}

export function parseYoudaoHtml(html: string, fileService: DocFileService): IBlockSnapshot | null {
  if (typeof DOMParser === 'undefined') return null;
  try {
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    const article = parsed.querySelector('article[data-content]');
    const raw = article?.getAttribute('data-content'); // DOM already entity-decodes &quot; etc.
    if (!raw) return null;

    const blocks = JSON.parse(raw) as BulbNode[];
    if (!Array.isArray(blocks) || !blocks.length) return null;

    // Image bytes live in the visible <img data-media-type="image" src="data:…">,
    // in document order — the bulb image blocks are traversed in the same order.
    const imageDataUris = Array.from(parsed.querySelectorAll('img[data-media-type="image"]'))
      .map(img => img.getAttribute('src') || '')
      .filter(src => src.startsWith('data:'));

    const ctx: BulbConvertContext = {
      imageDataUris,
      imageCursor: { i: 0 },
      fileService,
    };

    const children: IBlockSnapshot[] = [];
    for (const block of blocks) {
      children.push(...convertBulbBlock(block, ctx));
    }
    if (!children.length) return null;

    return RootBlockSchema.createSnapshot(generateId(), children);
  } catch {
    return null;
  }
}
