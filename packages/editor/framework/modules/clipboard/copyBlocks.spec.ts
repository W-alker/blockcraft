import {BlockNodeType, IBlockSnapshot} from "../../block-std";
import {copyBlocks} from "./copyBlocks";
import {ClipboardDataType} from "./types";
import {
  BLOCKCRAFT_CLIPBOARD_MARKER_CLASS,
  BLOCKCRAFT_WEB_SNAPSHOT_MIME,
} from "./internal-clipboard";

type FakeClipboardManager = {
  doc?: {
    root?: {
      hostElement: HTMLElement
    }
  }
  adapter: {
    supportedAdapters: Array<{
      type: ClipboardDataType
      fromSnapshot: (snapshot: IBlockSnapshot) => Promise<string>
    }>
  }
};

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

describe('copyBlocks', () => {
  const snapshot = createRootSnapshot([createEditableSnapshot('p1', 'Hello world')]);

  let originalClipboardItem: unknown;
  let originalClipboard: Clipboard | undefined;
  let originalExecCommand: typeof document.execCommand | undefined;

  beforeEach(() => {
    originalClipboardItem = (globalThis as any).ClipboardItem;
    originalClipboard = navigator.clipboard;
    originalExecCommand = document.execCommand;
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'ClipboardItem', {
      configurable: true,
      value: originalClipboardItem,
    });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: originalClipboard,
    });
    document.execCommand = originalExecCommand!;
  });

  it('skips unsupported clipboard types for navigator.write', async () => {
    const writeSpy = jasmine.createSpy('write').and.resolveTo();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {write: writeSpy},
    });

    let clipboardItemData: Record<string, Blob> | undefined;
    class MockClipboardItem {
      static supports(type: string) {
        return type !== ClipboardDataType.MARKDOWN
          && type !== ClipboardDataType.RTF
          && type !== BLOCKCRAFT_WEB_SNAPSHOT_MIME;
      }

      constructor(data: Record<string, Blob>) {
        clipboardItemData = data;
      }
    }

    Object.defineProperty(globalThis, 'ClipboardItem', {
      configurable: true,
      value: MockClipboardItem,
    });

    const htmlFromSnapshot = jasmine.createSpy('htmlFromSnapshot').and.resolveTo('<p>Hello world</p>');
    const markdownFromSnapshot = jasmine.createSpy('markdownFromSnapshot').and.resolveTo('# Hello world');
    const rtfFromSnapshot = jasmine.createSpy('rtfFromSnapshot').and.resolveTo('# Hello world');
    const manager: FakeClipboardManager = {
      adapter: {
        supportedAdapters: [
          {type: ClipboardDataType.HTML, fromSnapshot: htmlFromSnapshot},
          {type: ClipboardDataType.MARKDOWN, fromSnapshot: markdownFromSnapshot},
          {type: ClipboardDataType.RTF, fromSnapshot: rtfFromSnapshot},
        ],
      },
    };

    await copyBlocks.call(manager as any, snapshot);

    expect(writeSpy).toHaveBeenCalled();
    expect(htmlFromSnapshot).toHaveBeenCalled();
    expect(markdownFromSnapshot).not.toHaveBeenCalled();
    expect(rtfFromSnapshot).not.toHaveBeenCalled();
    expect(clipboardItemData).toBeDefined();
    expect(clipboardItemData?.[ClipboardDataType.TEXT]).toBeDefined();
    expect(clipboardItemData?.[ClipboardDataType.HTML]).toBeDefined();
    expect(await clipboardItemData?.[ClipboardDataType.HTML]?.text()).toContain(BLOCKCRAFT_CLIPBOARD_MARKER_CLASS);
    expect(clipboardItemData?.[ClipboardDataType.MARKDOWN]).toBeUndefined();
    expect(clipboardItemData?.[ClipboardDataType.RTF]).toBeUndefined();
    expect(clipboardItemData?.[BLOCKCRAFT_WEB_SNAPSHOT_MIME]).toBeUndefined();
  });

  it('writes the internal snapshot as a web custom format when navigator supports it', async () => {
    const writeSpy = jasmine.createSpy('write').and.resolveTo();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {write: writeSpy},
    });

    let clipboardItemData: Record<string, Blob> | undefined;
    class MockClipboardItem {
      static supports(type: string) {
        return type === BLOCKCRAFT_WEB_SNAPSHOT_MIME
          || type === ClipboardDataType.TEXT
          || type === ClipboardDataType.HTML;
      }

      constructor(data: Record<string, Blob>) {
        clipboardItemData = data;
      }
    }

    Object.defineProperty(globalThis, 'ClipboardItem', {
      configurable: true,
      value: MockClipboardItem,
    });

    const manager: FakeClipboardManager = {
      adapter: {
        supportedAdapters: [
          {type: ClipboardDataType.HTML, fromSnapshot: async () => '<p>Hello world</p>'},
        ],
      },
    };

    await copyBlocks.call(manager as any, snapshot);

    expect(writeSpy).toHaveBeenCalled();
    expect(clipboardItemData?.[BLOCKCRAFT_WEB_SNAPSHOT_MIME]).toBeDefined();
  });

  it('falls back to execCommand copy when navigator.write rejects', async () => {
    const writeSpy = jasmine.createSpy('write').and.rejectWith(
      new DOMException('Type not supported on write.', 'NotAllowedError')
    );
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {write: writeSpy},
    });

    class MockClipboardItem {
      static supports() {
        return true;
      }

      constructor(_: Record<string, Blob>) {}
    }

    Object.defineProperty(globalThis, 'ClipboardItem', {
      configurable: true,
      value: MockClipboardItem,
    });

    let copyListener: ((event: ClipboardEvent) => void) | undefined;
    spyOn(document.body, 'addEventListener').and.callFake(((type: string, listener: EventListenerOrEventListenerObject) => {
      if (type === 'copy') {
        copyListener = listener as (event: ClipboardEvent) => void;
      }
    }) as typeof document.body.addEventListener);

    const setData = jasmine.createSpy('setData');
    document.execCommand = jasmine.createSpy('execCommand').and.callFake(() => {
      copyListener?.({
        preventDefault() {},
        stopPropagation() {},
        clipboardData: {
          setData,
        },
      } as unknown as ClipboardEvent);
      return true;
    });

    const manager: FakeClipboardManager = {
      adapter: {
        supportedAdapters: [
          {
            type: ClipboardDataType.HTML,
            fromSnapshot: async () => '<p>Hello world</p>',
          },
          {
            type: ClipboardDataType.MARKDOWN,
            fromSnapshot: async () => '# Hello world',
          },
        ],
      },
    };

    await copyBlocks.call(manager as any, snapshot);

    expect(writeSpy).toHaveBeenCalled();
    expect(document.execCommand).toHaveBeenCalledWith('copy');
    expect(setData).toHaveBeenCalledWith(ClipboardDataType.TEXT, 'Hello world\n');
    expect(setData).toHaveBeenCalledWith(
      ClipboardDataType.HTML,
      jasmine.stringMatching(new RegExp(`^<p>Hello world</p><span[^>]*${BLOCKCRAFT_CLIPBOARD_MARKER_CLASS}`))
    );
    expect(setData).toHaveBeenCalledWith(ClipboardDataType.MARKDOWN, '# Hello world');
    expect(setData).toHaveBeenCalledWith(
      ClipboardDataType.BLOCKCRAFT_SNAPSHOT,
      jasmine.stringMatching(/"flavour":"root"/)
    );
  });

  it('runs execCommand fallback in the editor ownerDocument', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: undefined,
    });
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    const ownerDocument = iframe.contentDocument!;
    const rootHost = ownerDocument.createElement('div');
    ownerDocument.body.appendChild(rootHost);
    let copyListener: ((event: ClipboardEvent) => void) | undefined;
    spyOn(ownerDocument.body, 'addEventListener').and.callFake(((type: string, listener: EventListenerOrEventListenerObject) => {
      if (type === 'copy') copyListener = listener as (event: ClipboardEvent) => void;
    }) as typeof ownerDocument.body.addEventListener);
    const setData = jasmine.createSpy('setData');
    ownerDocument.execCommand = jasmine.createSpy('execCommand').and.callFake(() => {
      copyListener?.({
        preventDefault() {},
        stopPropagation() {},
        clipboardData: {setData},
      } as unknown as ClipboardEvent);
      return true;
    });
    const manager: FakeClipboardManager = {
      doc: {root: {hostElement: rootHost}},
      adapter: {
        supportedAdapters: [
          {type: ClipboardDataType.HTML, fromSnapshot: async () => '<p>Hello world</p>'},
        ],
      },
    };

    try {
      await copyBlocks.call(manager as any, snapshot);

      expect(ownerDocument.execCommand).toHaveBeenCalledWith('copy');
      expect(setData).toHaveBeenCalledWith(ClipboardDataType.TEXT, 'Hello world\n');
    } finally {
      iframe.remove();
    }
  });
});
