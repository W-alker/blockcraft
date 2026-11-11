import {fakeAsync, flushMicrotasks, tick} from "@angular/core/testing";
import {Subject} from "rxjs";
import {ClipboardDataType} from "../../framework";
import {AttachmentExtensionOptions, AttachmentExtensionPlugin} from "./index";

describe("AttachmentExtensionPlugin rename highlight", () => {
  function createHarness() {
    const hostElement = document.createElement("div");
    hostElement.setAttribute("data-attachment-extension-test", "true");
    document.body.appendChild(hostElement);

    const block = {
      id: "attachment-1",
      flavour: "attachment",
      props: {
        name: "report.pdf",
      },
      hostElement,
      updateProps: jasmine.createSpy("updateProps"),
    };

    const backdropClick$ = new Subject<void>();
    const componentRef = {
      setInput: jasmine.createSpy("setInput"),
      instance: {
        focus: jasmine.createSpy("focus"),
        cancel: new Subject<void>(),
        valueChange: new Subject<string>(),
      },
    };
    const overlayRef = {
      backdropClick: () => backdropClick$,
    };
    const doc = {
      getBlockById: jasmine.createSpy("getBlockById").and.returnValue(block),
      selection: {
        selectBlock: jasmine.createSpy("selectBlock"),
      },
      overlayService: {
        createConnectedOverlay: jasmine.createSpy("createConnectedOverlay")
          .and.returnValue({componentRef, overlayRef}),
      },
    };
    const plugin = new AttachmentExtensionPlugin();
    (plugin as any).doc = doc;

    return {plugin, doc, block, hostElement, componentRef};
  }

  afterEach(() => {
    document.body.querySelectorAll("[data-attachment-extension-test]").forEach(el => el.remove());
  });

  it("uses a rename-specific class instead of faking selected state", () => {
    const {plugin, block, hostElement, componentRef} = createHarness();
    spyOn(window, "requestAnimationFrame").and.callFake((callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });

    plugin.onRename(block as any);

    expect(componentRef.instance.focus).toHaveBeenCalled();
    expect(hostElement.classList.contains("bc-attachment-renaming")).toBeTrue();
    expect(hostElement.classList.contains("selected")).toBeFalse();
  });

  it("clears the rename-specific class without touching selected state", () => {
    const {plugin, block, hostElement} = createHarness();
    hostElement.classList.add("selected");

    (plugin as any)._setRenamingHighlight(block, true);
    expect(hostElement.classList.contains("bc-attachment-renaming")).toBeTrue();

    (plugin as any)._setRenamingHighlight(block, false);

    expect(hostElement.classList.contains("bc-attachment-renaming")).toBeFalse();
    expect(hostElement.classList.contains("selected")).toBeTrue();
  });

  it("does not restore selection to a deleted block after rename closes", fakeAsync(() => {
    const {plugin, doc, block, componentRef} = createHarness();
    spyOn(window, "requestAnimationFrame").and.callFake((callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });
    plugin.onRename(block as any);

    doc.getBlockById.and.throwError("Block not found: attachment-1");
    componentRef.instance.cancel.next();
    flushMicrotasks();

    expect(doc.selection.selectBlock).not.toHaveBeenCalled();
  }));

  it("does not rename a deleted block after the value changes", fakeAsync(() => {
    const {plugin, doc, block, componentRef} = createHarness();
    spyOn(window, "requestAnimationFrame").and.callFake((callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });
    plugin.onRename(block as any);

    doc.getBlockById.and.throwError("Block not found: attachment-1");
    componentRef.instance.valueChange.next("next.pdf");
    flushMicrotasks();

    expect(block.updateProps).not.toHaveBeenCalled();
    expect(doc.selection.selectBlock).not.toHaveBeenCalled();
  }));
});

describe("AttachmentExtensionPlugin click hit area", () => {
  const makeHarness = (props: {url?: string; name?: string} = {}) => {
    const hostElement = document.createElement("div");
    hostElement.setAttribute("data-block-id", "attachment-1");
    hostElement.setAttribute("data-attachment-click-test", "true");
    const content = document.createElement("div");
    content.className = props.url ? "attachment-block__info" : "attachment-block__empty";
    hostElement.appendChild(content);
    document.body.appendChild(hostElement);

    const block = {
      id: "attachment-1",
      flavour: "attachment",
      props: {
        name: props.name ?? "report.pdf",
        url: props.url ?? "",
      },
      hostElement,
      inputLocalFile: jasmine.createSpy("inputLocalFile"),
    };
    const doc = {
      isReadonly: false,
      getBlockById: jasmine.createSpy("getBlockById").and.returnValue(block),
      selection: {
        selectBlock: jasmine.createSpy("selectBlock"),
      },
      messageService: {
        warn: jasmine.createSpy("warn"),
      },
    };
    const plugin = new AttachmentExtensionPlugin();
    (plugin as any).doc = doc;
    const preventDefault = jasmine.createSpy("preventDefault");

    return {plugin, doc, block, hostElement, content, preventDefault};
  };

  afterEach(() => {
    document.body.querySelectorAll("[data-attachment-click-test]").forEach(el => el.remove());
  });

  it("keeps empty attachment upload behavior from the content area", () => {
    const {plugin, block, content, preventDefault} = makeHarness();

    const consumed = plugin.onClick({
      getDefaultEvent: () => ({target: content}),
      preventDefault,
    } as any);

    expect(consumed).toBeTrue();
    expect(preventDefault).toHaveBeenCalled();
    expect(block.inputLocalFile).toHaveBeenCalled();
  });

  it("ignores attachment host whitespace so gap selection can handle it", () => {
    const {plugin, doc, block, hostElement, preventDefault} = makeHarness();

    const consumed = plugin.onClick({
      getDefaultEvent: () => ({target: hostElement}),
      preventDefault,
    } as any);

    expect(consumed).toBeUndefined();
    expect(preventDefault).not.toHaveBeenCalled();
    expect(block.inputLocalFile).not.toHaveBeenCalled();
    expect(doc.selection.selectBlock).not.toHaveBeenCalled();
  });

  it("ignores stale attachment content clicks without throwing", () => {
    const {plugin, doc, block, content, preventDefault} = makeHarness();
    doc.getBlockById.and.throwError("missing");

    expect(() => plugin.onClick({
      getDefaultEvent: () => ({target: content}),
      preventDefault,
    } as any)).not.toThrow();

    expect(preventDefault).not.toHaveBeenCalled();
    expect(block.inputLocalFile).not.toHaveBeenCalled();
    expect(doc.selection.selectBlock).not.toHaveBeenCalled();
  });
});

describe("AttachmentExtensionPlugin delayed toolbar", () => {
  const makeHarness = (options?: AttachmentExtensionOptions) => {
    const selection$ = new Subject<any>();
    const policyChanges$ = new Subject<void>();
    const readonlyChanges$ = new Subject<void>();
    const policy = {hoverOpen: true, selectionOpen: true};
    const root = document.createElement('div');
    root.setAttribute('data-attachment-hover-test', 'true');
    root.setAttribute('data-blockcraft-root', 'true');
    const hostElement = document.createElement('div');
    hostElement.setAttribute('data-block-id', 'attachment-1');
    const content = document.createElement('div');
    content.className = 'attachment-block__info';
    hostElement.append(content);
    root.append(hostElement);
    document.body.append(root);
    const pointer = (type: string, options: PointerEventInit = {}, target: HTMLElement = content) =>
      target.dispatchEvent(new PointerEvent(type, {bubbles: true, pointerType: 'mouse', pointerId: 1, isPrimary: true, ...options}));
    const hover = () => pointer('pointerover');
    const readonlyStateChange$ = new Subject<void>();
    const selectionValue = {current: null as any};
    const attachmentBlock = {
      hostElement,
      id: "attachment-1",
      flavour: "attachment",
      props: {
        name: "report.pdf",
        url: "https://example.com/report.pdf",
      },
      onDestroy$: new Subject<void>(),
    };
    const attachmentSelection = {
      isInSameBlock: true,
      anchor: {type: "selected"},
      head: {type: "selected"},
      firstBlock: attachmentBlock,
    };
    const attachmentGapSelection = {
      isInSameBlock: true,
      anchor: {type: "gap", side: "after"},
      head: {type: "gap", side: "after"},
      firstBlock: attachmentBlock,
    };
    const doc = {
      root: {hostElement: root},
      onPropsUpdate$: new Subject<any>(),
      logger: {warn: jasmine.createSpy("warn")},
      messageService: {warn: jasmine.createSpy("warn")},
      ngZone: {run: (fn: () => void) => fn(), runOutsideAngular: (fn: () => void) => fn()},
      interaction: {get: () => ({...policy}), policyChanges$},
      subscribeReadonlyChange: (fn: () => void) => readonlyChanges$.subscribe(fn),
      injector: {
        get: jasmine.createSpy("get").and.returnValue({}),
      },
      selection: {
        selectionChange$: selection$,
        get value() {
          return selectionValue.current;
        },
      },
      overlayService: {
        createConnectedOverlay: jasmine.createSpy("createConnectedOverlay").and.returnValue({
          componentRef: {
            setInput: jasmine.createSpy("setInput"),
            instance: {
              onItemClick: new Subject<any>(),
            },
          },
          overlayRef: {
            dispose: jasmine.createSpy("dispose"),
            overlayElement: document.createElement("div"),
          },
        }),
      },
      getBlockById: jasmine.createSpy("getBlockById").and.returnValue(attachmentBlock),
      isReadonly: false,
      readonlyManager: {
        stateChange$: readonlyStateChange$,
        isReadonly: jasmine.createSpy("isReadonly").and.returnValue(false),
      },
    };
    const plugin = new AttachmentExtensionPlugin(options);
    (plugin as any).doc = doc;
    return {
      plugin,
      doc, policy, policyChanges$, readonlyChanges$, pointer, hover, hostElement,
      selection$,
      readonlyStateChange$,
      selectionValue,
      attachmentSelection,
      attachmentGapSelection,
    };
  };

  afterEach(() => document.querySelectorAll('[data-attachment-hover-test]').forEach(el => el.remove()));

  it("does not open from selection changes without hover", fakeAsync(() => {
    const {plugin, doc, selection$, selectionValue, attachmentSelection} = makeHarness();
    (doc.interaction.get as any) = () => ({hoverOpen: true, selectionOpen: false});
    plugin.init();

    selectionValue.current = attachmentSelection;
    selection$.next(attachmentSelection);
    selectionValue.current = null;
    tick(250);

    expect(doc.overlayService.createConnectedOverlay).not.toHaveBeenCalled();
    plugin.destroy();
  }));

  it("opens toolbar after hovering attachment blocks", fakeAsync(() => {
    const {plugin, doc, selection$, selectionValue, attachmentSelection, hover} = makeHarness();
    plugin.init();

    selectionValue.current = attachmentSelection;
    hover();
    tick(250);

    expect(doc.overlayService.createConnectedOverlay).toHaveBeenCalled();
    plugin.destroy();
  }));

  it("does not open delayed toolbar when the selected attachment block is stale", fakeAsync(() => {
    const {plugin, doc, selection$, selectionValue, attachmentSelection, hover} = makeHarness();
    plugin.init();

    selectionValue.current = attachmentSelection;
    hover();
    doc.getBlockById.and.throwError("missing");
    tick(250);

    expect(doc.overlayService.createConnectedOverlay).not.toHaveBeenCalled();
    plugin.destroy();
  }));

  it("does not run toolbar actions when the attachment block becomes stale", fakeAsync(() => {
    const {plugin, doc, selection$, selectionValue, attachmentSelection, hover} = makeHarness();
    plugin.init();

    selectionValue.current = attachmentSelection;
    hover();
    tick(250);
    const onItemClick = doc.overlayService.createConnectedOverlay.calls.mostRecent()
      .returnValue.componentRef.instance.onItemClick as Subject<any>;
    const fileService = doc.injector.get.calls.mostRecent().returnValue;
    fileService.downloadAttachment = jasmine.createSpy("downloadAttachment");

    doc.getBlockById.and.throwError("missing");
    onItemClick.next({name: "download"});

    expect(fileService.downloadAttachment).not.toHaveBeenCalled();
    plugin.destroy();
  }));

  it("closes a selected attachment toolbar before querying readonly state for a removed block", fakeAsync(() => {
    const {
      plugin,
      doc,
      selection$,
      readonlyStateChange$,
      selectionValue,
      attachmentSelection, hover,
    } = makeHarness();
    plugin.init();

    selectionValue.current = attachmentSelection;
    hover();
    tick(250);
    const {overlayRef} = doc.overlayService.createConnectedOverlay.calls.mostRecent().returnValue;

    doc.readonlyManager.isReadonly.calls.reset();
    doc.getBlockById.and.throwError("Block not found: attachment-1");
    doc.readonlyManager.isReadonly.and.throwError(
      new Error("readonly lookup received a removed block"),
    );

    expect(() => readonlyStateChange$.next()).not.toThrow();
    expect(doc.readonlyManager.isReadonly).not.toHaveBeenCalled();
    expect(overlayRef.dispose).toHaveBeenCalled();
    plugin.destroy();
  }));

  it("cancels delayed toolbar open on destroy", fakeAsync(() => {
    const {plugin, doc, selection$, selectionValue, attachmentSelection, hover} = makeHarness();
    plugin.init();

    selectionValue.current = attachmentSelection;
    hover();
    plugin.destroy();
    tick(250);

    expect(doc.overlayService.createConnectedOverlay).not.toHaveBeenCalled();
  }));

  it('shows a selected attachment once and retains it after pointer leave', fakeAsync(() => {
    const t = makeHarness();
    t.plugin.init();
    t.selectionValue.current = t.attachmentSelection;
    t.selection$.next(t.attachmentSelection);
    expect(t.doc.overlayService.createConnectedOverlay).toHaveBeenCalledTimes(1);
    t.hover();
    t.pointer('pointerout', {relatedTarget: document.body});
    tick(250);
    const overlay = t.doc.overlayService.createConnectedOverlay.calls.mostRecent().returnValue.overlayRef;
    expect(overlay.dispose).not.toHaveBeenCalled();
    t.selection$.next(t.attachmentSelection);
    expect(t.doc.overlayService.createConnectedOverlay).toHaveBeenCalledTimes(1);
    t.selectionValue.current = null;
    t.selection$.next(null);
    expect(overlay.dispose).toHaveBeenCalled();
    t.plugin.destroy();
  }));

  for (const readonly of [false, true]) {
    it(`only hover opens the toolbar when selection is disabled (readonly=${readonly})`, fakeAsync(() => {
      const t = makeHarness();
      t.policy.selectionOpen = readonly;
      t.doc.isReadonly = readonly;
      t.plugin.init();
      t.selectionValue.current = t.attachmentSelection;
      t.selection$.next(t.attachmentSelection);
      tick(250);
      expect(t.doc.overlayService.createConnectedOverlay).not.toHaveBeenCalled();
      t.hover();
      tick(250);
      expect(t.doc.overlayService.createConnectedOverlay).toHaveBeenCalledTimes(1);
      t.pointer('pointerout', {relatedTarget: document.body});
      tick(250);
      expect(t.doc.overlayService.createConnectedOverlay.calls.mostRecent().returnValue.overlayRef.dispose).toHaveBeenCalled();
      t.plugin.destroy();
    }));
  }

  it('reconciles the existing selection when mode or readonly changes', () => {
    const t = makeHarness();
    t.policy.selectionOpen = false;
    t.plugin.init();
    t.selectionValue.current = t.attachmentSelection;
    t.selection$.next(t.attachmentSelection);
    t.policy.selectionOpen = true;
    t.policyChanges$.next();
    expect(t.doc.overlayService.createConnectedOverlay).toHaveBeenCalledTimes(1);
    const overlay = t.doc.overlayService.createConnectedOverlay.calls.mostRecent().returnValue.overlayRef;
    t.policy.selectionOpen = false;
    t.policyChanges$.next();
    expect(overlay.dispose).toHaveBeenCalled();
    t.policy.selectionOpen = true;
    t.policyChanges$.next();
    expect(t.doc.overlayService.createConnectedOverlay).toHaveBeenCalledTimes(2);
    overlay.dispose.calls.reset();
    t.doc.isReadonly = true;
    t.readonlyChanges$.next();
    expect(overlay.dispose).toHaveBeenCalled();
    t.plugin.destroy();
  });

  it('does not show selection tools for a multi-block range', () => {
    const t = makeHarness();
    t.plugin.init();
    t.selectionValue.current = {...t.attachmentSelection, isInSameBlock: false};
    t.selection$.next(t.selectionValue.current);
    expect(t.doc.overlayService.createConnectedOverlay).not.toHaveBeenCalled();
    t.plugin.destroy();
  });

  it('keeps an actual hover when selection display is switched off', fakeAsync(() => {
    const t = makeHarness();
    t.plugin.init();
    t.hover();
    t.selectionValue.current = t.attachmentSelection;
    t.selection$.next(t.attachmentSelection);
    const overlay = t.doc.overlayService.createConnectedOverlay.calls.mostRecent().returnValue.overlayRef;
    t.policy.selectionOpen = false;
    t.policyChanges$.next();
    expect(overlay.dispose).not.toHaveBeenCalled();
    t.pointer('pointerout', {relatedTarget: document.body});
    tick(250);
    expect(overlay.dispose).toHaveBeenCalled();
    t.plugin.destroy();
  }));

  it('does not reopen a dismissed selection toolbar for unrelated policy updates', () => {
    const t = makeHarness();
    t.plugin.init();
    t.selectionValue.current = t.attachmentSelection;
    t.selection$.next(t.attachmentSelection);
    t.plugin.closeToolbar();
    t.policyChanges$.next();
    expect(t.doc.overlayService.createConnectedOverlay).toHaveBeenCalledTimes(1);
    t.plugin.destroy();
  });

  it('retains touch access when selection opening is disabled', () => {
    const t = makeHarness();
    t.policy.selectionOpen = false;
    t.plugin.init();
    t.pointer('pointerup', {pointerType: 'touch'});
    expect(t.doc.overlayService.createConnectedOverlay).toHaveBeenCalledTimes(1);
    t.plugin.destroy();
  });

  it('refreshes an open toolbar after upload without closing it or changing selection', fakeAsync(() => {
    const t = makeHarness();
    const block = t.attachmentSelection.firstBlock;
    block.props.url = 'blob:pending';
    t.plugin.init(); t.hover(); tick(250);
    const {componentRef, overlayRef} = t.doc.overlayService.createConnectedOverlay.calls.mostRecent().returnValue;
    expect(componentRef.setInput).toHaveBeenCalledWith('canUse', false);
    componentRef.setInput.calls.reset();
    block.props.url = 'https://example.com/complete.pdf';
    t.doc.onPropsUpdate$.next({transactions: [{block, changes: new Map([['url', {}]])}]});
    expect(componentRef.setInput).toHaveBeenCalledWith('canUse', true);
    expect(overlayRef.dispose).not.toHaveBeenCalled();
    expect(t.doc.overlayService.createConnectedOverlay).toHaveBeenCalledTimes(1);
    expect(t.selectionValue.current).toBeNull();
    t.plugin.destroy();
    expect(t.doc.onPropsUpdate$.observed).toBeFalse();
  }));

  it('keeps item handlers and legacy dispatch compatible and rechecks visibility and permissions', fakeAsync(() => {
    let visible = true;
    const click = jasmine.createSpy('click');
    const legacy = jasmine.createSpy('legacy').and.returnValue(true);
    const action = {name: 'web', icon: 'bc_wangluo', label: '网页', editOnly: true,
      visible: () => visible, onClick: click};
    const t = makeHarness({extraItems: [action, {name: 'old', icon: 'bc_eye-open', label: '旧入口'}], onExtraItemClick: legacy});
    t.plugin.init(); t.hover(); tick(250);
    const {componentRef} = t.doc.overlayService.createConnectedOverlay.calls.mostRecent().returnValue;
    componentRef.instance.onItemClick.next({name: 'web'});
    expect(click).toHaveBeenCalledOnceWith(t.attachmentSelection.firstBlock as any, t.doc as any);
    expect(legacy).not.toHaveBeenCalled();
    componentRef.instance.onItemClick.next({name: 'old'});
    expect(legacy).toHaveBeenCalledOnceWith('old', t.attachmentSelection.firstBlock as any, t.doc as any);
    click.calls.reset(); legacy.calls.reset();
    visible = false;
    componentRef.instance.onItemClick.next({name: 'web'});
    expect(click).not.toHaveBeenCalled();
    visible = true;
    t.doc.readonlyManager.isReadonly.and.returnValue(true);
    t.readonlyStateChange$.next();
    expect(componentRef.setInput).toHaveBeenCalledWith('extraItems', [{name: 'old', icon: 'bc_eye-open', label: '旧入口'}]);
    componentRef.instance.onItemClick.next({name: 'web'});
    expect(click).not.toHaveBeenCalled();
    t.attachmentSelection.firstBlock.props.url = 'blob:pending';
    componentRef.instance.onItemClick.next({name: 'old'});
    expect(legacy).not.toHaveBeenCalled();
    t.plugin.destroy(); flushMicrotasks();
  }));

  it('handles async action failures and does not notify after destruction', fakeAsync(() => {
    let reject!: (error: Error) => void;
    const t = makeHarness({extraItems: [{name: 'fail', icon: 'bc_eye-open', label: '失败',
      onClick: () => new Promise<void>((_resolve, fail) => reject = fail)}]});
    t.plugin.init(); t.hover(); tick(250);
    const {componentRef} = t.doc.overlayService.createConnectedOverlay.calls.mostRecent().returnValue;
    componentRef.instance.onItemClick.next({name: 'fail'});
    reject(new Error('failure')); flushMicrotasks();
    expect(t.doc.messageService.warn).toHaveBeenCalledTimes(1);
    componentRef.instance.onItemClick.next({name: 'fail'});
    t.plugin.destroy(); reject(new Error('late failure')); flushMicrotasks();
    expect(t.doc.messageService.warn).toHaveBeenCalledTimes(1);
  }));

  it('ignores nested document pointer events before resolving block IDs', fakeAsync(() => {
    const t = makeHarness();
    const nested = document.createElement('div');
    nested.setAttribute('data-blockcraft-root', 'true');
    nested.setAttribute('data-block-id', 'inner-attachment');
    t.doc.root.hostElement.append(nested);
    t.plugin.init(); t.doc.getBlockById.calls.reset();
    t.pointer('pointerover', {}, nested);
    t.pointer('pointerup', {pointerType: 'touch'}, nested);
    tick(250);
    expect(t.doc.getBlockById).not.toHaveBeenCalled();
    expect(t.doc.overlayService.createConnectedOverlay).not.toHaveBeenCalled();
    t.plugin.destroy();
  }));

  it("does not open toolbar for attachment gap cursor", fakeAsync(() => {
    const {plugin, doc, selection$, selectionValue, attachmentGapSelection} = makeHarness();
    plugin.init();

    selectionValue.current = attachmentGapSelection;
    selection$.next(attachmentGapSelection);
    tick(250);

    expect(doc.overlayService.createConnectedOverlay).not.toHaveBeenCalled();
    plugin.destroy();
  }));
});

describe("AttachmentExtensionPlugin file paste selection handling", () => {
  const makeSnapshot = (flavour: string, props: Record<string, any> = {}) => ({
    id: `${flavour}-${Math.random().toString(36).slice(2)}`,
    flavour,
    nodeType: 0,
    props,
    children: [],
  });

  const makeHarness = (
    selection: any,
    docPatch: Record<string, any> = {},
    files: File[] = [new File(["hello"], "report.txt", {type: "text/plain"})],
    deferPaste = false,
  ) => {
    const snapshots: any[] = [];
    const fileService = {
      isOverMaxSize: jasmine.createSpy("isOverMaxSize").and.returnValue(false),
      createObjectURL: jasmine.createSpy("createObjectURL").and.callFake(
        (file: File) => `blob:${file.name}`,
      ),
      removeObjectURL: jasmine.createSpy("removeObjectURL"),
    };
    const doc = {
      messageService: {
        warn: jasmine.createSpy("warn"),
      },
      logger: {
        warn: jasmine.createSpy("warn"),
      },
      schemas: {
        createSnapshot: jasmine.createSpy("createSnapshot").and.callFake((flavour: string, args: any[] = []) => {
          const snapshot = makeSnapshot(flavour, flavour === "attachment" ? args[0] : {src: args[0]});
          snapshots.push(snapshot);
          return snapshot;
        }),
      },
      clipboard: {
        deleteContentFromSelection: jasmine.createSpy("deleteContentFromSelection"),
      },
      selection: {setGapCursor: jasmine.createSpy('setGapCursor')},
      crud: {
        undoManager: {stopCapturing: jasmine.createSpy('stopCapturing')},
        transact: jasmine.createSpy("transact").and.callFake((run: () => void) => run()),
        insertBlocks: jasmine.createSpy("insertBlocks"),
        insertBlocksAfter: jasmine.createSpy("insertBlocksAfter"),
        deleteBlocks: jasmine.createSpy("deleteBlocks"),
      },
      ...docPatch,
    };
    const plugin = new AttachmentExtensionPlugin();
    (plugin as any).doc = doc;
    (plugin as any).fileService = fileService;
    const preventDefault = jasmine.createSpy("preventDefault");
    const paste = () => plugin.onPaste({
      preventDefault,
      get: (name: string) => {
        if (name !== "clipboardState") throw new Error(`Unexpected state ${name}`);
        return {
          dataTypes: [ClipboardDataType.FILES],
          clipboardData: {files},
          selection,
        };
      },
    } as any);
    const consumed = deferPaste ? undefined : paste();
    return {plugin, doc, snapshots, fileService, preventDefault, paste, consumed};
  };

  it("inserts pasted files at a gap-before cursor", () => {
    const gapBlock = {
      id: "table-1",
      props: {depth: 2},
      parentId: "root",
      getIndexOfParent: () => 1,
    };
    const selection = {
      collapsed: true,
      isAllSelected: false,
      start: {type: "gap", side: "before", block: gapBlock},
      end: {type: "gap", side: "before", block: gapBlock},
      getTableCellSelection: () => null,
    };

    const {doc, snapshots, preventDefault, consumed} = makeHarness(selection);

    expect(consumed).toBeTrue();
    expect(preventDefault).toHaveBeenCalled();
    expect(snapshots[0].props.depth).toBe(2);
    expect(doc.crud.insertBlocks).toHaveBeenCalledOnceWith("root", 1, snapshots);
    expect(doc.clipboard.deleteContentFromSelection).not.toHaveBeenCalled();
  });

  it("replaces a boundary range with pasted file blocks at the boundary start", () => {
    const host = {
      id: "root",
      childrenLength: 3,
    };
    const firstBlock = {
      id: "p1",
      props: {depth: 1},
    };
    const selection = {
      isAllSelected: false,
      firstBlock,
      start: {type: "boundary", blockId: "root", index: 1, block: host},
      end: {type: "boundary", blockId: "root", index: 2, block: host},
      getTableCellSelection: () => null,
    };

    const {doc, snapshots} = makeHarness(selection);

    expect(snapshots[0].props.depth).toBe(1);
    expect(doc.crud.deleteBlocks).toHaveBeenCalledOnceWith("root", 1, 1, true);
    expect(doc.crud.insertBlocks).toHaveBeenCalledOnceWith("root", 1, snapshots);
    expect(doc.clipboard.deleteContentFromSelection).not.toHaveBeenCalled();
  });

  it("keeps text selection file paste on the existing delete-then-insert-after path", () => {
    const textBlock = {
      id: "p1",
      props: {depth: 3},
    };
    const selection = {
      isAllSelected: false,
      firstBlock: textBlock,
      start: {type: "text", offset: 0},
      end: {type: "text", offset: 2},
      getTableCellSelection: () => null,
    };

    const {doc, snapshots} = makeHarness(selection);

    expect(snapshots[0].props.depth).toBe(3);
    expect(doc.clipboard.deleteContentFromSelection).toHaveBeenCalledOnceWith(selection);
    expect(doc.crud.insertBlocksAfter).toHaveBeenCalledOnceWith(textBlock, snapshots);
  });

  it("keeps every object URL after a successful batch insertion", () => {
    const gapBlock = {
      id: "paragraph-1",
      props: {depth: 1},
      parentId: "root",
      getIndexOfParent: () => 0,
    };
    const selection = {
      collapsed: true,
      isAllSelected: false,
      start: {type: "gap", side: "after", block: gapBlock},
      end: {type: "gap", side: "after", block: gapBlock},
      getTableCellSelection: () => null,
    };
    const files = [
      new File(["image"], "screen.png", {type: "image/png"}),
      new File(["attachment"], "report.txt", {type: "text/plain"}),
    ];

    const {doc, snapshots, fileService, consumed} = makeHarness(
      selection,
      {},
      files,
    );

    expect(consumed).toBeTrue();
    expect(doc.crud.insertBlocks).toHaveBeenCalledOnceWith("root", 1, snapshots);
    expect(fileService.createObjectURL).toHaveBeenCalledTimes(2);
    expect(fileService.removeObjectURL).not.toHaveBeenCalled();
  });

  it("releases every object URL when the prepared batch cannot be inserted", () => {
    const gapBlock = {
      id: "detached-block",
      props: {depth: 0},
      parentId: null,
      getIndexOfParent: () => 0,
    };
    const selection = {
      collapsed: true,
      isAllSelected: false,
      start: {type: "gap", side: "after", block: gapBlock},
      end: {type: "gap", side: "after", block: gapBlock},
      getTableCellSelection: () => null,
    };
    const files = [
      new File(["image"], "screen.png", {type: "image/png"}),
      new File(["attachment"], "report.txt", {type: "text/plain"}),
    ];

    const {doc, fileService, consumed} = makeHarness(selection, {}, files);

    expect(consumed).toBeTrue();
    expect(doc.crud.insertBlocks).not.toHaveBeenCalled();
    expect(fileService.removeObjectURL.calls.allArgs()).toEqual([
      ["blob:screen.png"],
      ["blob:report.txt"],
    ]);
  });

  it("releases every object URL and preserves the error when insertion throws", () => {
    const gapBlock = {
      id: "paragraph-1",
      props: {depth: 0},
      parentId: "root",
      getIndexOfParent: () => 0,
    };
    const selection = {
      collapsed: true,
      isAllSelected: false,
      start: {type: "gap", side: "after", block: gapBlock},
      end: {type: "gap", side: "after", block: gapBlock},
      getTableCellSelection: () => null,
    };
    const files = [
      new File(["image"], "screen.png", {type: "image/png"}),
      new File(["attachment"], "report.txt", {type: "text/plain"}),
    ];
    const insertError = new Error("insert failed");
    const insertBlocks = jasmine.createSpy("insertBlocks").and.throwError(insertError);
    const {fileService, paste} = makeHarness(
      selection,
      {crud: {insertBlocks}},
      files,
      true,
    );

    expect(paste).toThrowError("insert failed");
    expect(fileService.removeObjectURL.calls.allArgs()).toEqual([
      ["blob:screen.png"],
      ["blob:report.txt"],
    ]);
  });

  it("does not create object URLs for table-cell file paste", () => {
    const selection = {
      isAllSelected: false,
      getTableCellSelection: () => ({
        tableId: "table-1",
        anchorCellId: "cell-1",
        headCellId: "cell-2",
      }),
    };

    const {doc, snapshots, preventDefault, consumed} = makeHarness(selection);

    expect(consumed).toBeTrue();
    expect(preventDefault).toHaveBeenCalled();
    expect(doc.messageService.warn).toHaveBeenCalled();
    expect(snapshots).toEqual([]);
    expect(doc.crud.insertBlocks).not.toHaveBeenCalled();
    expect(doc.crud.insertBlocksAfter).not.toHaveBeenCalled();
  });

  it("does not create object URLs for stale file paste selections", () => {
    const textBlock = {
      id: "p1",
      props: {depth: 3},
    };
    const selection = {
      isAllSelected: false,
      firstBlock: textBlock,
      lastBlock: textBlock,
      commonParent: "p1",
      isInSameBlock: true,
      start: {type: "text", blockId: "p1", offset: 0},
      end: {type: "text", blockId: "p1", offset: 0},
      anchor: {type: "text", blockId: "p1", offset: 0},
      head: {type: "text", blockId: "p1", offset: 0},
      getTableCellSelection: () => null,
    };
    const {doc, snapshots, fileService, consumed} = makeHarness(selection, {
      getBlockById: jasmine.createSpy("getBlockById").and.throwError("missing"),
    });

    expect(consumed).toBeTrue();
    expect(doc.logger.warn).toHaveBeenCalledWith('attachment paste target selection is stale, abort');
    expect(fileService.createObjectURL).not.toHaveBeenCalled();
    expect(snapshots).toEqual([]);
  });
});
