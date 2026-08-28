// Clipboard-owned Youdao Note adapter tests.
import { IBlockSnapshot } from "../../../..";
import { parseYneClipboard, collectAndStripRehostMarkers } from "./index";
import { YNE_JSON_MIME, YNE_IMAGE_JSON_MIME } from "./types";

/** Root snapshot children are always IBlockSnapshot[] — cast once per test instead of per-access. */
function rootChildren(snap: IBlockSnapshot): IBlockSnapshot[] {
  return snap.children as IBlockSnapshot[];
}

function fakeState(map: Record<string, string>) {
  return {
    dataTypes: Object.keys(map),
    getData: (t: string) => map[t] ?? null,
  };
}

const fakeDoc = {
  injector: { get: () => ({ createObjectURL: (f: File) => `blob-local:${f.name}` }) },
  logger: { warn: () => {} },
} as any;

describe('parseYneClipboard', () => {
  it('returns null when yne-json is absent', () => {
    expect(parseYneClipboard(fakeState({}) as any, fakeDoc)).toBeNull();
  });

  it('returns null on malformed JSON', () => {
    expect(parseYneClipboard(fakeState({ [YNE_JSON_MIME]: '{bad' }) as any, fakeDoc)).toBeNull();
  });

  it('returns null on unknown block type (caller falls back to HTML)', () => {
    const json = JSON.stringify([{ blockType: 'mindmap' }]);
    expect(parseYneClipboard(fakeState({ [YNE_JSON_MIME]: json }) as any, fakeDoc)).toBeNull();
  });

  it('wraps converted blocks in a root snapshot', () => {
    const json = JSON.stringify([
      { blockType: 'heading', level: '2', richText: { data: [{ char: 'H' }] } },
      { blockType: 'paragraph', richText: { data: [{ char: 'p' }] } },
    ]);
    const res = parseYneClipboard(fakeState({ [YNE_JSON_MIME]: json }) as any, fakeDoc);
    expect(res).not.toBeNull();
    expect(res!.flavour).toBe('root');
    expect(rootChildren(res!).length).toBe(2);
    expect(collectAndStripRehostMarkers(res!)).toEqual([]);
  });

  it('collects deferred attachments by snapshot reference', () => {
    const json = JSON.stringify([
      { blockType: 'attachment', source: 'https://note.youdao/a.csv', fileName: 'a.csv', fileLength: 3913 },
    ]);
    const res = parseYneClipboard(fakeState({ [YNE_JSON_MIME]: json }) as any, fakeDoc);
    const markers = collectAndStripRehostMarkers(res!);
    expect(markers.length).toBe(1);
    expect(markers[0].snapshot).toBe(rootChildren(res!)[0]);
  });

  it('parses the image map from text/yne-image-json', () => {
    const json = JSON.stringify([{ blockType: 'image', source: 'u1' }]);
    const imageJson = JSON.stringify({ data: { u1: { base64: 'data:image/png;base64,aGk=' } } });
    const res = parseYneClipboard(fakeState({ [YNE_JSON_MIME]: json, [YNE_IMAGE_JSON_MIME]: imageJson }) as any, fakeDoc);
    expect(rootChildren(res!)[0].props['src']).toBe('blob-local:image.png');
  });
});
