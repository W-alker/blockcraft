import {ApplicationRef, EnvironmentInjector, Injector} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {Subject} from 'rxjs';
import {
  BlockNodeType,
  DOC_FILE_SERVICE_TOKEN,
  inlineImageEmbedConverter,
} from '../../framework';
import {ImgToolbarPlugin} from './index';
import {InlineImageToolbar} from './widgets/inline-image.toolbar';

describe('ImgToolbarPlugin inline-image interaction', () => {
  const makeHarness = (readonly = false) => {
    TestBed.configureTestingModule({});
    const rootHost = document.createElement('div');
    rootHost.dataset['blockcraftRoot'] = 'true';
    const paragraphHost = document.createElement('div');
    paragraphHost.dataset['blockId'] = 'paragraph-1';
    const shell = inlineImageEmbedConverter.toView({
      insert: {image: 'https://cdn.example.com/a.png'},
      attributes: {width: 120, height: 60},
    });
    const image = shell.querySelector<HTMLImageElement>('img')!;
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
        attributes: {width: 120, height: 60},
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
      messageService: {warn: jasmine.createSpy('warn')},
      chain: jasmine.createSpy('chain').and.returnValue(chain),
    };
    const plugin = new ImgToolbarPlugin();
    (plugin as any).doc = doc;

    return {
      plugin,
      doc,
      rootHost,
      shell,
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
        target: h.image,
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

  it('converts the inline image into a block between the surrounding text', () => {
    const h = makeHarness();
    h.plugin.init();
    h.image.dispatchEvent(new MouseEvent('mousedown', {bubbles: true, button: 0}));

    h.toolbarClicks.next({name: 'block'});

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

  it('keeps the inline image when its parent schema rejects image blocks', () => {
    const h = makeHarness();
    h.doc.schemas.isValidChildren.and.returnValue(false);
    h.plugin.init();
    h.image.dispatchEvent(new MouseEvent('mousedown', {bubbles: true, button: 0}));

    h.toolbarClicks.next({name: 'block'});

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
