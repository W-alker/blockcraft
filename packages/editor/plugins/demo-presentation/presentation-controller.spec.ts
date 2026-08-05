import {BlockNodeType, IBlockSnapshot, SchemaManager} from "../../framework";
import {ORIGIN_READONLY_VIEW_PROJECTION} from "../../framework/doc/origins";
import {PresentationController} from "./presentation-controller";

function paragraph(id = "page-block"): IBlockSnapshot {
  return {
    id,
    flavour: "paragraph",
    nodeType: BlockNodeType.editable,
    props: {depth: 0},
    meta: {},
    children: [{insert: "demo"}],
  } as IBlockSnapshot;
}

describe("PresentationController", () => {
  function createHarness(options: {readonly?: boolean, failInsert?: boolean} = {}) {
    const calls: string[] = [];
    let readonly = options.readonly ?? true;
    let projectionDepth = 0;
    const demoDoc = {
      get isReadonly() {
        return readonly;
      },
      rootId: "demo-root",
      root: {childrenLength: 1},
      crud: {
        transact(fn: () => void, origin: unknown) {
          expect(origin).toBe(ORIGIN_READONLY_VIEW_PROJECTION);
          calls.push("projection:start");
          projectionDepth++;
          try {
            fn();
          } finally {
            projectionDepth--;
            calls.push("projection:end");
          }
        },
        deleteBlocks() {
          calls.push("delete");
          if (readonly && projectionDepth === 0) {
            throw new Error("delete rejected by readonly guard");
          }
        },
        insertBlocks() {
          calls.push("insert");
          if (readonly && projectionDepth === 0) {
            throw new Error("insert rejected by readonly guard");
          }
          if (options.failInsert) throw new Error("insert failed");
        },
      },
    };
    const controller = new PresentationController({} as BlockCraft.Doc, {});
    (controller as any)._demoDoc = demoDoc;
    (controller as any).pages = [[paragraph()]];

    return {
      calls,
      controller,
      get readonly() {
        return readonly;
      },
      get projectionDepth() {
        return projectionDepth;
      },
      demoDoc,
    };
  }

  it("replaces a page through an internal projection while remaining readonly", () => {
    const harness = createHarness();

    (harness.controller as any).updatePageContent(0);

    expect(harness.calls).toEqual([
      "projection:start",
      "delete",
      "insert",
      "projection:end",
    ]);
    expect(harness.readonly).toBeTrue();
    expect(harness.projectionDepth).toBe(0);
    expect(() => harness.demoDoc.crud.insertBlocks()).toThrowError(
      "insert rejected by readonly guard",
    );
  });

  it("closes the internal projection scope when page insertion fails", () => {
    const harness = createHarness({failInsert: true});

    expect(() => (harness.controller as any).updatePageContent(0))
      .toThrowError("insert failed");

    expect(harness.calls).toEqual([
      "projection:start",
      "delete",
      "insert",
      "projection:end",
    ]);
    expect(harness.readonly).toBeTrue();
    expect(harness.projectionDepth).toBe(0);
  });

  it("preserves an already writable demo document", () => {
    const harness = createHarness({readonly: false});

    (harness.controller as any).updatePageContent(0);

    expect(harness.calls).toEqual([
      "projection:start",
      "delete",
      "insert",
      "projection:end",
    ]);
    expect(harness.readonly).toBeFalse();
  });

  it("disables inherited virtualization and uses the presentation stage as scroller", () => {
    const authoringScroller = document.createElement("div");
    const presentationStage = document.createElement("div");
    const controller = new PresentationController({
      config: {
        virtualization: {enabled: true, overscanViewports: 1},
        scrollContainer: authoringScroller,
        theme: "dark",
      },
    } as unknown as BlockCraft.Doc, {});

    const config = (controller as any).createDemoDocConfig(
      {} as SchemaManager,
      presentationStage,
    );

    expect(config.virtualization).toEqual({enabled: false});
    expect(config.scrollContainer).toBe(presentationStage);
    expect(config.plugins).toEqual([]);
    expect(config.readonly).toBeTrue();
  });

  it("restores only the body theme owned by the presentation runtime", () => {
    const originalTheme = document.body.getAttribute("blockcraft-theme");
    const controller = new PresentationController({
      config: {theme: "dark"},
    } as unknown as BlockCraft.Doc, {});

    try {
      document.body.removeAttribute("blockcraft-theme");
      (controller as any).captureBodyTheme();
      const config = (controller as any).createDemoDocConfig(
        {} as SchemaManager,
        document.createElement("div"),
      );
      document.body.setAttribute("blockcraft-theme", config.theme);

      (controller as any).restoreBodyTheme();

      expect(document.body.hasAttribute("blockcraft-theme")).toBeFalse();
    } finally {
      if (originalTheme === null) document.body.removeAttribute("blockcraft-theme");
      else document.body.setAttribute("blockcraft-theme", originalTheme);
    }
  });

  it("does not overwrite a host theme change made during presentation", () => {
    const originalTheme = document.body.getAttribute("blockcraft-theme");
    const controller = new PresentationController({
      config: {theme: "light"},
    } as unknown as BlockCraft.Doc, {});

    try {
      document.body.setAttribute("blockcraft-theme", "light");
      (controller as any).captureBodyTheme();
      (controller as any).createDemoDocConfig(
        {} as SchemaManager,
        document.createElement("div"),
      );
      document.body.setAttribute("blockcraft-theme", "dark");

      (controller as any).restoreBodyTheme();

      expect(document.body.getAttribute("blockcraft-theme")).toBe("dark");
    } finally {
      if (originalTheme === null) document.body.removeAttribute("blockcraft-theme");
      else document.body.setAttribute("blockcraft-theme", originalTheme);
    }
  });
});
