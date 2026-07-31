import {ErrorCode} from "../../global";
import {fakeAsync, flushMicrotasks} from "@angular/core/testing";
import {BlockNodeType, NativeBlockModel, YBlock, native2YBlock} from "../block-std";
import {BehaviorSubject, Subject} from "rxjs";
import * as Y from "yjs";
import {
  BlockLockError,
  BlockReadonlyError,
  BlockReadonlyOperation,
  BlockUnlockContext,
} from "./block-readonly.types";
import {BlockModelGraph} from "./model-graph";
import {BlockReadonlyManager} from "./block-readonly-manager";
import {ORIGIN_BLOCK_READONLY_CONTROL} from "./origins";

function structuralBlock(
  id: string,
  children: string[],
  nodeType: BlockNodeType.block | BlockNodeType.root = BlockNodeType.block,
): YBlock {
  return native2YBlock({
    id,
    flavour: nodeType === BlockNodeType.root ? "root" : "frame",
    nodeType,
    props: {},
    meta: {},
    children,
  } as NativeBlockModel);
}

function editableBlock(id: string): YBlock {
  return native2YBlock({
    id,
    flavour: "paragraph",
    nodeType: BlockNodeType.editable,
    props: {depth: 0},
    meta: {},
    children: [],
  } as unknown as NativeBlockModel);
}

function createReadonlyHarness(
  config: {
    currentUserId?: string;
    defaultBlockLockKind?: "user" | "template";
    canUnlockBlock?: (context: BlockUnlockContext) => boolean;
  } = {currentUserId: "user-1"},
) {
  const yDoc = new Y.Doc();
  const yBlockMap = yDoc.getMap<YBlock>("blocks");
  const readonlySwitch$ = new BehaviorSubject(false);
  const onMetaUpdate$ = new Subject<any>();
  const afterInitCallbacks: Array<() => void> = [];
  const destroyCallbacks: Array<() => void> = [];
  const transactionOrigins: unknown[] = [];
  const doc: any = {
    config,
    logger: {warn: jasmine.createSpy("logger.warn")},
    yDoc,
    yBlockMap,
    readonlySwitch$,
    onMetaUpdate$,
    rootId: "root",
    vm: {get: jasmine.createSpy("vm.get").and.returnValue(undefined)},
    crud: {
      transact: (fn: () => void, origin?: unknown) => {
        transactionOrigins.push(origin);
        return yDoc.transact(fn, origin);
      },
    },
    afterInit: (fn: () => void) => afterInitCallbacks.push(fn),
    onDestroy: (fn: () => void) => destroyCallbacks.push(fn),
  };
  Object.defineProperty(doc, "isReadonly", {get: () => readonlySwitch$.value});
  doc.model = new BlockModelGraph(doc as BlockCraft.Doc);

  const blocks = {
    root: structuralBlock("root", ["root-a", "root-b"], BlockNodeType.root),
    "root-a": structuralBlock("root-a", ["callout"]),
    callout: structuralBlock("callout", ["p-in"]),
    "p-in": editableBlock("p-in"),
    "root-b": structuralBlock("root-b", ["offscreen-p"]),
    "offscreen-p": editableBlock("offscreen-p"),
  };
  Object.entries(blocks).forEach(([id, block]) => yBlockMap.set(id, block));
  doc.model.build("root");
  const manager = new BlockReadonlyManager(doc as BlockCraft.Doc);
  afterInitCallbacks.forEach(fn => fn());

  const yMeta = (id: string) => yBlockMap.get(id)!.get("meta") as Y.Map<unknown>;
  const move = (blockId: string, fromParent: string, toParent: string) => {
    yDoc.transact(() => {
      const from = yBlockMap.get(fromParent)!.get("children") as Y.Array<string>;
      const to = yBlockMap.get(toParent)!.get("children") as Y.Array<string>;
      const index = from.toArray().indexOf(blockId);
      from.delete(index, 1);
      to.insert(to.length, [blockId]);
    });
  };

  return {
    doc,
    manager,
    move,
    onMetaUpdate$,
    transactionOrigins,
    yMeta,
    yDoc,
    yBlockMap,
    readonlySwitch$,
  };
}

function createLargeReadonlyHarness() {
  const yDoc = new Y.Doc();
  const yBlockMap = yDoc.getMap<YBlock>("blocks");
  const readonlySwitch$ = new BehaviorSubject(false);
  const afterInitCallbacks: Array<() => void> = [];
  const doc: any = {
    config: {currentUserId: "user-1"},
    logger: {warn: jasmine.createSpy("logger.warn")},
    yDoc,
    yBlockMap,
    readonlySwitch$,
    onMetaUpdate$: new Subject<any>(),
    rootId: "root",
    vm: {has: () => false, get: () => undefined},
    crud: {transact: (fn: () => void, origin?: unknown) => yDoc.transact(fn, origin)},
    afterInit: (fn: () => void) => afterInitCallbacks.push(fn),
    onDestroy: () => undefined,
  };
  Object.defineProperty(doc, "isReadonly", {get: () => readonlySwitch$.value});

  const branchIds = Array.from({length: 100}, (_, index) => `branch-${index}`);
  yBlockMap.set("root", structuralBlock("root", branchIds, BlockNodeType.root));
  branchIds.forEach((branchId, branchIndex) => {
    // root + 100 branches + 9,899 leaves = exactly 10,000 reachable blocks.
    const leafCount = branchIndex === branchIds.length - 1 ? 98 : 99;
    const leafIds = Array.from({length: leafCount}, (_, leafIndex) =>
      `leaf-${branchIndex}-${leafIndex}`,
    );
    const branch = structuralBlock(branchId, leafIds);
    yBlockMap.set(branchId, branch);
    (branch.get("meta") as Y.Map<unknown>).set("lock", "user-1");
    leafIds.forEach(leafId => yBlockMap.set(leafId, editableBlock(leafId)));
  });

  doc.model = new BlockModelGraph(doc as BlockCraft.Doc);
  doc.model.build("root");
  const manager = new BlockReadonlyManager(doc as BlockCraft.Doc);
  afterInitCallbacks.forEach(fn => fn());

  const moveLastBranchUnderFirst = () => {
    yDoc.transact(() => {
      const rootChildren = yBlockMap.get("root")!.get("children") as Y.Array<string>;
      const targetChildren = yBlockMap.get("branch-0")!.get("children") as Y.Array<string>;
      const movedId = "branch-99";
      rootChildren.delete(rootChildren.toArray().indexOf(movedId), 1);
      targetChildren.insert(targetChildren.length, [movedId]);
    });
  };

  return {doc, manager, moveLastBranchUnderFirst};
}

describe("Block readonly public contract", () => {
  it("exposes a typed readonly error without leaking document content", () => {
    const error = new BlockReadonlyError({
      operation: BlockReadonlyOperation.Delete,
      blockIds: ["locked-1"],
      source: {kind: "self", blockId: "locked-1"},
    });

    expect(error.code).toBe(ErrorCode.BlockReadonlyError);
    expect(error.blockIds).toEqual(["locked-1"]);
    expect(error.message).not.toContain("document text");
  });

  it("exposes a typed lock-control error without leaking the lock owner", () => {
    const error = new BlockLockError({
      operation: BlockReadonlyOperation.Unlock,
      reason: "unauthorized",
      blockId: "locked-1",
      lockUserId: "private-user-id",
    });

    expect(error.code).toBe(ErrorCode.BlockReadonlyError);
    expect(error.reason).toBe("unauthorized");
    expect(error.lockUserId).toBe("private-user-id");
    expect(error.message).not.toContain("private-user-id");
  });
});

describe("BlockReadonlyManager", () => {
  it("publishes structural state changes after model-to-view observers finish", fakeAsync(() => {
    const {manager, yDoc, yBlockMap} = createReadonlyHarness();
    let viewSynced = false;
    const observedViewStates: boolean[] = [];
    const viewObserver = () => {
      viewSynced = true;
    };
    yBlockMap.observeDeep(viewObserver);
    const subscription = manager.stateChange$.subscribe(() => {
      observedViewStates.push(viewSynced);
    });

    yDoc.transact(() => {
      const children = yBlockMap.get("root-a")!.get("children") as Y.Array<string>;
      children.delete(0, 1);
    });

    expect(observedViewStates).toEqual([]);
    flushMicrotasks();
    expect(observedViewStates).toEqual([true]);

    subscription.unsubscribe();
    yBlockMap.unobserveDeep(viewObserver);
  }));

  it("fails closed when a readonly query observes a selection whose block was just removed", () => {
    const {manager} = createReadonlyHarness();
    const staleSelection = {
      getBoundarySelectedChildIds: () => null,
      isInSameBlock: true,
      start: {blockId: "removed-block", type: "selected"},
      end: {blockId: "removed-block", type: "selected"},
    } as unknown as BlockCraft.Selection;

    expect(() => manager.isSelectionReadonly(staleSelection)).not.toThrow();
    expect(manager.isSelectionReadonly(staleSelection)).toBeTrue();
  });

  it("resolves cross-block selection readonly state from the model without mounted block references", () => {
    const {manager} = createReadonlyHarness();
    manager.set("root-b", true);
    const selection = {
      getBoundarySelectedChildIds: () => null,
      isInSameBlock: false,
      start: {blockId: "p-in", type: "text", offset: 0},
      end: {blockId: "offscreen-p", type: "text", offset: 0},
      get firstBlock(): never {
        throw new Error("selection readonly query must not resolve mounted blocks");
      },
      get lastBlock(): never {
        throw new Error("selection readonly query must not resolve mounted blocks");
      },
    } as unknown as BlockCraft.Selection;

    expect(manager.isSelectionReadonly(selection)).toBeTrue();
  });

  it("keeps 10,000-block permission queries model-only and cache bounded", () => {
    const {doc, manager, moveLastBranchUnderFirst} = createLargeReadonlyHarness();
    const pathSpy = spyOn(doc.model, "getPath").and.callThrough();
    const rectSpy = spyOn(Element.prototype, "getBoundingClientRect");
    const clientRectsSpy = spyOn(Element.prototype, "getClientRects");

    for (let index = 0; index < 10_000; index++) {
      expect(manager.isReadonly("leaf-0-0")).toBeTrue();
    }

    expect(pathSpy).toHaveBeenCalledTimes(1);
    expect(rectSpy).not.toHaveBeenCalled();
    expect(clientRectsSpy).not.toHaveBeenCalled();
    expect((manager as unknown as {parentById?: unknown}).parentById).toBeUndefined();

    moveLastBranchUnderFirst();
    pathSpy.calls.reset();
    expect(manager.containsReadonly("branch-0")).toBeTrue();
    // One path per explicit lock rebuilds the derived counts; no 10,000-node scan.
    expect(pathSpy).toHaveBeenCalledTimes(100);

    pathSpy.calls.reset();
    for (let index = 0; index < 10_000; index++) {
      expect(manager.isReadonly("leaf-99-0")).toBeTrue();
    }
    expect(pathSpy).toHaveBeenCalledTimes(1);
    expect(rectSpy).not.toHaveBeenCalled();
    expect(clientRectsSpy).not.toHaveBeenCalled();
  });

  it("resolves the nearest ancestor lock and updates descendant counts after move", () => {
    const {manager, move} = createReadonlyHarness();
    manager.set("callout", true);

    expect(manager.resolve("p-in")).toEqual({
      readonly: true,
      source: {kind: "ancestor", blockId: "callout"},
      lockUserId: "user-1",
      lockKind: "user",
    });
    expect(manager.containsReadonly("root-a")).toBeTrue();

    move("callout", "root-a", "root-b");

    expect(manager.containsReadonly("root-a")).toBeFalse();
    expect(manager.containsReadonly("root-b")).toBeTrue();
  });

  it("controls a reachable block without resolving a mounted component", () => {
    const {doc, manager, transactionOrigins, yMeta} = createReadonlyHarness();

    manager.set("offscreen-p", true);

    expect(doc.vm.get).not.toHaveBeenCalled();
    expect(yMeta("offscreen-p").get("lock")).toBe("user-1");
    expect(transactionOrigins.at(-1)).toBe(ORIGIN_BLOCK_READONLY_CONTROL);
    expect(manager.resolve("offscreen-p").source).toEqual({
      kind: "self",
      blockId: "offscreen-p",
    });
  });

  it("lets only the owner unlock and prevents lock ownership takeover", () => {
    const {manager, onMetaUpdate$, yMeta} = createReadonlyHarness({
      currentUserId: "user-2",
    });
    yMeta("offscreen-p").set("lock", "user-1");
    onMetaUpdate$.next({
      transactions: [{
        blockId: "offscreen-p",
        changes: new Map([["lock", {oldValue: undefined, action: "add"}]]),
      }],
    });

    expect(manager.canLock("offscreen-p")).toBeFalse();
    expect(manager.canUnlock("offscreen-p")).toBeFalse();
    expect(() => manager.set("offscreen-p", true))
      .toThrowError(BlockLockError);
    expect(() => manager.set("offscreen-p", false))
      .toThrowError(BlockLockError);
    expect(yMeta("offscreen-p").get("lock")).toBe("user-1");
  });

  it("allows the owner or an additionally authorized host policy to unlock", () => {
    const owner = createReadonlyHarness({currentUserId: "user-1"});
    owner.manager.set("offscreen-p", true);
    expect(owner.manager.canUnlock("offscreen-p")).toBeTrue();
    owner.manager.set("offscreen-p", false);
    expect(owner.yMeta("offscreen-p").has("lock")).toBeFalse();

    const policy = jasmine.createSpy("canUnlockBlock").and.returnValue(true);
    const admin = createReadonlyHarness({
      currentUserId: "admin-1",
      canUnlockBlock: policy,
    });
    admin.yMeta("offscreen-p").set("lock", "user-1");
    admin.onMetaUpdate$.next({
      transactions: [{
        blockId: "offscreen-p",
        changes: new Map([["lock", {oldValue: undefined, action: "add"}]]),
      }],
    });

    expect(admin.manager.canUnlock("offscreen-p")).toBeTrue();
    admin.manager.set("offscreen-p", false);
    expect(policy).toHaveBeenCalledWith({
      blockId: "offscreen-p",
      lockUserId: "user-1",
      lockKind: "user",
      currentUserId: "admin-1",
    });
    expect(admin.yMeta("offscreen-p").has("lock")).toBeFalse();
  });

  it("persists template lock kind and requires explicit host authorization to unlock", () => {
    const owner = createReadonlyHarness({currentUserId: "user-1"});
    owner.manager.set("offscreen-p", true, {kind: "template"});

    expect(owner.yMeta("offscreen-p").get("lock")).toBe("user-1");
    expect(owner.yMeta("offscreen-p").get("lockKind")).toBe("template");
    expect(owner.manager.resolve("offscreen-p")).toEqual({
      readonly: true,
      source: {kind: "self", blockId: "offscreen-p"},
      lockUserId: "user-1",
      lockKind: "template",
    });
    expect(owner.manager.canUnlock("offscreen-p")).toBeFalse();
    expect(() => owner.manager.set("offscreen-p", false))
      .toThrowError(BlockLockError);

    const policy = jasmine.createSpy("canUnlockBlock").and.callFake(
      (context: BlockUnlockContext) =>
        context.lockKind === "template"
        && context.currentUserId === context.lockUserId,
    );
    const authoring = createReadonlyHarness({
      currentUserId: "user-1",
      canUnlockBlock: policy,
    });
    authoring.manager.set("offscreen-p", true, {kind: "template"});

    expect(authoring.manager.canUnlock("offscreen-p")).toBeTrue();
    authoring.manager.set("offscreen-p", false);
    expect(policy).toHaveBeenCalledWith({
      blockId: "offscreen-p",
      lockUserId: "user-1",
      lockKind: "template",
      currentUserId: "user-1",
    });
    expect(authoring.yMeta("offscreen-p").has("lock")).toBeFalse();
    expect(authoring.yMeta("offscreen-p").has("lockKind")).toBeFalse();
  });

  it("uses the document default kind for generic lock controls", () => {
    const authoring = createReadonlyHarness({
      currentUserId: "user-1",
      defaultBlockLockKind: "template",
    });

    authoring.manager.set("offscreen-p", true);

    expect(authoring.yMeta("offscreen-p").get("lockKind")).toBe("template");
    expect(authoring.manager.resolve("offscreen-p").lockKind).toBe("template");
  });

  it("captures the current user identity when the document manager is constructed", () => {
    const harness = createReadonlyHarness({currentUserId: "user-1"});
    harness.doc.config.currentUserId = "user-2";

    harness.manager.set("offscreen-p", true);

    expect(harness.yMeta("offscreen-p").get("lock")).toBe("user-1");
    expect(harness.manager.currentUserId).toBe("user-1");
  });

  it("fails closed when identity is missing or the host policy throws", () => {
    const anonymous = createReadonlyHarness({});
    expect(anonymous.manager.canLock("offscreen-p")).toBeFalse();
    expect(() => anonymous.manager.set("offscreen-p", true))
      .toThrowError(BlockLockError);

    anonymous.yMeta("offscreen-p").set("lock", "user-1");
    anonymous.onMetaUpdate$.next({
      transactions: [{
        blockId: "offscreen-p",
        changes: new Map([["lock", {oldValue: undefined, action: "add"}]]),
      }],
    });
    expect(() => anonymous.manager.set("offscreen-p", false))
      .toThrowError(BlockLockError);

    const policyFailure = createReadonlyHarness({
      currentUserId: "admin-1",
      canUnlockBlock: () => {
        throw new Error("policy unavailable");
      },
    });
    policyFailure.yMeta("offscreen-p").set("lock", "user-1");
    policyFailure.onMetaUpdate$.next({
      transactions: [{
        blockId: "offscreen-p",
        changes: new Map([["lock", {oldValue: undefined, action: "add"}]]),
      }],
    });
    expect(policyFailure.manager.canUnlock("offscreen-p")).toBeFalse();
    expect(policyFailure.doc.logger.warn).toHaveBeenCalled();
  });

  it("ignores legacy readonly and invalid lock metadata", () => {
    const {manager, onMetaUpdate$, yMeta} = createReadonlyHarness();
    yMeta("offscreen-p").set("readonly", true);
    yMeta("p-in").set("lock", true);
    onMetaUpdate$.next({
      transactions: [{
        blockId: "p-in",
        changes: new Map([["lock", {oldValue: undefined, action: "add"}]]),
      }],
    });

    expect(manager.isReadonly("offscreen-p")).toBeFalse();
    expect(manager.isReadonly("p-in")).toBeFalse();
  });

  it("falls back unknown lock kinds to user locks and cleans orphan kinds", () => {
    const {manager, onMetaUpdate$, yMeta} = createReadonlyHarness();
    yMeta("offscreen-p").set("lock", "user-1");
    yMeta("offscreen-p").set("lockKind", "future-kind");
    onMetaUpdate$.next({
      transactions: [{
        blockId: "offscreen-p",
        changes: new Map([
          ["lock", {oldValue: undefined, action: "add"}],
          ["lockKind", {oldValue: undefined, action: "add"}],
        ]),
      }],
    });

    expect(manager.resolve("offscreen-p").lockKind).toBe("user");

    yMeta("p-in").set("lockKind", "template");
    manager.set("p-in", false);
    expect(yMeta("p-in").has("lockKind")).toBeFalse();
    expect(manager.isReadonly("p-in")).toBeFalse();
  });

  it("rejects persistent locking of the root block", () => {
    const {manager} = createReadonlyHarness();

    expect(() => manager.set("root", true)).toThrowError(BlockLockError);
  });

  it("applies remote metadata changes and preserves nearest-lock precedence", () => {
    const {manager, onMetaUpdate$, yMeta} = createReadonlyHarness();
    manager.set("callout", true);
    yMeta("p-in").set("lock", "remote-user");
    yMeta("p-in").set("lockKind", "template");
    onMetaUpdate$.next({
      transactions: [{
        blockId: "p-in",
        changes: new Map([
          ["lock", {oldValue: undefined, action: "add"}],
          ["lockKind", {oldValue: undefined, action: "add"}],
        ]),
      }],
    });

    expect(manager.resolve("p-in").source).toEqual({kind: "self", blockId: "p-in"});
    expect(manager.resolve("p-in").lockUserId).toBe("remote-user");
    expect(manager.resolve("p-in").lockKind).toBe("template");

    yMeta("p-in").delete("lockKind");
    onMetaUpdate$.next({
      transactions: [{
        blockId: "p-in",
        changes: new Map([["lockKind", {oldValue: "template", action: "delete"}]]),
      }],
    });
    expect(manager.resolve("p-in").lockKind).toBe("user");

    yMeta("p-in").delete("lock");
    onMetaUpdate$.next({
      transactions: [{
        blockId: "p-in",
        changes: new Map([["lock", {oldValue: "remote-user", action: "delete"}]]),
      }],
    });

    expect(manager.resolve("p-in").source).toEqual({
      kind: "ancestor",
      blockId: "callout",
    });
  });

  it("indexes an explicit lock arriving inside a newly reachable subtree", () => {
    const {manager, yDoc, yBlockMap} = createReadonlyHarness();
    const lockedBranch = structuralBlock("late-branch", ["late-leaf"]);
    const lockedLeaf = editableBlock("late-leaf");
    yBlockMap.set("late-branch", lockedBranch);
    yBlockMap.set("late-leaf", lockedLeaf);
    (lockedLeaf.get("meta") as Y.Map<unknown>).set("lock", "remote-user");

    yDoc.transact(() => {
      const children = yBlockMap.get("root-a")!.get("children") as Y.Array<string>;
      children.insert(children.length, ["late-branch"]);
    });

    expect(manager.isExplicitReadonly("late-leaf")).toBeTrue();
    expect(manager.resolve("late-branch").readonly).toBeFalse();
    expect(manager.containsReadonly("late-branch")).toBeTrue();
  });

  it("rejects deleting an unlocked ancestor and inserting into an inherited lock", () => {
    const {manager} = createReadonlyHarness();
    manager.set("p-in", true);

    expect(() => manager.assertRemovable(
      ["callout"],
      BlockReadonlyOperation.Delete,
    )).toThrowError(BlockReadonlyError);

    manager.set("p-in", false);
    manager.set("callout", true);
    expect(() => manager.assertInsertable(
      "p-in",
      BlockReadonlyOperation.Insert,
    )).toThrowError(BlockReadonlyError);
  });

  it("allows deterministic system repair only inside its scoped callback", () => {
    const {manager} = createReadonlyHarness();
    manager.set("callout", true);

    expect(() => manager.assertTextWritable(
      "p-in",
      BlockReadonlyOperation.Text,
    )).toThrowError(BlockReadonlyError);

    expect(() => manager.runSystemRepair(() => manager.assertTextWritable(
      "p-in",
      BlockReadonlyOperation.Text,
    ))).not.toThrow();

    expect(() => manager.assertTextWritable(
      "p-in",
      BlockReadonlyOperation.Text,
    )).toThrowError(BlockReadonlyError);
  });

  it("rejects an undo item that touches a subtree containing a locked descendant", () => {
    const {manager} = createReadonlyHarness();
    manager.set("p-in", true);

    expect(() => manager.assertUndoRedoWritable(
      ["callout"],
      BlockReadonlyOperation.Undo,
    )).toThrowError(BlockReadonlyError);
  });

  it("resolves document readonly before block metadata", () => {
    const {manager, readonlySwitch$} = createReadonlyHarness();
    manager.set("callout", true);
    readonlySwitch$.next(true);

    expect(manager.resolve("callout")).toEqual({
      readonly: true,
      source: {kind: "document"},
      lockUserId: null,
      lockKind: null,
    });
  });
});
