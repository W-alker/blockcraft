import {isYoudaoHtml, parseYoudaoHtml} from "./youdao-html";
import { IBlockSnapshot } from "../../../..";
import { collectAndStripRehostMarkers } from "./resource";

const fakeFileService = { createObjectURL: (f: File) => `blob-local:${f.name}` } as never;

/** Narrow the root snapshot's children union to block snapshots for assertions. */
const kids = (res: IBlockSnapshot | null): IBlockSnapshot[] => res!.children as IBlockSnapshot[];

/** Build a 有道云-style HTML string with a data-content article + visible base64 image. */
function youdaoHtml(blocks: unknown[], opts: { withImage?: boolean } = {}): string {
  const dataContent = JSON.stringify(blocks).replace(/"/g, '&quot;');
  const img = opts.withImage
    ? '<div yne-bulb-block="image"><img data-media-type="image" src="data:image/png;base64,aGk="></div>'
    : '';
  return `<article data-content="${dataContent}"><div yne-bulb-block="paragraph">x</div>${img}</article>`;
}

describe('isYoudaoHtml', () => {
  it('detects youdao markers', () => {
    expect(isYoudaoHtml('<div yne-bulb-block="paragraph">x</div>')).toBe(true);
    expect(isYoudaoHtml('<article data-content="[]"></article>')).toBe(true);
    expect(isYoudaoHtml('<p>plain</p>')).toBe(false);
  });
});

describe('parseYoudaoHtml', () => {
  it('returns null when there is no data-content article', () => {
    expect(parseYoudaoHtml('<p>plain</p>', fakeFileService)).toBeNull();
  });

  it('parses data-content into a root snapshot', () => {
    const html = youdaoHtml([
      { type: 'block', name: 'heading', data: { level: 'h1' }, nodes: [{ type: 'text', leaves: [{ text: 'Title' }] }] },
      { type: 'block', name: 'paragraph', nodes: [{ type: 'text', leaves: [{ text: 'p', marks: [{ type: 'bold' }] }] }] },
    ]);
    const res = parseYoudaoHtml(html, fakeFileService);
    expect(res).not.toBeNull();
    expect(res!.flavour).toBe('root');
    expect(kids(res).length).toBe(2);
    expect(kids(res)[0].props['heading']).toBe(1);
    expect(kids(res)[1].children).toEqual([{ insert: 'p', attributes: { 'a:bold': true } }]);
  });

  it('parses the real youdao structure: <head> prefix + article with style attr', () => {
    // 有道云 实际产出的 text/html 形如：<head><meta></head><article data-content="…" style="…">…
    const dataContent = JSON.stringify([
      { type: 'block', name: 'paragraph', nodes: [{ type: 'text', leaves: [{ text: 'hi' }] }] },
    ]).replace(/"/g, '&quot;');
    const html = `<head><meta charset="UTF-8"></head><article data-content="${dataContent}" style="caret-color: rgb(0, 0, 0); color: rgb(0, 0, 0);"><div yne-bulb-block="paragraph">hi</div></article>`;
    const res = parseYoudaoHtml(html, fakeFileService);
    expect(res).not.toBeNull();
    expect(kids(res).length).toBe(1);
    expect(kids(res)[0].children).toEqual([{ insert: 'hi' }]);
  });

  it('a diagram block in the middle does not abort the whole document (WKWebView regression)', () => {
    // The real 有道云 payload that broke WKWebView paste: a PlantUML `diagram` block
    // amid supported blocks. It must degrade to a code block, not nuke the doc.
    const html = youdaoHtml([
      { type: 'block', name: 'heading', data: { level: 'h1' }, nodes: [{ type: 'text', leaves: [{ text: 'T' }] }] },
      { type: 'block', name: 'diagram', data: { language: 'PlantUML' }, nodes: [{ name: 'code-line', nodes: [{ type: 'text', leaves: [{ text: 'a -> b' }] }] }] },
      { type: 'block', name: 'paragraph', nodes: [{ type: 'text', leaves: [{ text: 'after' }] }] },
    ]);
    const res = parseYoudaoHtml(html, fakeFileService);
    expect(res).not.toBeNull();
    expect(kids(res).length).toBe(3);
    expect(kids(res)[1].flavour).toBe('code');
    expect(kids(res)[1].children).toEqual([{ insert: 'a -> b' }]);
    expect(kids(res)[2].children).toEqual([{ insert: 'after' }]);
  });

  it('keeps an attachment as an attachment block (not an image) and defers re-host', () => {
    const html = youdaoHtml([
      { type: 'block', name: 'attachment', data: { fileName: 'Windows_Asset.csv', fileLength: 3913, source: 'https://note.youdao/a', resource: 'https://note.youdao/r' } },
    ]);
    const res = parseYoudaoHtml(html, fakeFileService);
    expect(kids(res)[0].flavour).toBe('attachment');
    expect(kids(res)[0].props['url']).toBe('https://note.youdao/a');
    expect(collectAndStripRehostMarkers(res!).length).toBe(1);
  });

  it('uses the visible base64 image bytes for the image src (upload path)', () => {
    const html = youdaoHtml([
      { type: 'block', name: 'image', data: { url: 'https://note.youdao/img', width: 288, height: 284 } },
    ], { withImage: true });
    const res = parseYoudaoHtml(html, fakeFileService);
    expect(kids(res)[0].flavour).toBe('image');
    expect(kids(res)[0].props['src']).toBe('blob-local:image.png');
  });

  it('returns null on malformed data-content JSON', () => {
    expect(parseYoudaoHtml('<article data-content="{bad"></article>', fakeFileService)).toBeNull();
  });
});
