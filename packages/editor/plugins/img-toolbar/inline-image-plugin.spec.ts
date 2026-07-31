import {ApplicationRef, EnvironmentInjector, Injector} from '@angular/core';
import {fakeAsync, TestBed, tick} from '@angular/core/testing';
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
    setRect(rootHost, {
      left: 100,
      top: 50,
      right: 600,
      bottom: 650,
      width: 500,
      height: 600,
    });
    setRect(paragraphHost, {
      left: 100,
      top: 50,
      right: 600,
      bottom: 250,
      width: 500,
      height: 200,
    });
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
    const caretRangeDescriptor = Object.getOwnPropertyDescriptor(
      document,
      'caretRangeFromPoint',
    );
    Object.defineProperty(document, 'caretRangeFromPoint', {
      configurable: true,
      value: () => {
        const range = document.createRange();
        range.setStart(paragraphHost, 0);
        range.collapse(true);
        return range;
      },
    });

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
        acquireFloatLayoutFreeze: jasmine.createSpy('acquireFloatLayoutFreeze')
          .and.callFake(() => jasmine.createSpy('releaseFloatLayoutFreeze')),
      },
      textDeltas: jasmine.createSpy('textDeltas').and.callFake(() => deltas),
      textLength: 3,
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
      event: {status: {isComposing: false}},
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
      virtualization: {
        acquireBlockViewLease: jasmine.createSpy('acquireBlockViewLease')
          .and.callFake(() => jasmine.createSpy('releaseBlockViewLease')),
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
        exists: jasmine.createSpy('exists').and.callFake((id: string) =>
          id === 'paragraph-1' || id === 'root-1'),
        getParentId: jasmine.createSpy('getParentId').and.returnValue('root-1'),
        toSnapshot: jasmine.createSpy('toSnapshot').and.callFake((id: string) =>
          id === 'paragraph-1' ? paragraphSnapshot : rootSnapshot),
      },
      vm: {
        isMounted: jasmine.createSpy('isMounted').and.returnValue(true),
      },
      isPlainTextBlock: jasmine.createSpy('isPlainTextBlock').and.returnValue(false),
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
        applyTextDelta: jasmine.createSpy('applyTextDelta'),
      },
    };
    const plugin = new ImgToolbarPlugin();
    (plugin as any).doc = doc;

    return {
      plugin,
      doc,
      rootHost,
      paragraphHost,
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
        document.querySelectorAll(
          '[data-bc-inline-image-drag-proxy], [data-bc-inline-image-resize-proxy]',
        )
          .forEach(node => node.remove());
        if (caretRangeDescriptor) {
          Object.defineProperty(document, 'caretRangeFromPoint', caretRangeDescriptor);
        } else {
          delete (document as any).caretRangeFromPoint;
        }
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
    expect(h.shell.querySelector('inline-image-resizer')).not.toBeNull();
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
    expect(h.shell.querySelector('inline-image-resizer')).toBeNull();
    h.destroy();
  });

  it('commits width and proportional height once when resizing ends', fakeAsync(() => {
    const h = makeHarness();
    h.plugin.init();
    h.image.dispatchEvent(new MouseEvent('mousedown', {bubbles: true, button: 0}));
    const handle = h.shell.querySelector<HTMLElement>(
      '.inline-image-resizer__bar--right',
    )!;
    const originalStyle = h.frame.getAttribute('style');

    handle.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true,
      button: 0,
      clientX: 345,
      isPrimary: true,
      pointerId: 20,
    }));
    window.dispatchEvent(new PointerEvent('pointermove', {
      clientX: 465,
      isPrimary: true,
      pointerId: 20,
    }));
    tick(17);

    const proxy = document.querySelector<HTMLElement>(
      '[data-bc-inline-image-resize-proxy]',
    );
    expect(proxy).not.toBeNull();
    expect(proxy!.style.width).toBe('240px');
    expect(proxy!.style.height).toBe('120px');
    expect(h.frame.getAttribute('style')).toBe(originalStyle);
    expect(h.paragraphBlock.formatText).not.toHaveBeenCalled();
    const releaseLayout = h.paragraphBlock.runtime.acquireFloatLayoutFreeze
      .calls.mostRecent().returnValue;
    const releaseViewLease = h.doc.virtualization.acquireBlockViewLease
      .calls.mostRecent().returnValue;
    expect(releaseLayout).not.toHaveBeenCalled();
    expect(releaseViewLease).not.toHaveBeenCalled();

    window.dispatchEvent(new PointerEvent('pointerup', {
      clientX: 465,
      isPrimary: true,
      pointerId: 20,
    }));

    expect(h.paragraphBlock.formatText).toHaveBeenCalledOnceWith(1, 1, {
      width: 240,
      height: 120,
    });
    expect(h.shell.querySelector('inline-image-resizer')).toBeNull();
    expect(document.querySelector(
      '[data-bc-inline-image-resize-proxy]',
    )).toBeNull();
    expect(releaseLayout).toHaveBeenCalledTimes(1);
    expect(releaseViewLease).toHaveBeenCalledTimes(1);
    h.destroy();
  }));

  it('does not commit a resize after the image delta becomes stale', () => {
    const h = makeHarness();
    h.plugin.init();
    h.image.dispatchEvent(new MouseEvent('mousedown', {bubbles: true, button: 0}));
    const handle = h.shell.querySelector<HTMLElement>(
      '.inline-image-resizer__bar--right',
    )!;
    handle.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true,
      button: 0,
      clientX: 345,
      isPrimary: true,
      pointerId: 21,
    }));
    h.paragraphBlock.textDeltas.and.returnValue([
      {insert: '前'},
      {insert: {image: 'https://cdn.example.com/remote.png'}},
      {insert: '后'},
    ]);

    window.dispatchEvent(new PointerEvent('pointerup', {
      clientX: 465,
      isPrimary: true,
      pointerId: 21,
    }));

    expect(h.paragraphBlock.formatText).not.toHaveBeenCalled();
    h.destroy();
  });

  it('preserves square-wrap metadata when resizing the visible frame', () => {
    const h = makeHarness(false, true);
    h.plugin.init();
    h.image.dispatchEvent(new MouseEvent('mousedown', {bubbles: true, button: 0}));
    const handle = h.shell.querySelector<HTMLElement>(
      '.inline-image-resizer__bar--right',
    )!;
    handle.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true,
      button: 0,
      clientX: 345,
      isPrimary: true,
      pointerId: 22,
    }));

    window.dispatchEvent(new PointerEvent('pointerup', {
      clientX: 465,
      isPrimary: true,
      pointerId: 22,
    }));

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

  it('keeps the wrapped image right edge when resizing from the left handle', () => {
    const h = makeHarness(false, true);
    h.plugin.init();
    h.image.dispatchEvent(new MouseEvent('mousedown', {bubbles: true, button: 0}));
    const handle = h.shell.querySelector<HTMLElement>(
      '.inline-image-resizer__bar--left',
    )!;
    handle.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true,
      button: 0,
      clientX: 225,
      isPrimary: true,
      pointerId: 25,
    }));

    window.dispatchEvent(new PointerEvent('pointerup', {
      clientX: 165,
      isPrimary: true,
      pointerId: 25,
    }));

    expect(h.paragraphBlock.formatText).toHaveBeenCalledOnceWith(1, 1, {
      width: 180,
      height: 90,
      wrap: true,
      side: 'auto',
      x: 0.13,
      gap: 12,
    });
    h.destroy();
  });

  it('cancels a resize when the inline toolbar closes and releases leases once', () => {
    const h = makeHarness(false, true);
    h.plugin.init();
    h.image.dispatchEvent(new MouseEvent('mousedown', {bubbles: true, button: 0}));
    const handle = h.shell.querySelector<HTMLElement>(
      '.inline-image-resizer__bar--left',
    )!;
    handle.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true,
      button: 0,
      clientX: 225,
      isPrimary: true,
      pointerId: 23,
    }));
    const releaseLayout = h.paragraphBlock.runtime.acquireFloatLayoutFreeze
      .calls.mostRecent().returnValue;
    const releaseViewLease = h.doc.virtualization.acquireBlockViewLease
      .calls.mostRecent().returnValue;

    h.plugin.closeInlineToolbar();
    h.plugin.closeInlineToolbar();

    expect(h.paragraphBlock.formatText).not.toHaveBeenCalled();
    expect(document.querySelector(
      '[data-bc-inline-image-resize-proxy]',
    )).toBeNull();
    expect(releaseLayout).toHaveBeenCalledTimes(1);
    expect(releaseViewLease).toHaveBeenCalledTimes(1);
    h.destroy();
  });

  it('does not start inline resize while IME owns the editable DOM', () => {
    const h = makeHarness(false, true);
    h.doc.event.status.isComposing = true;
    h.plugin.init();
    h.image.dispatchEvent(new MouseEvent('mousedown', {bubbles: true, button: 0}));
    const handle = h.shell.querySelector<HTMLElement>(
      '.inline-image-resizer__bar--right',
    )!;

    handle.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true,
      button: 0,
      clientX: 345,
      isPrimary: true,
      pointerId: 24,
    }));

    expect(document.querySelector(
      '[data-bc-inline-image-resize-proxy]',
    )).toBeNull();
    expect(h.paragraphBlock.runtime.acquireFloatLayoutFreeze)
      .not.toHaveBeenCalled();
    expect(h.doc.virtualization.acquireBlockViewLease).not.toHaveBeenCalled();
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

  it('moves a translucent proxy in x/y while the committed frame stays put', fakeAsync(() => {
    const h = makeHarness(false, true);
    h.plugin.init();
    h.image.dispatchEvent(new MouseEvent('mousedown', {bubbles: true, button: 0}));
    h.paragraphBlock.formatText.calls.reset();
    h.doc.crud.transact.calls.reset();

    h.frame.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true,
      button: 0,
      clientX: 245,
      clientY: 100,
      isPrimary: true,
      pointerId: 3,
    }));
    window.dispatchEvent(new PointerEvent('pointermove', {
      button: 0,
      clientX: 400,
      clientY: 130,
      isPrimary: true,
      pointerId: 3,
    }));
    tick(17);

    expect(h.paragraphBlock.formatText).not.toHaveBeenCalled();
    expect(h.doc.crud.applyTextDelta).not.toHaveBeenCalled();
    expect(h.frame.style.transform).toBe('');
    const proxy = document.querySelector<HTMLElement>(
      '[data-bc-inline-image-drag-proxy]',
    );
    expect(proxy).not.toBeNull();
    expect(proxy!.getAttribute('aria-hidden')).toBe('true');
    expect(proxy!.style.transform).toBe('translate3d(155px, 30px, 0px)');
    expect(h.shell.hasAttribute('data-bc-inline-float-preview')).toBeTrue();
    const releaseLayout = h.paragraphBlock.runtime.acquireFloatLayoutFreeze
      .calls.mostRecent().returnValue;
    const releaseViewLease = h.doc.virtualization.acquireBlockViewLease
      .calls.mostRecent().returnValue;
    expect(releaseLayout).not.toHaveBeenCalled();
    expect(releaseViewLease).not.toHaveBeenCalled();

    window.dispatchEvent(new PointerEvent('pointerup', {
      button: 0,
      clientX: 400,
      clientY: 130,
      isPrimary: true,
      pointerId: 3,
    }));

    expect(h.doc.crud.transact).toHaveBeenCalledTimes(1);
    expect(h.doc.crud.applyTextDelta).toHaveBeenCalledOnceWith(
      'paragraph-1',
      [
        {retain: 1},
        {retain: 1, attributes: {x: .56}},
      ],
    );
    expect(h.shell.hasAttribute('data-bc-inline-float-preview')).toBeFalse();
    expect(h.frame.style.transform).toBe('');
    expect(document.querySelector('[data-bc-inline-image-drag-proxy]')).toBeNull();
    expect(releaseLayout).toHaveBeenCalledTimes(1);
    expect(releaseViewLease).toHaveBeenCalledTimes(1);
    h.destroy();
  }));

  it('cancels pointer dragging without committing and releases layout freeze', () => {
    const h = makeHarness(false, true);
    h.plugin.init();
    h.image.dispatchEvent(new MouseEvent('mousedown', {bubbles: true, button: 0}));
    h.paragraphBlock.formatText.calls.reset();
    h.doc.crud.transact.calls.reset();

    h.frame.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true,
      button: 0,
      clientX: 245,
      clientY: 100,
      isPrimary: true,
      pointerId: 4,
    }));
    window.dispatchEvent(new PointerEvent('pointermove', {
      button: 0,
      clientX: 400,
      clientY: 130,
      isPrimary: true,
      pointerId: 4,
    }));
    const releaseLayout = h.paragraphBlock.runtime.acquireFloatLayoutFreeze
      .calls.mostRecent().returnValue;
    const releaseViewLease = h.doc.virtualization.acquireBlockViewLease
      .calls.mostRecent().returnValue;

    window.dispatchEvent(new PointerEvent('pointercancel', {
      isPrimary: true,
      pointerId: 4,
    }));

    expect(h.doc.crud.transact).not.toHaveBeenCalled();
    expect(h.doc.crud.applyTextDelta).not.toHaveBeenCalled();
    expect(h.paragraphBlock.formatText).not.toHaveBeenCalled();
    expect(h.shell.hasAttribute('data-bc-inline-float-preview')).toBeFalse();
    expect(h.frame.style.transform).toBe('');
    expect(document.querySelector('[data-bc-inline-image-drag-proxy]')).toBeNull();
    expect(releaseLayout).toHaveBeenCalledTimes(1);
    expect(releaseViewLease).toHaveBeenCalledTimes(1);
    h.destroy();
  });

  it('moves the embed anchor to another editable block in one transaction', () => {
    const h = makeHarness(false, true);
    const targetHost = document.createElement('div');
    targetHost.dataset['blockId'] = 'paragraph-2';
    targetHost.appendChild(document.createTextNode('目标段落'));
    setRect(targetHost, {
      left: 100,
      top: 300,
      right: 600,
      bottom: 500,
      width: 500,
      height: 200,
    });
    Object.defineProperty(targetHost, 'clientWidth', {
      configurable: true,
      value: 500,
    });
    h.rootHost.appendChild(targetHost);
    const targetBlock: any = {
      id: 'paragraph-2',
      flavour: 'paragraph',
      nodeType: BlockNodeType.editable,
      hostElement: targetHost,
      containerElement: targetHost,
      textLength: 4,
      runtime: {
        domPointToModel: jasmine.createSpy('targetDomPointToModel')
          .and.returnValue(2),
      },
      textDeltas: jasmine.createSpy('targetTextDeltas').and.returnValue([
        {insert: '目标段落'},
      ]),
    };
    h.doc.getBlockById.and.callFake((id: string) => {
      if (id === 'paragraph-1') return h.paragraphBlock;
      if (id === 'paragraph-2') return targetBlock;
      if (id === 'root-1') return {id: 'root-1', hostElement: h.rootHost};
      throw new Error('missing');
    });
    h.doc.isEditable.and.callFake((block: any) =>
      block === h.paragraphBlock || block === targetBlock);
    h.doc.model.exists.and.callFake((id: string) =>
      id === 'paragraph-1' || id === 'paragraph-2' || id === 'root-1');
    Object.defineProperty(document, 'caretRangeFromPoint', {
      configurable: true,
      value: () => {
        const range = document.createRange();
        range.setStart(targetHost.firstChild!, 2);
        range.collapse(true);
        return range;
      },
    });

    h.plugin.init();
    h.image.dispatchEvent(new MouseEvent('mousedown', {bubbles: true, button: 0}));
    h.doc.crud.transact.calls.reset();
    h.doc.crud.applyTextDelta.calls.reset();
    h.frame.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true,
      button: 0,
      clientX: 245,
      clientY: 100,
      isPrimary: true,
      pointerId: 8,
    }));
    window.dispatchEvent(new PointerEvent('pointermove', {
      clientX: 350,
      clientY: 350,
      isPrimary: true,
      pointerId: 8,
    }));
    window.dispatchEvent(new PointerEvent('pointerup', {
      clientX: 350,
      clientY: 350,
      isPrimary: true,
      pointerId: 8,
    }));

    expect(h.doc.crud.transact).toHaveBeenCalledTimes(1);
    expect(h.doc.crud.applyTextDelta.calls.allArgs()).toEqual([
      ['paragraph-1', [{retain: 1}, {delete: 1}]],
      ['paragraph-2', [
        {retain: 2},
        {
          insert: {image: 'https://cdn.example.com/a.png'},
          attributes: {
            width: 120,
            height: 60,
            wrap: true,
            side: 'auto',
            x: .46,
            gap: 12,
          },
        },
      ]],
    ]);
    expect(h.doc.virtualization.acquireBlockViewLease)
      .toHaveBeenCalledOnceWith(['paragraph-1']);
    expect(document.querySelector('[data-bc-inline-image-drag-proxy]')).toBeNull();
    h.destroy();
  });

  it('cancels a drop whose pointer is outside the editor root', () => {
    const h = makeHarness(false, true);
    h.plugin.init();
    h.image.dispatchEvent(new MouseEvent('mousedown', {bubbles: true, button: 0}));
    h.doc.crud.transact.calls.reset();
    h.frame.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true,
      button: 0,
      clientX: 245,
      clientY: 100,
      isPrimary: true,
      pointerId: 9,
    }));
    window.dispatchEvent(new PointerEvent('pointermove', {
      clientX: 50,
      clientY: 20,
      isPrimary: true,
      pointerId: 9,
    }));
    window.dispatchEvent(new PointerEvent('pointerup', {
      clientX: 50,
      clientY: 20,
      isPrimary: true,
      pointerId: 9,
    }));

    expect(h.doc.crud.transact).not.toHaveBeenCalled();
    expect(h.doc.crud.applyTextDelta).not.toHaveBeenCalled();
    expect(document.querySelector('[data-bc-inline-image-drag-proxy]')).toBeNull();
    h.destroy();
  });

  it('does not start a proxy drag while IME owns the editable DOM', () => {
    const h = makeHarness(false, true);
    h.doc.event.status.isComposing = true;
    h.plugin.init();
    h.image.dispatchEvent(new MouseEvent('mousedown', {bubbles: true, button: 0}));

    h.frame.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true,
      button: 0,
      clientX: 245,
      clientY: 100,
      isPrimary: true,
      pointerId: 10,
    }));

    expect(document.querySelector('[data-bc-inline-image-drag-proxy]')).toBeNull();
    expect(h.paragraphBlock.runtime.acquireFloatLayoutFreeze)
      .not.toHaveBeenCalled();
    expect(h.doc.virtualization.acquireBlockViewLease).not.toHaveBeenCalled();
    h.destroy();
  });

  it('uses the same idempotent cleanup when the toolbar closes mid-drag', () => {
    const h = makeHarness(false, true);
    h.plugin.init();
    h.image.dispatchEvent(new MouseEvent('mousedown', {bubbles: true, button: 0}));
    h.frame.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true,
      button: 0,
      clientX: 245,
      clientY: 100,
      isPrimary: true,
      pointerId: 11,
    }));
    window.dispatchEvent(new PointerEvent('pointermove', {
      clientX: 300,
      clientY: 140,
      isPrimary: true,
      pointerId: 11,
    }));
    const releaseLayout = h.paragraphBlock.runtime.acquireFloatLayoutFreeze
      .calls.mostRecent().returnValue;
    const releaseViewLease = h.doc.virtualization.acquireBlockViewLease
      .calls.mostRecent().returnValue;

    h.plugin.closeInlineToolbar();
    h.plugin.closeInlineToolbar();

    expect(document.querySelector('[data-bc-inline-image-drag-proxy]')).toBeNull();
    expect(h.doc.crud.applyTextDelta).not.toHaveBeenCalled();
    expect(releaseLayout).toHaveBeenCalledTimes(1);
    expect(releaseViewLease).toHaveBeenCalledTimes(1);
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

    expect(h.shell.querySelector('inline-image-resizer')).toBeNull();
    expect(h.shell.classList.contains('bc-inline-image-shell--selected')).toBeFalse();
    expect(h.overlayRef.dispose).toHaveBeenCalled();
    h.destroy();
  });
});
