import {BlockNodeType, IBlockSnapshot} from "../../block-std";
import {ClipboardDataType} from "./types";
import {
  BLOCKCRAFT_CLIPBOARD_FORMAT,
  BLOCKCRAFT_CLIPBOARD_FORMAT_ATTR,
  BLOCKCRAFT_CLIPBOARD_MARKER_CLASS,
  buildClipboardItems,
  decorateClipboardHtml,
  parseClipboardSnapshot,
  parseClipboardSnapshotFromHtml,
} from "./internal-clipboard";

const createEditableSnapshot = (id: string, text: string): IBlockSnapshot => ({
  id,
  flavour: 'paragraph',
  nodeType: BlockNodeType.editable,
  props: {depth: 0},
  meta: {},
  children: [{insert: text}],
});

const createRootSnapshot = (children: IBlockSnapshot[]): IBlockSnapshot => ({
  id: 'root',
  flavour: 'root',
  nodeType: BlockNodeType.root,
  props: {},
  meta: {},
  children,
});

describe('internal clipboard helpers', () => {
  const snapshot = createRootSnapshot([createEditableSnapshot('p1', 'Hello world')]);

  it('serializes internal snapshot data alongside plain text and html marker payload', async () => {
    const items = await buildClipboardItems([
      {
        type: ClipboardDataType.HTML,
        fromSnapshot: async () => '<html><body><p>Hello world</p></body></html>',
        toSnapshot: async () => snapshot,
      },
    ], snapshot, 'Hello world');

    expect(items[ClipboardDataType.TEXT]).toBe('Hello world');
    expect(items[ClipboardDataType.HTML]).toContain('<p>Hello world</p>');
    expect(items[ClipboardDataType.HTML]).toContain(BLOCKCRAFT_CLIPBOARD_MARKER_CLASS);
    expect(items[ClipboardDataType.HTML]).toContain(`${BLOCKCRAFT_CLIPBOARD_FORMAT_ATTR}="${BLOCKCRAFT_CLIPBOARD_FORMAT}"`);
    expect(parseClipboardSnapshot(items[ClipboardDataType.BLOCKCRAFT_SNAPSHOT])).toEqual(snapshot);
    expect(parseClipboardSnapshotFromHtml(items[ClipboardDataType.HTML])).toEqual(snapshot);
  });

  it('appends the marker before body/html closing tags when exporting full documents', () => {
    const html = decorateClipboardHtml('<html><body><p>Hello world</p></body></html>', snapshot);

    expect(html).toContain('<p>Hello world</p>');
    expect(html).toContain(BLOCKCRAFT_CLIPBOARD_MARKER_CLASS);
    expect(html.indexOf(BLOCKCRAFT_CLIPBOARD_MARKER_CLASS)).toBeGreaterThan(html.indexOf('<p>Hello world</p>'));
    expect(parseClipboardSnapshotFromHtml(html)).toEqual(snapshot);
  });

  it('accepts both the new raw payload and the legacy wrapped payload', () => {
    expect(parseClipboardSnapshot(JSON.stringify(snapshot))).toEqual(snapshot);
    expect(parseClipboardSnapshot(JSON.stringify({snapshot}))).toEqual(snapshot);
  });

  it('returns null for invalid payloads', () => {
    expect(parseClipboardSnapshot('not-json')).toBeNull();
    expect(parseClipboardSnapshot(JSON.stringify({foo: 'bar'}))).toBeNull();
    expect(parseClipboardSnapshotFromHtml('<p>Hello world</p>')).toBeNull();
  });
});
