import {ClipboardManager} from "./index";
import {ClipboardDataType} from "./types";
import {BlockNodeType, DeltaInsert, IBlockSnapshot} from "../../block-std";
import * as Y from "yjs";

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

  const makeVoidSnapshot = (flavour: string): IBlockSnapshot => ({
    id: `${flavour}-${++snapshotSeq}`,
    flavour: flavour as BlockCraft.BlockFlavour,
    nodeType: BlockNodeType.void,
    props: {},
    meta: {},
    children: [],
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
    const yDoc = new Y.Doc();

    // Resolve inserted blocks from snapshots so `_applyGapPaste` can place the caret.
    const resolveInserted = (snapshots: IBlockSnapshot[]) => {
      const inserted = snapshots.map(s => {
        const block = {
          id: s.id,
          nodeType: s.nodeType,
          textLength: 5,
        } as unknown as BlockCraft.BlockComponent & { yText?: Y.Text };
        if (s.nodeType === BlockNodeType.editable) {
          const yText = yDoc.getText(s.id);
          yText.insert(0, 'xxxxx');
          block.yText = yText;
        }
        return block;
      }) as unknown as BlockCraft.BlockComponent[];
      inserted.forEach(block => liveBlocks.set(block.id, block));
      if (options.removeInsertedBeforeCaretRestore) {
        inserted.forEach(block => liveBlocks.delete(block.id));
      }
      return inserted;
    };

    const setCursorAt = jasmine.createSpy('setCursorAt');
    const setCursorAtBlock = jasmine.createSpy('setCursorAtBlock');
    const setGapCursor = jasmine.createSpy('setGapCursor');
    const setSelection = jasmine.createSpy('setSelection');
    const replay = jasmine.createSpy('replay');
    const deleteBlockById = jasmine.createSpy('deleteBlockById');
    const rootHost = {
      contains: jasmine.createSpy('contains').and.returnValue(false),
      focus: jasmine.createSpy('focus'),
    };

    const doc = {
      event: eventStub(),
      config: {},
      injector: {get: () => ({supportedAdapters: [], getAdapter: () => undefined})},
      logger: {warn: jasmine.createSpy('warn')},
      root: {hostElement: rootHost},
      yDoc,
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
      selection: {
        setCursorAt,
        setCursorAtBlock,
        setGapCursor,
        setSelection,
        replay,
        selectBlock: jasmine.createSpy('selectBlock'),
        recalculate: jasmine.createSpy('recalculate'),
      },
    };

    const manager = new ClipboardManager(doc as any);
    return {manager, doc, calls, liveBlocks, rootHost, replay, setCursorAt, setCursorAtBlock, setGapCursor, setSelection, deleteBlockById};
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

  const snapshotState = (snapshot: IBlockSnapshot, plainText?: string) => ({
    dataTypes: plainText
      ? [ClipboardDataType.BLOCKCRAFT_SNAPSHOT, ClipboardDataType.TEXT]
      : [ClipboardDataType.BLOCKCRAFT_SNAPSHOT],
    getData: (type: string) => {
      if (type === ClipboardDataType.BLOCKCRAFT_SNAPSHOT) return JSON.stringify(snapshot);
      if (type === ClipboardDataType.TEXT) return plainText ?? null;
      return null;
    },
  });

  it('inserts pasted text as siblings AFTER the void block for gap-after', async () => {
    const {manager, doc, calls, rootHost, setCursorAt, setCursorAtBlock} = createManager();
    const selection = gapSelection('divider-1', 'after');

    const result = await (manager as any)._applyGapPaste(selection, textState('pasted 1\npasted 2'));

    expect(result).toBeTruthy();
    expect(calls.length).toBe(1);
    expect(calls[0].method).toBe('after');
    expect(calls[0].blockId).toBe('divider-1');
    expect(calls[0].snapshots.length).toBe(2);
    // void/container block is kept (never deleted).
    expect((manager as any).doc.crud.deleteBlockById).not.toHaveBeenCalled();
    // last inserted block is editable → caret goes via setCursorAt, not setCursorAtBlock
    expect(setCursorAtBlock).not.toHaveBeenCalled();
    // caret lands at the end of the last inserted editable block (textLength = 5).
    expect(rootHost.focus).toHaveBeenCalledWith({preventScroll: true});
    expect(setCursorAt).toHaveBeenCalledWith(
      jasmine.objectContaining({nodeType: BlockNodeType.editable}), 5,
    );
    expect(doc.selection.recalculate).not.toHaveBeenCalled();
  });

  it('does not restore the caret when the inserted gap-paste block was removed before nextTick', async () => {
    const {manager, calls, setCursorAt, setCursorAtBlock} = createManager({removeInsertedBeforeCaretRestore: true});
    const selection = gapSelection('divider-1', 'after');

    const result = await (manager as any)._applyGapPaste(selection, textState('pasted'));

    expect(result).toBeTruthy();
    expect(calls.length).toBe(1);
    expect(setCursorAt).not.toHaveBeenCalled();
    expect(setCursorAtBlock).not.toHaveBeenCalled();
  });

  it('inserts pasted blocks as siblings BEFORE the void block for gap-before', async () => {
    const {manager, calls, setCursorAt, setCursorAtBlock} = createManager();
    const selection = gapSelection('divider-1', 'before');

    const result = await (manager as any)._applyGapPaste(selection, textState('hello'));

    expect(result).toBeTruthy();
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

    const result = await (manager as any)._applyGapPaste(selection, snapshotState(payload));

    expect(result).toBeTruthy();
    expect(calls.length).toBe(1);
    expect(calls[0].method).toBe('after');
    expect(calls[0].snapshots.length).toBe(2);
    expect(deleteBlockById).not.toHaveBeenCalled();
  });

  it('places the caret after a pasted non-editable block using its trailing gap', async () => {
    const {manager, calls, rootHost, setCursorAt, setCursorAtBlock, setGapCursor} = createManager();
    const selection = gapSelection('divider-1', 'after');
    const image = makeVoidSnapshot('image');
    const payload = makeRootSnapshot([
      makeEditableSnapshot('paragraph', [{insert: 'one'}]),
      image,
    ]);

    const result = await (manager as any)._applyGapPaste(selection, snapshotState(payload));

    expect(result).toBeTruthy();
    expect(calls.length).toBe(1);
    const insertedImageId = calls[0].snapshots[1].id;
    expect(rootHost.focus).toHaveBeenCalledWith({preventScroll: true});
    expect(setCursorAt).not.toHaveBeenCalled();
    expect(setCursorAtBlock).not.toHaveBeenCalled();
    expect(setGapCursor).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({id: insertedImageId, nodeType: BlockNodeType.void}),
      'after',
    );
  });

  it('is a no-op (returns false) when the clipboard has nothing usable', async () => {
    const {manager, calls} = createManager();
    const selection = gapSelection('divider-1', 'after');

    const result = await (manager as any)._applyGapPaste(selection, {dataTypes: [], getData: () => null});

    expect(result).toBeNull();
    expect(calls.length).toBe(0);
  });

  it('returns false when the gap block has no parent', async () => {
    const {manager, calls} = createManager();
    const orphan = {id: 'x', parentId: null, nodeType: BlockNodeType.void};
    const point = {blockId: 'x', type: 'gap' as const, side: 'after' as const, block: orphan};
    const selection = {start: point, end: point, isInSameBlock: true} as unknown as BlockCraft.Selection;

    const result = await (manager as any)._applyGapPaste(selection, textState('hi'));

    expect(result).toBeNull();
    expect(calls.length).toBe(0);
  });

  it('emits paste-format data for structured gap paste with a capturable text region', async () => {
    const {manager} = createManager();
    const selection = gapSelection('divider-1', 'after');
    const payload = makeRootSnapshot([
      makeEditableSnapshot('paragraph', [{insert: 'rich'}]),
      makeEditableSnapshot('paragraph', [{insert: 'tail'}]),
    ]);
    const events: unknown[] = [];
    manager.pasteFormatData$.subscribe(event => events.push(event));

    const result = await (manager as any)._applyGapPaste(selection, snapshotState(payload, 'plain text'));

    expect(result).toEqual(jasmine.objectContaining({region: jasmine.any(Object)}));
    expect(events.length).toBe(1);
    expect(events[0]).toEqual(jasmine.objectContaining({
      anchorBlockId: (result as any).anchorBlockId,
      appliedType: 'html',
      plainText: 'plain text',
      collapsed: true,
      region: (result as any).region,
    }));
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

  it('restores a same-block text range through the canonical model without DOM readback', () => {
    const {manager, doc, liveBlocks, setSelection} = createManager();
    const block = {
      id: 'p1',
      nodeType: BlockNodeType.editable,
      textLength: 4,
      setInlineRange: jasmine.createSpy('setInlineRange'),
    } as any;
    liveBlocks.set(block.id, block);

    (manager as any)._setTextRangeAndSync(block, 1, 2);

    expect(setSelection).toHaveBeenCalledWith(
      {blockId: block.id, type: 'text', offset: 1, block},
      {blockId: block.id, type: 'text', offset: 3, block},
    );
    expect(block.setInlineRange).not.toHaveBeenCalled();
    expect(doc.selection.recalculate).not.toHaveBeenCalled();
  });

  it('restores a cross-block range through live model points without DOM readback', () => {
    const {manager, doc, liveBlocks, setSelection} = createManager();
    const startBlock = {id: 'p1', nodeType: BlockNodeType.editable, textLength: 4} as any;
    const endBlock = {id: 'p2', nodeType: BlockNodeType.editable, textLength: 3} as any;
    liveBlocks.set(startBlock.id, startBlock);
    liveBlocks.set(endBlock.id, endBlock);

    (manager as any)._setCrossBlockRangeAndSync(startBlock, 2, endBlock);

    expect(setSelection).toHaveBeenCalledWith(
      {blockId: startBlock.id, type: 'text', offset: 2, block: startBlock},
      {blockId: endBlock.id, type: 'text', offset: 3, block: endBlock},
    );
    expect(doc.selection.recalculate).not.toHaveBeenCalled();
  });

  it('replays a collapsed paste selection without confirming it through DOM', () => {
    const {manager, doc, replay} = createManager();
    const selection = {
      anchor: {blockId: 'p1', type: 'text', offset: 1},
      head: {blockId: 'p1', type: 'text', offset: 1},
      commonParent: 'p1',
    };

    (manager as any)._restoreCollapsedSelectionAndSync(selection);

    expect(replay).toHaveBeenCalledOnceWith(selection);
    expect(doc.selection.recalculate).not.toHaveBeenCalled();
  });
});
