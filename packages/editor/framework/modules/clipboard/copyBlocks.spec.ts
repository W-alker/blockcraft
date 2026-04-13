import {BlockNodeType, IBlockSnapshot} from "../../block-std";
import {copyBlocks} from "./copyBlocks";
import {ClipboardDataType} from "./types";

type FakeClipboardManager = {
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
        return type !== ClipboardDataType.MARKDOWN && type !== ClipboardDataType.RTF;
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
    expect(clipboardItemData?.[ClipboardDataType.MARKDOWN]).toBeUndefined();
    expect(clipboardItemData?.[ClipboardDataType.RTF]).toBeUndefined();
  });

  it('falls back to execCommand copy when navigator.write rejects', async () => {
    const writeSpy = jasmine.createSpy('write').and.rejectWith(
      new DOMException('Type text/markdown not supported on write.', 'NotAllowedError')
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
    expect(setData).toHaveBeenCalledWith(ClipboardDataType.HTML, '<p>Hello world</p>');
    expect(setData).toHaveBeenCalledWith(ClipboardDataType.MARKDOWN, '# Hello world');
  });
});
