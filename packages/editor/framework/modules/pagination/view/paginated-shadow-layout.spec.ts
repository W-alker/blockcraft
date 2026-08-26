import { BehaviorSubject, Subject } from "rxjs";
import { BlockNodeType } from "../../../block-std/types/block.type";
import {
  IBlockModelContentChange,
  IBlockModelStructureChange,
} from "../../../doc/model-graph";
import { PaginationConfig } from "../pagination.types";
import { PaginationGeometryMeasurement } from "../layout/pagination-geometry-index";
import {
  PaginationLayoutCoordinator,
  PaginationLayoutState,
} from "../layout/pagination-layout-coordinator";
import { PaginatedViewController } from "./paginated-view.controller";
import {emitRevisionPresentationChange} from '../../../revision/presentation-change';

const CONFIG: PaginationConfig = {
  pageSize: { width: 400, height: 220 },
  margins: { top: 10, right: 10, bottom: 10, left: 10 },
  pageGap: 20,
};

interface ModelFact {
  readonly flavour: string;
  readonly nodeType: BlockNodeType;
  readonly props: Record<string, unknown>;
  readonly path: readonly string[];
}

interface Harness {
  readonly doc: BlockCraft.Doc;
  readonly scrollContainer: HTMLElement;
  readonly rootHost: HTMLElement;
  readonly blockHost: HTMLElement;
  readonly contentChange$: Subject<IBlockModelContentChange>;
  readonly structureChange$: Subject<IBlockModelStructureChange>;
  readonly themeChange$: Subject<string>;
  readonly viewScale$: BehaviorSubject<number>;
  readonly onChildrenUpdate$: Subject<void>;
  readonly onPropsUpdate$: Subject<void>;
  readonly compositionSession: { isIdle: boolean };
  readonly eventStatus: { isComposing: boolean };
  readonly logger: { warn: jasmine.Spy };
  readonly revisionManager: object;
  setHeading(heading: number | undefined): void;
  destroy(): void;
}

function contentChange(
  blockIds: readonly string[],
  kinds: IBlockModelContentChange["kinds"] = ["props"],
): IBlockModelContentChange {
  return {
    blockIds,
    kinds,
    origin: null,
    local: true,
    isUndoRedo: false,
  };
}

function createHarness(): Harness {
  const scrollContainer = document.createElement("div");
  const rootHost = document.createElement("div");
  const blockHost = document.createElement("div");
  rootHost.setAttribute("data-blockcraft-root", "true");
  blockHost.setAttribute("data-block-id", "root-block");
  blockHost.setAttribute("data-node-type", BlockNodeType.editable);
  rootHost.appendChild(blockHost);
  scrollContainer.appendChild(rootHost);
  document.body.appendChild(scrollContainer);
  Object.defineProperty(blockHost, "offsetHeight", {
    configurable: true,
    value: 40,
  });
  Object.defineProperty(blockHost, "scrollHeight", {
    configurable: true,
    value: 40,
  });

  const facts = new Map<string, ModelFact>([
    [
      "root-block",
      {
        flavour: "paragraph",
        nodeType: BlockNodeType.editable,
        props: {},
        path: ["root", "root-block"],
      },
    ],
    [
      "nested",
      {
        flavour: "paragraph",
        nodeType: BlockNodeType.editable,
        props: {},
        path: ["root", "root-block", "nested"],
      },
    ],
  ]);
  const contentChange$ = new Subject<IBlockModelContentChange>();
  const structureChange$ = new Subject<IBlockModelStructureChange>();
  const themeChange$ = new Subject<string>();
  const viewScale$ = new BehaviorSubject(1);
  const onChildrenUpdate$ = new Subject<void>();
  const onPropsUpdate$ = new Subject<void>();
  const logger = { warn: jasmine.createSpy("warn") };
  const compositionSession = { isIdle: true };
  const eventStatus = { isComposing: false };
  const revisionManager = {
    getBlockPresentation: () => ({hidden: false}),
  };
  let heading: number | undefined;
  const block = {
    id: "root-block",
    flavour: "paragraph",
    nodeType: BlockNodeType.editable,
    hostElement: blockHost,
    get heading() {
      return heading;
    },
  };
  const model = {
    contentChange$,
    structureChange$,
    getChildrenIds: (blockId: string) =>
      blockId === "root" ? ["root-block"] : [],
    getPath: (blockId: string) => facts.get(blockId)?.path ?? null,
    getFlavour: (blockId: string) => facts.get(blockId)?.flavour,
    getNodeType: (blockId: string) => facts.get(blockId)?.nodeType,
    getProps: (blockId: string) => {
      const props = facts.get(blockId)?.props;
      return props ? { ...props } : undefined;
    },
  };
  const config = {
    scrollContainer,
    theme: "light",
    virtualization: { estimatedHeights: {} },
  };
  const doc = {
    rootId: "root",
    root: {
      childrenIds: ["root-block"],
      hostElement: rootHost,
    },
    model,
    config,
    get theme() {
      return config.theme || "light";
    },
    themeChange$,
    viewScale: { scale$: viewScale$ },
    onChildrenUpdate$,
    onPropsUpdate$,
    inputManger: { compositionSession },
    event: { status: eventStatus },
    revisions: revisionManager,
    ngZone: { runOutsideAngular: (fn: () => void) => fn() },
    getBlockById: (blockId: string) =>
      blockId === "root-block" ? block : null,
    logger,
  } as unknown as BlockCraft.Doc;

  return {
    doc,
    scrollContainer,
    rootHost,
    blockHost,
    contentChange$,
    structureChange$,
    themeChange$,
    viewScale$,
    onChildrenUpdate$,
    onPropsUpdate$,
    compositionSession,
    eventStatus,
    logger,
    revisionManager,
    setHeading: nextHeading => {
      heading = nextHeading;
      facts.set("root-block", {
        flavour: "paragraph",
        nodeType: BlockNodeType.editable,
        props: nextHeading == null ? {} : {heading: nextHeading},
        path: ["root", "root-block"],
      });
    },
    destroy: () => {
      contentChange$.complete();
      structureChange$.complete();
      themeChange$.complete();
      viewScale$.complete();
      onChildrenUpdate$.complete();
      onPropsUpdate$.complete();
      scrollContainer.remove();
    },
  };
}

function shadowWarnings(
  logger: { warn: jasmine.Spy },
  name: string,
): unknown[][] {
  return logger.warn.calls.allArgs().filter(([message]) => message === name);
}

function mismatchCoordinator(doc: BlockCraft.Doc): PaginationLayoutCoordinator {
  const delegate = new PaginationLayoutCoordinator(doc);
  return {
    get geometryRevision() {
      return delegate.geometryRevision;
    },
    syncRootOrder: () => delegate.syncRootOrder(),
    applyContentChange: (change: IBlockModelContentChange) =>
      delegate.applyContentChange(change),
    applyStructureChange: (change: IBlockModelStructureChange) =>
      delegate.applyStructureChange(change),
    updateMeasureContext: (
      context: Parameters<
        PaginationLayoutCoordinator["updateMeasureContext"]
      >[0],
    ) => delegate.updateMeasureContext(context),
    setRequiredMeasurementEpoch: (epoch: number) =>
      delegate.setRequiredMeasurementEpoch(epoch),
    applyMeasured: (
      measurements: readonly PaginationGeometryMeasurement[],
      revision: number,
      measurementEpoch: number,
    ) => delegate.applyMeasured(measurements, revision, measurementEpoch),
    compute: (...args: Parameters<PaginationLayoutCoordinator["compute"]>) => {
      const state = delegate.compute(...args);
      return {
        ...state,
        result: {
          pages: [
            ...state.result.pages,
            {
              index: state.result.pages.length,
              usedHeight: 0,
              slots: [],
            },
          ],
          byBlock: new Map(state.result.byBlock),
        },
      } satisfies PaginationLayoutState;
    },
    dispose: () => delegate.dispose(),
  } as PaginationLayoutCoordinator;
}

describe("PaginatedViewController shadow layout", () => {
  it("keeps the shared pagination surface at least one sheet wide", () => {
    const harness = createHarness();
    const controller = new PaginatedViewController(
      harness.doc,
      CONFIG,
      harness.scrollContainer,
    );

    try {
      controller.enable();
      expect(
        harness.scrollContainer.style.getPropertyValue("--bc-page-width"),
      ).toBe("400px");

      controller.updateConfig({pageSize: {width: 420, height: 300}});
      expect(
        harness.scrollContainer.style.getPropertyValue("--bc-page-width"),
      ).toBe("420px");

      controller.disable();
      expect(
        harness.scrollContainer.style.getPropertyValue("--bc-page-width"),
      ).toBe("");
    } finally {
      controller.destroy();
      harness.destroy();
    }
  });

  it("moves the whole first-page root below an external document header", () => {
    const harness = createHarness();
    const header = document.createElement("div");
    header.textContent = "host document header";
    harness.scrollContainer.insertBefore(header, harness.rootHost);
    Object.defineProperty(header, "offsetHeight", {
      configurable: true,
      value: 36,
    });
    const controller = new PaginatedViewController(
      harness.doc,
      CONFIG,
      harness.scrollContainer,
      undefined,
      {
        documentHeader: {
          element: header,
          placement: "content",
          gap: 16,
        },
      },
    );

    try {
      controller.enable();

      // 第一页 root 从纸面正文顶边距(10) + header(36) + gap(16) 之后开始。
      // root 内部不再保留等量 padding，placement plane 也保持 root-local 0。
      expect(
        harness.rootHost.style.getPropertyValue("--bc-page-root-offset-top"),
      ).toBe("62px");
      expect(
        harness.rootHost.style.getPropertyValue("--bc-page-margin-top"),
      ).toBe("0px");
      expect(
        harness.rootHost.style.getPropertyValue("--bc-placement-content-origin-y"),
      ).toBe("0px");
      expect(header.nextSibling).toBe(harness.rootHost);
      const layout = controller.captureStableLayout();
      expect(layout?.placementOriginX).toBe(10);
      expect(layout?.placementOriginY).toBe(62);
      expect(layout?.placementWidth).toBe(380);
    } finally {
      controller.destroy();
      harness.destroy();
    }
  });

  it("publishes canonical placement geometry without remeasuring the visual DOM", () => {
    const harness = createHarness();
    const plane = document.createElement("div");
    plane.setAttribute("data-bc-placement-layout", "");
    const placementContainer = document.createElement("div");
    placementContainer.className = "children-render-container";
    plane.appendChild(placementContainer);
    harness.rootHost.appendChild(plane);
    Object.defineProperty(harness.rootHost, "offsetWidth", {
      configurable: true,
      value: 400,
    });
    spyOn(harness.rootHost, "getBoundingClientRect").and.returnValue({
      top: 120,
      left: 20,
      width: 800,
      height: 440,
      right: 820,
      bottom: 560,
      x: 20,
      y: 120,
      toJSON: () => ({}),
    });
    spyOn(placementContainer, "getBoundingClientRect").and.returnValue({
      top: 140,
      left: 80,
      width: 680,
      height: 0,
      right: 760,
      bottom: 140,
      x: 80,
      y: 140,
      toJSON: () => ({}),
    });
    const controller = new PaginatedViewController(
      harness.doc,
      CONFIG,
      harness.scrollContainer,
    );

    try {
      controller.enable();
      // 即使视觉 DOM 模拟了 root 2x、placement 位置与宽度漂移，稳定分页也只能
      // 发布 PaginationConfig 对应的 content-box layout px。
      const backdrop = harness.rootHost.parentElement!.querySelector<HTMLElement>(
        ':scope > .bc-pagination-backdrop',
      )!;
      const firstSheet = document.createElement('div');
      firstSheet.className = 'bc-page-sheet';
      backdrop.appendChild(firstSheet);
      spyOn(firstSheet, 'getBoundingClientRect').and.returnValue({
        top: 100,
        left: 20,
        width: 800,
        height: 440,
        right: 820,
        bottom: 540,
        x: 20,
        y: 100,
        toJSON: () => ({}),
      });
      const layout = controller.captureStableLayout();

      expect(layout?.placementOriginY).toBe(10);
      expect(layout?.placementOriginX).toBe(10);
      expect(layout?.placementWidth).toBe(380);
    } finally {
      controller.destroy();
      harness.destroy();
    }
  });

  it("captures a shadow layout equal to the authoritative legacy layout", () => {
    const harness = createHarness();
    const controller = new PaginatedViewController(
      harness.doc,
      CONFIG,
      harness.scrollContainer,
    );

    try {
      controller.enable();
      const legacy = controller.captureStableLayout();
      const shadow = controller.captureShadowLayout();

      expect(legacy).not.toBeNull();
      expect(controller.canReuseStableLayoutForExport).toBeTrue();
      expect(shadow).not.toBeNull();
      expect(shadow?.exact).toBeTrue();
      expect(shadow?.result.pages).toEqual(legacy?.result.pages);
      expect(
        shadowWarnings(harness.logger, "paginationShadowMismatch: "),
      ).toHaveSize(0);
    } finally {
      controller.destroy();
      harness.destroy();
    }
  });

  it("preserves trailing scheduling by cancelling stale animation frames", () => {
    const harness = createHarness();
    const controller = new PaginatedViewController(
      harness.doc,
      CONFIG,
      harness.scrollContainer,
    );

    try {
      controller.enable();
      controller.captureStableLayout();
      const callbacks = new Map<number, FrameRequestCallback>();
      let nextFrameId = 0;
      const requestFrame = spyOn(window, "requestAnimationFrame").and.callFake(
        (callback: FrameRequestCallback) => {
          const frameId = ++nextFrameId;
          callbacks.set(frameId, callback);
          return frameId;
        },
      );
      const cancelFrame = spyOn(window, "cancelAnimationFrame").and.callFake(
        (frameId: number) => {
          callbacks.delete(frameId);
        },
      );
      const recompute = spyOn(
        controller as unknown as {_recompute(): unknown},
        "_recompute",
      ).and.callThrough();

      controller.scheduleRecompute();
      expect(controller.captureShadowLayout()).toBeNull();
      controller.scheduleRecompute();
      controller.scheduleRecompute();

      expect(requestFrame).toHaveBeenCalledTimes(3);
      expect(cancelFrame).toHaveBeenCalledTimes(2);
      expect(callbacks.size).toBe(1);
      callbacks.forEach((callback) => callback(performance.now()));
      expect(recompute).toHaveBeenCalledTimes(1);
    } finally {
      controller.destroy();
      harness.destroy();
    }
  });

  it("defers pagination frames for the full model-owned IME session and flushes once", async () => {
    const harness = createHarness();
    const controller = new PaginatedViewController(
      harness.doc,
      CONFIG,
      harness.scrollContainer,
    );

    try {
      controller.enable();
      controller.captureStableLayout();
      const callbacks = new Map<number, FrameRequestCallback>();
      let nextFrameId = 0;
      const requestFrame = spyOn(window, "requestAnimationFrame").and.callFake(
        callback => {
          const frameId = ++nextFrameId;
          callbacks.set(frameId, callback);
          return frameId;
        },
      );
      spyOn(window, "cancelAnimationFrame").and.callFake(frameId => {
        callbacks.delete(frameId);
      });
      const applyLayout = spyOn(
        controller as unknown as {_applyLayoutView(...args: unknown[]): void},
        "_applyLayoutView",
      ).and.callThrough();

      // A frame queued before compositionstart must also be stopped when it runs.
      controller.scheduleRecompute();
      harness.compositionSession.isIdle = false;
      callbacks.forEach(callback => callback(performance.now()));
      callbacks.clear();
      expect(applyLayout).not.toHaveBeenCalled();

      // A replaced table-cell host can make the raw event state false here. The
      // model-owned session still keeps every resize/structure echo buffered.
      harness.eventStatus.isComposing = false;
      controller.scheduleRecompute();
      controller.scheduleRecompute();
      expect(requestFrame).toHaveBeenCalledTimes(1);

      harness.blockHost.dispatchEvent(new CompositionEvent("compositionend", {
        bubbles: true,
      }));
      harness.compositionSession.isIdle = true;
      await Promise.resolve();

      expect(requestFrame).toHaveBeenCalledTimes(2);
      expect(callbacks.size).toBe(1);
      callbacks.forEach(callback => callback(performance.now()));
      expect(applyLayout).toHaveBeenCalledTimes(1);
    } finally {
      controller.destroy();
      harness.destroy();
    }
  });

  it("restores inline pagination after the earlier bubble-phase IME commit", async () => {
    const harness = createHarness();
    const controller = new PaginatedViewController(
      harness.doc,
      CONFIG,
      harness.scrollContainer,
    );
    const releaseComposition = () => {
      harness.compositionSession.isIdle = true;
    };
    const internals = controller as unknown as {
      _flushCompositionRecompute(): void;
    };
    const flushCompositionRecompute =
      internals._flushCompositionRecompute.bind(controller);
    const idleStatesAtPaginationListener: boolean[] = [];

    try {
      // CompositionControl is registered before pagination during document init.
      harness.rootHost.addEventListener("compositionend", releaseComposition);
      controller.enable();
      controller.captureStableLayout();
      const callbacks = new Map<number, FrameRequestCallback>();
      let nextFrameId = 0;
      spyOn(window, "requestAnimationFrame").and.callFake(callback => {
        const frameId = ++nextFrameId;
        callbacks.set(frameId, callback);
        return frameId;
      });
      spyOn(window, "cancelAnimationFrame").and.callFake(frameId => {
        callbacks.delete(frameId);
      });
      const applyLayout = spyOn(
        controller as unknown as {_applyLayoutView(...args: unknown[]): void},
        "_applyLayoutView",
      ).and.callThrough();
      spyOn(internals, "_flushCompositionRecompute").and.callFake(() => {
        idleStatesAtPaginationListener.push(harness.compositionSession.isIdle);
        flushCompositionRecompute();
      });

      // InlineRuntime.render() has already revoked the paragraph's old page gaps,
      // but the model-owned session is still committing, so the content echo can
      // only mark pagination as pending.
      harness.compositionSession.isIdle = false;
      harness.contentChange$.next(contentChange(["root-block"], ["text"]));
      expect(callbacks.size).toBe(0);

      // Zone/WebKit can run a microtask checkpoint between listeners. Model the
      // pagination microtask as immediate: the earlier CompositionControl bubble
      // handler must already have completed rerender/caret restoration/session.end.
      spyOn(window, "queueMicrotask").and.callFake(callback => callback());
      harness.blockHost.dispatchEvent(new CompositionEvent("compositionend", {
        bubbles: true,
      }));
      await Promise.resolve();

      const flushFrame = () => {
        const pending = [...callbacks.entries()];
        callbacks.clear();
        pending.forEach(([, callback]) => callback(performance.now()));
      };
      flushFrame();
      flushFrame();

      expect(harness.compositionSession.isIdle).toBeTrue();
      expect(idleStatesAtPaginationListener).toEqual([true]);
      expect(applyLayout).toHaveBeenCalledTimes(1);
    } finally {
      harness.rootHost.removeEventListener("compositionend", releaseComposition);
      controller.destroy();
      harness.destroy();
    }
  });

  it("coalesces a structural deletion and its resize notification into one frame", () => {
    const harness = createHarness();
    const controller = new PaginatedViewController(
      harness.doc,
      CONFIG,
      harness.scrollContainer,
    );

    try {
      controller.enable();
      controller.captureStableLayout();
      const callbacks = new Map<number, FrameRequestCallback>();
      let nextFrameId = 0;
      spyOn(window, "requestAnimationFrame").and.callFake(callback => {
        const frameId = ++nextFrameId;
        callbacks.set(frameId, callback);
        return frameId;
      });
      spyOn(window, "cancelAnimationFrame").and.callFake(frameId => {
        callbacks.delete(frameId);
      });
      const recompute = spyOn(
        controller as unknown as {_recompute(): unknown},
        "_recompute",
      ).and.callThrough();
      const heightSource = (
        controller as unknown as {
          _heightSource: {
            _handleResize(entries: readonly ResizeObserverEntry[]): void;
          };
        }
      )._heightSource;

      harness.structureChange$.next({
        revision: 1,
        reachableAddedIds: [],
        reachableRemovedIds: ["nested"],
        affectedParentIds: ["root-block"],
        affectedRootIds: ["root-block"],
      });
      heightSource._handleResize([{
        target: harness.blockHost,
        borderBoxSize: [{blockSize: 40}],
      } as unknown as ResizeObserverEntry]);

      expect(callbacks.size).toBe(1);
      callbacks.forEach(callback => callback(performance.now()));
      expect(recompute).toHaveBeenCalledTimes(1);
    } finally {
      controller.destroy();
      harness.destroy();
    }
  });

  it("invalidates natural measurements on view scale changes and unsubscribes when disabled", () => {
    const harness = createHarness();
    const controller = new PaginatedViewController(
      harness.doc,
      CONFIG,
      harness.scrollContainer,
    );
    const heightSource = (
      controller as unknown as {
        _heightSource: {
          readonly measurementEpoch: number;
          invalidateNaturalMeasurements(): void;
        };
      }
    )._heightSource;
    const invalidateNaturalMeasurements = spyOn(
      heightSource,
      "invalidateNaturalMeasurements",
    ).and.callThrough();

    try {
      controller.enable();
      // BehaviorSubject's current value is only subscription setup context; it
      // must not manufacture an extra measurement generation on enable.
      expect(invalidateNaturalMeasurements).not.toHaveBeenCalled();

      controller.captureStableLayout();
      invalidateNaturalMeasurements.calls.reset();
      const measurementEpoch = heightSource.measurementEpoch;
      const scheduleRecompute = spyOn(
        controller,
        "scheduleRecompute",
      ).and.callThrough();

      harness.viewScale$.next(1.25);

      expect(heightSource.measurementEpoch).toBe(measurementEpoch + 1);
      expect(invalidateNaturalMeasurements).toHaveBeenCalledTimes(1);
      expect(scheduleRecompute).toHaveBeenCalledTimes(1);
      expect(controller.canReuseStableLayoutForExport).toBeFalse();

      controller.disable();
      invalidateNaturalMeasurements.calls.reset();
      scheduleRecompute.calls.reset();
      const disabledMeasurementEpoch = heightSource.measurementEpoch;

      harness.viewScale$.next(1.5);

      expect(heightSource.measurementEpoch).toBe(disabledMeasurementEpoch);
      expect(invalidateNaturalMeasurements).not.toHaveBeenCalled();
      expect(scheduleRecompute).not.toHaveBeenCalled();
    } finally {
      controller.destroy();
      harness.destroy();
    }
  });

  it("invalidates and schedules every content change so inline page gaps are replayed", () => {
    const harness = createHarness();
    const coordinator = new PaginationLayoutCoordinator(harness.doc);
    const applyContentChange = spyOn(
      coordinator,
      "applyContentChange",
    ).and.callThrough();
    const controller = new PaginatedViewController(
      harness.doc,
      CONFIG,
      harness.scrollContainer,
      coordinator,
    );

    try {
      controller.enable();
      controller.captureStableLayout();
      const requestFrame = spyOn(window, "requestAnimationFrame").and.returnValue(
        101,
      );
      const cancelFrame = spyOn(window, "cancelAnimationFrame").and.stub();

      harness.contentChange$.next(contentChange(["root-block"], ["text"]));
      expect(applyContentChange).toHaveBeenCalledTimes(1);
      expect(controller.captureShadowLayout()).toBeNull();
      expect(requestFrame).toHaveBeenCalledTimes(1);

      harness.contentChange$.next(
        contentChange(["root-block"], ["text", "props"]),
      );
      harness.contentChange$.next(contentChange(["nested"], ["props"]));

      expect(applyContentChange).toHaveBeenCalledTimes(3);
      expect(requestFrame).toHaveBeenCalledTimes(3);
      expect(cancelFrame).toHaveBeenCalledTimes(2);
    } finally {
      controller.destroy();
      harness.destroy();
    }
  });

  it("invalidates affected roots for revision-only presentation changes", () => {
    const harness = createHarness();
    const coordinator = new PaginationLayoutCoordinator(harness.doc);
    const applyPresentationChange = spyOn(
      coordinator,
      "applyPresentationChange",
    ).and.stub();
    const controller = new PaginatedViewController(
      harness.doc,
      CONFIG,
      harness.scrollContainer,
      coordinator,
    );

    try {
      controller.enable();
      const internals = controller as any;
      const invalidateMeasurements = spyOn(
        internals._heightSource,
        "invalidateMeasurements",
      ).and.callThrough();
      const invalidateInlineBreaks = spyOn(
        internals._inlineBreaks,
        "invalidate",
      ).and.callThrough();
      const scheduleRecompute = spyOn(
        controller,
        "scheduleRecompute",
      ).and.stub();

      emitRevisionPresentationChange(harness.revisionManager, ["nested"]);

      expect(invalidateMeasurements).toHaveBeenCalledOnceWith(["root-block"]);
      expect(invalidateInlineBreaks).toHaveBeenCalledOnceWith(["root-block"]);
      expect(applyPresentationChange).toHaveBeenCalledOnceWith(["root-block"]);
      expect(scheduleRecompute).toHaveBeenCalledTimes(1);
    } finally {
      controller.destroy();
      harness.destroy();
    }
  });

  it("keeps normal pagination active while heading props change", () => {
    const harness = createHarness();
    const controller = new PaginatedViewController(
      harness.doc,
      CONFIG,
      harness.scrollContainer,
    );

    try {
      controller.enable();
      expect(controller.captureStableLayout()).not.toBeNull();

      for (const heading of [1, 2, undefined]) {
        harness.setHeading(heading);
        harness.contentChange$.next(contentChange(["root-block"], ["props"]));

        expect(controller.captureStableLayout()).not.toBeNull();
        expect(controller.captureShadowLayout()?.entries[0].isHeading)
          .toBe(heading != null);
        expect(harness.rootHost.classList.contains("bc-paginated")).toBeTrue();
      }

      expect(shadowWarnings(
        harness.logger,
        "paginationShadowLayoutError: ",
      )).toEqual([]);
    } finally {
      controller.destroy();
      harness.destroy();
    }
  });

  it("starts an inline update before natural measurement and applies it after pagination", () => {
    const harness = createHarness();
    const controller = new PaginatedViewController(
      harness.doc,
      CONFIG,
      harness.scrollContainer,
    );
    const internals = controller as unknown as {
      _inlineBreaks: {
        beginUpdate(): {commit(): void; rollback(): void};
        apply(...args: unknown[]): void;
      };
      _heightSource: {measure(...args: unknown[]): unknown};
    };
    const beginUpdate = spyOn(
      internals._inlineBreaks,
      "beginUpdate",
    ).and.callThrough();
    const measure = spyOn(internals._heightSource, "measure").and.callThrough();
    const apply = spyOn(internals._inlineBreaks, "apply").and.callThrough();

    try {
      controller.enable();
      controller.captureStableLayout();

      expect(beginUpdate).toHaveBeenCalled();
      expect(measure).toHaveBeenCalled();
      expect(apply).toHaveBeenCalled();
      const invocationOrder = (call: unknown) =>
        (call as {invocationOrder: number}).invocationOrder;
      expect(invocationOrder(beginUpdate.calls.first()))
        .toBeLessThan(invocationOrder(measure.calls.first()));
      expect(invocationOrder(measure.calls.first()))
        .toBeLessThan(invocationOrder(apply.calls.first()));
    } finally {
      controller.destroy();
      harness.destroy();
    }
  });

  it("keeps the stable DOM/layout pair while a wrapped inline projection is frozen", () => {
    const harness = createHarness();
    const controller = new PaginatedViewController(
      harness.doc,
      CONFIG,
      harness.scrollContainer,
    );

    try {
      controller.enable();
      controller.captureStableLayout();
      const internals = controller as unknown as {
        _stableLayout: unknown;
        _recompute(): unknown;
        _inlineBreaks: {
          deferUpdateWhileProjectionFrozen(): boolean;
          beginUpdate(): {commit(): void; rollback(): void};
        };
        _heightSource: {measure(...args: unknown[]): unknown};
      };
      const stable = internals._stableLayout;
      spyOn(
        internals._inlineBreaks,
        "deferUpdateWhileProjectionFrozen",
      ).and.returnValue(true);
      const beginUpdate = spyOn(
        internals._inlineBreaks,
        "beginUpdate",
      ).and.callThrough();
      const measure = spyOn(internals._heightSource, "measure").and.callThrough();

      expect(internals._recompute()).toBe(stable);
      expect(beginUpdate).not.toHaveBeenCalled();
      expect(measure).not.toHaveBeenCalled();
      expect(controller.canReuseStableLayoutForExport).toBeFalse();
    } finally {
      controller.destroy();
      harness.destroy();
    }
  });

  it("publishes an atomic stable fallback when inline continuation projection fails", () => {
    const harness = createHarness();
    const controller = new PaginatedViewController(
      harness.doc,
      CONFIG,
      harness.scrollContainer,
    );
    const internals = controller as unknown as {
      _heightSource: {measure(...args: unknown[]): unknown};
      _inlineBreaks: {
        apply(...args: unknown[]): ReadonlySet<string>;
      };
    };
    spyOn(internals._heightSource, "measure").and.returnValue([{
      id: "root-block",
      flavour: "paragraph",
      nodeType: BlockNodeType.editable,
      isHeading: false,
      naturalHeight: 400,
      height: 400,
      splitOffsets: [100, 200, 300],
      inlineBreakPlan: {
        points: [
          {layoutOffset: 100, textOffset: 5},
          {layoutOffset: 200, textOffset: 10},
          {layoutOffset: 300, textOffset: 15},
        ],
      },
    }]);
    const apply = spyOn(internals._inlineBreaks, "apply").and.returnValues(
      new Set(["root-block"]),
      new Set(),
    );

    try {
      controller.enable();
      const layout = controller.captureStableLayout();

      expect(apply).toHaveBeenCalledTimes(2);
      expect(layout?.items[0]?.breakable).toBeFalse();
      expect(layout?.items[0]?.splitOffsets).toBeUndefined();
      expect(layout?.result.pages[0]?.slots[0]?.id).toBe("root-block");
      expect(layout?.result.pages[0]?.slots[0]?.fragment).toBeUndefined();
      expect(controller.canReuseStableLayoutForExport).toBeFalse();
    } finally {
      controller.destroy();
      harness.destroy();
    }
  });

  it("falls back atomically when oversized text has no live line anchors", () => {
    const harness = createHarness();
    const controller = new PaginatedViewController(
      harness.doc,
      CONFIG,
      harness.scrollContainer,
    );
    const internals = controller as unknown as {
      _heightSource: {measure(...args: unknown[]): unknown};
    };
    spyOn(internals._heightSource, "measure").and.returnValue([{
      id: "root-block",
      flavour: "paragraph",
      nodeType: BlockNodeType.editable,
      isHeading: false,
      naturalHeight: 400,
      height: 400,
    }]);

    try {
      controller.enable();
      const layout = controller.captureStableLayout();

      expect(layout?.items[0]?.breakable).toBeFalse();
      expect(layout?.result.pages[0]?.slots[0]?.fragment).toBeUndefined();
      expect(controller.canReuseStableLayoutForExport).toBeFalse();
    } finally {
      controller.destroy();
      harness.destroy();
    }
  });

  it("rolls back the inline update when a later view applier throws", () => {
    const harness = createHarness();
    const controller = new PaginatedViewController(
      harness.doc,
      CONFIG,
      harness.scrollContainer,
    );
    const commit = jasmine.createSpy("commit");
    const rollback = jasmine.createSpy("rollback");
    const internals = controller as unknown as {
      _inlineBreaks: {
        beginUpdate(): {commit(): void; rollback(): void};
      };
      _tableBreaks: {apply(...args: unknown[]): void};
    };
    spyOn(internals._inlineBreaks, "beginUpdate").and.returnValue({
      commit,
      rollback,
    });
    spyOn(internals._tableBreaks, "apply").and.throwError("forced table failure");

    try {
      controller.enable();

      expect(() => controller.captureStableLayout()).toThrowError(
        "forced table failure",
      );
      expect(commit).not.toHaveBeenCalled();
      expect(rollback).toHaveBeenCalledTimes(1);
      expect(controller.canReuseStableLayoutForExport).toBeFalse();
    } finally {
      controller.destroy();
      harness.destroy();
    }
  });

  it("coalesces direct and nested props into one frame and one root revision", () => {
    const harness = createHarness();
    const controller = new PaginatedViewController(
      harness.doc,
      CONFIG,
      harness.scrollContainer,
    );

    try {
      controller.enable();
      controller.captureStableLayout();
      const callbacks: FrameRequestCallback[] = [];
      const requestFrame = spyOn(window, "requestAnimationFrame").and.callFake(
        (callback: FrameRequestCallback) => {
          callbacks.push(callback);
          return callbacks.length;
        },
      );
      const syncObserved = spyOn(
        (controller as unknown as { _heightSource: { syncObserved(): void } })
          ._heightSource,
        "syncObserved",
      ).and.callThrough();

      harness.onPropsUpdate$.next();
      expect(requestFrame).not.toHaveBeenCalled();

      harness.onChildrenUpdate$.next();
      expect(syncObserved).toHaveBeenCalledTimes(1);
      expect(requestFrame).not.toHaveBeenCalled();

      harness.contentChange$.next(
        contentChange(["root-block", "nested"], ["props"]),
      );
      expect(requestFrame).toHaveBeenCalledTimes(1);
      callbacks[0]!(performance.now());

      expect(controller.captureShadowLayout()?.entries[0]).toEqual(
        jasmine.objectContaining({ contentRevision: 1 }),
      );
    } finally {
      controller.destroy();
      harness.destroy();
    }
  });

  it("invalidates measurement for text-layout context changes, but not page gap", () => {
    const harness = createHarness();
    const addFontListener = spyOn(
      harness.scrollContainer.ownerDocument.fonts,
      "addEventListener",
    ).and.callThrough();
    const controller = new PaginatedViewController(
      harness.doc,
      CONFIG,
      harness.scrollContainer,
    );

    try {
      controller.enable();
      controller.captureStableLayout();
      const initial = controller.captureShadowLayout()!;

      controller.updateConfig({pageGap: 48});
      controller.captureStableLayout();
      expect(controller.captureShadowLayout()!.geometryRevision).toBe(
        initial.geometryRevision,
      );

      controller.updateConfig({pageSize: { width: 400, height: 300 }});
      controller.captureStableLayout();
      const afterHeight = controller.captureShadowLayout()!;
      expect(afterHeight.geometryRevision).toBeGreaterThan(
        initial.geometryRevision,
      );

      controller.updateConfig({widowOrphanLines: 3});
      controller.captureStableLayout();
      const afterWidowOrphan = controller.captureShadowLayout()!;
      expect(afterWidowOrphan.geometryRevision).toBeGreaterThan(
        afterHeight.geometryRevision,
      );

      controller.updateConfig({ pageSize: { width: 420, height: 300 } });
      controller.captureStableLayout();
      const afterWidth = controller.captureShadowLayout()!;
      expect(afterWidth.geometryRevision).toBeGreaterThan(
        afterWidowOrphan.geometryRevision,
      );

      (harness.doc.config as { theme?: string }).theme = "dark";
      harness.themeChange$.next("ignored-payload");
      controller.captureStableLayout();
      const afterTheme = controller.captureShadowLayout()!;
      expect(afterTheme.geometryRevision).toBeGreaterThan(
        afterWidth.geometryRevision,
      );

      harness.themeChange$.next("another-ignored-payload");
      controller.captureStableLayout();
      expect(controller.captureShadowLayout()!.geometryRevision).toBe(
        afterTheme.geometryRevision,
      );

      const fontCallback = addFontListener.calls
        .allArgs()
        .find(([type]) => type === "loadingdone")?.[1] as EventListener;
      expect(fontCallback).toBeDefined();
      fontCallback.call(
        harness.scrollContainer.ownerDocument.fonts,
        new Event("loadingdone"),
      );
      controller.captureStableLayout();
      expect(
        controller.captureShadowLayout()!.geometryRevision,
      ).toBeGreaterThan(afterTheme.geometryRevision);
    } finally {
      controller.destroy();
      harness.destroy();
    }
  });

  it("isolates and deduplicates a throwing document fonts getter", () => {
    const harness = createHarness();
    const ownerDocument = {} as Document;
    Object.defineProperty(ownerDocument, "fonts", {
      configurable: true,
      get: () => {
        throw new Error("forced fonts getter failure");
      },
    });
    Object.defineProperty(harness.scrollContainer, "ownerDocument", {
      configurable: true,
      value: ownerDocument,
    });
    const controller = new PaginatedViewController(
      harness.doc,
      CONFIG,
      harness.scrollContainer,
    );
    const internals = controller as unknown as {_addFontListener(): void};

    try {
      expect(() => controller.enable()).not.toThrow();
      expect(() => internals._addFontListener()).not.toThrow();
      expect(
        shadowWarnings(harness.logger, "paginationShadowLayoutError: "),
      ).toHaveSize(1);

      const legacy = controller.captureStableLayout();
      expect(legacy).not.toBeNull();
      expect(
        harness.scrollContainer.querySelectorAll(".bc-page-sheet").length,
      ).toBe(legacy!.result.pages.length);
    } finally {
      controller.destroy();
      harness.destroy();
    }
  });

  it("tears down font and frame resources symmetrically across lifecycle", () => {
    const harness = createHarness();
    const fonts = harness.scrollContainer.ownerDocument.fonts;
    const addFontListener = spyOn(fonts, "addEventListener").and.callThrough();
    const removeFontListener = spyOn(
      fonts,
      "removeEventListener",
    ).and.callThrough();
    const cancelFrame = spyOn(window, "cancelAnimationFrame").and.callThrough();
    const coordinator = new PaginationLayoutCoordinator(harness.doc);
    const dispose = spyOn(coordinator, "dispose").and.callThrough();
    const controller = new PaginatedViewController(
      harness.doc,
      CONFIG,
      harness.scrollContainer,
      coordinator,
    );

    try {
      controller.enable();
      controller.enable();
      controller.captureStableLayout();
      expect(
        addFontListener.calls
          .allArgs()
          .filter(([type]) => type === "loadingdone"),
      ).toHaveSize(1);
      expect(controller.captureShadowLayout()).not.toBeNull();

      controller.scheduleRecompute();
      controller.disable();
      const firstAddedCallback = addFontListener.calls.argsFor(0)[1];
      const firstRemovedCallback = removeFontListener.calls.argsFor(0)[1];
      expect(firstRemovedCallback).toBe(firstAddedCallback);
      expect(cancelFrame).toHaveBeenCalled();
      expect(controller.captureShadowLayout()).toBeNull();
      expect(dispose).not.toHaveBeenCalled();

      controller.enable();
      controller.captureStableLayout();
      expect(
        addFontListener.calls
          .allArgs()
          .filter(([type]) => type === "loadingdone"),
      ).toHaveSize(2);
      expect(controller.captureShadowLayout()).not.toBeNull();

      controller.destroy();
      controller.destroy();
      expect(dispose).toHaveBeenCalledTimes(1);
      expect(
        removeFontListener.calls
          .allArgs()
          .filter(([type]) => type === "loadingdone"),
      ).toHaveSize(2);
    } finally {
      controller.destroy();
      harness.destroy();
    }
  });

  it("deduplicates mismatches while legacy DOM remains authoritative", () => {
    const harness = createHarness();
    const controller = new PaginatedViewController(
      harness.doc,
      CONFIG,
      harness.scrollContainer,
      mismatchCoordinator(harness.doc),
    );

    try {
      controller.enable();
      const firstLegacy = controller.captureStableLayout()!;
      controller.captureStableLayout();

      expect(
        shadowWarnings(harness.logger, "paginationShadowMismatch: "),
      ).toHaveSize(1);
      expect(controller.captureShadowLayout()!.result.pages.length).toBe(
        firstLegacy.result.pages.length + 1,
      );
      expect(
        harness.scrollContainer.querySelectorAll(".bc-page-sheet"),
      ).toHaveSize(firstLegacy.result.pages.length);
      expect(harness.rootHost.classList.contains("bc-paginated")).toBeTrue();

      controller.disable();
      controller.enable();
      controller.captureStableLayout();
      expect(
        shadowWarnings(harness.logger, "paginationShadowMismatch: "),
      ).toHaveSize(2);
    } finally {
      controller.destroy();
      harness.destroy();
    }
  });

  it("drops a stale ticket, reschedules, and still applies legacy DOM", () => {
    const harness = createHarness();
    const delegate = new PaginationLayoutCoordinator(harness.doc);
    const compute = jasmine.createSpy("compute");
    const staleCoordinator = {
      get geometryRevision() {
        return delegate.geometryRevision;
      },
      syncRootOrder: () => delegate.syncRootOrder(),
      applyContentChange: (change: IBlockModelContentChange) =>
        delegate.applyContentChange(change),
      applyStructureChange: (change: IBlockModelStructureChange) =>
        delegate.applyStructureChange(change),
      updateMeasureContext: (
        context: Parameters<
          PaginationLayoutCoordinator["updateMeasureContext"]
        >[0],
      ) => delegate.updateMeasureContext(context),
      setRequiredMeasurementEpoch: (epoch: number) =>
        delegate.setRequiredMeasurementEpoch(epoch),
      applyMeasured: () => ({accepted: false, changed: false}),
      compute,
      dispose: () => delegate.dispose(),
    } as unknown as PaginationLayoutCoordinator;
    const controller = new PaginatedViewController(
      harness.doc,
      CONFIG,
      harness.scrollContainer,
      staleCoordinator,
    );
    const requestFrame = spyOn(window, "requestAnimationFrame").and.returnValue(
      101,
    );

    try {
      controller.enable();
      requestFrame.calls.reset();
      const legacy = controller.captureStableLayout();

      expect(legacy).not.toBeNull();
      expect(controller.captureShadowLayout()).toBeNull();
      expect(compute).not.toHaveBeenCalled();
      expect(requestFrame).toHaveBeenCalledTimes(1);
      expect(
        harness.scrollContainer.querySelectorAll(".bc-page-sheet").length,
      ).toBe(legacy!.result.pages.length);
    } finally {
      controller.destroy();
      harness.destroy();
    }
  });

  it("isolates shadow errors and continues every legacy applier", () => {
    const harness = createHarness();
    const delegate = new PaginationLayoutCoordinator(harness.doc);
    const failingCoordinator = {
      get geometryRevision() {
        return delegate.geometryRevision;
      },
      syncRootOrder: () => delegate.syncRootOrder(),
      applyContentChange: (change: IBlockModelContentChange) =>
        delegate.applyContentChange(change),
      applyStructureChange: (change: IBlockModelStructureChange) =>
        delegate.applyStructureChange(change),
      updateMeasureContext: (
        context: Parameters<
          PaginationLayoutCoordinator["updateMeasureContext"]
        >[0],
      ) => delegate.updateMeasureContext(context),
      setRequiredMeasurementEpoch: (epoch: number) =>
        delegate.setRequiredMeasurementEpoch(epoch),
      applyMeasured: (
        measurements: readonly PaginationGeometryMeasurement[],
        revision: number,
        measurementEpoch: number,
      ) => delegate.applyMeasured(measurements, revision, measurementEpoch),
      compute: () => {
        throw {
          toString: () => {
            throw new Error("forced stringify failure");
          },
        };
      },
      dispose: () => delegate.dispose(),
    } as unknown as PaginationLayoutCoordinator;
    const controller = new PaginatedViewController(
      harness.doc,
      CONFIG,
      harness.scrollContainer,
      failingCoordinator,
    );
    const internals = controller as unknown as {
      _frameLayer: {render(input: unknown): void};
      _gapApplier: {apply(gaps: Map<string, number>): void};
      _tableBreaks: {apply(...args: unknown[]): void};
      _heightLockApplier: {apply(ids: ReadonlySet<string>): void};
    };
    const renderFrame = spyOn(internals._frameLayer, "render").and.callThrough();
    const applyGap = spyOn(internals._gapApplier, "apply").and.callThrough();
    const applyTableBreaks = spyOn(
      internals._tableBreaks,
      "apply",
    ).and.callThrough();
    const applyHeightLock = spyOn(
      internals._heightLockApplier,
      "apply",
    ).and.callThrough();
    harness.logger.warn.and.throwError("logger failed");

    try {
      controller.enable();
      let legacy: ReturnType<PaginatedViewController["captureStableLayout"]>;
      expect(() => {
        legacy = controller.captureStableLayout();
      }).not.toThrow();
      expect(() => controller.captureStableLayout()).not.toThrow();

      expect(controller.captureShadowLayout()).toBeNull();
      expect(
        shadowWarnings(harness.logger, "paginationShadowLayoutError: "),
      ).toHaveSize(1);
      expect(renderFrame).toHaveBeenCalledTimes(2);
      expect(applyGap).toHaveBeenCalledTimes(2);
      expect(applyTableBreaks).toHaveBeenCalledTimes(2);
      expect(applyHeightLock).toHaveBeenCalledTimes(2);
      expect(
        harness.scrollContainer.querySelectorAll(".bc-page-sheet"),
      ).toHaveSize(legacy!.result.pages.length);
      expect(harness.rootHost.classList.contains("bc-paginated")).toBeTrue();
    } finally {
      controller.destroy();
      harness.destroy();
    }
  });

  it("isolates mismatch signature failures after legacy rendering", () => {
    const harness = createHarness();
    const controller = new PaginatedViewController(
      harness.doc,
      CONFIG,
      harness.scrollContainer,
      mismatchCoordinator(harness.doc),
    );
    const internals = controller as unknown as {
      _frameLayer: {render(input: unknown): void};
      _createShadowMismatchSignature(): string;
    };
    const renderFrame = spyOn(internals._frameLayer, "render").and.callThrough();
    spyOn(internals, "_createShadowMismatchSignature").and.throwError(
      "forced signature failure",
    );

    try {
      controller.enable();
      expect(() => controller.captureStableLayout()).not.toThrow();

      expect(renderFrame).toHaveBeenCalledTimes(1);
      expect(controller.captureShadowLayout()).toBeNull();
      expect(
        shadowWarnings(harness.logger, "paginationShadowLayoutError: "),
      ).toHaveSize(1);
    } finally {
      controller.destroy();
      harness.destroy();
    }
  });

  it("isolates coordinator disposal from controller destruction", () => {
    const harness = createHarness();
    const coordinator = new PaginationLayoutCoordinator(harness.doc);
    const dispose = spyOn(coordinator, "dispose").and.throwError(
      "forced dispose failure",
    );
    const controller = new PaginatedViewController(
      harness.doc,
      CONFIG,
      harness.scrollContainer,
      coordinator,
    );

    try {
      controller.enable();
      controller.captureStableLayout();
      expect(() => controller.destroy()).not.toThrow();
      expect(dispose).toHaveBeenCalledTimes(1);
      expect(harness.rootHost.classList.contains("bc-paginated")).toBeFalse();
    } finally {
      controller.destroy();
      harness.destroy();
    }
  });
});
