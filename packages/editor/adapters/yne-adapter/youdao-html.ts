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

/**
 * Diagnostic log, gated behind `window.__BC_PASTE_LOG__` (same flag as the paste
 * inspector). Lets us see — in a real WKWebview — exactly which stage of the
 * 有道云 parse failed, without adding console noise to production.
 */
export function ynedbg(...args: unknown[]): void {
  if (typeof window === 'undefined') return;
  if (!(window as unknown as Record<string, unknown>)['__BC_PASTE_LOG__']) return;
  // eslint-disable-next-line no-console
  console.warn('[YNE]', ...args);
}

/** Cheap marker check before paying for DOMParser. */
export function isYoudaoHtml(html: string): boolean {
  return html.includes('yne-bulb-block') || /<article[^>]*\bdata-content=/.test(html);
}

export function parseYoudaoHtml(html: string, fileService: DocFileService): IBlockSnapshot | null {
  if (typeof DOMParser === 'undefined') { ynedbg('no DOMParser in this environment'); return null; }
  try {
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    const article = parsed.querySelector('article[data-content]');
    const raw = article?.getAttribute('data-content'); // DOM already entity-decodes &quot; etc.
    if (!raw) { ynedbg('no <article data-content> found; article=', !!article); return null; }

    const blocks = JSON.parse(raw) as BulbNode[];
    if (!Array.isArray(blocks) || !blocks.length) { ynedbg('data-content parsed but empty/non-array'); return null; }

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
    if (!children.length) { ynedbg('converted 0 children from', blocks.length, 'blocks'); return null; }

    ynedbg('ok →', children.length, 'blocks from', blocks.length, 'bulb blocks');
    return RootBlockSchema.createSnapshot(generateId(), children);
  } catch (e) {
    ynedbg('parse threw:', e);
    return null;
  }
}
