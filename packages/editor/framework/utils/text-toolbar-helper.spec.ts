import {BlockNodeType} from "../block-std";
import {BlockSelection} from "../modules/selection/blockSelection";
import {TextToolbarHelper} from "./text-toolbar-helper";
import {fakeAsync, flushMicrotasks, tick} from "@angular/core/testing";

describe("TextToolbarHelper boundary selections", () => {
  const makeHarness = () => {
    const rootHost = document.createElement("div");
    const p1Host = document.createElement("p");
    const p2Host = document.createElement("p");
    const outsideHost = document.createElement("p");
    rootHost.append(p1Host, p2Host, outsideHost);
    document.body.appendChild(rootHost);

    const root = {
      id: "root",
      flavour: "root",
      nodeType: BlockNodeType.root,
      hostElement: rootHost,
      childrenIds: ["p1", "p2", "outside"],
      childrenLength: 3,
      props: {},
    };
    const makeBlock = (id: string, hostElement: HTMLElement, text: string, index: number) => ({
      id,
      flavour: "paragraph",
      nodeType: BlockNodeType.editable,
      hostElement,
      parentId: "root",
      parentBlock: root,
      props: {depth: 0},
      plainTextOnly: false,
      textLength: text.length,
      getIndexOfParent: () => index,
      textContent: () => text,
      textDeltas: () => [{insert: text}],
      formatText: jasmine.createSpy(`formatText:${id}`),
      updateProps: jasmine.createSpy(`updateProps:${id}`),
    });
    const p1 = makeBlock("p1", p1Host, "one", 0);
    const p2 = makeBlock("p2", p2Host, "two", 1);
    const outside = makeBlock("outside", outsideHost, "out", 2);
    const blocks: Record<string, any> = {root, p1, p2, outside};
    const queryBlocksBetween = jasmine.createSpy("queryBlocksBetween").and.callFake((
      from: {id: string},
      to: {id: string},
      contain = false,
    ) => {
      const fromIndex = root.childrenIds.indexOf(from.id);
      const toIndex = root.childrenIds.indexOf(to.id);
      return root.childrenIds.slice(
        Math.min(fromIndex, toIndex) + (contain ? 0 : 1),
        Math.max(fromIndex, toIndex) + (contain ? 1 : 0),
      );
    });
    const getBlockById = (id: string) => blocks[id];
    const doc = {
      getBlockById,
      isEditable: (block: {nodeType: BlockNodeType}) => block.nodeType === BlockNodeType.editable,
      queryBlocksBetween,
      crud: {
        transact: (fn: () => void) => fn(),
        replaceWithSnapshots: jasmine.createSpy("replaceWithSnapshots"),
      },
      selection: {
        setSelection: jasmine.createSpy("setSelection"),
        setSuppressRecalculate: jasmine.createSpy("setSuppressRecalculate"),
        replay: jasmine.createSpy("replay"),
        recalculate: jasmine.createSpy("recalculate"),
      },
      chain: jasmine.createSpy("chain"),
      schemas: {
        createSnapshot: jasmine.createSpy("createSnapshot"),
      },
    };
    const helper = new TextToolbarHelper(doc as any);
    const selection = (anchor: any, head: any) => new BlockSelection(
      anchor,
      head,
      "root",
      getBlockById,
      (a, b) => blocks[a].hostElement.compareDocumentPosition(blocks[b].hostElement),
    );

    return {helper, doc, root, p1, p2, outside, rootHost, selection, queryBlocksBetween};
  };

  it("updates only the child blocks covered by a boundary range", () => {
    const {helper, root, p1, p2, outside, rootHost, selection, queryBlocksBetween} = makeHarness();
    const boundarySelection = selection(
      {blockId: "root", type: "boundary", index: 0, block: root},
      {blockId: "root", type: "boundary", index: 2, block: root},
    );

    helper.updateBlockProps({textAlign: "center"}, boundarySelection as any);

    expect(queryBlocksBetween).not.toHaveBeenCalled();
    expect(p1.updateProps).toHaveBeenCalledOnceWith({textAlign: "center"});
    expect(p2.updateProps).toHaveBeenCalledOnceWith({textAlign: "center"});
    expect(outside.updateProps).not.toHaveBeenCalled();
    rootHost.remove();
  });

  it("updates from the boundary content block through the text endpoint block", () => {
    const {helper, root, p1, p2, outside, rootHost, selection, queryBlocksBetween} = makeHarness();
    const mixedSelection = selection(
      {blockId: "root", type: "boundary", index: 0, block: root},
      {blockId: "p2", type: "text", offset: 2, block: p2},
    );

    helper.updateBlockProps({heading: 2}, mixedSelection as any);

    expect(queryBlocksBetween).toHaveBeenCalledWith(p1, p2, false);
    expect(queryBlocksBetween).toHaveBeenCalledWith(p1, p2, true);
    expect(p1.updateProps).toHaveBeenCalledOnceWith({heading: 2});
    expect(p2.updateProps).toHaveBeenCalledOnceWith({heading: 2});
    expect(outside.updateProps).not.toHaveBeenCalled();
    rootHost.remove();
  });

  it("does not update neighbouring blocks for a collapsed boundary cursor", () => {
    const {helper, root, p1, p2, outside, rootHost, selection, queryBlocksBetween} = makeHarness();
    const boundaryCursor = selection(
      {blockId: "root", type: "boundary", index: 1, block: root},
      {blockId: "root", type: "boundary", index: 1, block: root},
    );

    helper.updateBlockProps({textAlign: "right"}, boundaryCursor as any);

    expect(queryBlocksBetween).not.toHaveBeenCalled();
    expect(p1.updateProps).not.toHaveBeenCalled();
    expect(p2.updateProps).not.toHaveBeenCalled();
    expect(outside.updateProps).not.toHaveBeenCalled();
    rootHost.remove();
  });

  it("returns empty common attrs for a stale selection", () => {
    const {helper, doc, root, p1, rootHost, selection} = makeHarness();
    const textSelection = selection(
      {blockId: "p1", type: "text", offset: 0, block: p1},
      {blockId: "p1", type: "text", offset: 2, block: p1},
    );
    (doc.getBlockById as any) = jasmine.createSpy("getBlockById").and.throwError("missing");

    const attrs = helper.getCurrentCommonAttrs(textSelection as any);

    expect(attrs.attrs.size).toBe(0);
    expect(attrs.colors).toEqual({});
    expect(attrs.props).toEqual({});
    expect(attrs.allEditable).toBeFalse();
    void root;
    rootHost.remove();
  });

  it("does not format text for a stale selection", () => {
    const {helper, doc, p1, rootHost, selection} = makeHarness();
    const textSelection = selection(
      {blockId: "p1", type: "text", offset: 0, block: p1},
      {blockId: "p1", type: "text", offset: 2, block: p1},
    );
    (doc.getBlockById as any) = jasmine.createSpy("getBlockById").and.throwError("missing");

    helper.formatText({"a:bold": true}, textSelection as any);

    expect(p1.formatText).not.toHaveBeenCalled();
    expect(doc.selection.setSelection).not.toHaveBeenCalled();
    rootHost.remove();
  });

  it("formats an unmounted middle block through model-first CRUD", () => {
    const {helper, doc, root, p1, p2, outside, rootHost, selection} = makeHarness();
    const ids = ["p1", "p2", "outside"];
    const text: Record<string, string> = {p1: "one", p2: "two", outside: "out"};
    (doc as any).model = {
      exists: (id: string) => id === "root" || ids.includes(id),
      getNodeType: (id: string) => id === "root" ? BlockNodeType.root : BlockNodeType.editable,
      getFlavour: (id: string) => id === "root" ? "root" : "paragraph",
      getProps: (id: string) => id === "root" ? {} : {depth: 0},
      getTextDeltas: (id: string) => id in text ? [{insert: text[id]}] : undefined,
      getTextLength: (id: string) => text[id]?.length ?? 0,
      getChildrenIds: (id: string) => id === "root" ? ids : [],
      getParentId: (id: string) => ids.includes(id) ? "root" : null,
      getPath: (id: string) => id === "root" ? ["root"] : ["root", id],
      indexInParent: (id: string) => ids.indexOf(id),
    };
    (doc as any).isPlainTextBlock = () => false;
    (doc.crud as any).formatText = jasmine.createSpy("formatText");
    const mountedLookup = doc.getBlockById;
    (doc as any).getBlockById = jasmine.createSpy("getBlockById").and.callFake((id: string) => {
      if (id === "p2") throw new Error("component is unmounted");
      return mountedLookup(id);
    });
    const textSelection = selection(
      {blockId: "p1", type: "text", offset: 1, block: p1},
      {blockId: "outside", type: "text", offset: 2, block: outside},
    );

    helper.formatText({"a:bold": true}, textSelection as any);

    expect((doc.crud as any).formatText.calls.allArgs()).toEqual([
      ["p1", 1, 2, {"a:bold": true}],
      ["outside", 0, 2, {"a:bold": true}],
      ["p2", 0, 3, {"a:bold": true}],
    ]);
    expect(p2.formatText).not.toHaveBeenCalled();
    void root;
    rootHost.remove();
  });

  it("normalizes compact and legacy typography into one common toolbar state", () => {
    const {helper, p1, p2, rootHost, selection} = makeHarness();
    (p1 as any).props = {depth: 0, lh: 1.5};
    (p2 as any).props = {depth: 0, lh: 1.5};
    (p1 as any).textDeltas = () => [{insert: "one", attributes: {"t:ff": "kai", "t:fs": 1.2, "t:ls": 0.1}}];
    (p2 as any).textDeltas = () => [{insert: "two", attributes: {
      "s:fontFamily": '"Kaiti SC", KaiTi, serif',
      "s:fontSize": "1.2em",
      "s:letterSpacing": "0.1em",
    }}];
    const textSelection = selection(
      {blockId: "p1", type: "text", offset: 0, block: p1},
      {blockId: "p2", type: "text", offset: 3, block: p2},
    );

    const common = helper.getCurrentCommonAttrs(textSelection as any);

    expect(common.typography).toEqual({ff: "kai", fs: 1.2, ls: 0.1});
    expect(common.paragraph).toEqual({lh: 1.5});
    rootHost.remove();
  });

  it("reports mixed inline and paragraph typography as undefined", () => {
    const {helper, p1, p2, rootHost, selection} = makeHarness();
    (p1 as any).props = {depth: 0, lh: 1.25};
    (p2 as any).props = {depth: 0, lh: 2};
    (p1 as any).textDeltas = () => [{insert: "one", attributes: {"t:fs": 1.2}}];
    (p2 as any).textDeltas = () => [{insert: "two", attributes: {"t:fs": 1.5}}];
    const textSelection = selection(
      {blockId: "p1", type: "text", offset: 0, block: p1},
      {blockId: "p2", type: "text", offset: 3, block: p2},
    );

    const common = helper.getCurrentCommonAttrs(textSelection as any);

    expect(common.typography?.fs).toBeUndefined();
    expect(common.paragraph?.lh).toBeUndefined();
    rootHost.remove();
  });

  it("does not update block props for a stale selection", () => {
    const {helper, doc, p1, p2, rootHost, selection} = makeHarness();
    const boundarySelection = selection(
      {blockId: "root", type: "boundary", index: 0, block: doc.getBlockById("root")},
      {blockId: "root", type: "boundary", index: 2, block: doc.getBlockById("root")},
    );
    (doc.getBlockById as any) = jasmine.createSpy("getBlockById").and.throwError("missing");

    helper.updateBlockProps({textAlign: "center"}, boundarySelection as any);

    expect(p1.updateProps).not.toHaveBeenCalled();
    expect(p2.updateProps).not.toHaveBeenCalled();
    rootHost.remove();
  });

  it("does not suppress recalculation for stale block transforms", () => {
    const {helper, doc, p1, p2, rootHost, selection} = makeHarness();
    const boundarySelection = selection(
      {blockId: "root", type: "boundary", index: 0, block: doc.getBlockById("root")},
      {blockId: "root", type: "boundary", index: 2, block: doc.getBlockById("root")},
    );
    (doc.getBlockById as any) = jasmine.createSpy("getBlockById").and.throwError("missing");

    helper.transformBlocks("bullet", boundarySelection as any);

    expect(doc.selection.setSuppressRecalculate).not.toHaveBeenCalled();
    expect(doc.chain).not.toHaveBeenCalled();
    expect(p1.updateProps).not.toHaveBeenCalled();
    expect(p2.updateProps).not.toHaveBeenCalled();
    rootHost.remove();
  });

  it("replays transformed blocks without resampling the restored DOM selection", fakeAsync(() => {
    const {helper, doc, p1, p2, rootHost, selection} = makeHarness();
    const textSelection = selection(
      {blockId: "p1", type: "text", offset: 0, block: p1},
      {blockId: "p2", type: "text", offset: 3, block: p2},
    );
    const chain: any = {};
    chain.transact = jasmine.createSpy("transact").and.callFake((run: () => void) => {
      run();
      return chain;
    });
    chain.run = jasmine.createSpy("run").and.resolveTo(undefined);
    let nextId = 0;
    doc.chain.and.returnValue(chain);
    doc.schemas.createSnapshot.and.callFake(() => ({id: `replacement-${++nextId}`}));
    const rafSpy = (window.requestAnimationFrame as any).and
      ? window.requestAnimationFrame as jasmine.Spy
      : spyOn(window, "requestAnimationFrame");
    rafSpy.and.callFake(callback => {
      callback(0);
      return 1;
    });

    helper.transformBlocks("bullet", textSelection as any);
    flushMicrotasks();

    expect(doc.selection.setSuppressRecalculate.calls.allArgs()).toEqual([[true], [false]]);
    expect(doc.selection.replay).toHaveBeenCalledOnceWith({
      anchor: {blockId: "replacement-1", type: "text", offset: 0},
      head: {blockId: "replacement-2", type: "text", offset: 3},
      commonParent: "root",
    });
    expect(doc.selection.recalculate).not.toHaveBeenCalled();
    rootHost.remove();
  }));

  it("releases selection suppression when the restore animation frame is missed", fakeAsync(() => {
    const {helper, doc, p1, p2, rootHost, selection} = makeHarness();
    const textSelection = selection(
      {blockId: "p1", type: "text", offset: 0, block: p1},
      {blockId: "p2", type: "text", offset: 3, block: p2},
    );
    const chain: any = {};
    chain.transact = jasmine.createSpy("transact").and.callFake((run: () => void) => {
      run();
      return chain;
    });
    chain.run = jasmine.createSpy("run").and.resolveTo(undefined);
    let nextId = 0;
    doc.chain.and.returnValue(chain);
    doc.schemas.createSnapshot.and.callFake(() => ({id: `replacement-${++nextId}`}));
    const scheduled: {restoreFrame?: FrameRequestCallback} = {};
    const rafSpy = (window.requestAnimationFrame as any).and
      ? window.requestAnimationFrame as jasmine.Spy
      : spyOn(window, "requestAnimationFrame");
    rafSpy.and.callFake(callback => {
      scheduled.restoreFrame = callback;
      return 1;
    });

    helper.transformBlocks("bullet", textSelection as any);
    flushMicrotasks();
    tick(100);

    expect(doc.selection.setSuppressRecalculate.calls.allArgs()).toEqual([[true], [false]]);
    expect(doc.selection.replay).toHaveBeenCalledTimes(1);

    scheduled.restoreFrame?.(0);
    expect(doc.selection.replay).toHaveBeenCalledTimes(1);
    rootHost.remove();
  }));
});
