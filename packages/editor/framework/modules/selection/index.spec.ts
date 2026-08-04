import {Subject} from 'rxjs';
import {BlockNodeType} from '../../block-std';
import {createBlockGapSpace} from '../../utils';
import {nextTick} from '../../../global';
import {SelectionManager} from './index';
import {BlockSelection} from './blockSelection';

describe('SelectionManager DOM selection normalization', () => {
  function createManager(options?: {
    bindEvents?: boolean;
    remoteSyncLifecycle$?: Subject<any>;
  }) {
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
      childrenIds: ['block-1'],
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
      crud: options?.remoteSyncLifecycle$
        ? {remoteSyncLifecycle$: options.remoteSyncLifecycle$.asObservable()}
        : undefined,
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

  it('constructs remote reconciliation without reading a partially assigned doc.selection', () => {
    const remoteSyncLifecycle$ = new Subject<any>();

    expect(() => createManager({remoteSyncLifecycle$})).not.toThrow();

    remoteSyncLifecycle$.complete();
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

  it('rejects a native range that leaks outside the editor before normalization', () => {
    const {manager, rootHost, blockHost, doc} = createManager();
    const insideText = document.createTextNode('inside');
    blockHost.appendChild(insideText);
    const outside = document.createElement('div');
    outside.setAttribute('data-selection-test-outside', 'true');
    const outsideText = document.createTextNode('outside');
    outside.appendChild(outsideText);
    document.body.appendChild(outside);
    rootHost.focus();
    const range = document.createRange();
    range.setStart(insideText, 0);
    range.setEnd(outsideText, outsideText.length);
    const nativeSelection = document.getSelection()!;
    nativeSelection.removeAllRanges();
    nativeSelection.addRange(range);
    const normalizeRange = spyOn<any>(manager, '_normalizeRange').and.callThrough();

    const result = manager.recalculate();

    expect(result.value).toBeNull();
    expect(manager.value).toBeNull();
    expect(normalizeRange).not.toHaveBeenCalled();
    expect(nativeSelection.rangeCount).toBe(0);
    expect(doc.logger.warn).not.toHaveBeenCalled();
  });

  it('does not clear a native selection wholly owned by an external editor', () => {
    const {manager, doc} = createManager();
    const outside = document.createElement('div');
    outside.setAttribute('data-selection-test-outside', 'true');
    outside.setAttribute('contenteditable', 'true');
    const outsideText = document.createTextNode('outside');
    outside.appendChild(outsideText);
    document.body.appendChild(outside);
    outside.focus();
    const range = document.createRange();
    range.selectNodeContents(outside);
    const nativeSelection = document.getSelection()!;
    nativeSelection.removeAllRanges();
    nativeSelection.addRange(range);

    const result = manager.recalculate();

    expect(result.value).toBeNull();
    expect(nativeSelection.rangeCount).toBe(1);
    expect(nativeSelection.getRangeAt(0).toString()).toBe('outside');
    expect(doc.logger.warn).not.toHaveBeenCalled();
  });

  it('updates the canonical selection immediately when setting a gap cursor', () => {
    const {manager, block, blockHost} = createManager();
    const leading = createBlockGapSpace('before');
    const trailing = createBlockGapSpace('after');
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

  it('degrades a disallowed absolute-object gap cursor to block selection', () => {
    const {manager, block, blockHost, doc} = createManager();
    blockHost.append(
      createBlockGapSpace('before'),
      document.createElement('div'),
      createBlockGapSpace('after'),
    );
    (doc as any).placement = {
      allowsGapCursor: jasmine.createSpy('allowsGapCursor')
        .and.returnValue(false),
    };

    manager.setGapCursor(block as any, 'after');

    expect(manager.value?.start.type).toBe('selected');
    expect(manager.value?.end.type).toBe('selected');
    expect(manager.value?.start.blockId).toBe(block.id);
  });

  it('coerces a stale native gap on placement-layout to block selection', () => {
    const {manager, block, blockHost, doc} = createManager();
    const leading = createBlockGapSpace('before');
    blockHost.append(
      leading,
      document.createElement('div'),
      createBlockGapSpace('after'),
    );
    (block as any).flavour = 'placement-layout';
    (doc as any).placement = {
      allowsGapCursor: jasmine.createSpy('allowsGapCursor')
        .and.callFake((blockOrId: string | {flavour?: string}) =>
          typeof blockOrId === 'string'
            ? blockOrId !== block.id
            : blockOrId.flavour !== 'placement-layout'),
    };
    const range = document.createRange();
    range.setStart(leading.firstChild!, 0);
    range.collapse(true);
    const nativeSelection = document.getSelection()!;
    nativeSelection.removeAllRanges();
    nativeSelection.addRange(range);

    const result = manager.recalculate();

    expect(result.value?.start.type).toBe('selected');
    expect(result.value?.end.type).toBe('selected');
    expect(result.value?.start.blockId).toBe(block.id);
    expect((doc as any).placement.allowsGapCursor)
      .toHaveBeenCalledWith(block.id);
  });

  it('updates the canonical selection immediately when selecting a container block', () => {
    const {manager, block, blockHost} = createManager();
    const leading = createBlockGapSpace('before');
    const trailing = createBlockGapSpace('after');
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

  it('materializes a virtual string target before selecting its block view', () => {
    const {manager, block, blockHost, doc} = createManager();
    const leading = createBlockGapSpace('before');
    const trailing = createBlockGapSpace('after');
    blockHost.append(leading, document.createElement('div'), trailing);
    let mounted = false;
    const ensureViewMounted = jasmine.createSpy('ensureViewMounted').and.callFake(() => {
      mounted = true;
    });
    (doc as any).virtualization = {ensureViewMounted};
    (doc as any).getBlockById = jasmine.createSpy('getBlockById').and.callFake((id: string) => {
      if (id === 'block-1' && !mounted) throw new Error('view is not mounted');
      return id === 'root' ? doc.root : block;
    });

    manager.selectBlock('block-1');

    expect(ensureViewMounted).toHaveBeenCalledOnceWith(['block-1']);
    expect(manager.value?.start.blockId).toBe('block-1');
    expect(manager.value?.isAllSelected).toBeTrue();
  });

  it('keeps a programmatic block selection when the native selectionchange is delayed', () => {
    const {manager, block, blockHost, dispatchSelectionChange} = createManager({bindEvents: true});
    const leading = createBlockGapSpace('before');
    const trailing = createBlockGapSpace('after');
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

  it('lets a new primary mousedown end the previous programmatic suppression window', () => {
    const {manager, rootHost, block, blockHost, dispatchSelectionChange} = createManager({bindEvents: true});
    const leading = createBlockGapSpace('before');
    const trailing = createBlockGapSpace('after');
    blockHost.append(leading, document.createElement('div'), trailing);
    const recalculateSpy = spyOn(manager, 'recalculate').and.callThrough();

    manager.selectBlock(block as any);
    rootHost.dispatchEvent(new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      button: 0,
    }));
    dispatchSelectionChange();

    expect(recalculateSpy).toHaveBeenCalledTimes(1);
  });

  it('holds the pointer target inline layout while native selection may be dragging', () => {
    const {manager, rootHost, block} = createManager({bindEvents: true});
    const release = jasmine.createSpy('releaseFloatLayoutFreeze');
    (block as any).runtime = {
      acquireFloatLayoutFreeze: jasmine.createSpy(
        'acquireFloatLayoutFreeze',
      ).and.returnValue(release),
    };

    rootHost.querySelector('[data-block-id="block-1"]')!.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        button: 0,
        isPrimary: true,
        pointerId: 7,
      }),
    );
    expect((block as any).runtime.acquireFloatLayoutFreeze)
      .toHaveBeenCalledTimes(1);
    expect(release).not.toHaveBeenCalled();

    window.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true,
      isPrimary: true,
      pointerId: 7,
    }));

    expect(release).toHaveBeenCalledTimes(1);
    void manager;
  });

  it('keeps a pending DOM projection authoritative until a new pointer intent cancels it', () => {
    const {manager, rootHost, block, blockHost, dispatchSelectionChange} = createManager({bindEvents: true});
    const leading = createBlockGapSpace('before');
    const trailing = createBlockGapSpace('after');
    blockHost.append(leading, document.createElement('div'), trailing);
    const recalculateSpy = spyOn(manager, 'recalculate').and.callThrough();

    manager.selectBlock(block as any);
    (manager as any)._suppressProgrammaticSelectionChangeUntil = 0;
    (manager as any)._projectionFrame = 987654;
    dispatchSelectionChange();

    expect(recalculateSpy).not.toHaveBeenCalled();

    rootHost.dispatchEvent(new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      button: 0,
    }));
    dispatchSelectionChange();

    expect((manager as any)._projectionFrame).toBeNull();
    expect(recalculateSpy).toHaveBeenCalledTimes(1);
  });

  it('keeps explicit recalculate suppression across a primary mousedown', () => {
    const {manager, rootHost, block, blockHost, dispatchSelectionChange} = createManager({bindEvents: true});
    const leading = createBlockGapSpace('before');
    const trailing = createBlockGapSpace('after');
    blockHost.append(leading, document.createElement('div'), trailing);
    const recalculateSpy = spyOn(manager, 'recalculate').and.callThrough();

    manager.selectBlock(block as any);
    manager.setSuppressRecalculate(true);
    rootHost.dispatchEvent(new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      button: 0,
    }));
    dispatchSelectionChange();
    manager.setSuppressRecalculate(false);

    expect(recalculateSpy).not.toHaveBeenCalled();
  });

  it('suppresses native recalculation during an inline layout projection lease', () => {
    const {manager, dispatchSelectionChange} = createManager({bindEvents: true});
    const recalculateSpy = spyOn(manager, 'recalculate').and.returnValue({value: null});

    const release = manager.acquireInlineLayoutProjectionGuard();
    dispatchSelectionChange();
    release();
    release();
    dispatchSelectionChange();

    expect(recalculateSpy).toHaveBeenCalledTimes(1);
  });

  it('preserves an explicit suppression state changed inside the layout guard', () => {
    const {manager, dispatchSelectionChange} = createManager({bindEvents: true});
    const recalculateSpy = spyOn(manager, 'recalculate').and.returnValue({value: null});

    const release = manager.acquireInlineLayoutProjectionGuard();
    manager.setSuppressRecalculate(true);
    release();
    dispatchSelectionChange();
    manager.setSuppressRecalculate(false);
    dispatchSelectionChange();

    expect(recalculateSpy).toHaveBeenCalledTimes(1);
  });

  it('rechecks a selectionchange after the same event releases a stale composition gate', async () => {
    const {manager, doc, dispatchSelectionChange} = createManager({bindEvents: true});
    const recalculateSpy = spyOn(manager, 'recalculate').and.returnValue({value: null});

    doc.event.status.isComposing = true;
    dispatchSelectionChange();
    // CompositionControl can run later than SelectionManager for the same
    // native event, depending on afterInit listener registration order.
    doc.event.status.isComposing = false;
    await Promise.resolve();

    expect(recalculateSpy).toHaveBeenCalledTimes(1);
  });

  it('rechecks when a later selectionchange listener releases the composition gate in a microtask', async () => {
    const {manager, doc, dispatchSelectionChange} = createManager({bindEvents: true});
    const recalculateSpy = spyOn(manager, 'recalculate').and.returnValue({value: null});

    doc.event.status.isComposing = true;
    dispatchSelectionChange();
    queueMicrotask(() => {
      doc.event.status.isComposing = false;
    });
    await new Promise(resolve => setTimeout(resolve, 20));

    expect(recalculateSpy).toHaveBeenCalledTimes(1);
  });

  it('stops bounded composition rechecks while a real composition remains active', async () => {
    const {manager, doc, dispatchSelectionChange} = createManager({bindEvents: true});
    const recalculateSpy = spyOn(manager, 'recalculate').and.returnValue({value: null});

    doc.event.status.isComposing = true;
    dispatchSelectionChange();
    await new Promise(resolve => setTimeout(resolve, 20));

    expect(recalculateSpy).not.toHaveBeenCalled();
    expect((manager as any)._compositionSelectionRecheckTimer).toBeNull();
  });

  it('rechecks after a stale composition recovers inside the programmatic suppression window', async () => {
    const {manager, doc, dispatchSelectionChange} = createManager({bindEvents: true});
    const recalculateSpy = spyOn(manager, 'recalculate').and.returnValue({value: null});
    (manager as any)._suppressProgrammaticSelectionChangeUntil = performance.now() + 10;

    doc.event.status.isComposing = true;
    dispatchSelectionChange();
    doc.event.status.isComposing = false;
    await new Promise(resolve => setTimeout(resolve, 30));

    expect(recalculateSpy).toHaveBeenCalledTimes(1);
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
    const leading = createBlockGapSpace('before');
    const trailing = createBlockGapSpace('after');
    const content = document.createElement('div');
    const expectedRect = new DOMRect(10, 20, 1, 24);
    blockHost.append(leading, content, trailing);
    spyOn(trailing, 'getBoundingClientRect').and.returnValue(expectedRect);

    manager.setGapCursor(block as any, 'after');

    expect(manager.getSelectionRect()).toBe(expectedRect);
  });

  it('delegates virtualized history placement to block navigation', async () => {
    const {manager, blockHost, doc} = createManager();
    const leading = createBlockGapSpace('before');
    const trailing = createBlockGapSpace('after');
    blockHost.append(leading, document.createElement('div'), trailing);
    const source = {
      anchor: {blockId: 'block-1', type: 'gap' as const, side: 'after' as const},
      head: {blockId: 'block-1', type: 'gap' as const, side: 'after' as const},
      commonParent: 'block-1',
    };
    const scrollIntoView = spyOn(manager, 'scrollSelectionIntoView');
    const scrollToBlock = jasmine.createSpy('scrollToBlock').and.returnValue(Promise.resolve(true));
    let mounted = false;
    const ensureViewMounted = jasmine.createSpy('ensureViewMounted').and.callFake(() => {
      mounted = true;
    });
    (doc as any).virtualization = {enabled: true, ensureViewMounted, scrollToBlock};
    (doc as any).getBlockById = (id: string) => {
      if (id === 'root') return doc.root;
      if (!mounted) throw new Error('view is not mounted');
      return {
        id: 'block-1',
        nodeType: BlockNodeType.block,
        hostElement: blockHost,
        parentId: 'root',
        parentBlock: doc.root,
        textContent: () => 'void text',
      };
    };

    manager.restoreBookmark({
      anchor: {type: 'gap', blockId: 'block-1', side: 'after'},
      head: {type: 'gap', blockId: 'block-1', side: 'after'},
      source,
      dependencyBlockIds: new Set(['root', 'block-1']),
      structuralPositions: [],
    });
    await nextTick();

    expect(ensureViewMounted).toHaveBeenCalledOnceWith(['block-1']);
    expect(scrollToBlock).toHaveBeenCalledOnceWith('block-1');
    expect(scrollIntoView).not.toHaveBeenCalled();
    doc.onDestroy$.next();
  });

  it('keeps the viewport stable when a restored virtualized selection is already visible', async () => {
    const {manager, blockHost, rootHost, doc} = createManager();
    const leading = createBlockGapSpace('before');
    const trailing = createBlockGapSpace('after');
    blockHost.append(leading, document.createElement('div'), trailing);
    const source = {
      anchor: {blockId: 'block-1', type: 'gap' as const, side: 'after' as const},
      head: {blockId: 'block-1', type: 'gap' as const, side: 'after' as const},
      commonParent: 'block-1',
    };
    Object.defineProperty(rootHost, 'scrollTop', {value: 80, writable: true});
    spyOn(rootHost, 'getBoundingClientRect').and.returnValue(new DOMRect(0, 100, 300, 200));
    spyOn(trailing, 'getBoundingClientRect').and.returnValue(new DOMRect(20, 160, 1, 24));
    const scrollToBlock = jasmine.createSpy('scrollToBlock').and.returnValue(Promise.resolve(true));
    (doc as any).scrollContainer = rootHost;
    (doc as any).virtualization = {
      enabled: true,
      ensureViewMounted: jasmine.createSpy('ensureViewMounted'),
      scrollToBlock,
    };

    manager.restoreBookmark({
      anchor: {type: 'gap', blockId: 'block-1', side: 'after'},
      head: {type: 'gap', blockId: 'block-1', side: 'after'},
      source,
      dependencyBlockIds: new Set(['root', 'block-1']),
      structuralPositions: [],
    });
    await nextTick();

    expect(scrollToBlock).not.toHaveBeenCalled();
    expect(rootHost.scrollTop).toBe(80);
    doc.onDestroy$.next();
  });

  it('scrolls toward the active head instead of the ordered range start', () => {
    const {manager, blockHost, rootHost, doc} = createManager();
    const leading = createBlockGapSpace('before');
    const trailing = createBlockGapSpace('after');
    blockHost.append(leading, document.createElement('div'), trailing);
    Object.defineProperty(rootHost, 'scrollTop', {value: 0, writable: true});
    spyOn(rootHost, 'getBoundingClientRect').and.returnValue(new DOMRect(0, 0, 300, 100));
    spyOn(leading, 'getBoundingClientRect').and.returnValue(new DOMRect(0, 8, 1, 24));
    spyOn(trailing, 'getBoundingClientRect').and.returnValue(new DOMRect(0, 180, 1, 24));
    (doc as any).scrollContainer = rootHost;

    manager.replay({
      anchor: {blockId: 'block-1', type: 'gap', side: 'before'},
      head: {blockId: 'block-1', type: 'gap', side: 'after'},
      commonParent: 'block-1',
    });
    manager.scrollSelectionIntoView();

    expect(rootHost.scrollTop).toBe(128);
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
    const leading = createBlockGapSpace('before');
    const trailing = createBlockGapSpace('after');
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

    const leading = createBlockGapSpace('before');
    const trailing = createBlockGapSpace('after');
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
    const leading = createBlockGapSpace('before');
    const content = document.createElement('div');
    const trailing = createBlockGapSpace('after');
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
    const leading = createBlockGapSpace('before');
    const calloutContent = document.createElement('div');
    const trailing = createBlockGapSpace('after');
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
      props: {colWidths: [100, 100]},
      confirmSelection: jasmine.createSpy('confirmSelection').and.callFake((start: number[], end: number[]) => ({start, end})),
      getCellsMatrixByCoordinates: jasmine.createSpy('getCellsMatrixByCoordinates').and.callFake((start: number[], end: number[]) => {
        const rows = [row1, row2];
        return rows.slice(start[0], end[0] + 1)
          .map(row => row.children.slice(start[1], end[1] + 1));
      }),
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
    const modelChildren: Record<string, string[]> = {
      root: ['table-1'],
      'table-1': ['row-1', 'row-2'],
      'row-1': ['cell-1', 'cell-2'],
      'row-2': ['cell-3', 'cell-4'],
      'cell-1': ['paragraph-1'],
      'cell-2': ['paragraph-2'],
      'cell-3': ['paragraph-3'],
      'cell-4': ['paragraph-4'],
      'paragraph-1': [],
      'paragraph-2': [],
      'paragraph-3': [],
      'paragraph-4': [],
    };
    const modelParent: Record<string, string | null> = {
      root: null,
      'table-1': 'root',
      'row-1': 'table-1',
      'row-2': 'table-1',
      'cell-1': 'row-1',
      'cell-2': 'row-1',
      'cell-3': 'row-2',
      'cell-4': 'row-2',
      'paragraph-1': 'cell-1',
      'paragraph-2': 'cell-2',
      'paragraph-3': 'cell-3',
      'paragraph-4': 'cell-4',
    };
    const modelText: Record<string, string> = {
      'paragraph-1': 'A',
      'paragraph-2': 'B',
      'paragraph-3': 'C',
      'paragraph-4': 'D',
    };
    const modelFlavour = (id: string) => {
      if (id === 'root') return 'root';
      if (id === 'table-1') return 'table';
      if (id.startsWith('row-')) return 'table-row';
      if (id.startsWith('cell-')) return 'table-cell';
      if (id.startsWith('paragraph-')) return 'paragraph';
      return undefined;
    };
    const doc = {
      root: rootBlock,
      event: {add() {}, bindHotkey() {}},
      afterInit() {},
      onDestroy$: new Subject<void>(),
      getBlockById: jasmine.createSpy('getBlockById').and.callFake((id: string) =>
        id === 'cell-2' || id === 'cell-3' ? undefined : blocks[id]),
      model: {
        exists: (id: string) => id in modelChildren,
        getParentId: (id: string) => modelParent[id] ?? null,
        getChildrenIds: (id: string) => [...(modelChildren[id] ?? [])],
        getTextLength: (id: string) => modelText[id]?.length ?? 0,
        getFlavour: modelFlavour,
        getProps: (id: string) => id === 'table-1' ? {colWidths: [100, 100]} : {},
        getNodeType: (id: string) => id.startsWith('paragraph-')
          ? BlockNodeType.editable
          : BlockNodeType.block,
        getTextDeltas: (id: string) => id in modelText ? [{insert: modelText[id]}] : undefined,
      },
      compareBlockPosition: (a: string, b: string) => blocks[a].hostElement.compareDocumentPosition(blocks[b].hostElement),
      queryBlocksBetween: () => [],
      logger: {warn: jasmine.createSpy('warn')},
    };
    const manager = new SelectionManager(doc as any);
    return {manager, table, c1, c4, c1Host, rootHost, doc};
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

  it('keeps a model-only table-cell selection when Safari leaks a range outside root', () => {
    const {manager, table, c1, c4, c1Host, rootHost, doc} = createTableManager();
    const outside = document.createElement('div');
    outside.setAttribute('data-selection-test-outside', 'true');
    const outsideText = document.createTextNode('outside');
    outside.appendChild(outsideText);
    document.body.appendChild(outside);
    manager.setTableCellSelection(table, c1, c4);
    rootHost.focus();
    const range = document.createRange();
    range.setStart(c1Host.firstChild!, 0);
    range.setEnd(outsideText, outsideText.length);
    const nativeSelection = document.getSelection()!;
    nativeSelection.removeAllRanges();
    nativeSelection.addRange(range);
    const normalizeRange = spyOn<any>(manager, '_normalizeRange').and.callThrough();

    const result = manager.recalculate();

    expect(result.value?.getTableCellSelection()).toEqual({
      tableId: 'table-1',
      anchorCellId: 'cell-1',
      headCellId: 'cell-4',
    });
    expect(manager.value?.getTableCellSelection()?.headCellId).toBe('cell-4');
    expect(normalizeRange).not.toHaveBeenCalled();
    expect(nativeSelection.rangeCount).toBe(0);
    expect(doc.logger.warn).not.toHaveBeenCalled();
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
    const {manager, table} = createTableManager();

    manager.replay({
      anchor: {blockId: 'cell-1', type: 'table-cell', tableId: 'table-1'},
      head: {blockId: 'cell-4', type: 'table-cell', tableId: 'table-1'},
      commonParent: 'table-1',
    });

    expect(manager.value?.getTableCellSelection()?.headCellId).toBe('cell-4');
    expect(document.getSelection()?.rangeCount).toBe(0);
    expect(manager.getSelectionRects()).toBeNull();
    expect(manager.getSelectedText()).toBe('A\tB\nC\tD');
    expect(table.confirmSelection).not.toHaveBeenCalled();
    expect(table.getCellsMatrixByCoordinates).not.toHaveBeenCalled();
    expect(manager.doc.getBlockById).not.toHaveBeenCalledWith('cell-2');
    expect(manager.doc.getBlockById).not.toHaveBeenCalledWith('cell-3');
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

  it('creates and derives a selection from the model graph while endpoint components are unmounted', () => {
    const parentById: Record<string, string | null> = {
      'virtual-root': null,
      'virtual-p1': 'virtual-root',
      'virtual-p2': 'virtual-root',
    };
    const childrenById: Record<string, readonly string[]> = {
      'virtual-root': ['virtual-p1', 'virtual-p2'],
      'virtual-p1': [],
      'virtual-p2': [],
    };
    const getBlockById = jasmine.createSpy('getBlockById').and.throwError('component is unmounted');
    const doc = {
      root: {id: 'virtual-root', hostElement: document.createElement('div')},
      event: {add() {}, bindHotkey() {}},
      afterInit() {},
      onDestroy$: new Subject<void>(),
      getBlockById,
      model: {
        exists: (blockId: string) => blockId in parentById,
        getParentId: (blockId: string) => parentById[blockId],
        getChildrenIds: (blockId: string) => childrenById[blockId] ?? [],
        getTextLength: (blockId: string) => blockId === 'virtual-p2' ? 5 : 4,
        queryBetween: () => [],
      },
      logger: {warn: jasmine.createSpy('warn')},
    };
    const manager = new SelectionManager(doc as any);

    const selection = manager.createSelection({
      anchor: {blockId: 'virtual-p1', type: 'text', offset: 1},
      head: {blockId: 'virtual-p2', type: 'text', offset: 5},
      commonParent: 'virtual-root',
    });

    expect(selection?.direction).toBe('forward');
    expect(selection?.firstBlockId).toBe('virtual-p1');
    expect(selection?.lastBlockId).toBe('virtual-p2');
    expect(selection?.isEndOfBlock).toBeTrue();
    expect(getBlockById).not.toHaveBeenCalled();
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
    const callbacks = new Map<number, FrameRequestCallback>();
    let nextFrame = 0;
    const rafSpy = (window.requestAnimationFrame as any).and
      ? window.requestAnimationFrame as jasmine.Spy
      : spyOn(window, 'requestAnimationFrame');
    rafSpy.and.callFake((callback: FrameRequestCallback) => {
      const frame = ++nextFrame;
      callbacks.set(frame, callback);
      return frame;
    });
    const cancelRafSpy = (window.cancelAnimationFrame as any).and
      ? window.cancelAnimationFrame as jasmine.Spy
      : spyOn(window, 'cancelAnimationFrame');
    cancelRafSpy.and.callFake((frame: number) => callbacks.delete(frame));
    const {manager, p1, p2, p2Text} = createProgrammaticManager({
      brokenMapperBlockId: 'model-p1',
      projectionFailures: 1,
    });

    manager.setCursorAt(p1, 1);
    expect(callbacks.size).toBe(1);

    manager.setCursorAt(p2, 2);

    expect(cancelRafSpy).toHaveBeenCalledOnceWith(1);
    expect(callbacks.size).toBe(0);
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

describe('SelectionManager projection mount coordination', () => {
  function deferred<T = void>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    });
    return {promise, resolve, reject};
  }

  function createProjectionMountManager() {
    document.getSelection()?.removeAllRanges();

    const rootHost = document.createElement('div');
    rootHost.setAttribute('data-block-id', 'virtual-root');
    rootHost.setAttribute('data-projection-mount-test', 'true');
    rootHost.setAttribute('contenteditable', 'true');
    document.body.appendChild(rootHost);

    const childrenById: Record<string, readonly string[]> = {
      'virtual-root': ['virtual-p0', 'virtual-callout', 'virtual-p1', 'virtual-p2'],
      'virtual-p0': [],
      'virtual-callout': [],
      'virtual-p1': [],
      'virtual-p2': [],
    };
    const parentById: Record<string, string | null> = {
      'virtual-root': null,
      'virtual-p0': 'virtual-root',
      'virtual-callout': 'virtual-root',
      'virtual-p1': 'virtual-root',
      'virtual-p2': 'virtual-root',
    };
    const root = {
      id: 'virtual-root',
      nodeType: BlockNodeType.root,
      hostElement: rootHost,
      parentId: null,
      parentBlock: null,
      childrenIds: childrenById['virtual-root'],
      childrenLength: childrenById['virtual-root'].length,
    } as any;
    const mountedBlocks = new Map<string, any>();
    const mountedTextNodes = new Map<string, Text>();
    const eventStreams = new Map<string, Subject<Event>>();
    const frames = new Map<number, FrameRequestCallback>();
    let nextFrame = 0;
    const surface = {
      ownerDocument: document,
      getActiveElement: () => rootHost,
      getNativeSelection: () => document.getSelection(),
      clearNativeSelection: () => document.getSelection()?.removeAllRanges(),
      createRange: () => document.createRange(),
      focusRoot: jasmine.createSpy('focusRoot'),
      focusEditingHost: jasmine.createSpy('focusEditingHost'),
      hasEditorFocus: () => true,
      isFocusDropped: () => false,
      isRootConnected: () => true,
      ownsNativeSelection: () => false,
      requestFrame: (callback: FrameRequestCallback) => {
        const frame = ++nextFrame;
        frames.set(frame, callback);
        return frame;
      },
      cancelFrame: (frame: number) => {
        frames.delete(frame);
      },
      getElementRect: (element: Element) => element.getBoundingClientRect(),
      getRangeRect: (range: Range) => range.getBoundingClientRect(),
      getRangeRects: (range: Range) => range.getClientRects(),
    };
    const onDestroy$ = new Subject<void>();
    const logger = {warn: jasmine.createSpy('warn')};
    const doc = {
      root,
      event: {
        add() {},
        bindHotkey() {},
        status: {isComposing: false, isSelecting: false},
        customListen(_target: EventTarget, eventName: string) {
          let stream = eventStreams.get(eventName);
          if (!stream) {
            stream = new Subject<Event>();
            eventStreams.set(eventName, stream);
          }
          return stream;
        },
      },
      afterInit() {},
      onDestroy$,
      model: {
        exists: (blockId: string) => blockId in parentById,
        getParentId: (blockId: string) => parentById[blockId] ?? null,
        getChildrenIds: (blockId: string) => childrenById[blockId] ?? [],
        getPath: (blockId: string) => blockId === root.id
          ? [root.id]
          : blockId in parentById ? [root.id, blockId] : null,
        getTextLength: (blockId: string) => blockId.startsWith('virtual-p') ? 8 : 0,
        queryBetween: () => [],
      },
      vm: {
        isMounted: (blockId: string) => blockId === root.id ||
          !!mountedBlocks.get(blockId)?.hostElement.isConnected,
      },
      getBlockById: (blockId: string) => {
        if (blockId === root.id) return root;
        const mounted = mountedBlocks.get(blockId);
        if (mounted) return mounted;
        throw new Error(`component is unmounted: ${blockId}`);
      },
      queryBlocksBetween: () => [],
      queryBlocksThroughPathDeeply: () => [],
      logger,
    };

    const mountEditable = (blockId: string) => {
      const hostElement = document.createElement('p');
      hostElement.setAttribute('data-block-id', blockId);
      const textNode = document.createTextNode('mounted text');
      hostElement.appendChild(textNode);
      rootHost.appendChild(hostElement);
      const block = {
        id: blockId,
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
        runtime: {
          mapper: {
            modelPointToDomPoint: (_container: HTMLElement, offset: number) => ({
              node: textNode,
              offset,
            }),
          },
        },
      };
      mountedBlocks.set(blockId, block);
      mountedTextNodes.set(blockId, textNode);
      return block;
    };

    return {
      manager: new SelectionManager(doc as any, surface as any),
      frames,
      onDestroy$,
      logger,
      mountEditable,
      mountedTextNodes,
      rootHost,
      doc,
      dispatchSelectionChange: () => {
        eventStreams.get('selectionchange')?.next(new Event('selectionchange'));
      },
    };
  }

  function registerMountAdapter(
    manager: SelectionManager,
    adapter: {ensureMounted(blockIds: readonly string[], signal: AbortSignal): void | Promise<void>},
  ): () => void {
    const register = (manager as any).registerProjectionMountAdapter;
    expect(typeof register).toBe('function');
    return typeof register === 'function'
      ? register.call(manager, adapter)
      : () => {};
  }

  afterEach(() => {
    document.getSelection()?.removeAllRanges();
    document.querySelectorAll('[data-projection-mount-test]').forEach(element => element.remove());
  });

  it('mounts the endpoint neighborhood before broadcasting an offscreen boundary selection', () => {
    const {manager, mountEditable, mountedTextNodes} = createProjectionMountManager();
    const ensureViewMounted = jasmine.createSpy('ensureViewMounted').and.callFake((blockIds: readonly string[]) => {
      blockIds.forEach(blockId => {
        if (blockId.startsWith('virtual-p') && !mountedTextNodes.has(blockId)) {
          mountEditable(blockId);
        }
      });
    });
    (manager as any).doc.virtualization = {ensureViewMounted};
    let firstEndpointMountedWhenPublished = false;
    manager.changeObserve().subscribe(selection => {
      if (!selection) return;
      const firstSelectedId = selection.getBoundarySelectedChildIds()?.[0];
      firstEndpointMountedWhenPublished = !!firstSelectedId && mountedTextNodes.has(firstSelectedId);
    });

    manager.replay({
      anchor: {blockId: 'virtual-root', type: 'boundary', index: 2},
      head: {blockId: 'virtual-root', type: 'boundary', index: 3},
      commonParent: 'virtual-root',
    });

    expect(ensureViewMounted).toHaveBeenCalledOnceWith([
      'virtual-root',
      'virtual-p1',
      'virtual-callout',
      'virtual-p2',
    ]);
    expect(firstEndpointMountedWhenPublished).toBeTrue();
    expect(manager.value?.firstBlock.id).toBe('virtual-p1');
  });

  it('projects a full-document boundary range identically on the first and second replay', () => {
    const {manager, mountEditable, mountedTextNodes, rootHost} = createProjectionMountManager();
    const ensureViewMounted = jasmine.createSpy('ensureViewMounted').and.callFake((blockIds: readonly string[]) => {
      blockIds.forEach(blockId => {
        if (blockId.startsWith('virtual-p') && !mountedTextNodes.has(blockId)) {
          mountEditable(blockId);
        }
      });
    });
    (manager as any).doc.virtualization = {enabled: true, ensureViewMounted};
    const fullSelection = {
      anchor: {blockId: 'virtual-root', type: 'boundary' as const, index: 0},
      head: {blockId: 'virtual-root', type: 'boundary' as const, index: 4},
      commonParent: 'virtual-root',
    };

    manager.replay(fullSelection);
    const first = document.getSelection()!.getRangeAt(0).cloneRange();
    manager.replay(fullSelection);
    const second = document.getSelection()!.getRangeAt(0);

    expect(ensureViewMounted).toHaveBeenCalledTimes(1);
    expect(ensureViewMounted).toHaveBeenCalledWith([
      'virtual-root',
      'virtual-p0',
      'virtual-p2',
    ]);
    const firstText = mountedTextNodes.get('virtual-p0')!;
    const lastText = mountedTextNodes.get('virtual-p2')!;
    expect(first.startContainer).toBe(firstText);
    expect(first.startOffset).toBe(0);
    expect(first.endContainer).toBe(lastText);
    expect(first.endOffset).toBe(lastText.length);
    expect(second.startContainer).toBe(first.startContainer);
    expect(second.startOffset).toBe(first.startOffset);
    expect(second.endContainer).toBe(first.endContainer);
    expect(second.endOffset).toBe(first.endOffset);

    const transientMiddle = document.createElement('div');
    rootHost.insertBefore(transientMiddle, lastText.parentElement);
    const liveRange = document.getSelection()!.getRangeAt(0);
    expect(liveRange.startContainer).toBe(firstText);
    expect(liveRange.startOffset).toBe(0);
    expect(liveRange.endContainer).toBe(lastText);
    expect(liveRange.endOffset).toBe(lastText.length);
    transientMiddle.remove();
    expect(liveRange.startContainer).toBe(firstText);
    expect(liveRange.endContainer).toBe(lastText);
  });

  it('reprojects a full-document boundary range after the mounted window changes', () => {
    const {manager, mountEditable, mountedTextNodes, rootHost, doc} = createProjectionMountManager();
    const viewChange$ = new Subject<{mountedRootIds: readonly string[]}>();
    const ensureViewMounted = jasmine.createSpy('ensureViewMounted').and.callFake((blockIds: readonly string[]) => {
      blockIds.forEach(blockId => {
        if (blockId.startsWith('virtual-p') && !mountedTextNodes.has(blockId)) {
          mountEditable(blockId);
        }
      });
    });
    (doc as any).virtualization = {enabled: true, ensureViewMounted, viewChange$};
    (manager as any)._bindEvents(doc.root);

    const fullSelection = {
      anchor: {blockId: 'virtual-root', type: 'boundary' as const, index: 0},
      head: {blockId: 'virtual-root', type: 'boundary' as const, index: 4},
      commonParent: 'virtual-root',
    };
    manager.replay(fullSelection);

    const nativeSelection = document.getSelection()!;
    const wrongRange = document.createRange();
    const lastText = mountedTextNodes.get('virtual-p2')!;
    wrongRange.setStart(lastText, 1);
    wrongRange.collapse(true);
    nativeSelection.removeAllRanges();
    nativeSelection.addRange(wrongRange);
    const applyDomRange = spyOn<any>(manager, '_applyDomRange').and.callThrough();
    doc.event.status.isSelecting = true;

    viewChange$.next({mountedRootIds: ['virtual-p0', 'virtual-p2']});

    expect(applyDomRange).toHaveBeenCalledTimes(1);
    const repaired = nativeSelection.getRangeAt(0);
    expect(repaired.startContainer).toBe(mountedTextNodes.get('virtual-p0')!);
    expect(repaired.startOffset).toBe(0);
    expect(repaired.endContainer).toBe(lastText);
    expect(repaired.endOffset).toBe(lastText.length);
    expect(manager.value?.toJSON()).toEqual(fullSelection);
    doc.onDestroy$.next();
  });

  it('keeps a full-document model range while its initial virtual endpoints are still mounting', async () => {
    const {
      manager,
      mountEditable,
      frames,
      rootHost,
      doc,
      dispatchSelectionChange,
    } = createProjectionMountManager();
    const viewChange$ = new Subject<{mountedRootIds: readonly string[]}>();
    const endpointMount = deferred<void>();
    const ensureMounted = jasmine.createSpy('ensureMounted').and.returnValue(endpointMount.promise);
    (doc as any).virtualization = {
      enabled: true,
      ensureViewMounted: jasmine.createSpy('ensureViewMounted'),
      viewChange$,
    };
    registerMountAdapter(manager, {ensureMounted});
    (manager as any)._bindEvents(doc.root);

    const fullSelection = {
      anchor: {blockId: 'virtual-root', type: 'boundary' as const, index: 0},
      head: {blockId: 'virtual-root', type: 'boundary' as const, index: 4},
      commonParent: 'virtual-root',
    };
    manager.replay(fullSelection);

    const publishTransientCollapsedRange = () => {
      const transient = document.createRange();
      transient.setStart(rootHost, 0);
      transient.collapse(true);
      const nativeSelection = document.getSelection()!;
      nativeSelection.removeAllRanges();
      nativeSelection.addRange(transient);
      (manager as any)._suppressProgrammaticSelectionChangeUntil = 0;
      dispatchSelectionChange();
    };

    publishTransientCollapsedRange();
    viewChange$.next({mountedRootIds: []});
    publishTransientCollapsedRange();

    expect(manager.value?.toJSON()).toEqual(fullSelection);
    expect(ensureMounted).toHaveBeenCalledTimes(2);

    mountEditable('virtual-p0');
    mountEditable('virtual-p2');
    endpointMount.resolve();
    await endpointMount.promise;
    await Promise.resolve();
    expect(frames.size).toBe(1);
    const [frame] = frames.values();
    frame(performance.now());

    expect(manager.value?.toJSON()).toEqual(fullSelection);
    const repaired = document.getSelection()!.getRangeAt(0);
    expect(repaired.startContainer).toBe(rootHost.firstChild!.firstChild!);
    expect(repaired.startOffset).toBe(0);
    expect(repaired.endContainer).toBe(rootHost.lastChild!.firstChild!);
    expect(repaired.endOffset).toBe(rootHost.lastChild!.firstChild!.textContent!.length);
    doc.onDestroy$.next();
  });

  it('mounts a retained endpoint component before projecting an empty text cursor', () => {
    const {manager, mountEditable, mountedTextNodes} = createProjectionMountManager();
    const retained = mountEditable('virtual-p1');
    retained.hostElement.remove();
    const ensureViewMounted = jasmine.createSpy('ensureViewMounted').and.callFake(() => {
      (manager as any).doc.root.hostElement.appendChild(retained.hostElement);
    });
    (manager as any).doc.virtualization = {ensureViewMounted};

    manager.replay({
      anchor: {blockId: 'virtual-p1', type: 'text', offset: 0},
      head: {blockId: 'virtual-p1', type: 'text', offset: 0},
      commonParent: 'virtual-p1',
    });

    expect(ensureViewMounted).toHaveBeenCalledOnceWith(['virtual-p1']);
    const range = document.getSelection()!.getRangeAt(0);
    expect(range.startContainer).toBe(mountedTextNodes.get('virtual-p1')!);
    expect(range.startOffset).toBe(0);
  });

  it('requests only unmounted text endpoint blocks before retrying DOM projection', () => {
    const {manager, frames} = createProjectionMountManager();
    const ensureMounted = jasmine.createSpy('ensureMounted')
      .and.returnValue(new Promise<void>(() => {}));
    registerMountAdapter(manager, {ensureMounted});

    manager.replay({
      anchor: {blockId: 'virtual-p1', type: 'text', offset: 1},
      head: {blockId: 'virtual-p2', type: 'text', offset: 2},
      commonParent: 'virtual-root',
    });

    expect(ensureMounted).toHaveBeenCalledTimes(1);
    const [blockIds, signal] = ensureMounted.calls.mostRecent().args as [readonly string[], AbortSignal];
    expect(blockIds).toEqual(['virtual-p1', 'virtual-p2']);
    expect(signal.aborted).toBeFalse();
    expect(frames.size).toBe(0);
    expect(manager.value?.toJSON()).toEqual({
      anchor: {blockId: 'virtual-p1', type: 'text', offset: 1},
      head: {blockId: 'virtual-p2', type: 'text', offset: 2},
      commonParent: 'virtual-root',
    });
  });

  it('requests boundary containers and only their adjacent children without duplicates', () => {
    const {manager, frames} = createProjectionMountManager();
    const ensureMounted = jasmine.createSpy('ensureMounted')
      .and.returnValue(new Promise<void>(() => {}));
    registerMountAdapter(manager, {ensureMounted});

    manager.replay({
      anchor: {blockId: 'virtual-root', type: 'boundary', index: 1},
      head: {blockId: 'virtual-root', type: 'boundary', index: 3},
      commonParent: 'virtual-root',
    });

    expect(ensureMounted).toHaveBeenCalledTimes(1);
    const [blockIds] = ensureMounted.calls.mostRecent().args as [readonly string[], AbortSignal];
    expect([...blockIds].sort()).toEqual([
      'virtual-callout',
      'virtual-p0',
      'virtual-p1',
      'virtual-p2',
      'virtual-root',
    ]);
    expect(new Set(blockIds).size).toBe(blockIds.length);
    expect(frames.size).toBe(0);
  });

  it('aborts a stale request and ignores its late resolution after a newer selection', async () => {
    const {manager, frames} = createProjectionMountManager();
    const first = deferred();
    const second = deferred();
    const ensureMounted = jasmine.createSpy('ensureMounted')
      .and.returnValues(first.promise, second.promise);
    registerMountAdapter(manager, {ensureMounted});

    manager.replay({
      anchor: {blockId: 'virtual-p1', type: 'text', offset: 1},
      head: {blockId: 'virtual-p2', type: 'text', offset: 2},
      commonParent: 'virtual-root',
    });
    const firstSignal = ensureMounted.calls.argsFor(0)[1] as AbortSignal;

    manager.replay({
      anchor: {blockId: 'virtual-p2', type: 'text', offset: 3},
      head: {blockId: 'virtual-p2', type: 'text', offset: 3},
      commonParent: 'virtual-p2',
    });
    const secondSignal = ensureMounted.calls.argsFor(1)[1] as AbortSignal;

    expect(firstSignal.aborted).toBeTrue();
    expect(secondSignal.aborted).toBeFalse();
    expect(frames.size).toBe(0);

    first.resolve();
    await Promise.resolve();
    expect(frames.size).toBe(0);

    second.resolve();
    await Promise.resolve();
    expect(frames.size).toBe(1);
    expect(manager.value?.start.blockId).toBe('virtual-p2');
  });

  it('retries DOM projection after the requested endpoint mounts', async () => {
    const {manager, frames, mountEditable, mountedTextNodes} = createProjectionMountManager();
    const pending = deferred();
    const ensureMounted = jasmine.createSpy('ensureMounted').and.returnValue(pending.promise);
    registerMountAdapter(manager, {ensureMounted});

    manager.replay({
      anchor: {blockId: 'virtual-p1', type: 'text', offset: 2},
      head: {blockId: 'virtual-p1', type: 'text', offset: 2},
      commonParent: 'virtual-p1',
    });
    mountEditable('virtual-p1');
    pending.resolve();
    await Promise.resolve();

    expect(frames.size).toBe(1);
    const callback = [...frames.values()][0];
    callback(performance.now());

    const range = document.getSelection()!.getRangeAt(0);
    expect(range.startContainer).toBe(mountedTextNodes.get('virtual-p1')!);
    expect(range.startOffset).toBe(2);
    expect(manager.value?.start.blockId).toBe('virtual-p1');
  });

  it('aborts an in-flight request when its registration is disposed', async () => {
    const {manager, frames} = createProjectionMountManager();
    const pending = deferred();
    const ensureMounted = jasmine.createSpy('ensureMounted').and.returnValue(pending.promise);
    const dispose = registerMountAdapter(manager, {ensureMounted});
    manager.replay({
      anchor: {blockId: 'virtual-p1', type: 'text', offset: 1},
      head: {blockId: 'virtual-p1', type: 'text', offset: 1},
      commonParent: 'virtual-p1',
    });
    const signal = ensureMounted.calls.mostRecent().args[1] as AbortSignal;

    dispose();
    expect(frames.size).toBe(1);
    pending.resolve();
    await Promise.resolve();

    expect(signal.aborted).toBeTrue();
    expect(frames.size).toBe(1);
  });

  it('hands an in-flight projection request to a replacement adapter', () => {
    const {manager, frames} = createProjectionMountManager();
    const firstPending = deferred();
    const secondPending = deferred();
    const firstEnsureMounted = jasmine.createSpy('firstEnsureMounted')
      .and.returnValue(firstPending.promise);
    const secondEnsureMounted = jasmine.createSpy('secondEnsureMounted')
      .and.returnValue(secondPending.promise);
    registerMountAdapter(manager, {ensureMounted: firstEnsureMounted});
    manager.replay({
      anchor: {blockId: 'virtual-p1', type: 'text', offset: 1},
      head: {blockId: 'virtual-p1', type: 'text', offset: 1},
      commonParent: 'virtual-p1',
    });
    const firstSignal = firstEnsureMounted.calls.mostRecent().args[1] as AbortSignal;

    registerMountAdapter(manager, {ensureMounted: secondEnsureMounted});

    expect(firstSignal.aborted).toBeTrue();
    expect(secondEnsureMounted).toHaveBeenCalledTimes(1);
    expect(secondEnsureMounted.calls.mostRecent().args[0]).toEqual(['virtual-p1']);
    expect(frames.size).toBe(0);
  });

  it('does not let a stale disposer unregister a newer registration of the same adapter', () => {
    const {manager} = createProjectionMountManager();
    const ensureMounted = jasmine.createSpy('ensureMounted')
      .and.returnValue(new Promise<void>(() => {}));
    const adapter = {ensureMounted};
    const disposeFirst = registerMountAdapter(manager, adapter);
    const disposeSecond = registerMountAdapter(manager, adapter);

    disposeFirst();
    manager.replay({
      anchor: {blockId: 'virtual-p1', type: 'text', offset: 1},
      head: {blockId: 'virtual-p1', type: 'text', offset: 1},
      commonParent: 'virtual-p1',
    });

    expect(ensureMounted).toHaveBeenCalledTimes(1);
    disposeSecond();
  });

  it('aborts an in-flight request when the document is destroyed', async () => {
    const {manager, frames, onDestroy$} = createProjectionMountManager();
    const pending = deferred();
    const ensureMounted = jasmine.createSpy('ensureMounted').and.returnValue(pending.promise);
    registerMountAdapter(manager, {ensureMounted});
    manager.replay({
      anchor: {blockId: 'virtual-p1', type: 'text', offset: 1},
      head: {blockId: 'virtual-p1', type: 'text', offset: 1},
      commonParent: 'virtual-p1',
    });
    const signal = ensureMounted.calls.mostRecent().args[1] as AbortSignal;

    onDestroy$.next();
    pending.resolve();
    await Promise.resolve();

    expect(signal.aborted).toBeTrue();
    expect(frames.size).toBe(0);
  });

  it('falls back to the bounded frame retry when mounting rejects', async () => {
    const {manager, frames, logger} = createProjectionMountManager();
    const pending = deferred();
    const ensureMounted = jasmine.createSpy('ensureMounted').and.returnValue(pending.promise);
    registerMountAdapter(manager, {ensureMounted});
    manager.replay({
      anchor: {blockId: 'virtual-p1', type: 'text', offset: 1},
      head: {blockId: 'virtual-p1', type: 'text', offset: 1},
      commonParent: 'virtual-p1',
    });

    pending.reject(new Error('renderer declined mount'));
    await Promise.resolve();

    expect(frames.size).toBe(1);
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
