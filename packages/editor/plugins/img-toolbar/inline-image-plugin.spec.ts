import {ApplicationRef, EnvironmentInjector, Injector} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {Subject} from 'rxjs';
import {
  BlockNodeType,
  DOC_FILE_SERVICE_TOKEN,
  inlineImageEmbedConverter,
  ORIGIN_NO_RECORD,
} from '../../framework';
import {
  INLINE_IMAGE_INTRINSIC_SIZE_EVENT,
} from '../../framework/block-std/inline/image-embed-events';
import {ImgToolbarPlugin} from './index';
import {InlineImageToolbar} from './widgets/inline-image.toolbar';

const setRect = (element: HTMLElement, rect: Partial<DOMRect>) => {
  element.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    width: 0,
    height: 0,
    toJSON: () => ({}),
    ...rect,
  });
};

describe('ImgToolbarPlugin inline-image interaction', () => {
  const makeHarness = (readonly = false, wrapped = false) => {
    TestBed.configureTestingModule({});
    const rootHost = document.createElement('div');
    rootHost.dataset['blockcraftRoot'] = 'true';
    const paragraphHost = document.createElement('div');
    paragraphHost.dataset['blockId'] = 'paragraph-1';
    const shell = inlineImageEmbedConverter.toView({
      insert: {image: 'https://cdn.example.com/a.png'},
      attributes: {
        width: 120,
        height: 60,
        ...(wrapped ? {wrap: true, side: 'auto', x: 0.25, gap: 12} : {}),
      },
    });
    const frame = shell.querySelector<HTMLElement>('.bc-inline-image-frame')!;
    const image = shell.querySelector<HTMLImageElement>('img')!;
    setRect(rootHost, {left: 100, top: 50, width: 500});
    setRect(paragraphHost, {left: 100, top: 50, width: 500});
    setRect(frame, {
      left: 225,
      top: 90,
      right: 345,
      bottom: 150,
      width: 120,
      height: 60,
    });
    setRect(image, {
      left: 225,
      top: 90,
      right: 345,
      bottom: 150,
      width: 120,
      height: 60,
    });
    Object.defineProperty(rootHost, 'clientWidth', {
      configurable: true,
      value: 500,
    });
    Object.defineProperty(paragraphHost, 'clientWidth', {
      configurable: true,
      value: 500,
    });
    paragraphHost.appendChild(shell);
    rootHost.appendChild(paragraphHost);
    document.body.appendChild(rootHost);

    const selection$ = new Subject<any>();
    const onDestroy$ = new Subject<void>();
    const readonlyState$ = new Subject<void>();
    const dragState$ = new Subject<string>();
    const toolbarClicks = new Subject<any>();
    const fileService = {
      previewImg: jasmine.createSpy('previewImg'),
      downloadAttachment: jasmine.createSpy('downloadAttachment'),
    };
    const appRef = TestBed.inject(ApplicationRef);
    const injector = Injector.create({
      providers: [
        {provide: DOC_FILE_SERVICE_TOKEN, useValue: fileService},
        {provide: ApplicationRef, useValue: appRef},
      ],
      parent: TestBed.inject(EnvironmentInjector),
    });
    const deltas = [
      {insert: '前'},
      {
        insert: {image: 'https://cdn.example.com/a.png'},
        attributes: {
          width: 120,
          height: 60,
          ...(wrapped ? {wrap: true, side: 'auto', x: 0.25, gap: 12} : {}),
        },
      },
      {insert: '后'},
    ];
    const paragraphSnapshot = {
      id: 'paragraph-1',
      flavour: 'paragraph',
      nodeType: BlockNodeType.editable,
      props: {depth: 0},
      meta: {},
      children: deltas,
    };
    const rootSnapshot = {
      id: 'root-1',
      flavour: 'root',
      nodeType: BlockNodeType.root,
      props: {},
      meta: {},
      children: [paragraphSnapshot],
    };
    const paragraphBlock = {
      id: 'paragraph-1',
      flavour: 'paragraph',
      nodeType: BlockNodeType.editable,
      hostElement: paragraphHost,
      containerElement: paragraphHost,
      runtime: {
        domPointToModel: jasmine.createSpy('domPointToModel').and.returnValue(1),
        findBlotByOffset: jasmine.createSpy('findBlotByOffset'),
      },
      textDeltas: jasmine.createSpy('textDeltas').and.callFake(() => deltas),
      formatText: jasmine.createSpy('formatText'),
    };
    const rootBlock = {
      id: 'root-1',
      flavour: 'root',
      nodeType: BlockNodeType.root,
      hostElement: rootHost,
      childrenRenderRef: {containerElement: rootHost},
    };
    const run = jasmine.createSpy('run').and.resolveTo(undefined);
    const selectOrSetCursorAtBlock = jasmine.createSpy('selectOrSetCursorAtBlock');
    const replaceWithSnapshots = jasmine.createSpy('replaceWithSnapshots');
    const chain: any = {replaceWithSnapshots, selectOrSetCursorAtBlock, run};
    replaceWithSnapshots.and.returnValue(chain);
    selectOrSetCursorAtBlock.and.returnValue(chain);
    const overlayRef = {
      dispose: jasmine.createSpy('dispose'),
      updatePosition: jasmine.createSpy('updatePosition'),
    };
    const overlayComponentRef = {
      setInput: jasmine.createSpy('setInput'),
      instance: {onItemClicked: toolbarClicks},
    };
    const doc: any = {
      isReadonly: readonly,
      injector,
      root: {hostElement: rootHost},
      onDestroy$,
      selection: {
        value: null,
        selectionChange$: selection$,
        nextChangeObserve: () => new Subject(),
        selectBlock: jasmine.createSpy('selectBlock'),
      },
      dragController: {
        state: 'idle',
        isDragging: false,
        state$: dragState$,
        startDrag: jasmine.createSpy('startDrag'),
      },
      placement: {
        state: 'idle',
        isDragging: false,
        state$: new Subject<string>(),
        registerObjectLayoutAdapter: jasmine.createSpy('registerObjectLayoutAdapter')
          .and.returnValue(() => {}),
      },
      readonlyManager: {
        isReadonly: jasmine.createSpy('isReadonly').and.returnValue(readonly),
        stateChange$: readonlyState$,
      },
      subscribeReadonlyChange: jasmine.createSpy('subscribeReadonlyChange').and.returnValue({
        unsubscribe: jasmine.createSpy('unsubscribeReadonly'),
      }),
      getBlockById: jasmine.createSpy('getBlockById').and.callFake((id: string) => {
        if (id === 'paragraph-1') return paragraphBlock;
        if (id === 'root-1') return rootBlock;
        throw new Error('missing');
      }),
      isEditable: jasmine.createSpy('isEditable').and.callFake((block: any) => block === paragraphBlock),
      overlayService: {
        createConnectedOverlay: jasmine.createSpy('createConnectedOverlay').and.returnValue({
          overlayRef,
          componentRef: overlayComponentRef,
        }),
      },
      model: {
        getParentId: jasmine.createSpy('getParentId').and.returnValue('root-1'),
        toSnapshot: jasmine.createSpy('toSnapshot').and.callFake((id: string) =>
          id === 'paragraph-1' ? paragraphSnapshot : rootSnapshot),
      },
      schemas: {
        isValidChildren: jasmine.createSpy('isValidChildren').and.returnValue(true),
      },
      canInsertChild: jasmine.createSpy('canInsertChild')
        .and.callFake((_parentId: string, flavour: string) =>
          flavour === 'image' && doc.schemas.isValidChildren()),
      messageService: {warn: jasmine.createSpy('warn')},
      chain: jasmine.createSpy('chain').and.returnValue(chain),
      crud: {
        transact: jasmine.createSpy('transact').and.callFake((fn: () => void) => fn()),
      },
    };
    const plugin = new ImgToolbarPlugin();
    (plugin as any).doc = doc;

    return {
      plugin,
      doc,
      rootHost,
      shell,
      frame,
      image,
      paragraphBlock,
      toolbarClicks,
      readonlyState$,
      overlayRef,
      replaceWithSnapshots,
      selectOrSetCursorAtBlock,
      run,
      destroy: () => {
        plugin.destroy();
        rootHost.remove();
      },
    };
  };

  it('opens inline controls from the default image shell', () => {
    const h = makeHarness();
    h.plugin.init();

    h.image.dispatchEvent(new MouseEvent('mousedown', {
      bubbles: true,
      button: 0,
      cancelable: true,
    }));

    expect(h.doc.overlayService.createConnectedOverlay)
      .toHaveBeenCalledWith(jasmine.objectContaining({
        target: h.frame,
        component: InlineImageToolbar,
      }), jasmine.any(Subject), jasmine.any(Function));
    expect(h.shell.querySelector('block-resizer')).not.toBeNull();
    expect(h.shell.classList.contains('bc-inline-image-shell--selected')).toBeTrue();

    h.plugin.closeInlineToolbar();

    expect(h.shell.classList.contains('bc-inline-image-shell--selected')).toBeFalse();
    h.destroy();
  });

  it('does not open inline controls in readonly mode', () => {
    const h = makeHarness(true);
    h.plugin.init();

    h.image.dispatchEvent(new MouseEvent('mousedown', {bubbles: true, button: 0}));

    expect(h.doc.overlayService.createConnectedOverlay).not.toHaveBeenCalled();
    expect(h.shell.querySelector('block-resizer')).toBeNull();
    h.destroy();
  });

  it('commits width and proportional height once when resizing ends', () => {
    const h = makeHarness();
    h.plugin.init();
    h.image.dispatchEvent(new MouseEvent('mousedown', {bubbles: true, button: 0}));

    (h.plugin as any)._inlineResizerRef.instance.widthChange.emit(240);

    expect(h.paragraphBlock.formatText).toHaveBeenCalledOnceWith(1, 1, {
      width: 240,
      height: 120,
    });
    expect(h.shell.querySelector('block-resizer')).toBeNull();
    h.destroy();
  });

  it('does not commit a resize after the image delta becomes stale', () => {
    const h = makeHarness();
    h.plugin.init();
    h.image.dispatchEvent(new MouseEvent('mousedown', {bubbles: true, button: 0}));
    h.paragraphBlock.textDeltas.and.returnValue([
      {insert: '前'},
      {insert: {image: 'https://cdn.example.com/remote.png'}},
      {insert: '后'},
    ]);

    (h.plugin as any)._inlineResizerRef.instance.widthChange.emit(240);

    expect(h.paragraphBlock.formatText).not.toHaveBeenCalled();
    h.destroy();
  });

  it('preserves square-wrap metadata when resizing the visible frame', () => {
    const h = makeHarness(false, true);
    h.plugin.init();
    h.image.dispatchEvent(new MouseEvent('mousedown', {bubbles: true, button: 0}));

    (h.plugin as any)._inlineResizerRef.instance.widthChange.emit(240);

    expect(h.paragraphBlock.formatText).toHaveBeenCalledOnceWith(1, 1, {
      width: 240,
      height: 120,
      wrap: true,
      side: 'auto',
      x: 0.25,
      gap: 12,
    });
    h.destroy();
  });

  it('enables square wrapping with a normalized initial position', () => {
    const h = makeHarness();
    h.plugin.init();
    h.image.dispatchEvent(new MouseEvent('mousedown', {bubbles: true, button: 0}));

    h.toolbarClicks.next({name: 'object-layout', value: 'wrap'});

    expect(h.doc.crud.transact).toHaveBeenCalled();
    expect(h.paragraphBlock.formatText).toHaveBeenCalledOnceWith(1, 1, {
      wrap: true,
      side: 'auto',
      x: 0.25,
      gap: 12,
    });
    h.destroy();
  });

  it('returns a wrapped image to ordinary inline layout', () => {
    const h = makeHarness(false, true);
    h.plugin.init();
    h.image.dispatchEvent(new MouseEvent('mousedown', {bubbles: true, button: 0}));

    h.toolbarClicks.next({name: 'object-layout', value: 'inline'});

    expect(h.paragraphBlock.formatText).toHaveBeenCalledOnceWith(1, 1, {
      wrap: null,
      side: null,
      x: null,
      gap: null,
    });
    h.destroy();
  });

  it('changes which side receives wrapped text without resetting x', () => {
    const h = makeHarness(false, true);
    h.plugin.init();
    h.image.dispatchEvent(new MouseEvent('mousedown', {bubbles: true, button: 0}));

    h.toolbarClicks.next({name: 'inline-wrap-side', value: 'left'});

    expect(h.paragraphBlock.formatText)
      .toHaveBeenCalledOnceWith(1, 1, {side: 'left'});
    h.destroy();
  });

  it('previews pointer dragging in the DOM and commits normalized x once', () => {
    const h = makeHarness(false, true);
    h.plugin.init();
    h.image.dispatchEvent(new MouseEvent('mousedown', {bubbles: true, button: 0}));
    h.paragraphBlock.formatText.calls.reset();
    h.doc.crud.transact.calls.reset();

    h.frame.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true,
      button: 0,
      clientX: 245,
      isPrimary: true,
      pointerId: 3,
    }));
    window.dispatchEvent(new PointerEvent('pointermove', {
      button: 0,
      clientX: 400,
      isPrimary: true,
      pointerId: 3,
    }));

    expect(h.paragraphBlock.formatText).not.toHaveBeenCalled();
    expect(h.frame.style.left).toBe('12px');
    expect(h.shell.hasAttribute('data-bc-inline-float-preview')).toBeTrue();

    window.dispatchEvent(new PointerEvent('pointerup', {
      button: 0,
      clientX: 400,
      isPrimary: true,
      pointerId: 3,
    }));

    expect(h.doc.crud.transact).toHaveBeenCalledTimes(1);
    expect(h.paragraphBlock.formatText).toHaveBeenCalledOnceWith(1, 1, {
      wrap: true,
      side: 'auto',
      x: 0.56,
      gap: 12,
    });
    expect(h.shell.hasAttribute('data-bc-inline-float-preview')).toBeFalse();
    h.destroy();
  });

  it('backfills missing intrinsic dimensions without adding undo history', () => {
    const h = makeHarness();
    h.paragraphBlock.textDeltas.and.returnValue([
      {insert: '前'},
      {insert: {image: 'https://cdn.example.com/a.png'}},
      {insert: '后'},
    ]);
    h.plugin.init();

    h.shell.dispatchEvent(new CustomEvent(INLINE_IMAGE_INTRINSIC_SIZE_EVENT, {
      bubbles: true,
      detail: {
        src: 'https://cdn.example.com/a.png',
        width: 640,
        height: 360,
      },
    }));

    expect(h.doc.crud.transact)
      .toHaveBeenCalledWith(jasmine.any(Function), ORIGIN_NO_RECORD);
    expect(h.paragraphBlock.formatText).toHaveBeenCalledOnceWith(1, 1, {
      width: 640,
      height: 360,
    });
    h.destroy();
  });

  it('converts the inline image into a block between the surrounding text', () => {
    const h = makeHarness();
    h.plugin.init();
    h.image.dispatchEvent(new MouseEvent('mousedown', {bubbles: true, button: 0}));

    h.toolbarClicks.next({name: 'object-layout', value: 'top-bottom'});

    const snapshots = h.replaceWithSnapshots.calls.mostRecent().args[1];
    const image = snapshots[1];
    expect(h.replaceWithSnapshots).toHaveBeenCalledOnceWith('paragraph-1', snapshots);
    expect(snapshots.map((snapshot: any) => snapshot.flavour)).toEqual([
      'paragraph',
      'image',
      'paragraph',
    ]);
    expect(image.props).toEqual({
      src: 'https://cdn.example.com/a.png',
      width: 120,
      height: 60,
    });
    expect(h.selectOrSetCursorAtBlock).toHaveBeenCalledOnceWith(image.id, true);
    expect(h.run).toHaveBeenCalledTimes(1);
    h.destroy();
  });

  it('lifts an inline image at its visual position when moved below text', () => {
    const h = makeHarness();
    h.plugin.init();
    h.image.dispatchEvent(new MouseEvent('mousedown', {bubbles: true, button: 0}));

    h.toolbarClicks.next({name: 'object-layout', value: 'under'});

    const snapshots = h.replaceWithSnapshots.calls.mostRecent().args[1];
    const image = snapshots[1];
    expect(image.props.placement).toEqual({
      mode: 'absolute',
      x: 25,
      y: 40,
      layer: 'under',
    });
    expect(h.selectOrSetCursorAtBlock).toHaveBeenCalledOnceWith(image.id, true);
    expect(h.run).toHaveBeenCalledTimes(1);
    h.destroy();
  });

  it('keeps the inline image when its parent schema rejects image blocks', () => {
    const h = makeHarness();
    h.doc.schemas.isValidChildren.and.returnValue(false);
    h.plugin.init();
    h.image.dispatchEvent(new MouseEvent('mousedown', {bubbles: true, button: 0}));

    h.toolbarClicks.next({name: 'object-layout', value: 'top-bottom'});

    expect(h.replaceWithSnapshots).not.toHaveBeenCalled();
    expect(h.doc.messageService.warn).toHaveBeenCalledOnceWith('当前位置不支持图片块');
    h.destroy();
  });

  it('closes inline controls when the block becomes readonly', () => {
    const h = makeHarness();
    h.plugin.init();
    h.image.dispatchEvent(new MouseEvent('mousedown', {bubbles: true, button: 0}));
    h.doc.readonlyManager.isReadonly.and.returnValue(true);

    h.readonlyState$.next();

    expect(h.shell.querySelector('block-resizer')).toBeNull();
    expect(h.shell.classList.contains('bc-inline-image-shell--selected')).toBeFalse();
    expect(h.overlayRef.dispose).toHaveBeenCalled();
    h.destroy();
  });
});
