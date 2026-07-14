import {Subject} from 'rxjs';
import {BlockNodeType} from '../../block-std';
import {createBlockGapSpace} from '../../utils';
import {SelectionManager} from './index';
import {BlockSelection} from './blockSelection';

describe('SelectionManager DOM selection normalization', () => {
  function createManager(options?: {bindEvents?: boolean}) {
    document.getSelection()?.removeAllRanges();

    const rootHost = document.createElement('div');
    rootHost.setAttribute('data-block-id', 'root');
    rootHost.setAttribute('data-node-type', BlockNodeType.root);
    rootHost.setAttribute('contenteditable', 'true');

    const blockHost = document.createElement('div');
    blockHost.setAttribute('data-block-id', 'block-1');
    blockHost.setAttribute('data-node-type', BlockNodeType.block);
    rootHost.appendChild(blockHost);
    document.body.appendChild(rootHost);

    const rootBlock = {
      id: 'root',
      nodeType: BlockNodeType.root,
      hostElement: rootHost,
      childrenLength: 1,
    };
    const block = {
      id: 'block-1',
      nodeType: BlockNodeType.block,
      hostElement: blockHost,
      parentId: 'root',
      parentBlock: rootBlock,
      textContent: () => 'void text',
    };

    let selectionChangeHandler: ((event: Event) => void) | null = null;
    const doc = {
      root: rootBlock,
      event: {
        add() {},
        bindHotkey() {},
        status: {isComposing: false},
        customListen(_target: EventTarget, type: string) {
          return {
            subscribe(fn: (event: Event) => void) {
              if (type === 'selectionchange') {
                selectionChangeHandler = fn;
              }
              return {unsubscribe() {}};
            },
          };
        },
      },
      afterInit(fn: (root: any) => void) {
        if (options?.bindEvents) fn(rootBlock);
      },
      onDestroy$: new Subject<void>(),
      getBlockById: (id: string) => id === 'root' ? rootBlock : block,
      compareBlockPosition: () => 0,
      queryBlocksBetween: () => [],
      logger: {warn: jasmine.createSpy('warn')},
    };

    const manager = new SelectionManager(doc as any);
    return {
      manager,
      rootHost,
      blockHost,
      block,
      doc,
      dispatchSelectionChange: () => selectionChangeHandler?.(new Event('selectionchange')),
    };
  }

  afterEach(() => {
    document.getSelection()?.removeAllRanges();
    document.querySelectorAll('[data-block-id="root"]').forEach(el => el.remove());
    document.querySelectorAll('[data-selection-test-outside]').forEach(el => el.remove());
  });

  it('keeps a collapsed native range on a non-editable block host as a block selection', () => {
    const {manager, blockHost} = createManager();
    const range = document.createRange();
    range.setStart(blockHost, 0);
    range.collapse(true);

    const domSelection = document.getSelection()!;
    domSelection.removeAllRanges();
    domSelection.addRange(range);

    const result = manager.recalculate();

    expect(result.value).not.toBeNull();
    expect(result.value!.start.type).toBe('selected');
    expect(result.value!.start.blockId).toBe('block-1');
    expect(result.value!.end.type).toBe('selected');
    expect(result.value!.end.blockId).toBe('block-1');
    expect(manager.value).toBe(result.value);
    expect(blockHost.classList.contains('selected')).toBeTrue();
  });

  it('updates the canonical selection immediately when setting a gap cursor', () => {
    const {manager, block, blockHost} = createManager();
    const leading = createBlockGapSpace();
    const trailing = createBlockGapSpace();
    const content = document.createElement('div');
    blockHost.append(leading, content, trailing);
    const rangeCountsOnSelectionChange: number[] = [];
    const sub = manager.selectionChange$.subscribe(() => {
      rangeCountsOnSelectionChange.push(document.getSelection()?.rangeCount ?? -1);
    });

    manager.setGapCursor(block as any, 'after');
    sub.unsubscribe();

    const value = manager.value;
    expect(value).not.toBeNull();
    expect(value!.collapsed).toBeTrue();
    expect(value!.start.type).toBe('gap');
    expect(value!.end.type).toBe('gap');
    if (value!.start.type === 'gap' && value!.end.type === 'gap') {
      expect(value!.start.side).toBe('after');
      expect(value!.end.side).toBe('after');
    }

    const nativeSelection = document.getSelection()!;
    expect(nativeSelection.rangeCount).toBe(1);
    const range = nativeSelection.getRangeAt(0);
    expect(range.collapsed).toBeTrue();
    expect(range.startContainer).toBe(trailing.firstChild!);
    expect(range.startOffset).toBe(0);
    expect(rangeCountsOnSelectionChange[1]).toBe(0);
  });

  it('updates the canonical selection immediately when selecting a container block', () => {
    const {manager, block, blockHost} = createManager();
    const leading = createBlockGapSpace();
    const trailing = createBlockGapSpace();
    const content = document.createElement('div');
    blockHost.append(leading, content, trailing);

    manager.selectBlock(block as any);

    const value = manager.value;
    expect(value).not.toBeNull();
    expect(value!.isAllSelected).toBeTrue();
    expect(value!.start.type).toBe('selected');
    expect(value!.start.blockId).toBe('block-1');
    expect(value!.end.type).toBe('selected');
    expect(value!.end.blockId).toBe('block-1');

    const nativeSelection = document.getSelection()!;
    expect(nativeSelection.rangeCount).toBe(1);
    const range = nativeSelection.getRangeAt(0);
    expect(range.startContainer).toBe(leading.firstChild!);
    expect(range.endContainer).toBe(trailing.firstChild!);
  });

  it('keeps a programmatic block selection when the native selectionchange is delayed', () => {
    const {manager, block, blockHost, dispatchSelectionChange} = createManager({bindEvents: true});
    const leading = createBlockGapSpace();
    const trailing = createBlockGapSpace();
    const content = document.createElement('div');
    blockHost.append(leading, content, trailing);
    const recalculateSpy = spyOn(manager, 'recalculate').and.callThrough();

    manager.selectBlock(block as any);
    const value = manager.value;
    dispatchSelectionChange();

    expect(recalculateSpy).not.toHaveBeenCalled();
    expect(manager.value).toBe(value);
    expect(manager.value?.isAllSelected).toBeTrue();
  });

  it('selects editable children through the canonical model immediately', () => {
    const rootHost = document.createElement('div');
    rootHost.setAttribute('data-block-id', 'root');
    rootHost.setAttribute('contenteditable', 'true');
    const paragraphHost = document.createElement('p');
    paragraphHost.setAttribute('data-block-id', 'p1');
    const container = document.createElement('span');
    const text = document.createTextNode('hello');
    container.appendChild(text);
    paragraphHost.appendChild(container);
    rootHost.appendChild(paragraphHost);
    document.body.appendChild(rootHost);

    const rootBlock = {id: 'root', nodeType: BlockNodeType.root, hostElement: rootHost, childrenLength: 1} as any;
    const paragraph = {
      id: 'p1',
      nodeType: BlockNodeType.editable,
      hostElement: paragraphHost,
      containerElement: container,
      parentId: 'root',
      parentBlock: rootBlock,
      textLength: 5,
      textContent: () => 'hello',
      runtime: {
        mapper: {
          modelPointToDomPoint: (_container: HTMLElement, offset: number) => ({node: text, offset}),
        },
      },
    } as any;
    const doc = {
      root: rootBlock,
      event: {add() {}, bindHotkey() {}},
      afterInit() {},
      onDestroy$: new Subject<void>(),
      isEditable: (block: any) => block?.nodeType === BlockNodeType.editable,
      getBlockById: (id: string) => id === 'root' ? rootBlock : paragraph,
      compareBlockPosition: () => 0,
      queryBlocksBetween: () => [],
      logger: {warn: jasmine.createSpy('warn')},
    };
    const manager = new SelectionManager(doc as any);

    manager.selectAllChildren(paragraph);

    const value = manager.value;
    expect(value?.start.type).toBe('text');
    expect(value?.end.type).toBe('text');
    if (value?.start.type === 'text' && value.end.type === 'text') {
      expect(value.start.offset).toBe(0);
      expect(value.end.offset).toBe(5);
    }
    const range = document.getSelection()!.getRangeAt(0);
    expect(range.startContainer).toBe(text);
    expect(range.startOffset).toBe(0);
    expect(range.endContainer).toBe(text);
    expect(range.endOffset).toBe(5);
  });

  it('clears selected block classes when selection is cleared', () => {
    const {manager, block, blockHost, doc} = createManager();
    const blockSelection = new BlockSelection(
      {blockId: block.id, type: 'selected', block} as any,
      {blockId: block.id, type: 'selected', block} as any,
      'root',
      id => id === 'root' ? doc.root as any : block as any,
      () => 0,
    );

    (manager as any)._applyState(blockSelection);
    expect(blockHost.classList.contains('selected')).toBeTrue();

    manager.replay(null);

    expect(blockHost.classList.contains('selected')).toBeFalse();
  });

  it('measures a gap cursor from the filler span instead of the zero-width text range', () => {
    const {manager, block, blockHost} = createManager();
    const leading = createBlockGapSpace();
    const trailing = createBlockGapSpace();
    const content = document.createElement('div');
    const expectedRect = new DOMRect(10, 20, 1, 24);
    blockHost.append(leading, content, trailing);
    spyOn(trailing, 'getBoundingClientRect').and.returnValue(expectedRect);

    manager.setGapCursor(block as any, 'after');

    expect(manager.getSelectionRect()).toBe(expectedRect);
  });

  it('does not report block text for a collapsed gap cursor', () => {
    const {manager} = createManager();
    const gapSelection = manager.createSelection({
      anchor: {blockId: 'block-1', type: 'gap', side: 'before'},
      head: {blockId: 'block-1', type: 'gap', side: 'before'},
      commonParent: 'block-1',
    });

    expect(gapSelection).not.toBeNull();
    manager.selectionChange$.next(gapSelection);

    expect(manager.getSelectedText()).toBe('');
  });

  it('replays gap JSON into the canonical selection synchronously', () => {
    const {manager, blockHost} = createManager();
    const leading = createBlockGapSpace();
    const trailing = createBlockGapSpace();
    const content = document.createElement('div');
    blockHost.append(leading, content, trailing);

    manager.replay({
      anchor: {blockId: 'block-1', type: 'gap', side: 'after'},
      head: {blockId: 'block-1', type: 'gap', side: 'after'},
      commonParent: 'block-1',
    });

    expect(manager.value?.start.type).toBe('gap');
    if (manager.value?.start.type === 'gap') {
      expect(manager.value.start.side).toBe('after');
    }
    const range = document.getSelection()!.getRangeAt(0);
    expect(range.collapsed).toBeTrue();
    expect(range.startContainer).toBe(trailing.firstChild!);
  });

  it('retries replaying a gap cursor when the gap filler mounts after replay', () => {
    const {manager, blockHost} = createManager();
    let scheduled: FrameRequestCallback | null = null;
    const rafSpy = (window.requestAnimationFrame as any).and
      ? window.requestAnimationFrame as jasmine.Spy
      : spyOn(window, 'requestAnimationFrame');
    rafSpy.and.callFake((callback: FrameRequestCallback) => {
      scheduled = callback;
      return 1;
    });

    manager.replay({
      anchor: {blockId: 'block-1', type: 'gap', side: 'after'},
      head: {blockId: 'block-1', type: 'gap', side: 'after'},
      commonParent: 'block-1',
    });

    expect(manager.value?.start.type).toBe('gap');
    expect(document.getSelection()?.rangeCount).toBe(0);
    expect(scheduled).not.toBeNull();

    const leading = createBlockGapSpace();
    const trailing = createBlockGapSpace();
    const content = document.createElement('div');
    blockHost.append(leading, content, trailing);
    scheduled!(performance.now());

    const range = document.getSelection()!.getRangeAt(0);
    expect(range.collapsed).toBeTrue();
    expect(range.startContainer).toBe(trailing.firstChild!);
  });

  it('clears selection instead of throwing when replay JSON points at a missing block', () => {
    const {manager, doc} = createManager();
    (doc as any).getBlockById = (id: string) => {
      if (id === 'missing') throw new Error('block not found');
      return id === 'root' ? doc.root : null;
    };

    expect(() => manager.replay({
      anchor: {blockId: 'missing', type: 'selected'},
      head: {blockId: 'missing', type: 'selected'},
      commonParent: 'missing',
    })).not.toThrow();

    expect(manager.value).toBeNull();
    expect(document.getSelection()?.rangeCount).toBe(0);
  });

  it('creates an empty fake range instead of throwing for stale selection JSON', () => {
    const {manager, doc} = createManager();
    (doc as any).getBlockById = (id: string) => {
      if (id === 'missing') throw new Error('block not found');
      return id === 'root' ? doc.root : null;
    };

    const fakeRange = manager.createFakeRange({
      anchor: {blockId: 'missing', type: 'selected'},
      head: {blockId: 'missing', type: 'selected'},
      commonParent: 'missing',
    });

    expect(fakeRange.fakeSpans).toEqual([]);
    expect(() => fakeRange.destroy()).not.toThrow();
  });

  it('does not broadcast a selection whose lazy content block no longer exists', () => {
    const rootHost = document.createElement('div');
    rootHost.setAttribute('data-block-id', 'root');
    rootHost.setAttribute('contenteditable', 'true');
    document.body.appendChild(rootHost);

    const rootBlock = {id: 'root', nodeType: BlockNodeType.root, hostElement: rootHost} as any;
    const callout = {
      id: 'callout-1',
      nodeType: BlockNodeType.block,
      hostElement: rootHost,
      parentId: 'root',
      parentBlock: rootBlock,
      childrenLength: 2,
      childrenIds: ['p1', 'p2'],
    } as any;
    const p1 = {id: 'p1', nodeType: BlockNodeType.editable, hostElement: rootHost} as any;
    const blocks: Record<string, any> = {root: rootBlock, 'callout-1': callout, p1};
    const doc = {
      root: rootBlock,
      event: {add() {}, bindHotkey() {}},
      afterInit() {},
      onDestroy$: new Subject<void>(),
      getBlockById: (id: string) => {
        const block = blocks[id];
        if (!block) throw new Error(`block not found: ${id}`);
        return block;
      },
      compareBlockPosition: () => Node.DOCUMENT_POSITION_FOLLOWING,
      queryBlocksBetween: () => [],
      logger: {warn: jasmine.createSpy('warn')},
    };
    const manager = new SelectionManager(doc as any);
    const staleSelection = new BlockSelection(
      {blockId: 'callout-1', type: 'boundary', index: 0, block: callout} as any,
      {blockId: 'callout-1', type: 'boundary', index: 2, block: callout} as any,
      'callout-1',
      id => doc.getBlockById(id) as any,
      () => Node.DOCUMENT_POSITION_FOLLOWING,
    );
    const emitted: Array<BlockSelection | null> = [];
    const sub = manager.selectionChange$.subscribe(selection => emitted.push(selection));

    expect(() => (manager as any)._applyState(staleSelection)).not.toThrow();

    sub.unsubscribe();
    expect(manager.value).toBeNull();
    expect(emitted[emitted.length - 1]).toBeNull();
  });

  it('does not expose a stale selection through value reads', () => {
    const rootHost = document.createElement('div');
    rootHost.setAttribute('data-block-id', 'root');
    rootHost.setAttribute('contenteditable', 'true');
    document.body.appendChild(rootHost);

    const rootBlock = {id: 'root', nodeType: BlockNodeType.root, hostElement: rootHost} as any;
    const deletedBlock = {
      id: 'deleted',
      nodeType: BlockNodeType.block,
      hostElement: document.createElement('div'),
      parentId: 'root',
      parentBlock: rootBlock,
    } as any;
    const blocks: Record<string, any> = {root: rootBlock};
    const doc = {
      root: rootBlock,
      event: {add() {}, bindHotkey() {}},
      afterInit() {},
      onDestroy$: new Subject<void>(),
      getBlockById: (id: string) => {
        const block = blocks[id];
        if (!block) throw new Error(`block not found: ${id}`);
        return block;
      },
      compareBlockPosition: () => 0,
      queryBlocksBetween: () => [],
      logger: {warn: jasmine.createSpy('warn')},
    };
    const manager = new SelectionManager(doc as any);
    const staleSelection = new BlockSelection(
      {blockId: 'deleted', type: 'selected', block: deletedBlock} as any,
      {blockId: 'deleted', type: 'selected', block: deletedBlock} as any,
      'deleted',
      id => doc.getBlockById(id) as any,
      () => 0,
    );
    const emitted: Array<BlockSelection | null> = [];
    const sub = manager.selectionChange$.subscribe(selection => emitted.push(selection));

    manager.selectionChange$.next(staleSelection);

    expect(() => manager.value?.firstBlock).not.toThrow();
    expect(manager.value).toBeNull();

    sub.unsubscribe();
    expect(emitted[emitted.length - 1]).toBeNull();
  });

  it('builds a DOM range from boundary points inside a children container', () => {
    const rootHost = document.createElement('div');
    rootHost.setAttribute('data-block-id', 'root');
    rootHost.setAttribute('contenteditable', 'true');
    const calloutHost = document.createElement('div');
    calloutHost.setAttribute('data-block-id', 'callout-1');
    const content = document.createElement('div');
    content.className = 'children-render-container';
    const p1Host = document.createElement('p');
    p1Host.setAttribute('data-block-id', 'p1');
    const p2Host = document.createElement('p');
    p2Host.setAttribute('data-block-id', 'p2');
    content.append(p1Host, p2Host);
    calloutHost.appendChild(content);
    rootHost.appendChild(calloutHost);
    document.body.appendChild(rootHost);

    const rootBlock = {id: 'root', nodeType: BlockNodeType.root, hostElement: rootHost, childrenLength: 1} as any;
    const callout = {
      id: 'callout-1',
      nodeType: BlockNodeType.block,
      hostElement: calloutHost,
      parentId: 'root',
      parentBlock: rootBlock,
      childrenLength: 2,
      childrenIds: ['p1', 'p2'],
      childrenRenderRef: {containerElement: content},
      textContent: () => 'one\ntwo',
    } as any;
    const p1 = {
      id: 'p1',
      nodeType: BlockNodeType.editable,
      hostElement: p1Host,
      parentId: 'callout-1',
      parentBlock: callout,
      textContent: () => 'one',
      getIndexOfParent: () => 0,
    } as any;
    const p2 = {
      id: 'p2',
      nodeType: BlockNodeType.editable,
      hostElement: p2Host,
      parentId: 'callout-1',
      parentBlock: callout,
      textContent: () => 'two',
      getIndexOfParent: () => 1,
    } as any;
    const blocks: Record<string, any> = {root: rootBlock, 'callout-1': callout, p1, p2};
    const doc = {
      root: rootBlock,
      event: {add() {}, bindHotkey() {}},
      afterInit() {},
      onDestroy$: new Subject<void>(),
      getBlockById: (id: string) => blocks[id],
      compareBlockPosition: () => Node.DOCUMENT_POSITION_FOLLOWING,
      queryBlocksBetween: () => [],
      logger: {warn: jasmine.createSpy('warn')},
    };
    const manager = new SelectionManager(doc as any);

    manager.setSelection(
      {blockId: 'callout-1', type: 'boundary', index: 0} as any,
      {blockId: 'callout-1', type: 'boundary', index: 2} as any,
    );

    const nativeSelection = document.getSelection()!;
    const range = nativeSelection.getRangeAt(0);
    expect(range.startContainer).toBe(content);
    expect(range.startOffset).toBe(0);
    expect(range.endContainer).toBe(content);
    expect(range.endOffset).toBe(2);
  });

  it('maps boundary points around a gap block to its gap text anchors', () => {
    const rootHost = document.createElement('div');
    rootHost.setAttribute('data-block-id', 'root');
    rootHost.setAttribute('contenteditable', 'true');
    const calloutHost = document.createElement('div');
    calloutHost.setAttribute('data-block-id', 'callout-1');
    const leading = createBlockGapSpace();
    const content = document.createElement('div');
    const trailing = createBlockGapSpace();
    calloutHost.append(leading, content, trailing);
    rootHost.appendChild(calloutHost);
    document.body.appendChild(rootHost);

    const rootBlock = {
      id: 'root',
      nodeType: BlockNodeType.root,
      hostElement: rootHost,
      childrenLength: 1,
      childrenIds: ['callout-1'],
    } as any;
    const callout = {
      id: 'callout-1',
      nodeType: BlockNodeType.block,
      hostElement: calloutHost,
      parentId: 'root',
      parentBlock: rootBlock,
      childrenLength: 0,
      childrenIds: [],
      textContent: () => '',
      getIndexOfParent: () => 0,
    } as any;
    const blocks: Record<string, any> = {root: rootBlock, 'callout-1': callout};
    const doc = {
      root: rootBlock,
      event: {add() {}, bindHotkey() {}},
      afterInit() {},
      onDestroy$: new Subject<void>(),
      getBlockById: (id: string) => blocks[id],
      compareBlockPosition: () => Node.DOCUMENT_POSITION_FOLLOWING,
      queryBlocksBetween: () => [],
      logger: {warn: jasmine.createSpy('warn')},
    };
    const manager = new SelectionManager(doc as any);

    manager.setSelection(
      {blockId: 'root', type: 'boundary', index: 0} as any,
      {blockId: 'root', type: 'boundary', index: 1} as any,
    );

    const range = document.getSelection()!.getRangeAt(0);
    expect(range.startContainer).toBe(leading.firstChild!);
    expect(range.startOffset).toBe(0);
    expect(range.endContainer).toBe(trailing.firstChild!);
    expect(range.endOffset).toBe((trailing.firstChild as Text).length);
  });

  function createBoundaryBridgeManager(options?: {bindEvents?: boolean}) {
    const rootHost = document.createElement('div');
    rootHost.setAttribute('data-block-id', 'root');
    rootHost.setAttribute('contenteditable', 'true');
    const calloutHost = document.createElement('div');
    calloutHost.setAttribute('data-block-id', 'callout-1');
    const content = document.createElement('div');
    content.className = 'children-render-container';
    const p1Host = document.createElement('p');
    p1Host.setAttribute('data-block-id', 'p1');
    const p2Host = document.createElement('p');
    p2Host.setAttribute('data-block-id', 'p2');
    content.append(p1Host, p2Host);
    calloutHost.appendChild(content);
    rootHost.appendChild(calloutHost);
    document.body.appendChild(rootHost);

    const rootBlock = {id: 'root', nodeType: BlockNodeType.root, hostElement: rootHost, childrenLength: 1} as any;
    const callout = {
      id: 'callout-1',
      nodeType: BlockNodeType.block,
      hostElement: calloutHost,
      parentId: 'root',
      parentBlock: rootBlock,
      childrenLength: 2,
      childrenIds: ['p1', 'p2'],
      childrenRenderRef: {containerElement: content},
      textContent: () => 'one\ntwo',
    } as any;
    const p1 = {
      id: 'p1',
      nodeType: BlockNodeType.editable,
      hostElement: p1Host,
      parentId: 'callout-1',
      parentBlock: callout,
      textContent: () => 'one',
      getIndexOfParent: () => 0,
    } as any;
    const p2 = {
      id: 'p2',
      nodeType: BlockNodeType.editable,
      hostElement: p2Host,
      parentId: 'callout-1',
      parentBlock: callout,
      textContent: () => 'two',
      getIndexOfParent: () => 1,
    } as any;
    const blocks: Record<string, any> = {root: rootBlock, 'callout-1': callout, p1, p2};
    let selectionChangeHandler: ((event: Event) => void) | null = null;
    const doc = {
      root: rootBlock,
      event: {
        add() {},
        bindHotkey() {},
        status: {isComposing: false},
        customListen(_target: EventTarget, type: string) {
          return {
            subscribe(fn: (event: Event) => void) {
              if (type === 'selectionchange') {
                selectionChangeHandler = fn;
              }
              return {unsubscribe() {}};
            },
          };
        },
      },
      afterInit(fn: (root: any) => void) {
        if (options?.bindEvents) fn(rootBlock);
      },
      onDestroy$: new Subject<void>(),
      getBlockById: (id: string) => blocks[id],
      compareBlockPosition: () => Node.DOCUMENT_POSITION_FOLLOWING,
      queryBlocksBetween: () => [],
      logger: {warn: jasmine.createSpy('warn')},
    };
    const manager = new SelectionManager(doc as any);

    return {
      manager,
      content,
      dispatchSelectionChange: () => selectionChangeHandler?.(new Event('selectionchange')),
    };
  }

  function createMixedBoundaryBridgeManager() {
    const rootHost = document.createElement('div');
    rootHost.setAttribute('data-block-id', 'root');
    rootHost.setAttribute('contenteditable', 'true');
    const p0Host = document.createElement('p');
    p0Host.setAttribute('data-block-id', 'p0');
    p0Host.textContent = 'before';
    const calloutHost = document.createElement('div');
    calloutHost.setAttribute('data-block-id', 'callout-1');
    const leading = createBlockGapSpace();
    const calloutContent = document.createElement('div');
    const trailing = createBlockGapSpace();
    calloutHost.append(leading, calloutContent, trailing);
    const p1Host = document.createElement('p');
    p1Host.setAttribute('data-block-id', 'p1');
    const p1Text = document.createTextNode('after');
    p1Host.appendChild(p1Text);
    rootHost.append(p0Host, calloutHost, p1Host);
    document.body.appendChild(rootHost);

    const rootBlock = {
      id: 'root',
      nodeType: BlockNodeType.root,
      hostElement: rootHost,
      childrenLength: 3,
      childrenIds: ['p0', 'callout-1', 'p1'],
    } as any;
    const p0 = {
      id: 'p0',
      nodeType: BlockNodeType.editable,
      hostElement: p0Host,
      parentId: 'root',
      parentBlock: rootBlock,
      getIndexOfParent: () => 0,
    } as any;
    const callout = {
      id: 'callout-1',
      nodeType: BlockNodeType.block,
      hostElement: calloutHost,
      parentId: 'root',
      parentBlock: rootBlock,
      childrenLength: 0,
      childrenIds: [],
      textContent: () => 'callout',
      getIndexOfParent: () => 1,
    } as any;
    const p1 = {
      id: 'p1',
      nodeType: BlockNodeType.editable,
      hostElement: p1Host,
      containerElement: p1Host,
      parentId: 'root',
      parentBlock: rootBlock,
      textLength: p1Text.length,
      textContent: () => 'after',
      getIndexOfParent: () => 2,
      runtime: {
        mapper: {
          modelPointToDomPoint: (_container: HTMLElement, offset: number) => ({node: p1Text, offset}),
        },
      },
    } as any;
    const blocks: Record<string, any> = {root: rootBlock, p0, 'callout-1': callout, p1};
    const doc = {
      root: rootBlock,
      event: {add() {}, bindHotkey() {}},
      afterInit() {},
      onDestroy$: new Subject<void>(),
      getBlockById: (id: string) => blocks[id],
      compareBlockPosition: (a: string, b: string) => blocks[a].hostElement.compareDocumentPosition(blocks[b].hostElement),
      queryBlocksBetween: () => [],
      logger: {warn: jasmine.createSpy('warn')},
    };
    const manager = new SelectionManager(doc as any);

    return {manager, leading, p1Text};
  }

  it('replays boundary JSON into the canonical selection synchronously', () => {
    const rootHost = document.createElement('div');
    rootHost.setAttribute('data-block-id', 'root');
    rootHost.setAttribute('contenteditable', 'true');
    const calloutHost = document.createElement('div');
    calloutHost.setAttribute('data-block-id', 'callout-1');
    const content = document.createElement('div');
    content.className = 'children-render-container';
    const p1Host = document.createElement('p');
    p1Host.setAttribute('data-block-id', 'p1');
    const p2Host = document.createElement('p');
    p2Host.setAttribute('data-block-id', 'p2');
    content.append(p1Host, p2Host);
    calloutHost.appendChild(content);
    rootHost.appendChild(calloutHost);
    document.body.appendChild(rootHost);

    const rootBlock = {id: 'root', nodeType: BlockNodeType.root, hostElement: rootHost, childrenLength: 1} as any;
    const callout = {
      id: 'callout-1',
      nodeType: BlockNodeType.block,
      hostElement: calloutHost,
      parentId: 'root',
      parentBlock: rootBlock,
      childrenLength: 2,
      childrenIds: ['p1', 'p2'],
      childrenRenderRef: {containerElement: content},
      textContent: () => 'one\ntwo',
    } as any;
    const p1 = {
      id: 'p1',
      nodeType: BlockNodeType.editable,
      hostElement: p1Host,
      parentId: 'callout-1',
      parentBlock: callout,
      textContent: () => 'one',
      getIndexOfParent: () => 0,
    } as any;
    const p2 = {
      id: 'p2',
      nodeType: BlockNodeType.editable,
      hostElement: p2Host,
      parentId: 'callout-1',
      parentBlock: callout,
      textContent: () => 'two',
      getIndexOfParent: () => 1,
    } as any;
    const blocks: Record<string, any> = {root: rootBlock, 'callout-1': callout, p1, p2};
    const doc = {
      root: rootBlock,
      event: {add() {}, bindHotkey() {}},
      afterInit() {},
      onDestroy$: new Subject<void>(),
      getBlockById: (id: string) => blocks[id],
      compareBlockPosition: () => Node.DOCUMENT_POSITION_FOLLOWING,
      queryBlocksBetween: () => [],
      logger: {warn: jasmine.createSpy('warn')},
    };
    const manager = new SelectionManager(doc as any);

    manager.replay({
      anchor: {blockId: 'callout-1', type: 'boundary', index: 0},
      head: {blockId: 'callout-1', type: 'boundary', index: 2},
      commonParent: 'callout-1',
    });

    expect(manager.value?.getBoundarySelectedChildIds()).toEqual(['p1', 'p2']);
    const range = document.getSelection()!.getRangeAt(0);
    expect(range.startContainer).toBe(content);
    expect(range.endContainer).toBe(content);
  });

  it('replays reversed boundary JSON without normalizing canonical anchor/head', () => {
    const {manager, content} = createBoundaryBridgeManager();

    manager.replay({
      anchor: {blockId: 'callout-1', type: 'boundary', index: 2},
      head: {blockId: 'callout-1', type: 'boundary', index: 0},
      commonParent: 'callout-1',
    });

    const value = manager.value;
    expect(value?.direction).toBe('backward');
    expect(value?.toJSON()).toEqual({
      anchor: {blockId: 'callout-1', type: 'boundary', index: 2},
      head: {blockId: 'callout-1', type: 'boundary', index: 0},
      commonParent: 'callout-1',
    });
    expect(value?.getBoundarySelectedChildIds()).toEqual(['p1', 'p2']);
    const range = document.getSelection()!.getRangeAt(0);
    expect(range.startContainer).toBe(content);
    expect(range.startOffset).toBe(0);
    expect(range.endContainer).toBe(content);
    expect(range.endOffset).toBe(2);
  });

  it('derives text and rects from a reversed boundary model without changing anchor/head', () => {
    const {manager} = createBoundaryBridgeManager();

    manager.replay({
      anchor: {blockId: 'callout-1', type: 'boundary', index: 2},
      head: {blockId: 'callout-1', type: 'boundary', index: 0},
      commonParent: 'callout-1',
    });
    const json = manager.value!.toJSON();

    expect(manager.getSelectedText()).toBe('one\ntwo');
    expect(manager.getSelectionRects()).not.toBeNull();
    expect(manager.value?.toJSON()).toEqual(json);
  });

  it('keeps reversed boundary replay when the native selectionchange is delayed', () => {
    const {manager, dispatchSelectionChange} = createBoundaryBridgeManager({bindEvents: true});
    const recalculateSpy = spyOn(manager, 'recalculate').and.callThrough();

    manager.replay({
      anchor: {blockId: 'callout-1', type: 'boundary', index: 2},
      head: {blockId: 'callout-1', type: 'boundary', index: 0},
      commonParent: 'callout-1',
    });
    const value = manager.value;
    dispatchSelectionChange();

    expect(recalculateSpy).not.toHaveBeenCalled();
    expect(manager.value).toBe(value);
    expect(manager.value?.toJSON()).toEqual({
      anchor: {blockId: 'callout-1', type: 'boundary', index: 2},
      head: {blockId: 'callout-1', type: 'boundary', index: 0},
      commonParent: 'callout-1',
    });
  });

  it('replays reversed mixed text-to-boundary JSON while building a forward DOM range', () => {
    const {manager, leading, p1Text} = createMixedBoundaryBridgeManager();

    manager.replay({
      anchor: {blockId: 'p1', type: 'text', offset: 3},
      head: {blockId: 'root', type: 'boundary', index: 1},
      commonParent: 'root',
    });

    const value = manager.value;
    expect(value?.direction).toBe('backward');
    expect(value?.toJSON()).toEqual({
      anchor: {blockId: 'p1', type: 'text', offset: 3},
      head: {blockId: 'root', type: 'boundary', index: 1},
      commonParent: 'root',
    });
    expect(value?.start.type).toBe('boundary');
    expect(value?.end.type).toBe('text');
    const range = document.getSelection()!.getRangeAt(0);
    expect(range.startContainer).toBe(leading.firstChild!);
    expect(range.startOffset).toBe(0);
    expect(range.endContainer).toBe(p1Text);
    expect(range.endOffset).toBe(3);
  });

  it('derives text and rects from a reversed mixed text-to-boundary model', () => {
    const {manager} = createMixedBoundaryBridgeManager();

    manager.replay({
      anchor: {blockId: 'p1', type: 'text', offset: 3},
      head: {blockId: 'root', type: 'boundary', index: 1},
      commonParent: 'root',
    });
    const json = manager.value!.toJSON();

    expect(manager.getSelectedText()).toBe('callout\naft');
    expect(manager.getSelectionRects()).not.toBeNull();
    expect(manager.value?.toJSON()).toEqual(json);
  });

  it('selects container children as a boundary range instead of selecting the container block', () => {
    const rootHost = document.createElement('div');
    rootHost.setAttribute('data-block-id', 'root');
    rootHost.setAttribute('contenteditable', 'true');
    const calloutHost = document.createElement('div');
    calloutHost.setAttribute('data-block-id', 'callout-1');
    const content = document.createElement('div');
    content.className = 'children-render-container';
    const p1Host = document.createElement('p');
    p1Host.setAttribute('data-block-id', 'p1');
    const p2Host = document.createElement('p');
    p2Host.setAttribute('data-block-id', 'p2');
    content.append(p1Host, p2Host);
    calloutHost.appendChild(content);
    rootHost.appendChild(calloutHost);
    document.body.appendChild(rootHost);

    const rootBlock = {id: 'root', nodeType: BlockNodeType.root, hostElement: rootHost, childrenLength: 1} as any;
    const callout = {
      id: 'callout-1',
      nodeType: BlockNodeType.block,
      hostElement: calloutHost,
      parentId: 'root',
      parentBlock: rootBlock,
      childrenLength: 2,
      childrenIds: ['p1', 'p2'],
      childrenRenderRef: {containerElement: content},
      textContent: () => 'one\ntwo',
    } as any;
    const p1 = {
      id: 'p1',
      nodeType: BlockNodeType.editable,
      hostElement: p1Host,
      parentId: 'callout-1',
      parentBlock: callout,
      textContent: () => 'one',
      getIndexOfParent: () => 0,
    } as any;
    const p2 = {
      id: 'p2',
      nodeType: BlockNodeType.editable,
      hostElement: p2Host,
      parentId: 'callout-1',
      parentBlock: callout,
      textContent: () => 'two',
      getIndexOfParent: () => 1,
    } as any;
    const blocks: Record<string, any> = {root: rootBlock, 'callout-1': callout, p1, p2};
    const doc = {
      root: rootBlock,
      event: {add() {}, bindHotkey() {}},
      afterInit() {},
      onDestroy$: new Subject<void>(),
      isEditable: (block: any) => block?.nodeType === BlockNodeType.editable,
      getBlockById: (id: string) => blocks[id],
      compareBlockPosition: () => Node.DOCUMENT_POSITION_FOLLOWING,
      queryBlocksBetween: () => [],
      logger: {warn: jasmine.createSpy('warn')},
    };
    const manager = new SelectionManager(doc as any);

    manager.selectAllChildren(callout);

    const value = manager.value;
    expect(value?.isAllSelected).toBeFalse();
    expect(value?.getBoundarySelectedChildIds()).toEqual(['p1', 'p2']);
    const range = document.getSelection()!.getRangeAt(0);
    expect(range.startContainer).toBe(content);
    expect(range.startOffset).toBe(0);
    expect(range.endContainer).toBe(content);
    expect(range.endOffset).toBe(2);
  });

  function createTableManager() {
    const rootHost = document.createElement('div');
    rootHost.setAttribute('data-block-id', 'root');
    rootHost.setAttribute('contenteditable', 'true');

    const tableHost = document.createElement('table');
    tableHost.setAttribute('data-block-id', 'table-1');
    tableHost.className = 'table-block';
    const row1Host = document.createElement('tr');
    row1Host.setAttribute('data-block-id', 'row-1');
    const row2Host = document.createElement('tr');
    row2Host.setAttribute('data-block-id', 'row-2');
    tableHost.append(row1Host, row2Host);
    rootHost.appendChild(tableHost);

    const makeCellHost = (id: string, text: string) => {
      const host = document.createElement('td');
      host.setAttribute('data-block-id', id);
      host.textContent = text;
      return host;
    };
    const c1Host = makeCellHost('cell-1', 'A');
    const c2Host = makeCellHost('cell-2', 'B');
    const c3Host = makeCellHost('cell-3', 'C');
    const c4Host = makeCellHost('cell-4', 'D');
    row1Host.append(c1Host, c2Host);
    row2Host.append(c3Host, c4Host);
    document.body.appendChild(rootHost);

    const rootBlock = {id: 'root', nodeType: BlockNodeType.root, hostElement: rootHost, childrenIds: ['table-1'], childrenLength: 1} as any;
    const table = {
      id: 'table-1',
      flavour: 'table',
      nodeType: BlockNodeType.block,
      hostElement: tableHost,
      parentId: 'root',
      parentBlock: rootBlock,
      childrenIds: ['row-1', 'row-2'],
      childrenLength: 2,
      confirmSelection: (start: number[], end: number[]) => ({start, end}),
      getCellsMatrixByCoordinates(start: number[], end: number[]) {
        const rows = [row1, row2];
        return rows.slice(start[0], end[0] + 1)
          .map(row => row.children.slice(start[1], end[1] + 1));
      },
      textContent: () => 'A\tB\nC\tD',
    } as any;
    const row1 = {
      id: 'row-1',
      nodeType: BlockNodeType.block,
      hostElement: row1Host,
      parentId: 'table-1',
      parentBlock: table,
      childrenIds: ['cell-1', 'cell-2'],
      children: [] as any[],
    } as any;
    const row2 = {
      id: 'row-2',
      nodeType: BlockNodeType.block,
      hostElement: row2Host,
      parentId: 'table-1',
      parentBlock: table,
      childrenIds: ['cell-3', 'cell-4'],
      children: [] as any[],
    } as any;
    const makeCell = (id: string, hostElement: HTMLElement, parentBlock: any, index: number, text: string) => ({
      id,
      flavour: 'table-cell',
      nodeType: BlockNodeType.block,
      hostElement,
      parentId: parentBlock.id,
      parentBlock,
      childrenIds: [],
      childrenLength: 0,
      getIndexOfParent: () => index,
      textContent: () => text,
    }) as any;
    const c1 = makeCell('cell-1', c1Host, row1, 0, 'A');
    const c2 = makeCell('cell-2', c2Host, row1, 1, 'B');
    const c3 = makeCell('cell-3', c3Host, row2, 0, 'C');
    const c4 = makeCell('cell-4', c4Host, row2, 1, 'D');
    row1.children = [c1, c2];
    row2.children = [c3, c4];
    const blocks: Record<string, any> = {root: rootBlock, 'table-1': table, 'row-1': row1, 'row-2': row2, 'cell-1': c1, 'cell-2': c2, 'cell-3': c3, 'cell-4': c4};
    const doc = {
      root: rootBlock,
      event: {add() {}, bindHotkey() {}},
      afterInit() {},
      onDestroy$: new Subject<void>(),
      getBlockById: (id: string) => blocks[id],
      compareBlockPosition: (a: string, b: string) => blocks[a].hostElement.compareDocumentPosition(blocks[b].hostElement),
      queryBlocksBetween: () => [],
      logger: {warn: jasmine.createSpy('warn')},
    };
    const manager = new SelectionManager(doc as any);
    return {manager, table, c1, c4};
  }

  it('sets a model-only table-cell selection synchronously', () => {
    const {manager, table, c1, c4} = createTableManager();

    manager.setTableCellSelection(table, c1, c4);

    expect(manager.value?.getTableCellSelection()).toEqual({
      tableId: 'table-1',
      anchorCellId: 'cell-1',
      headCellId: 'cell-4',
    });
    expect(document.getSelection()?.rangeCount).toBe(0);
  });

  it('does not expose DOM rects for model-only table-cell selections', () => {
    const {manager, table, c1, c4} = createTableManager();

    manager.setTableCellSelection(table, c1, c4);

    expect(manager.getSelectionRect()).toBeNull();
    expect(manager.getSelectionRects()).toBeNull();
  });

  it('keeps model-only table-cell selection when native selection is empty', () => {
    const {manager, table, c1, c4} = createTableManager();

    manager.setTableCellSelection(table, c1, c4);
    document.getSelection()?.removeAllRanges();
    const result = manager.recalculate();

    expect(result.value?.getTableCellSelection()).toEqual({
      tableId: 'table-1',
      anchorCellId: 'cell-1',
      headCellId: 'cell-4',
    });
    expect(manager.value?.getTableCellSelection()?.headCellId).toBe('cell-4');
  });

  it('clears model-only table-cell selection when focus leaves the editor', () => {
    const {manager, table, c1, c4} = createTableManager();
    const outsideButton = document.createElement('button');
    outsideButton.setAttribute('data-selection-test-outside', 'true');
    document.body.appendChild(outsideButton);

    manager.setTableCellSelection(table, c1, c4);
    outsideButton.focus();
    document.getSelection()?.removeAllRanges();
    const result = manager.recalculate();

    expect(result.value).toBeNull();
    expect(manager.value).toBeNull();
  });

  it('replays table-cell JSON as a model selection', () => {
    const {manager} = createTableManager();

    manager.replay({
      anchor: {blockId: 'cell-1', type: 'table-cell', tableId: 'table-1'},
      head: {blockId: 'cell-4', type: 'table-cell', tableId: 'table-1'},
      commonParent: 'table-1',
    });

    expect(manager.value?.getTableCellSelection()?.headCellId).toBe('cell-4');
    expect(document.getSelection()?.rangeCount).toBe(0);
    expect(manager.getSelectionRects()).toBeNull();
    expect(manager.getSelectedText()).toBe('A\tB\nC\tD');
  });

  it('clears a replayed table-cell selection when replaying null', () => {
    const {manager} = createTableManager();

    manager.replay({
      anchor: {blockId: 'cell-1', type: 'table-cell', tableId: 'table-1'},
      head: {blockId: 'cell-4', type: 'table-cell', tableId: 'table-1'},
      commonParent: 'table-1',
    });
    manager.replay(null);

    expect(manager.value).toBeNull();
    expect(document.getSelection()?.rangeCount).toBe(0);
  });
});

describe('SelectionManager programmatic model-first writes', () => {
  function createProgrammaticManager(options?: {
    brokenMapperBlockId?: string
    projectionFailures?: number
  }) {
    document.getSelection()?.removeAllRanges();

    const rootHost = document.createElement('div');
    rootHost.setAttribute('data-block-id', 'model-root');
    rootHost.setAttribute('data-model-first-test', 'true');
    rootHost.setAttribute('contenteditable', 'true');
    const p1Host = document.createElement('p');
    const p2Host = document.createElement('p');
    p1Host.setAttribute('data-block-id', 'model-p1');
    p2Host.setAttribute('data-block-id', 'model-p2');
    const p1Text = document.createTextNode('hello');
    const p2Text = document.createTextNode('world');
    p1Host.appendChild(p1Text);
    p2Host.appendChild(p2Text);
    rootHost.append(p1Host, p2Host);
    document.body.appendChild(rootHost);

    let rootChildrenIds = ['model-p1', 'model-p2'];
    const childrenIdsRead = jasmine.createSpy('childrenIdsRead');
    const root = {
      id: 'model-root',
      nodeType: BlockNodeType.root,
      hostElement: rootHost,
      parentId: null,
      parentBlock: null,
      get childrenIds() {
        childrenIdsRead();
        return rootChildrenIds;
      },
      set childrenIds(value: string[]) {
        rootChildrenIds = value;
      },
      childrenLength: 2,
    } as any;
    let projectionFailures = options?.projectionFailures ?? Number.POSITIVE_INFINITY;
    const makeEditable = (id: string, hostElement: HTMLElement, textNode: Text, index: number) => ({
      id,
      flavour: 'paragraph',
      nodeType: BlockNodeType.editable,
      hostElement,
      containerElement: hostElement,
      parentId: root.id,
      parentBlock: root,
      childrenIds: [],
      childrenLength: 0,
      textLength: textNode.length,
      textContent: () => textNode.data,
      getIndexOfParent: () => index,
      runtime: {
        mapper: {
          modelPointToDomPoint: (_container: HTMLElement, offset: number) => {
            if (options?.brokenMapperBlockId === id && projectionFailures > 0) {
              projectionFailures -= 1;
              throw new Error(`mapper failed: ${id}`);
            }
            return {node: textNode, offset};
          },
        },
      },
    });
    const p1 = makeEditable('model-p1', p1Host, p1Text, 0) as any;
    const p2 = makeEditable('model-p2', p2Host, p2Text, 1) as any;
    const blocks: Record<string, any> = {
      [root.id]: root,
      [p1.id]: p1,
      [p2.id]: p2,
    };
    const compareBlockPosition = jasmine.createSpy('compareBlockPosition').and.callFake(() => {
      throw new Error('DOM block ordering must not be used');
    });
    const logger = {warn: jasmine.createSpy('warn')};
    const queryBlocksBetween = jasmine.createSpy('queryBlocksBetween').and.returnValue([]);
    const doc = {
      root,
      event: {add() {}, bindHotkey() {}},
      afterInit() {},
      onDestroy$: new Subject<void>(),
      isEditable: (block: any) => block?.nodeType === BlockNodeType.editable,
      getBlockById: (id: string) => {
        const block = blocks[id];
        if (!block) throw new Error(`missing block: ${id}`);
        return block;
      },
      compareBlockPosition,
      queryBlocksBetween,
      queryBlocksThroughPathDeeply: () => [],
      logger,
    };

    return {
      manager: new SelectionManager(doc as any),
      doc,
      root,
      p1,
      p2,
      p1Text,
      p2Text,
      logger,
      compareBlockPosition,
      childrenIdsRead,
      queryBlocksBetween,
    };
  }

  afterEach(() => {
    document.getSelection()?.removeAllRanges();
    document.querySelectorAll('[data-model-first-test]').forEach(element => element.remove());
    document.querySelectorAll('[data-projection-outside]').forEach(element => element.remove());
  });

  it('publishes a collapsed text model synchronously from setCursorAt', () => {
    const {manager, p1, p1Text} = createProgrammaticManager();

    manager.setCursorAt(p1, 2);

    expect(manager.value?.toJSON()).toEqual({
      anchor: {blockId: p1.id, type: 'text', offset: 2},
      head: {blockId: p1.id, type: 'text', offset: 2},
      commonParent: p1.id,
    });
    const range = document.getSelection()!.getRangeAt(0);
    expect(range.startContainer).toBe(p1Text);
    expect(range.startOffset).toBe(2);
  });

  it('canonicalizes a single legacy text range without losing its length', () => {
    const {manager, p1} = createProgrammaticManager();

    const range = manager.setSelection({
      blockId: p1.id,
      type: 'text',
      index: 1,
      length: 3,
    });

    expect(manager.value?.toJSON()).toEqual({
      anchor: {blockId: p1.id, type: 'text', offset: 1},
      head: {blockId: p1.id, type: 'text', offset: 4},
      commonParent: p1.id,
    });
    expect(range).toBe(document.getSelection()!.getRangeAt(0));
  });

  it('canonicalizes cross-block legacy end length and orders from the model tree', () => {
    const {manager, p1, p2, compareBlockPosition} = createProgrammaticManager();

    manager.setSelection(
      {blockId: p1.id, type: 'text', index: 2, length: 0},
      {blockId: p2.id, type: 'text', index: 1, length: 2},
    );

    expect(manager.value?.direction).toBe('forward');
    expect(manager.value?.toJSON()).toEqual({
      anchor: {blockId: p1.id, type: 'text', offset: 2},
      head: {blockId: p2.id, type: 'text', offset: 3},
      commonParent: 'model-root',
    });
    expect(compareBlockPosition).not.toHaveBeenCalled();
  });

  it('resolves and validates one cross-block commit only once', () => {
    const {manager, p1, p2, childrenIdsRead, queryBlocksBetween} = createProgrammaticManager();

    manager.setSelection(
      {blockId: p1.id, type: 'text', offset: 1, block: p1},
      {blockId: p2.id, type: 'text', offset: 2, block: p2},
    );

    expect(childrenIdsRead).toHaveBeenCalledTimes(1);
    expect(queryBlocksBetween).toHaveBeenCalledTimes(1);

    childrenIdsRead.calls.reset();
    queryBlocksBetween.calls.reset();
    expect(manager.value?.start.blockId).toBe(p1.id);
    expect(manager.value?.end.blockId).toBe(p2.id);
    expect(manager.value?.direction).toBe('forward');
    expect(childrenIdsRead).not.toHaveBeenCalled();
    expect(queryBlocksBetween).not.toHaveBeenCalled();
  });

  it('normalizes reversed legacy ranges to forward anchor and head', () => {
    const {manager, p1, p2} = createProgrammaticManager();

    manager.setSelection(
      {blockId: p2.id, type: 'text', index: 2, length: 1},
      {blockId: p1.id, type: 'text', index: 1, length: 2},
    );

    expect(manager.value?.direction).toBe('forward');
    expect(manager.value?.toJSON()).toEqual({
      anchor: {blockId: p1.id, type: 'text', offset: 3},
      head: {blockId: p2.id, type: 'text', offset: 2},
      commonParent: 'model-root',
    });
  });

  it('preserves reversed intent for current selection points', () => {
    const {manager, p1, p2} = createProgrammaticManager();

    manager.setSelection(
      {blockId: p2.id, type: 'text', offset: 2, block: p2},
      {blockId: p1.id, type: 'text', offset: 3, block: p1},
    );

    expect(manager.value?.direction).toBe('backward');
    expect(manager.value?.toJSON()).toEqual({
      anchor: {blockId: p2.id, type: 'text', offset: 2},
      head: {blockId: p1.id, type: 'text', offset: 3},
      commonParent: 'model-root',
    });
  });

  it('extends from the canonical anchor and replaces only the head', () => {
    const {manager, p1, p2} = createProgrammaticManager();
    manager.setCursorAt(p1, 3);

    manager.extendTo(p2, 2);

    expect(manager.value?.toJSON()).toEqual({
      anchor: {blockId: p1.id, type: 'text', offset: 3},
      head: {blockId: p2.id, type: 'text', offset: 2},
      commonParent: 'model-root',
    });
  });

  it('uses the model-first cursor path for editable setCursorAtBlock', () => {
    const {manager, p1} = createProgrammaticManager();

    manager.setCursorAtBlock(p1, false, false);

    expect(manager.value?.toJSON()).toEqual({
      anchor: {blockId: p1.id, type: 'text', offset: p1.textLength},
      head: {blockId: p1.id, type: 'text', offset: p1.textLength},
      commonParent: p1.id,
    });
  });

  it('publishes the model before applying the derived native range', () => {
    const {manager, p1} = createProgrammaticManager();
    const nativeSelection = document.getSelection()!;
    const originalAddRange = nativeSelection.addRange.bind(nativeSelection);
    const valuesDuringAddRange: Array<BlockSelection | null> = [];
    spyOn(nativeSelection, 'addRange').and.callFake((range: Range) => {
      valuesDuringAddRange.push(manager.value);
      originalAddRange(range);
    });

    manager.setCursorAt(p1, 1);

    expect(valuesDuringAddRange[0]?.toJSON()).toEqual({
      anchor: {blockId: p1.id, type: 'text', offset: 1},
      head: {blockId: p1.id, type: 'text', offset: 1},
      commonParent: p1.id,
    });
  });

  it('keeps the canonical state and retries when DOM projection fails transiently', () => {
    const callbacks: FrameRequestCallback[] = [];
    const rafSpy = (window.requestAnimationFrame as any).and
      ? window.requestAnimationFrame as jasmine.Spy
      : spyOn(window, 'requestAnimationFrame');
    rafSpy.and.callFake((callback: FrameRequestCallback) => {
      callbacks.push(callback);
      return callbacks.length;
    });
    const {manager, root, p1, p1Text, logger} = createProgrammaticManager({
      brokenMapperBlockId: 'model-p1',
      projectionFailures: 1,
    });

    expect(() => manager.setCursorAt(p1, 1)).not.toThrow();

    expect(manager.value?.toJSON()).toEqual({
      anchor: {blockId: p1.id, type: 'text', offset: 1},
      head: {blockId: p1.id, type: 'text', offset: 1},
      commonParent: p1.id,
    });
    expect(document.activeElement).toBe(root.hostElement);
    expect(document.getSelection()?.rangeCount).toBe(0);
    expect(callbacks.length).toBe(1);
    expect(logger.warn).not.toHaveBeenCalled();

    callbacks.shift()!(performance.now());

    const range = document.getSelection()!.getRangeAt(0);
    expect(range.startContainer).toBe(p1Text);
    expect(range.startOffset).toBe(1);
    expect(manager.value?.start.blockId).toBe(p1.id);
  });

  it('keeps an undo-style replay snapshot while its DOM projection is pending', () => {
    const callbacks: FrameRequestCallback[] = [];
    const rafSpy = (window.requestAnimationFrame as any).and
      ? window.requestAnimationFrame as jasmine.Spy
      : spyOn(window, 'requestAnimationFrame');
    rafSpy.and.callFake((callback: FrameRequestCallback) => {
      callbacks.push(callback);
      return callbacks.length;
    });
    const {manager, p1, p1Text} = createProgrammaticManager({
      brokenMapperBlockId: 'model-p1',
      projectionFailures: 1,
    });
    const snapshot = {
      anchor: {blockId: p1.id, type: 'text' as const, offset: 3},
      head: {blockId: p1.id, type: 'text' as const, offset: 3},
      commonParent: p1.id,
    };

    manager.replay(snapshot);

    expect(manager.value?.toJSON()).toEqual(snapshot);
    expect(document.getSelection()?.rangeCount).toBe(0);

    callbacks.shift()!(performance.now());

    expect(manager.value?.toJSON()).toEqual(snapshot);
    const range = document.getSelection()!.getRangeAt(0);
    expect(range.startContainer).toBe(p1Text);
    expect(range.startOffset).toBe(3);
  });

  it('cancels a stale projection retry after a newer selection is committed', () => {
    const callbacks: FrameRequestCallback[] = [];
    const rafSpy = (window.requestAnimationFrame as any).and
      ? window.requestAnimationFrame as jasmine.Spy
      : spyOn(window, 'requestAnimationFrame');
    rafSpy.and.callFake((callback: FrameRequestCallback) => {
      callbacks.push(callback);
      return callbacks.length;
    });
    const {manager, p1, p2, p2Text} = createProgrammaticManager({
      brokenMapperBlockId: 'model-p1',
      projectionFailures: 1,
    });

    manager.setCursorAt(p1, 1);
    manager.setCursorAt(p2, 2);
    callbacks.shift()!(performance.now());

    expect(manager.value?.toJSON()).toEqual({
      anchor: {blockId: p2.id, type: 'text', offset: 2},
      head: {blockId: p2.id, type: 'text', offset: 2},
      commonParent: p2.id,
    });
    const range = document.getSelection()!.getRangeAt(0);
    expect(range.startContainer).toBe(p2Text);
    expect(range.startOffset).toBe(2);
  });

  it('does not steal focus back when the user focuses outside before a retry', () => {
    const callbacks: FrameRequestCallback[] = [];
    const rafSpy = (window.requestAnimationFrame as any).and
      ? window.requestAnimationFrame as jasmine.Spy
      : spyOn(window, 'requestAnimationFrame');
    rafSpy.and.callFake((callback: FrameRequestCallback) => {
      callbacks.push(callback);
      return callbacks.length;
    });
    const {manager, p1} = createProgrammaticManager({
      brokenMapperBlockId: 'model-p1',
      projectionFailures: 1,
    });
    const outside = document.createElement('button');
    outside.setAttribute('data-projection-outside', 'true');
    document.body.appendChild(outside);

    manager.setCursorAt(p1, 1);
    outside.focus();
    callbacks.shift()!(performance.now());

    expect(document.activeElement).toBe(outside);
    expect(document.getSelection()?.rangeCount).toBe(0);
    expect(manager.value?.start.blockId).toBe(p1.id);
  });

  it('keeps the model and focus when projection retries are exhausted', () => {
    const callbacks: FrameRequestCallback[] = [];
    const rafSpy = (window.requestAnimationFrame as any).and
      ? window.requestAnimationFrame as jasmine.Spy
      : spyOn(window, 'requestAnimationFrame');
    rafSpy.and.callFake((callback: FrameRequestCallback) => {
      callbacks.push(callback);
      return callbacks.length;
    });
    const {manager, root, p1, logger} = createProgrammaticManager({brokenMapperBlockId: 'model-p1'});

    manager.setCursorAt(p1, 1);
    while (callbacks.length) {
      callbacks.shift()!(performance.now());
    }

    expect(manager.value?.toJSON()).toEqual({
      anchor: {blockId: p1.id, type: 'text', offset: 1},
      head: {blockId: p1.id, type: 'text', offset: 1},
      commonParent: p1.id,
    });
    expect(document.activeElement).toBe(root.hostElement);
    expect(document.getSelection()?.rangeCount).toBe(0);
    expect(logger.warn).toHaveBeenCalledOnceWith(
      'selectionProjectionRetryError: ',
      jasmine.any(Error),
    );
  });

  it('rejects replay endpoints that are live but disconnected in the model tree', () => {
    const {manager, root, p1, p2} = createProgrammaticManager();
    root.childrenIds = [p1.id];
    root.childrenLength = 1;

    manager.replay({
      anchor: {blockId: p1.id, type: 'text', offset: 1},
      head: {blockId: p2.id, type: 'text', offset: 2},
      commonParent: root.id,
    });

    expect(manager.value).toBeNull();
    expect(document.getSelection()?.rangeCount).toBe(0);
  });
});
