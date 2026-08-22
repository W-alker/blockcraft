import {BlockNodeType, IBlockSnapshot, SchemaManager} from "../../framework";
import {ORIGIN_READONLY_VIEW_PROJECTION} from "../../framework/doc/origins";
import {PaginationPlugin} from "../pagination";
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
    let insertedPage: IBlockSnapshot[] | null = null;
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
        insertBlocks(_parentId?: string, _index?: number, blocks?: IBlockSnapshot[]) {
          calls.push("insert");
          insertedPage = blocks ?? null;
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
      get insertedPage() {
        return insertedPage;
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

  it("projects the original page snapshots without presentation-only table rewrites", () => {
    const harness = createHarness();
    const page = [{
      id: "table-1",
      flavour: "table",
      nodeType: BlockNodeType.block,
      props: {colWidths: [120, 240]},
      meta: {},
      children: [],
    } as unknown as IBlockSnapshot];
    (harness.controller as any).pages = [page];

    (harness.controller as any).updatePageContent(0);

    expect(harness.insertedPage).toBe(page);
    expect((page[0].props as any).colWidths).toEqual([120, 240]);
  });

  it("applies one whole-page view scale and keeps fontScale as a fallback alias", () => {
    const sourceHost = document.createElement("div");
    const hostElement = document.createElement("div");
    const setScale = jasmine.createSpy("setScale");
    const attach = jasmine.createSpy("attach");
    const controller = new PresentationController({
      root: {hostElement: sourceHost},
    } as unknown as BlockCraft.Doc, {
      viewScale: 1.25,
      fontScale: 1.8,
    });
    (controller as any)._demoDoc = {
      root: {hostElement},
      viewScale: {setScale, attach},
    };

    (controller as any).applyPresentationViewScale();

    expect(setScale).toHaveBeenCalledOnceWith(1.25);
    expect(attach).toHaveBeenCalledOnceWith(hostElement);
    expect(hostElement.style.width).toBe("");

    const legacyController = new PresentationController(
      {} as BlockCraft.Doc,
      {fontScale: 1.8},
    );
    expect((legacyController as any).getViewScale()).toBe(1.8);
    const clampedController = new PresentationController(
      {} as BlockCraft.Doc,
      {viewScale: 9},
    );
    expect((clampedController as any).getViewScale()).toBe(2);
  });

  it("copies source layout tokens without scaling their values", () => {
    const sourceRoot = document.createElement("div");
    sourceRoot.style.setProperty("--bc-fs", "18px");
    sourceRoot.style.setProperty("--bc-lh", "1.75");
    sourceRoot.style.setProperty("--bc-segments-gap", "12px");
    const target = document.createElement("div");
    const controller = new PresentationController({
      root: {hostElement: sourceRoot},
    } as unknown as BlockCraft.Doc, {});

    (controller as any).copySourceLayoutTokens(target);

    expect(target.style.getPropertyValue("--bc-fs")).toBe("18px");
    expect(target.style.getPropertyValue("--bc-lh")).toBe("1.75");
    expect(target.style.getPropertyValue("--bc-segments-gap")).toBe("12px");
  });

  it("keeps explicit legacy spacing scales as opt-in compatibility corrections", () => {
    const target = document.createElement("div");
    target.style.setProperty("--bc-lh", "1.5");
    target.style.setProperty("--bc-segments-gap", "10px");
    const controller = new PresentationController({} as BlockCraft.Doc, {
      viewScale: 1.5,
      lineHeightScale: 1.2,
      segmentsGapScale: 0.9,
    });

    (controller as any).applyLegacySpacingOverrides(target);

    expect(target.style.getPropertyValue("--bc-lh"))
      .toBe("calc(1.5 * 0.8)");
    expect(target.style.getPropertyValue("--bc-segments-gap"))
      .toBe("calc(10px * 0.6)");
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

  it("keeps a fresh pagination plugin in the isolated demo config", () => {
    const pagination = new PaginationPlugin({enabled: true});
    const controller = new PresentationController({
      config: {theme: "light"},
    } as unknown as BlockCraft.Doc, {});

    const config = (controller as any).createDemoDocConfig(
      {} as SchemaManager,
      document.createElement("div"),
      [pagination],
    );

    expect(config.plugins).toEqual([pagination]);
  });

  it("selects the paginated path only when the source pagination plugin is enabled", () => {
    const disabled = new PaginationPlugin();
    const enabled = new PaginationPlugin({enabled: true});
    const paginated = new PresentationController({
      plugins: [disabled, enabled],
    } as unknown as BlockCraft.Doc, {});
    const flow = new PresentationController({
      plugins: [disabled],
    } as unknown as BlockCraft.Doc, {});

    expect((paginated as any).findEnabledPaginationPlugin()).toBe(enabled);
    expect((flow as any).findEnabledPaginationPlugin()).toBeNull();
  });

  it("clones the pagination document header as a non-interactive visual copy", () => {
    const source = document.createElement("section");
    source.id = "source-header";
    source.innerHTML = '<label for="source-input">Title</label><input id="source-input" aria-describedby="hint"><span id="hint">Hint</span>';
    const surface = document.createElement("div");
    const controller = new PresentationController({} as BlockCraft.Doc, {});

    const result = (controller as any).clonePaginationDocumentHeader(
      {element: source, gap: 12},
      surface,
    );
    const clone = result.element as HTMLElement;

    expect(clone).not.toBe(source);
    expect(surface.firstElementChild).toBe(clone);
    expect(clone.querySelector('[id]')).toBeNull();
    expect(clone.querySelector('[for]')).toBeNull();
    expect(clone.querySelector('[aria-describedby]')).toBeNull();
    expect(clone.getAttribute('aria-hidden')).toBe('true');
    expect(clone.hasAttribute('inert')).toBeTrue();
    expect(source.id).toBe('source-header');
  });

  it("fits a real page into the paginated viewport and scales the shared surface", () => {
    const viewport = document.createElement("div");
    const surface = document.createElement("div");
    const scaleProbe = document.createElement("div");
    const sheet = document.createElement("div");
    sheet.className = "bc-page-sheet";
    surface.appendChild(sheet);
    Object.defineProperty(viewport, "clientWidth", {value: 720});
    Object.defineProperty(viewport, "clientHeight", {value: 846});
    Object.defineProperty(sheet, "offsetWidth", {value: 800});
    Object.defineProperty(sheet, "offsetHeight", {value: 1000});
    const setScale = jasmine.createSpy("setScale").and.returnValue(0.84);
    const attach = jasmine.createSpy("attach");
    const controller = new PresentationController({} as BlockCraft.Doc, {});
    (controller as any).layoutMode = "paginated";
    (controller as any).presentationViewport = viewport;
    (controller as any).presentationSurface = surface;
    (controller as any).presentationScaleProbe = scaleProbe;
    (controller as any)._demoDoc = {
      root: {hostElement: document.createElement("div")},
      viewScale: {setScale, attach},
    };

    (controller as any).applyPresentationViewScale();

    expect(setScale).toHaveBeenCalledOnceWith(0.84);
    expect(attach).toHaveBeenCalledOnceWith(scaleProbe);
    expect(surface.style.width).toBe("800px");
    expect(surface.style.transform).toBe("scale(0.84)");
    expect(surface.style.transformOrigin).toBe("left top");
  });

  it("supports manual paginated zoom and restores the fit-page scale", () => {
    const viewport = document.createElement("div");
    const surface = document.createElement("div");
    const scaleProbe = document.createElement("div");
    const sheet = document.createElement("div");
    sheet.className = "bc-page-sheet";
    surface.appendChild(sheet);
    Object.defineProperty(viewport, "clientWidth", {value: 800});
    Object.defineProperty(viewport, "clientHeight", {value: 900});
    Object.defineProperty(sheet, "offsetWidth", {value: 800});
    Object.defineProperty(sheet, "offsetHeight", {value: 1000});
    let scale = 0.9;
    const setScale = jasmine.createSpy("setScale").and.callFake((next: number) => {
      scale = Math.round(Math.min(2, Math.max(0.5, next)) * 100) / 100;
      return scale;
    });
    const controller = new PresentationController({} as BlockCraft.Doc, {});
    (controller as any).layoutMode = "paginated";
    (controller as any).presentationViewport = viewport;
    (controller as any).presentationSurface = surface;
    (controller as any).presentationScaleProbe = scaleProbe;
    (controller as any)._demoDoc = {
      root: {hostElement: document.createElement("div")},
      viewScale: {
        get value() { return scale; },
        setScale,
        attach: jasmine.createSpy("attach"),
      },
    };

    (controller as any).zoomPaginatedPage(0.1);
    expect(surface.style.transform).toBe("scale(1)");
    expect((controller as any).paginatedScaleMode).toBe("manual");

    (controller as any).fitPaginatedPage();
    expect(surface.style.transform).toBe("scale(0.9)");
    expect((controller as any).paginatedFitScale).toBe(0.9);
    expect((controller as any).paginatedScaleMode).toBe("fit");
  });

  it("coalesces Ctrl/Cmd-wheel into paginated zoom without browser zoom", () => {
    const viewport = document.createElement("div");
    const surface = document.createElement("div");
    const scaleProbe = document.createElement("div");
    let scale = 0.9;
    let frameCallback: FrameRequestCallback | undefined;
    spyOn(window, "requestAnimationFrame").and.callFake(callback => {
      frameCallback = callback;
      return 17;
    });
    const controller = new PresentationController({} as BlockCraft.Doc, {});
    (controller as any).layoutMode = "paginated";
    (controller as any).presentationViewport = viewport;
    (controller as any).presentationSurface = surface;
    (controller as any).presentationScaleProbe = scaleProbe;
    (controller as any)._demoDoc = {
      root: {hostElement: document.createElement("div")},
      viewScale: {
        get value() { return scale; },
        setScale(next: number) {
          scale = Math.round(next * 100) / 100;
          return scale;
        },
        attach: jasmine.createSpy("attach"),
      },
    };
    (controller as any).bindPaginatedZoomWheel();
    const event = new WheelEvent("wheel", {
      ctrlKey: true,
      deltaY: -120,
      cancelable: true,
    });

    viewport.dispatchEvent(event);
    frameCallback?.(0);

    expect(event.defaultPrevented).toBeTrue();
    expect(scale).toBe(1);
    expect(surface.style.transform).toBe("scale(1)");
    (controller as any).eventCleanups.forEach((cleanup: () => void) => cleanup());
  });

  it("projects the current paginated sheet into a scrollable page-sized canvas", () => {
    const viewport = document.createElement("div");
    const track = document.createElement("div");
    const surface = document.createElement("div");
    const backdrop = document.createElement("div");
    backdrop.className = "bc-pagination-backdrop";
    const first = document.createElement("div");
    const second = document.createElement("div");
    first.className = second.className = "bc-page-sheet";
    backdrop.append(first, second);
    surface.appendChild(backdrop);
    Object.defineProperty(viewport, "clientWidth", {value: 600});
    Object.defineProperty(viewport, "clientHeight", {value: 800});
    Object.defineProperty(backdrop, "offsetTop", {value: 24});
    Object.defineProperty(backdrop, "offsetParent", {value: surface});
    Object.defineProperty(first, "offsetTop", {value: 0});
    Object.defineProperty(second, "offsetTop", {value: 1120});
    Object.defineProperty(second, "offsetWidth", {value: 800});
    Object.defineProperty(second, "offsetHeight", {value: 1000});
    Object.defineProperty(first, "offsetParent", {value: backdrop});
    Object.defineProperty(second, "offsetParent", {value: backdrop});
    const controller = new PresentationController({} as BlockCraft.Doc, {});
    (controller as any).layoutMode = "paginated";
    (controller as any).presentationViewport = viewport;
    (controller as any).presentationTrack = track;
    (controller as any).presentationSurface = surface;
    (controller as any)._demoDoc = {
      root: {hostElement: document.createElement("div")},
      viewScale: {value: 0.75},
    };

    (controller as any).renderPage(1);

    expect((controller as any).currentPageIndex).toBe(1);
    expect(track.style.width).toBe("600px");
    expect(track.style.height).toBe("800px");
    expect(surface.style.left).toBe("0px");
    expect(surface.style.top).toBe("-833px");
    expect(track.style.transform).toBe("");
  });

  it("expands the paginated canvas beyond the viewport for manual zoom scrolling", () => {
    const viewport = document.createElement("div");
    const track = document.createElement("div");
    const surface = document.createElement("div");
    const sheet = document.createElement("div");
    sheet.className = "bc-page-sheet";
    surface.appendChild(sheet);
    Object.defineProperty(viewport, "clientWidth", {value: 800});
    Object.defineProperty(viewport, "clientHeight", {value: 900});
    Object.defineProperty(sheet, "offsetWidth", {value: 800});
    Object.defineProperty(sheet, "offsetHeight", {value: 1000});
    Object.defineProperty(sheet, "offsetParent", {value: surface});
    const controller = new PresentationController({} as BlockCraft.Doc, {});
    (controller as any).layoutMode = "paginated";
    (controller as any).presentationViewport = viewport;
    (controller as any).presentationTrack = track;
    (controller as any).presentationSurface = surface;
    (controller as any)._demoDoc = {
      root: {hostElement: document.createElement("div")},
      viewScale: {value: 1.2},
    };

    (controller as any).positionPaginatedPage(0);

    expect(track.style.width).toBe("960px");
    expect(track.style.height).toBe("1200px");
    expect(viewport.scrollTop).toBe(0);
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
