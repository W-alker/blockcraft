import {BlockNodeType, DeltaInsert, IBlockSnapshot} from "../../block-std";
import {BlockSelection} from "../selection/blockSelection";
import {ClipboardManager} from "./index";
import {parseClipboardSnapshot, parseClipboardSnapshotFromHtml} from './internal-clipboard';
import {ClipboardDataType} from './types';

describe("ClipboardManager selection copy", () => {
  const makeHarness = () => {
    const rootHost = document.createElement("div");
    const root = {
      id: "root",
      flavour: "root",
      nodeType: BlockNodeType.root,
      hostElement: rootHost,
      props: {},
      childrenIds: [] as string[],
      childrenLength: 0,
    };
    const blocks: Record<string, any> = {root};

    const cloneSnapshot = (snapshot: IBlockSnapshot): IBlockSnapshot =>
      JSON.parse(JSON.stringify(snapshot));

    const makeSnapshot = (
      id: string,
      flavour: BlockCraft.BlockFlavour,
      nodeType: BlockNodeType,
      text: string,
    ): IBlockSnapshot => ({
      id,
      flavour,
      nodeType,
      props: {depth: 0},
      meta: {},
      children: nodeType === BlockNodeType.editable ? [{insert: text}] : [],
    } as IBlockSnapshot);

    const addBlock = (
      id: string,
      text: string,
      nodeType: BlockNodeType,
      flavour: BlockCraft.BlockFlavour = nodeType === BlockNodeType.editable ? "paragraph" : "callout",
    ) => {
      const hostElement = document.createElement("div");
      hostElement.setAttribute("data-block-id", id);
      rootHost.appendChild(hostElement);
      const snapshot = makeSnapshot(id, flavour, nodeType, text);
      const block = {
        id,
        flavour,
        nodeType,
        hostElement,
        parentId: "root",
        parentBlock: root,
        props: {depth: 0},
        childrenIds: [],
        childrenLength: 0,
        textLength: text.length,
        getIndexOfParent: () => root.childrenIds.indexOf(id),
        textContent: () => text,
        textDeltas: () => [{insert: text}] as DeltaInsert[],
        toSnapshot: jasmine.createSpy(`toSnapshot:${id}`).and.callFake(() => cloneSnapshot(snapshot)),
      };
      root.childrenIds.push(id);
      root.childrenLength = root.childrenIds.length;
      blocks[id] = block;
      return block;
    };

    const getBlockById = (id: string) => blocks[id];
    const queryBlocksBetween = jasmine.createSpy("queryBlocksBetween").and.callFake((
      from: string | {id: string},
      to: string | {id: string},
      contain = false,
    ) => {
      const fromId = typeof from === "string" ? from : from.id;
      const toId = typeof to === "string" ? to : to.id;
      const fromIndex = root.childrenIds.indexOf(fromId);
      const toIndex = root.childrenIds.indexOf(toId);
      return root.childrenIds.slice(
        Math.min(fromIndex, toIndex) + (contain ? 0 : 1),
        Math.max(fromIndex, toIndex) + (contain ? 1 : 0),
      );
    });
    const doc = {
      event: {add() {}, bindHotkey() {}},
      config: {},
      injector: {get: () => ({supportedAdapters: [], getAdapter: () => undefined})},
      logger: {warn: jasmine.createSpy("warn")},
      schemas: {
        createSnapshot: (flavour: BlockCraft.BlockFlavour, params: any[]): IBlockSnapshot =>
          flavour === "paragraph"
            ? ({
                id: "generated-paragraph",
                flavour,
                nodeType: BlockNodeType.editable,
                props: {depth: 0},
                meta: {},
                children: params[0],
              } as IBlockSnapshot)
            : ({
                id: params[0],
                flavour,
                nodeType: BlockNodeType.root,
                props: {},
                meta: {},
                children: params[1],
              } as IBlockSnapshot),
      },
      getBlockById,
      isEditable: (block: {nodeType: BlockNodeType}) => block.nodeType === BlockNodeType.editable,
      queryBlocksBetween,
    };
    const manager = new ClipboardManager(doc as any);
    const makeSelection = (anchor: any, head: any) => new BlockSelection(
      anchor,
      head,
      "root",
      getBlockById,
      (a, b) => blocks[a].hostElement.compareDocumentPosition(blocks[b].hostElement),
    );

    document.body.appendChild(rootHost);
    return {root, blocks, addBlock, manager, doc, queryBlocksBetween, makeSelection, rootHost};
  };

  it("copies a reversed mixed boundary-to-text selection in document order", () => {
    const {root, addBlock, manager, makeSelection, rootHost} = makeHarness();
    const callout = addBlock("callout-1", "callout", BlockNodeType.block);
    const middle = addBlock("middle", "middle", BlockNodeType.block);
    const paragraph = addBlock("p1", "after", BlockNodeType.editable);
    const selection = makeSelection(
      {blockId: "p1", type: "text", offset: 3, block: paragraph},
      {blockId: "root", type: "boundary", index: 0, block: root},
    );

    const payload = (manager as any)._buildCopyPayload(selection);

    expect(selection.direction).toBe("backward");
    expect(selection.firstBlock).toBe(callout as any);
    expect(selection.lastBlock).toBe(paragraph as any);
    expect(payload.plainText).toBe("callout\nmiddle\naft");
    expect(payload.snapshot.children.map((snapshot: IBlockSnapshot) => snapshot.id)).toEqual([
      "callout-1",
      "middle",
      "p1",
    ]);
    expect(payload.snapshot.children[2].children).toEqual([{insert: "aft"}]);
    rootHost.remove();
  });

  it("keeps plain text order for whole-block selected endpoints", () => {
    const {addBlock, manager, makeSelection, queryBlocksBetween, rootHost} = makeHarness();
    const first = addBlock("first", "one", BlockNodeType.block);
    const middle = addBlock("middle", "two", BlockNodeType.block);
    const last = addBlock("last", "three", BlockNodeType.block);
    const selection = makeSelection(
      {blockId: "first", type: "selected", block: first},
      {blockId: "last", type: "selected", block: last},
    );

    const payload = (manager as any)._buildCopyPayload(selection);

    expect(payload.plainText).toBe("one\ntwo\nthree");
    expect(payload.snapshot.children.map((snapshot: IBlockSnapshot) => snapshot.id)).toEqual([
      "first",
      "middle",
      "last",
    ]);
    expect(queryBlocksBetween).toHaveBeenCalledOnceWith(first, last);
    expect(middle.toSnapshot).toHaveBeenCalled();
    rootHost.remove();
  });

  it("writes a selected absolute object synchronously before adapter work", async () => {
    const {addBlock, manager, doc, makeSelection, rootHost} = makeHarness();
    const shape = addBlock("shape-1", "", BlockNodeType.block, "shape");
    shape.toSnapshot.and.returnValue({
      id: shape.id,
      flavour: 'shape',
      nodeType: BlockNodeType.block,
      props: {position: "20 30"},
      meta: {lock: 'owner-1', lockKind: 'template'},
      children: [],
    });
    const selection = makeSelection(
      {blockId: shape.id, type: 'selected', block: shape},
      {blockId: shape.id, type: 'selected', block: shape},
    );
    const values = new Map<string, string>();
    const clipboardData = {
      setData: (type: string, value: string) => values.set(type, value),
    } as unknown as DataTransfer;
    (doc as any).placement = {
      isAbsoluteObjectSelection: () => true,
    };
    spyOn<any>(manager, '_writeRichClipboardAsync').and.resolveTo();

    const copy = manager.copyFromSelection(selection, clipboardData);

    const snapshot = parseClipboardSnapshot(
      values.get(ClipboardDataType.BLOCKCRAFT_SNAPSHOT),
    );
    const copiedShape = snapshot?.children[0] as IBlockSnapshot;
    expect(copiedShape.id).toBe(shape.id);
    expect(copiedShape.props['position']).toEqual("20 30");
    expect(copiedShape.meta['lock']).toBeUndefined();
    expect(copiedShape.meta['lockKind']).toBeUndefined();
    expect(values.get(ClipboardDataType.HTML)).toContain(
      'data-bc-clipboard-format="blockcraft/snapshot"',
    );
    await copy;
    rootHost.remove();
  });

  it("keeps adapter formats and the native range when readonly async clipboard write is rejected", async () => {
    const {addBlock, manager, doc, makeSelection, rootHost} = makeHarness();
    const paragraph = addBlock("p1", "readonly rich text", BlockNodeType.editable);
    paragraph.hostElement.textContent = "readonly rich text";
    const nativeSelection = document.getSelection()!;
    nativeSelection.setBaseAndExtent(paragraph.hostElement.firstChild!, 18, paragraph.hostElement.firstChild!, 0);
    const selection = makeSelection(
      {blockId: "p1", type: "text", offset: 0, block: paragraph},
      {blockId: "p1", type: "text", offset: 18, block: paragraph},
    );
    (doc as any).isReadonly = true;
    const html = jasmine.createSpy("html").and.resolveTo("<p><strong>readonly rich text</strong></p>");
    const markdown = jasmine.createSpy("markdown").and.resolveTo("**readonly rich text**");
    manager.adapter.supportedAdapters = [
      {type: ClipboardDataType.HTML, fromSnapshot: html, toSnapshot: async () => undefined as any},
      {type: ClipboardDataType.MARKDOWN, fromSnapshot: markdown, toSnapshot: async () => undefined as any},
    ];
    const write = spyOn(navigator.clipboard, "write").and.rejectWith(new DOMException("gesture required", "NotAllowedError"));
    const copied = new DataTransfer();
    spyOn(document, "execCommand").and.callFake(() => {
      expect(document.getSelection()!.toString()).toBe("readonly rich text");
      const event = new ClipboardEvent("copy", {bubbles: true, cancelable: true});
      Object.defineProperty(event, "clipboardData", {value: copied});
      document.body.dispatchEvent(event);
      return true;
    });
    const nativeData = new DataTransfer();

    try {
      const copy = manager.copyFromSelection(selection, nativeData);
      // Sync fallback commits before the asynchronous API starts its write.
      expect(write).not.toHaveBeenCalled();
      expect(nativeData.getData(ClipboardDataType.TEXT)).toBe("readonly rich text");
      await copy;
      expect(write).toHaveBeenCalledTimes(1);
      expect(html).toHaveBeenCalledTimes(1);
      expect(markdown).toHaveBeenCalledTimes(1);
      expect(copied.getData(ClipboardDataType.HTML)).toContain("<strong>readonly rich text</strong>");
      expect(copied.getData(ClipboardDataType.MARKDOWN)).toBe("**readonly rich text**");
      expect(copied.getData(ClipboardDataType.BLOCKCRAFT_SNAPSHOT)).toBeTruthy();
      expect(document.getSelection()!.toString()).toBe("readonly rich text");
      expect(nativeSelection.anchorOffset).toBe(18);
      expect(nativeSelection.focusOffset).toBe(0);
      expect(doc.logger.warn).not.toHaveBeenCalled();
    } finally {
      document.getSelection()!.removeAllRanges();
      rootHost.remove();
    }
  });

  it("does not start a superseded async write while the native copy fallback is committing", async () => {
    const {addBlock, manager, doc, makeSelection, rootHost} = makeHarness();
    const paragraph = addBlock("p1", "text", BlockNodeType.editable);
    (doc as any).isReadonly = true;
    const write = spyOn(navigator.clipboard, "write").and.resolveTo();
    const selection = makeSelection(
      {blockId: "p1", type: "text", offset: 0, block: paragraph},
      {blockId: "p1", type: "text", offset: 4, block: paragraph},
    );
    try {
      const first = manager.copyFromSelection(selection, new DataTransfer());
      const second = manager.copyFromSelection(selection, new DataTransfer());
      expect(write).not.toHaveBeenCalled();
      await Promise.all([first, second]);
      expect(write).toHaveBeenCalledTimes(1);
    } finally {
      rootHost.remove();
    }
  });

  for (const missingApi of ['clipboard', 'write', 'ClipboardItem']) {
    it(`writes readonly adapter formats through native copy when ${missingApi} is unavailable`, async () => {
      const {addBlock, manager, doc, makeSelection, rootHost} = makeHarness();
      const paragraph = addBlock('p1', 'rich text', BlockNodeType.editable);
      paragraph.textDeltas = () => [{insert: 'rich text', attributes: {'a:bold': true}}];
      (doc as any).isReadonly = true;
      const html = jasmine.createSpy('html').and.resolveTo('<p><strong>rich text</strong></p>');
      const markdown = jasmine.createSpy('markdown').and.resolveTo('**rich text**');
      manager.adapter.supportedAdapters = [
        {type: ClipboardDataType.HTML, fromSnapshot: html, toSnapshot: async () => undefined as any},
        {type: ClipboardDataType.MARKDOWN, fromSnapshot: markdown, toSnapshot: async () => undefined as any},
      ];
      const selection = makeSelection(
        {blockId: paragraph.id, type: 'text', offset: 0, block: paragraph},
        {blockId: paragraph.id, type: 'text', offset: 9, block: paragraph},
      );
      const target = missingApi === 'ClipboardItem' ? globalThis : missingApi === 'clipboard' ? navigator : navigator.clipboard;
      const property = missingApi;
      const descriptor = Object.getOwnPropertyDescriptor(target, property);
      Object.defineProperty(target, property, {value: undefined, configurable: true});
      const copied = new DataTransfer();
      const command = spyOn(document, 'execCommand').and.callFake(() => {
        const event = new ClipboardEvent('copy', {bubbles: true, cancelable: true});
        Object.defineProperty(event, 'clipboardData', {value: copied});
        document.body.dispatchEvent(event);
        return true;
      });
      const nativeData = new DataTransfer();

      try {
        const copying = manager.copyFromSelection(selection, nativeData);
        // This HTML fallback is available before any asynchronous adapter
        // result, including on platforms that strip custom event MIME types.
        const fallback = parseClipboardSnapshotFromHtml(nativeData.getData(ClipboardDataType.HTML));
        expect((fallback?.children[0] as IBlockSnapshot).children)
          .toEqual([{insert: 'rich text', attributes: {'a:bold': true}}]);
        expect(command).not.toHaveBeenCalled();
        await copying;
        expect(command).toHaveBeenCalledTimes(1);
        expect(html).toHaveBeenCalledTimes(1);
        expect(markdown).toHaveBeenCalledTimes(1);
        expect(copied.getData(ClipboardDataType.HTML)).toContain('<strong>rich text</strong>');
        expect(copied.getData(ClipboardDataType.MARKDOWN)).toBe('**rich text**');
        expect(doc.logger.warn).not.toHaveBeenCalled();
      } finally {
        if (descriptor) Object.defineProperty(target, property, descriptor);
        else Reflect.deleteProperty(target, property);
        rootHost.remove();
      }
    });
  }

  it('keeps the synchronous readonly HTML fallback readable and escapes literal markup', async () => {
    const {addBlock, manager, doc, makeSelection, rootHost} = makeHarness();
    const text = '<strong>literal</strong>&\nsecond';
    const paragraph = addBlock('p1', text, BlockNodeType.editable);
    (doc as any).isReadonly = true;
    spyOn<any>(manager, '_writeRichClipboardAsync').and.resolveTo();
    const selection = makeSelection(
      {blockId: paragraph.id, type: 'text', offset: 0, block: paragraph},
      {blockId: paragraph.id, type: 'text', offset: text.length, block: paragraph},
    );
    const data = new DataTransfer();
    try {
      const copying = manager.copyFromSelection(selection, data);
      const parsed = new DOMParser().parseFromString(data.getData(ClipboardDataType.HTML), 'text/html');
      expect(parsed.querySelector('p')!.textContent).toBe('<strong>literal</strong>&second');
      expect(parsed.querySelector('strong')).toBeNull();
      expect(parsed.querySelectorAll('br').length).toBe(1);
      expect(parseClipboardSnapshotFromHtml(data.getData(ClipboardDataType.HTML))).toBeTruthy();
      await copying;
    } finally {
      rootHost.remove();
    }
  });

  it("does not let an older readonly adapter result overwrite a newer copy fallback", async () => {
    const {addBlock, manager, doc, makeSelection, rootHost} = makeHarness();
    const older = addBlock("older", "older", BlockNodeType.editable);
    const newer = addBlock("newer", "newer", BlockNodeType.editable);
    (doc as any).isReadonly = true;
    const pending: Array<(html: string) => void> = [];
    manager.adapter.supportedAdapters = [{
      type: ClipboardDataType.HTML,
      fromSnapshot: () => new Promise<string>(resolve => pending.push(resolve)),
      toSnapshot: async () => undefined as any,
    }];
    spyOn(navigator.clipboard, "write").and.rejectWith(new DOMException("gesture required", "NotAllowedError"));
    const copied = new DataTransfer();
    const command = spyOn(document, "execCommand").and.callFake(() => {
      const event = new ClipboardEvent("copy", {bubbles: true, cancelable: true});
      Object.defineProperty(event, "clipboardData", {value: copied});
      document.body.dispatchEvent(event);
      return true;
    });
    const select = (block: typeof older) => makeSelection(
      {blockId: block.id, type: "text", offset: 0, block},
      {blockId: block.id, type: "text", offset: 5, block},
    );

    try {
      const first = manager.copyFromSelection(select(older), new DataTransfer());
      const second = manager.copyFromSelection(select(newer), new DataTransfer());
      pending[1]("<p>newer</p>");
      await second;
      pending[0]("<p>older</p>");
      await first;
      expect(command).toHaveBeenCalledTimes(1);
      expect(copied.getData(ClipboardDataType.TEXT)).toBe("newer");
      expect(copied.getData(ClipboardDataType.HTML)).toContain("<p>newer</p>");
      expect(doc.logger.warn).not.toHaveBeenCalled();
    } finally {
      rootHost.remove();
    }
  });

  it("copies a one-character inline image selection as its embed delta", () => {
    const {addBlock, manager, makeSelection, rootHost} = makeHarness();
    const paragraph = addBlock("p1", "", BlockNodeType.editable);
    const deltas: DeltaInsert[] = [
      {insert: "前"},
      {
        insert: {image: "https://cdn.example.com/a.png"},
        attributes: {width: 120, height: 60},
      },
      {insert: "后"},
    ];
    paragraph.textLength = 3;
    paragraph.textDeltas = () => deltas;
    paragraph.toSnapshot.and.returnValue({
      id: "p1",
      flavour: "paragraph",
      nodeType: BlockNodeType.editable,
      props: {depth: 0},
      meta: {},
      children: deltas,
    });
    const selection = makeSelection(
      {blockId: "p1", type: "text", offset: 1, block: paragraph},
      {blockId: "p1", type: "text", offset: 2, block: paragraph},
    );

    const payload = (manager as any)._buildCopyPayload(selection);

    expect(payload.plainText).toBe("");
    expect(payload.snapshot.children[0].children).toEqual([deltas[1]]);
    rootHost.remove();
  });

  it("copies an unmounted middle block from the model graph", () => {
    const {addBlock, blocks, manager, doc, makeSelection, rootHost} = makeHarness();
    const first = addBlock("first", "one", BlockNodeType.editable);
    const middle = addBlock("middle", "middle", BlockNodeType.editable);
    const last = addBlock("last", "three", BlockNodeType.editable);
    const texts: Record<string, string> = {first: "one", middle: "middle", last: "three"};
    (doc as any).model = {
      exists: (id: string) => id in texts,
      getNodeType: () => BlockNodeType.editable,
      getChildrenIds: () => [],
      getTextDeltas: (id: string) => [{insert: texts[id]}],
      toSnapshot: (id: string) => ({
        id,
        flavour: "paragraph",
        nodeType: BlockNodeType.editable,
        props: {depth: 0},
        meta: {},
        children: [{insert: texts[id]}],
      }),
    };
    (doc as any).getBlockById = jasmine.createSpy("getBlockById").and.throwError("component is unmounted");
    const selection = makeSelection(
      {blockId: "first", type: "text", offset: 1, block: first},
      {blockId: "last", type: "text", offset: 2, block: last},
    );

    const payload = (manager as any)._buildCopyPayload(selection);

    expect(payload.plainText).toBe("ne\nmiddle\nth");
    expect(payload.snapshot.children.map((snapshot: IBlockSnapshot) => snapshot.id)).toEqual([
      "first",
      "middle",
      "last",
    ]);
    expect(middle.toSnapshot).not.toHaveBeenCalled();
    expect((doc as any).getBlockById).not.toHaveBeenCalled();
    void blocks;
    rootHost.remove();
  });

  it("uses the synchronous copy fallback for a block-readonly selection", async () => {
    const {addBlock, manager, doc, makeSelection, rootHost} = makeHarness();
    const paragraph = addBlock("locked", "locked text", BlockNodeType.editable);
    const selection = makeSelection(
      {blockId: "locked", type: "text", offset: 0, block: paragraph},
      {blockId: "locked", type: "text", offset: 11, block: paragraph},
    );
    (doc as any).readonlyManager = {
      isReadonly: (blockId: string) => blockId === "locked",
    };
    const clipboardData = {
      setData: jasmine.createSpy("setData"),
    } as unknown as DataTransfer;
    spyOn<any>(manager, "_writeRichClipboardAsync").and.resolveTo();

    await manager.copyFromSelection(selection, clipboardData);

    expect(clipboardData.setData).toHaveBeenCalledWith(
      "text/plain",
      "locked text",
    );
    rootHost.remove();
  });
});
