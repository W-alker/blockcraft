import {ClipboardManager} from "./index";
import {ClipboardDataType} from "./types";
import {BlockNodeType, DeltaInsert, IBlockSnapshot} from "../../block-std";

/**
 * P6: pasting at a gap cursor (collapsed selection beside a void/container block)
 * must insert the clipboard blocks as SIBLINGS at the gap index — gap-before
 * before the block, gap-after after it — and KEEP the void/container block.
 *
 * These tests exercise the private `_applyGapPaste` directly (the same pattern the
 * input spec uses for `_resolveBeforeInputRange`), stubbing the doc so we can
 * assert which CRUD insert was called without mounting Angular components.
 */
describe('ClipboardManager – paste at gap', () => {
  // `@DocEventRegister` validates `doc.event` and registers listeners in the
  // constructor, so the mock doc must expose a minimal event dispatcher stub.
  const eventStub = () => ({add() {}, bindHotkey() {}});

  let snapshotSeq: number;

  const makeEditableSnapshot = (flavour: string, deltas: DeltaInsert[]): IBlockSnapshot => ({
    id: `${flavour}-${++snapshotSeq}`,
    flavour: flavour as BlockCraft.BlockFlavour,
    nodeType: BlockNodeType.editable,
    props: {depth: 0},
    meta: {},
    children: deltas,
  });

  const makeRootSnapshot = (children: IBlockSnapshot[]): IBlockSnapshot => ({
    id: `root-${++snapshotSeq}`,
    flavour: 'root' as BlockCraft.BlockFlavour,
    nodeType: BlockNodeType.root,
    props: {},
    meta: {},
    children,
  });

  const createManager = (options: {removeInsertedBeforeCaretRestore?: boolean} = {}) => {
    snapshotSeq = 0;
    const calls: Array<{ method: 'before' | 'after'; blockId: string; snapshots: IBlockSnapshot[] }> = [];
    const liveBlocks = new Map<string, BlockCraft.BlockComponent>();

    // Resolve inserted blocks from snapshots so `_applyGapPaste` can place the caret.
    const resolveInserted = (snapshots: IBlockSnapshot[]) => {
      const inserted = snapshots.map(s => ({
        id: s.id,
        nodeType: s.nodeType,
        textLength: 5,
      })) as unknown as BlockCraft.BlockComponent[];
      inserted.forEach(block => liveBlocks.set(block.id, block));
      if (options.removeInsertedBeforeCaretRestore) {
        inserted.forEach(block => liveBlocks.delete(block.id));
      }
      return inserted;
    };

    const setCursorAt = jasmine.createSpy('setCursorAt');
    const setCursorAtBlock = jasmine.createSpy('setCursorAtBlock');
    const deleteBlockById = jasmine.createSpy('deleteBlockById');

    const doc = {
      event: eventStub(),
      config: {},
      injector: {get: () => ({supportedAdapters: [], getAdapter: () => undefined})},
      logger: {warn: jasmine.createSpy('warn')},
      isEditable: (block: { nodeType: BlockNodeType }) => block.nodeType === BlockNodeType.editable,
      schemas: {
        createSnapshot: (flavour: string, args: unknown[]) =>
          flavour === 'root'
            ? makeRootSnapshot(args[1] as IBlockSnapshot[])
            : makeEditableSnapshot(flavour, ((args[0] as DeltaInsert[][])?.[0]) ?? []),
      },
      crud: {
        deleteBlockById,
        insertBlocksBefore: (block: { id: string }, snapshots: IBlockSnapshot[]) => {
          calls.push({method: 'before', blockId: block.id, snapshots});
          return resolveInserted(snapshots);
        },
        insertBlocksAfter: (block: { id: string }, snapshots: IBlockSnapshot[]) => {
          calls.push({method: 'after', blockId: block.id, snapshots});
          return resolveInserted(snapshots);
        },
      },
      getBlockById: (id: string) => {
        const block = liveBlocks.get(id);
        if (!block) throw new Error(`missing block ${id}`);
        return block;
      },
      selection: {setCursorAt, setCursorAtBlock, recalculate: jasmine.createSpy('recalculate')},
    };

    const manager = new ClipboardManager(doc as any);
    return {manager, doc, calls, setCursorAt, setCursorAtBlock, deleteBlockById};
  };

  const gapSelection = (blockId: string, side: 'before' | 'after') => {
    const block = {id: blockId, parentId: 'root', nodeType: BlockNodeType.void};
    const point = {blockId, type: 'gap' as const, side, block};
    return {start: point, end: point, isInSameBlock: true} as unknown as BlockCraft.Selection;
  };

  const textState = (text: string) => ({
    dataTypes: [ClipboardDataType.TEXT],
    getData: (type: string) => (type === ClipboardDataType.TEXT ? text : null),
  });

  const snapshotState = (snapshot: IBlockSnapshot) => ({
    dataTypes: [ClipboardDataType.BLOCKCRAFT_SNAPSHOT],
    getData: () => JSON.stringify(snapshot),
  });

  it('inserts pasted text as siblings AFTER the void block for gap-after', async () => {
    const {manager, calls, setCursorAt, setCursorAtBlock} = createManager();
    const selection = gapSelection('divider-1', 'after');

    const ok = await (manager as any)._applyGapPaste(selection, textState('pasted 1\npasted 2'));

    expect(ok).toBeTrue();
    expect(calls.length).toBe(1);
    expect(calls[0].method).toBe('after');
    expect(calls[0].blockId).toBe('divider-1');
    expect(calls[0].snapshots.length).toBe(2);
    // void/container block is kept (never deleted).
    expect((manager as any).doc.crud.deleteBlockById).not.toHaveBeenCalled();
    // last inserted block is editable → caret goes via setCursorAt, not setCursorAtBlock
    expect(setCursorAtBlock).not.toHaveBeenCalled();
    // caret lands at the end of the last inserted editable block (textLength = 5).
    expect(setCursorAt).toHaveBeenCalledWith(
      jasmine.objectContaining({nodeType: BlockNodeType.editable}), 5,
    );
  });

  it('does not restore the caret when the inserted gap-paste block was removed before nextTick', async () => {
    const {manager, calls, setCursorAt, setCursorAtBlock} = createManager({removeInsertedBeforeCaretRestore: true});
    const selection = gapSelection('divider-1', 'after');

    const ok = await (manager as any)._applyGapPaste(selection, textState('pasted'));

    expect(ok).toBeTrue();
    expect(calls.length).toBe(1);
    expect(setCursorAt).not.toHaveBeenCalled();
    expect(setCursorAtBlock).not.toHaveBeenCalled();
  });

  it('inserts pasted blocks as siblings BEFORE the void block for gap-before', async () => {
    const {manager, calls, setCursorAt, setCursorAtBlock} = createManager();
    const selection = gapSelection('divider-1', 'before');

    const ok = await (manager as any)._applyGapPaste(selection, textState('hello'));

    expect(ok).toBeTrue();
    expect(calls.length).toBe(1);
    expect(calls[0].method).toBe('before');
    expect(calls[0].blockId).toBe('divider-1');
    // void/container block is kept (never deleted).
    expect((manager as any).doc.crud.deleteBlockById).not.toHaveBeenCalled();
    expect(setCursorAtBlock).not.toHaveBeenCalled();
    // caret lands at the end of the last inserted editable block (textLength = 5).
    expect(setCursorAt).toHaveBeenCalledWith(
      jasmine.objectContaining({nodeType: BlockNodeType.editable}), 5,
    );
  });

  it('inserts a structured snapshot payload as siblings, preserving the void block', async () => {
    const {manager, calls, deleteBlockById} = createManager();
    const selection = gapSelection('image-1', 'after');
    const payload = makeRootSnapshot([
      makeEditableSnapshot('paragraph', [{insert: 'one'}]),
      makeEditableSnapshot('paragraph', [{insert: 'two'}]),
    ]);

    const ok = await (manager as any)._applyGapPaste(selection, snapshotState(payload));

    expect(ok).toBeTrue();
    expect(calls.length).toBe(1);
    expect(calls[0].method).toBe('after');
    expect(calls[0].snapshots.length).toBe(2);
    expect(deleteBlockById).not.toHaveBeenCalled();
  });

  it('is a no-op (returns false) when the clipboard has nothing usable', async () => {
    const {manager, calls} = createManager();
    const selection = gapSelection('divider-1', 'after');

    const ok = await (manager as any)._applyGapPaste(selection, {dataTypes: [], getData: () => null});

    expect(ok).toBeFalse();
    expect(calls.length).toBe(0);
  });

  it('returns false when the gap block has no parent', async () => {
    const {manager, calls} = createManager();
    const orphan = {id: 'x', parentId: null, nodeType: BlockNodeType.void};
    const point = {blockId: 'x', type: 'gap' as const, side: 'after' as const, block: orphan};
    const selection = {start: point, end: point, isInSameBlock: true} as unknown as BlockCraft.Selection;

    const ok = await (manager as any)._applyGapPaste(selection, textState('hi'));

    expect(ok).toBeFalse();
    expect(calls.length).toBe(0);
  });

  it('skips inline range restore when the editable target is stale', () => {
    const recalculate = jasmine.createSpy('recalculate');
    const doc = {
      event: eventStub(),
      config: {},
      injector: {get: () => ({supportedAdapters: [], getAdapter: () => undefined})},
      logger: {warn: jasmine.createSpy('warn')},
      getBlockById: jasmine.createSpy('getBlockById').and.throwError('missing'),
      selection: {recalculate},
    };
    const block = {
      id: 'p1',
      nodeType: BlockNodeType.editable,
      setInlineRange: jasmine.createSpy('setInlineRange'),
    };
    const manager = new ClipboardManager(doc as any);

    (manager as any)._setTextRangeAndSync(block, 0, 1);

    expect(block.setInlineRange).not.toHaveBeenCalled();
    expect(recalculate).not.toHaveBeenCalled();
  });
});
