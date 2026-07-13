import {fakeAsync, flushMicrotasks, tick} from "@angular/core/testing";
import {Subject} from "rxjs";
import {ClipboardDataType} from "../../framework";
import {AttachmentExtensionPlugin} from "./index";

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
  const makeHarness = () => {
    const selection$ = new Subject<any>();
    const selectionValue = {current: null as any};
    const attachmentBlock = {
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
          },
        }),
      },
      getBlockById: jasmine.createSpy("getBlockById").and.returnValue(attachmentBlock),
    };
    const plugin = new AttachmentExtensionPlugin();
    (plugin as any).doc = doc;
    return {plugin, doc, selection$, selectionValue, attachmentSelection, attachmentGapSelection};
  };

  it("rechecks the current selection before opening", fakeAsync(() => {
    const {plugin, doc, selection$, selectionValue, attachmentSelection} = makeHarness();
    plugin.init();

    selectionValue.current = attachmentSelection;
    selection$.next(attachmentSelection);
    selectionValue.current = null;
    tick(250);

    expect(doc.overlayService.createConnectedOverlay).not.toHaveBeenCalled();
    plugin.destroy();
  }));

  it("opens toolbar for selected attachment blocks", fakeAsync(() => {
    const {plugin, doc, selection$, selectionValue, attachmentSelection} = makeHarness();
    plugin.init();

    selectionValue.current = attachmentSelection;
    selection$.next(attachmentSelection);
    tick(250);

    expect(doc.overlayService.createConnectedOverlay).toHaveBeenCalled();
    plugin.destroy();
  }));

  it("does not open delayed toolbar when the selected attachment block is stale", fakeAsync(() => {
    const {plugin, doc, selection$, selectionValue, attachmentSelection} = makeHarness();
    plugin.init();

    selectionValue.current = attachmentSelection;
    selection$.next(attachmentSelection);
    doc.getBlockById.and.throwError("missing");
    tick(250);

    expect(doc.overlayService.createConnectedOverlay).not.toHaveBeenCalled();
    plugin.destroy();
  }));

  it("does not run toolbar actions when the attachment block becomes stale", fakeAsync(() => {
    const {plugin, doc, selection$, selectionValue, attachmentSelection} = makeHarness();
    plugin.init();

    selectionValue.current = attachmentSelection;
    selection$.next(attachmentSelection);
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

  it("cancels delayed toolbar open on destroy", fakeAsync(() => {
    const {plugin, doc, selection$, selectionValue, attachmentSelection} = makeHarness();
    plugin.init();

    selectionValue.current = attachmentSelection;
    selection$.next(attachmentSelection);
    plugin.destroy();
    tick(250);

    expect(doc.overlayService.createConnectedOverlay).not.toHaveBeenCalled();
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

  const makeHarness = (selection: any, docPatch: Record<string, any> = {}) => {
    const file = new File(["hello"], "report.txt", {type: "text/plain"});
    const snapshots: any[] = [];
    const fileService = {
      isOverMaxSize: jasmine.createSpy("isOverMaxSize").and.returnValue(false),
      createObjectURL: jasmine.createSpy("createObjectURL").and.returnValue("blob:report"),
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
      crud: {
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
    const consumed = plugin.onPaste({
      preventDefault,
      get: (name: string) => {
        if (name !== "clipboardState") throw new Error(`Unexpected state ${name}`);
        return {
          dataTypes: [ClipboardDataType.FILES],
          clipboardData: {files: [file]},
          selection,
        };
      },
    } as any);
    return {plugin, doc, snapshots, fileService, preventDefault, consumed};
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
