import { fakeAsync, flushMicrotasks } from "@angular/core/testing";
import { BehaviorSubject, Subject } from "rxjs";
import * as Y from "yjs";
import { OneShotCursorAnchor } from "../../framework";
import { BlockTransformerPlugin } from "./index";
import { blockTransforms } from "./const";

describe("BlockTransformerPlugin ordered continuation", () => {
  it("reads virtual root siblings from the model without materializing every component", () => {
    const orderedTransform = blockTransforms.find(
      (transform) => transform.flavour === "ordered",
    )!;
    const parent = {
      getChildrenBlocks: jasmine.createSpy('getChildrenBlocks').and.throwError(
        'offscreen sibling component is not mounted',
      ),
    }
    const from = {
      id: 'current',
      flavour: 'paragraph',
      props: {depth: 0, heading: 0},
      parentBlock: parent,
      textDeltas: () => [{insert: '1. current'}],
    }
    const replacement = {
      id: 'replacement',
      flavour: 'ordered',
      props: {} as Record<string, unknown>,
    }
    const chain = {
      replaceWithSnapshots: jasmine.createSpy('replaceWithSnapshots'),
      nextTick: jasmine.createSpy('nextTick'),
      selectOrSetCursorAtBlock: jasmine.createSpy('selectOrSetCursorAtBlock'),
      recalculateSelection: jasmine.createSpy('recalculateSelection'),
      run: jasmine.createSpy('run'),
    }
    Object.values(chain).forEach(spy => spy.and.returnValue(chain))
    const doc = {
      model: {
        getParentId: (blockId: string) => blockId === 'current' ? 'root' : null,
        getChildrenIds: () => ['offscreen-ordered', 'current'],
        getFlavour: (blockId: string) => blockId === 'offscreen-ordered' ? 'ordered' : 'paragraph',
        getProps: (blockId: string) => blockId === 'offscreen-ordered'
          ? {depth: 0, heading: 0, order: 7}
          : from.props,
      },
      schemas: {
        createSnapshot: jasmine.createSpy('createSnapshot').and.returnValue(replacement),
      },
      chain: () => chain,
    }

    expect(() => orderedTransform.onConvert!(doc as any, from as any, '1. ')).not.toThrow()

    expect(parent.getChildrenBlocks).not.toHaveBeenCalled()
    expect(replacement.props['order']).toBe(7)
    expect(chain.replaceWithSnapshots).toHaveBeenCalledOnceWith('current', [replacement])
  })
})

describe('BlockTransformerPlugin beforeInput', () => {
  function stubNextTick() {
    const scheduler = (window as any).scheduler

    if (scheduler?.yield) {
      spyOn(scheduler, 'yield').and.returnValue(Promise.resolve())
    } else if ('requestIdleCallback' in window) {
      spyOn(window as any, 'requestIdleCallback').and.callFake((cb: IdleRequestCallback) => {
        cb({didTimeout: false, timeRemaining: () => 0} as IdleDeadline)
        return 1
      })
    }
  }

  function createPlugin() {
    const block = {
      id: 'block',
      flavour: 'paragraph',
      textContent: () => ' ',
    }
    const plugin = new BlockTransformerPlugin()
    ;(plugin as any).doc = {
      getBlockById: jasmine.createSpy('getBlockById').and.callFake((id: string) => {
        const current = (plugin as any).doc.selection.value?.firstBlock
        if (current?.id === id) return current
        return id === block.id ? block : undefined
      }),
      schemas: {
        get: jasmine.createSpy('get').and.returnValue({metadata: {isLeaf: false}})
      },
      selection: {
        value: {
          collapsed: true,
          start: {type: 'text', offset: 0},
          firstBlock: block
        },
        recalculate: jasmine.createSpy('recalculate').and.callFake(() => ({
          value: (plugin as any).doc.selection.value
        }))
      }
    }
    return plugin as any
  }

  it('triggers markdown transform when Safari provides space through dataTransfer', fakeAsync(() => {
    const plugin = createPlugin()
    spyOn<any>(plugin, '_mdTransform').and.callFake(() => true)
    stubNextTick()

    plugin.onBeforeInput({
      getDefaultEvent: () => ({
        data: null,
        dataTransfer: {
          types: ['text/plain'],
          getData: () => ' '
        }
      })
    } as any)

    flushMicrotasks()

    expect(plugin._mdTransform).toHaveBeenCalled()
  }))

  it('triggers markdown transform from keyDown fallback when beforeInput text is missing', fakeAsync(() => {
    const plugin = createPlugin()
    spyOn<any>(plugin, '_mdTransform').and.callFake(() => true)
    stubNextTick()

    plugin.onKeyDown({
      get: (name: string) => {
        if (name === 'keyboardState') {
          return {
            raw: {
              key: ' ',
              metaKey: false,
              ctrlKey: false,
              altKey: false
            }
          }
        }
        throw new Error(`Unexpected state ${name}`)
      }
    } as any)

    flushMicrotasks()

    expect(plugin._mdTransform).toHaveBeenCalled()
  }))

  it('opens the context menu when Safari provides slash through dataTransfer', fakeAsync(() => {
    const plugin = createPlugin()
    const block = {
      id: 'slash-block',
      flavour: 'paragraph',
      textContent: () => '/',
      textDeltas: () => [{insert: '/'}],
      textLength: 1,
      plainTextOnly: false,
    }
    plugin.doc.selection.value = {
      collapsed: true,
      start: {type: 'text', offset: 1},
      firstBlock: block
    }
    spyOn(plugin, 'openContextMenu')
    stubNextTick()

    plugin.onBeforeInput({
      getDefaultEvent: () => ({
        data: null,
        dataTransfer: {
          types: ['text/plain'],
          getData: () => '/'
        }
      })
    } as any)

    flushMicrotasks()

    expect(plugin.openContextMenu).toHaveBeenCalledWith(block, 0)
  }))

  it('opens the context menu from keyDown fallback when slash is typed', fakeAsync(() => {
    const plugin = createPlugin()
    const block = {
      id: 'slash-block',
      flavour: 'paragraph',
      textContent: () => '/',
      textDeltas: () => [{insert: '/'}],
      textLength: 1,
      plainTextOnly: false,
    }
    plugin.doc.selection.value = {
      collapsed: true,
      start: {type: 'text', offset: 1},
      firstBlock: block
    }
    spyOn(plugin, 'openContextMenu')
    stubNextTick()

    plugin.onKeyDown({
      get: (name: string) => {
        if (name === 'keyboardState') {
          return {
            raw: {
              key: '/',
              metaKey: false,
              ctrlKey: false,
              altKey: false
            }
          }
        }
        throw new Error(`Unexpected state ${name}`)
      }
    } as any)

    flushMicrotasks()

    expect(plugin.openContextMenu).toHaveBeenCalledWith(block, 0)
  }))

  it("opens the searchless Emoji picker when a colon is typed", fakeAsync(() => {
    const plugin = createPlugin();
    const block = {
      id: "emoji-block",
      flavour: "paragraph",
      textContent: () => ":",
      textDeltas: () => [{ insert: ":" }],
      textLength: 1,
      plainTextOnly: false,
    };
    plugin.doc.selection.value = {
      collapsed: true,
      start: { type: "text", offset: 1 },
      firstBlock: block,
    };
    spyOn<any>(plugin, "openColonEmojiPicker");
    stubNextTick();

    plugin.onKeyDown({
      get: () => ({
        raw: { key: ":", metaKey: false, ctrlKey: false, altKey: false },
      }),
    } as any);
    flushMicrotasks();

    expect(plugin.openColonEmojiPicker).toHaveBeenCalledOnceWith(block, 0);
  }));

  it("opens Emoji after ASCII text without changing the slash trigger path", fakeAsync(() => {
    const plugin = createPlugin();
    const block = {
      id: "inline-emoji-block",
      flavour: "paragraph",
      textContent: () => "abc:",
      textDeltas: () => [{ insert: "abc:" }],
      textLength: 4,
      plainTextOnly: false,
    };
    plugin.doc.selection.value = {
      collapsed: true,
      start: { type: "text", offset: 4 },
      firstBlock: block,
    };
    spyOn<any>(plugin, "openColonEmojiPicker");
    spyOn(plugin, "openContextMenu");
    stubNextTick();

    plugin.onKeyDown({
      get: () => ({
        raw: { key: ":", metaKey: false, ctrlKey: false, altKey: false },
      }),
    } as any);
    flushMicrotasks();

    expect(plugin.openColonEmojiPicker).toHaveBeenCalledOnceWith(block, 3);
    expect(plugin.openContextMenu).not.toHaveBeenCalled();
  }));

  it("does not open the slash menu after existing paragraph text", fakeAsync(() => {
    const plugin = createPlugin();
    const block = {
      id: 'rich-slash-block',
      flavour: 'paragraph',
      textContent: () => 'before /',
      textDeltas: () => [{insert: 'before /'}],
      textLength: 8,
      plainTextOnly: false,
    }
    plugin.doc.selection.value = {
      collapsed: true,
      start: {type: 'text', offset: 8},
      firstBlock: block,
    }
    spyOn(plugin, 'openContextMenu')
    stubNextTick()

    plugin.onKeyDown({
      get: () => ({
        raw: {key: '/', metaKey: false, ctrlKey: false, altKey: false},
      }),
    } as any)
    flushMicrotasks()

    expect(plugin.openContextMenu).not.toHaveBeenCalled()
  }))

  it("does not open the slash menu in an otherwise empty non-paragraph block", fakeAsync(() => {
    const plugin = createPlugin();
    const block = {
      id: 'ordered-slash-block',
      flavour: 'ordered',
      textContent: () => '/',
      textDeltas: () => [{insert: '/'}],
      textLength: 1,
      plainTextOnly: false,
    }
    plugin.doc.selection.value = {
      collapsed: true,
      start: {type: 'text', offset: 1},
      firstBlock: block,
    }
    spyOn(plugin, 'openContextMenu')
    stubNextTick()

    plugin.onKeyDown({
      get: () => ({
        raw: {key: '/', metaKey: false, ctrlKey: false, altKey: false},
      }),
    } as any)
    flushMicrotasks()

    expect(plugin.openContextMenu).not.toHaveBeenCalled()
  }))

  it('lets a later beforeInput trigger replace an earlier keyDown trigger', fakeAsync(() => {
    const plugin = createPlugin()
    const block = {
      id: 'heading-block',
      flavour: 'paragraph',
      textContent: () => '# ',
    }
    plugin.doc.selection.value = {
      collapsed: true,
      start: {type: 'text', offset: 1},
      firstBlock: block
    }
    plugin.doc.selection.recalculate.and.callFake(() => ({
      value: plugin.doc.selection.value
    }))
    spyOn<any>(plugin, '_mdTransform').and.callFake(() => true)
    stubNextTick()

    block.textContent = () => '#'
    plugin.onKeyDown({
      get: (name: string) => {
        if (name === 'keyboardState') {
          return {
            raw: {
              key: ' ',
              metaKey: false,
              ctrlKey: false,
              altKey: false
            }
          }
        }
        throw new Error(`Unexpected state ${name}`)
      }
    } as any)

    block.textContent = () => '# '
    plugin.doc.selection.value = {
      collapsed: true,
      start: {type: 'text', offset: 1},
      firstBlock: block
    }
    plugin.onBeforeInput({
      getDefaultEvent: () => ({
        data: ' '
      })
    } as any)

    flushMicrotasks()

    expect(plugin._mdTransform).toHaveBeenCalled()
  }))

  it('does not run a queued input trigger after destroy', fakeAsync(() => {
    const plugin = createPlugin()
    spyOn<any>(plugin, '_mdTransform').and.callFake(() => true)
    stubNextTick()

    plugin.onKeyDown({
      get: (name: string) => {
        if (name === 'keyboardState') {
          return {
            raw: {
              key: ' ',
              metaKey: false,
              ctrlKey: false,
              altKey: false
            }
          }
        }
        throw new Error(`Unexpected state ${name}`)
      }
    } as any)
    plugin.destroy()

    flushMicrotasks()

    expect(plugin._mdTransform).not.toHaveBeenCalled()
  }))

  it('does not open the slash context menu for a stale block', fakeAsync(() => {
    const plugin = createPlugin()
    const block = {
      id: 'stale-block',
      flavour: 'paragraph',
      textContent: () => '/',
      textDeltas: () => [{insert: '/'}],
      textLength: 1,
      plainTextOnly: false,
    }
    plugin.doc.selection.value = {
      collapsed: true,
      start: {type: 'text'},
      firstBlock: block
    }
    plugin.doc.getBlockById.and.throwError('missing')
    spyOn(plugin, 'openContextMenu')
    stubNextTick()

    plugin.onBeforeInput({
      getDefaultEvent: () => ({
        data: '/'
      })
    } as any)

    flushMicrotasks()

    expect(plugin.openContextMenu).not.toHaveBeenCalled()
  }))

  it('does not format heading for a stale selected block', () => {
    const plugin = createPlugin()
    const block = {
      id: 'stale-heading',
      flavour: 'paragraph',
      updateProps: jasmine.createSpy('updateProps'),
    }
    plugin.doc.getBlockById.and.throwError('missing')
    const preventDefault = jasmine.createSpy('preventDefault')

    plugin.formatHeading({
      preventDefault,
      get: (name: string) => {
        if (name === 'keyboardState') {
          return {
            raw: {key: '1'},
            selection: {
              isInSameBlock: true,
              start: {type: 'text'},
              firstBlock: block,
            },
          }
        }
        throw new Error(`Unexpected state ${name}`)
      },
    } as any)

    expect(preventDefault).not.toHaveBeenCalled()
    expect(block.updateProps).not.toHaveBeenCalled()
  })

  it('does not run transform hotkeys for a stale selected block', () => {
    const plugin = new BlockTransformerPlugin([
      {
        flavour: 'bullet',
        description: 'Bullet',
        hotkey: {key: 'b'},
      } as any,
    ]) as any
    let hotkeyHandler!: (evt: any) => unknown
    const block = {
      id: 'stale-transform',
      flavour: 'paragraph',
    }
    plugin.doc = {
      getBlockById: jasmine.createSpy('getBlockById').and.throwError('missing'),
      schemas: {
        get: jasmine.createSpy('get').and.returnValue({metadata: {}}),
      },
      event: {
        bindHotkey: jasmine.createSpy('bindHotkey').and.callFake((_hotkey: any, handler: (evt: any) => unknown) => {
          hotkeyHandler = handler
        }),
      },
    }
    const transformEditableBlock = spyOn(BlockTransformerPlugin, 'transformEditableBlock')
    const preventDefault = jasmine.createSpy('preventDefault')

    plugin.init()
    const result = hotkeyHandler({
      preventDefault,
      get: (name: string) => {
        if (name === 'keyboardState') {
          return {
            selection: {
              isInSameBlock: true,
              start: {type: 'text'},
              firstBlock: block,
            },
          }
        }
        throw new Error(`Unexpected state ${name}`)
      },
    })

    expect(result).toBeUndefined()
    expect(preventDefault).not.toHaveBeenCalled()
    expect(transformEditableBlock).not.toHaveBeenCalled()
  })
})

describe("BlockTransformerPlugin slash execution", () => {
  it("reads the complete slash query while selection projection is one input behind", () => {
    const plugin = new BlockTransformerPlugin() as any;
    const yDoc = new Y.Doc();
    const yText = yDoc.getText("source");
    yText.insert(0, "/icon");
    const block = {
      id: "source",
      flavour: "paragraph",
      yText,
      get textLength() {
        return yText.length;
      },
      textDeltas: () => yText.toDelta(),
    };
    const selection = {
      collapsed: true,
      start: {type: "text", blockId: block.id, offset: 1},
      end: {type: "text", blockId: block.id, offset: 1},
      firstBlock: block,
      lastBlock: block,
    };
    plugin.doc = {
      yDoc,
      isReadonly: false,
      getBlockById: (id: string) => id === block.id ? block : undefined,
      isEditable: (candidate: unknown) => candidate === block,
      selection: {
        value: selection,
        recalculate: () => ({value: selection}),
      },
    };

    expect(plugin.resolveSlashQueryState(block, 0)).toEqual({
      query: "icon",
      triggerLength: 5,
    });
  });

  it("closes a secondary command panel when its slash range is deleted", () => {
    const plugin = new BlockTransformerPlugin() as any;
    const yDoc = new Y.Doc();
    const yText = yDoc.getText("source");
    yText.insert(0, "before /emoji after");
    const block = {
      id: "source",
      yText,
      get textLength() {
        return yText.length;
      },
      textDeltas: () => yText.toDelta(),
    };
    plugin.doc = {
      yDoc,
      getBlockById: (id: string) => (id === block.id ? block : undefined),
      isEditable: (candidate: unknown) => candidate === block,
    };
    const close$ = plugin.createCommandPanelClose({
      block,
      query: "emoji",
      triggerIndex: 7,
      triggerLength: 6,
    });
    const closed = jasmine.createSpy("closed");
    close$.subscribe(closed);

    // A collaboration edit before the command moves both relative endpoints;
    // the still-intact slash command must keep its picker open.
    yText.insert(0, "x");
    expect(closed).not.toHaveBeenCalled();

    // Deleting only the slash invalidates the anchored command range.
    yText.delete(8, 1);
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it("splits formatted text around an inserted block and removes only the slash query", async () => {
    const plugin = new BlockTransformerPlugin() as any;
    const block = {
      id: 'source',
      flavour: 'paragraph',
      parentId: 'root',
      props: {depth: 2, align: 'left'},
      textDeltas: () => [
        {insert: 'before ', attributes: {bold: true}},
        {insert: '/table'},
        {insert: ' after', attributes: {italic: true}},
      ],
    }
    const created: any[] = []
    const chain = {
      replaceWithSnapshots: jasmine.createSpy('replaceWithSnapshots'),
      nextTick: jasmine.createSpy('nextTick'),
      selectOrSetCursorAtBlock: jasmine.createSpy('selectOrSetCursorAtBlock'),
      recalculateSelection: jasmine.createSpy('recalculateSelection'),
      run: jasmine.createSpy('run').and.resolveTo(undefined),
    }
    Object.values(chain).forEach(value => {
      if (jasmine.isSpy(value) && value !== chain.run) value.and.returnValue(chain)
    })
    plugin.doc = {
      getBlockById: () => block,
      isReadonly: false,
      canInsertChild: () => true,
      schemas: {
        createSnapshot: jasmine.createSpy('createSnapshot').and.callFake((flavour: string, params: any[]) => {
          const snapshot = {id: `snapshot-${created.length}`, flavour, children: params[0], props: {...params[1]}}
          created.push(snapshot)
          return snapshot
        }),
      },
      chain: () => chain,
    }
    const range = {
      consume: () => ({block, index: 7, length: 6}),
    }

    await plugin.insertBlockAtQuery({block}, 'table', [{rows: 2}], range)

    expect(created.map(snapshot => snapshot.flavour)).toEqual(['paragraph', 'table', 'paragraph'])
    expect(created[0].children).toEqual([{insert: 'before ', attributes: {bold: true}}])
    expect(created[1].props.depth).toBe(2)
    expect(created[2].children).toEqual([{insert: ' after', attributes: {italic: true}}])
    expect(chain.replaceWithSnapshots).toHaveBeenCalledOnceWith('source', created)
    expect(chain.selectOrSetCursorAtBlock).toHaveBeenCalledOnceWith('snapshot-1', true)
  })

  it('replaces a slash range through one model delta operation', fakeAsync(() => {
    const plugin = new BlockTransformerPlugin() as any
    const scheduler = (window as any).scheduler
    if (scheduler?.yield) {
      spyOn(scheduler, 'yield').and.returnValue(Promise.resolve())
    }
    const block = {
      id: 'source',
      applyDeltaOperations: jasmine.createSpy('applyDeltaOperations'),
    }
    plugin.doc = {
      getBlockById: () => block,
      isReadonly: false,
      selection: {setCursorAt: jasmine.createSpy('setCursorAt')},
    }
    const range = {
      consume: jasmine.createSpy('consume').and.returnValue({block, index: 3, length: 6}),
    }

    expect(plugin.replaceCommandRange(range, [{insert: '😀'}])).toBeTrue()
    flushMicrotasks()

    expect(block.applyDeltaOperations).toHaveBeenCalledOnceWith([
      { retain: 3 },
      { delete: 6 },
      { insert: "😀" },
    ]);
    expect(plugin.doc.selection.setCursorAt).toHaveBeenCalledOnceWith(block, 5);
  }));
});

describe("BlockTransformerPlugin colon Emoji execution", () => {
  it("captures arrows for a virtual Emoji selection without moving editor focus", () => {
    const plugin = new BlockTransformerPlugin() as any;
    const yDoc = new Y.Doc();
    const yText = yDoc.getText("source");
    yText.insert(0, ":smile");
    const editor = document.createElement("div");
    editor.contentEditable = "true";
    const host = document.createElement("div");
    const option = document.createElement("button");
    option.className = "cs-emoji-picker__option";
    option.dataset["emojiIndex"] = "0";
    option.tabIndex = 0;
    host.append(option);
    document.body.append(editor, host);
    const blockDestroy$ = new Subject<void>();
    const block = {
      id: "source",
      yText,
      containerElement: editor,
      onDestroy$: blockDestroy$,
      get textLength() {
        return yText.length;
      },
      textDeltas: () => yText.toDelta(),
      setInlineRange: jasmine.createSpy("setInlineRange"),
      runtime: {
        domPointToModel: jasmine.createSpy("domPointToModel").and.returnValue(6),
      },
    };
    const selectionValue = {
      collapsed: true,
      start: { type: "text", blockId: block.id, offset: 6 },
      end: { type: "text", blockId: block.id, offset: 6 },
      firstBlock: block,
      lastBlock: block,
    };
    const setSuppressRecalculate = jasmine.createSpy("setSuppressRecalculate");
    const emojiSelect$ = new Subject<any>();
    const moveActive = jasmine.createSpy("moveActive").and.returnValue(true);
    const moveCategory = jasmine.createSpy("moveCategory").and.returnValue(true);
    const selectActive = jasmine.createSpy("selectActive").and.returnValue(true);
    const componentRef = {
      instance: {
        csEmojiSelect: emojiSelect$,
        moveActive,
        moveCategory,
        selectActive,
      },
      location: { nativeElement: host },
      changeDetectorRef: { detectChanges: jasmine.createSpy("detectChanges") },
      setInput: jasmine.createSpy("setInput"),
    };
    plugin.doc = {
      yDoc,
      isReadonly: false,
      getBlockById: (id: string) => (id === block.id ? block : undefined),
      isEditable: (candidate: unknown) => candidate === block,
      event: { status: { isComposing: false } },
      selection: {
        value: selectionValue,
        selectionChange$: new BehaviorSubject(selectionValue),
        setSuppressRecalculate,
        setCursorAt: jasmine.createSpy("setCursorAt"),
      },
      readonlySwitch$: new Subject<boolean>(),
      onDestroy$: new Subject<void>(),
      overlayService: {
        createConnectedOverlay: jasmine
          .createSpy("createConnectedOverlay")
          .and.returnValue({ componentRef }),
      },
    };

    plugin.openColonEmojiPicker(block, 0);
    editor.focus();
    document.getSelection()?.removeAllRanges();
    const editorRange = document.createRange();
    editorRange.selectNodeContents(editor);
    editorRange.collapse(false);
    document.getSelection()?.addRange(editorRange);
    const event = new KeyboardEvent("keydown", {
      key: "ArrowDown",
      bubbles: true,
      cancelable: true,
    });
    editor.dispatchEvent(event);

    expect(event.defaultPrevented).toBeTrue();
    expect(setSuppressRecalculate).toHaveBeenCalledOnceWith(true);
    expect(document.activeElement).toBe(editor);
    expect(moveActive).toHaveBeenCalledOnceWith("down", {
      preserveFocus: true,
    });

    const searchKey = new KeyboardEvent("keydown", {
      key: "a",
      bubbles: true,
      cancelable: true,
    });
    editor.dispatchEvent(searchKey);
    expect(searchKey.defaultPrevented).toBeFalse();
    expect(document.activeElement).toBe(editor);
    expect(setSuppressRecalculate.calls.allArgs()).toEqual([[true], [false]]);

    const tab = new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true,
    });
    editor.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBeTrue();
    expect(moveCategory).toHaveBeenCalledWith("next", {
      preserveFocus: true,
    });
    expect(document.activeElement).toBe(editor);

    const shiftTab = new KeyboardEvent("keydown", {
      key: "Tab",
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    editor.dispatchEvent(shiftTab);
    expect(shiftTab.defaultPrevented).toBeTrue();
    expect(moveCategory).toHaveBeenCalledWith("previous", {
      preserveFocus: true,
    });
    expect(document.activeElement).toBe(editor);

    plugin.closePickerSession();
    expect(setSuppressRecalculate.calls.allArgs()).toEqual([
      [true],
      [false],
      [true],
      [false],
    ]);
    emojiSelect$.complete();
    blockDestroy$.complete();
    editor.remove();
    host.remove();
  });

  it("uses the text after colon as query and replaces the full trigger range", () => {
    const plugin = new BlockTransformerPlugin() as any;
    const yDoc = new Y.Doc();
    const yText = yDoc.getText("source");
    yText.insert(0, ":rocket");
    const block = {
      id: "source",
      yText,
      get textLength() {
        return yText.length;
      },
      textDeltas: () => yText.toDelta(),
      applyDeltaOperations: (operations: any[]) => yText.applyDelta(operations),
    };
    plugin.doc = {
      yDoc,
      isReadonly: false,
      getBlockById: (id: string) => (id === block.id ? block : undefined),
      isEditable: (candidate: unknown) => candidate === block,
      selection: {
        value: {
          collapsed: true,
          start: { type: "text", blockId: block.id, offset: 7 },
          end: { type: "text", blockId: block.id, offset: 7 },
          firstBlock: block,
          lastBlock: block,
        },
        setCursorAt: jasmine.createSpy("setCursorAt"),
      },
    };
    const anchor = new OneShotCursorAnchor(plugin.doc);
    anchor.capture(block as any, 0);

    const context = plugin.resolveEmojiTriggerContext(anchor);
    expect(context).toEqual(
      jasmine.objectContaining({
        query: "rocket",
        triggerIndex: 0,
        triggerLength: 7,
      }),
    );

    expect(context.replace([{ insert: "🚀" }])).toBeTrue();
    expect(yText.toString()).toBe("🚀");
  });

  it("invalidates the session after the trigger colon is deleted", () => {
    const plugin = new BlockTransformerPlugin() as any;
    const yDoc = new Y.Doc();
    const yText = yDoc.getText("source");
    yText.insert(0, ":smile");
    const block = {
      id: "source",
      yText,
      get textLength() {
        return yText.length;
      },
      textDeltas: () => yText.toDelta(),
    };
    plugin.doc = {
      yDoc,
      isReadonly: false,
      getBlockById: (id: string) => (id === block.id ? block : undefined),
      isEditable: (candidate: unknown) => candidate === block,
      selection: {
        value: {
          collapsed: true,
          start: { type: "text", blockId: block.id, offset: 6 },
          end: { type: "text", blockId: block.id, offset: 6 },
          firstBlock: block,
          lastBlock: block,
        },
      },
    };
    const anchor = new OneShotCursorAnchor(plugin.doc);
    anchor.capture(block as any, 0);

    yText.delete(0, 1);
    plugin.doc.selection.value.start.offset = 5;
    plugin.doc.selection.value.end.offset = 5;

    expect(plugin.resolveEmojiTriggerContext(anchor)).toBeNull();
  });
});

describe("BlockTransformerPlugin slash picker keyboard execution", () => {
  function createHarness(kind: "emoji" | "icon") {
    const plugin = new BlockTransformerPlugin() as any;
    const root = document.createElement("div");
    root.contentEditable = "true";
    const source = document.createElement("div");
    root.append(source);
    const pickerHost = document.createElement("div");
    const search = document.createElement("input");
    pickerHost.append(search);
    document.body.append(root, pickerHost);

    const close$ = new Subject<void>();
    const selection$ = new Subject<any>();
    const moveActive = jasmine.createSpy("moveActive").and.returnValue(true);
    const moveCategory = jasmine.createSpy("moveCategory").and.returnValue(true);
    const selectActive = jasmine.createSpy("selectActive").and.returnValue(true);
    const pickerOutput = new Subject<any>();
    const instance = {
      moveActive,
      moveCategory,
      selectActive,
      ...(kind === "emoji"
        ? {csEmojiSelect: pickerOutput}
        : {csChange: pickerOutput}),
    };
    const componentRef = {
      instance,
      location: {nativeElement: pickerHost},
      setInput: jasmine.createSpy("setInput"),
    };
    const block = {
      id: "slash-source",
      containerElement: source,
      setInlineRange: jasmine.createSpy("setInlineRange"),
      runtime: {
        domPointToModel: jasmine.createSpy("domPointToModel").and.returnValue(5),
      },
    };
    const selectionValue = {
      collapsed: true,
      start: {type: "text", offset: 5},
      firstBlock: block,
    };
    const context = {
      block,
      replace: jasmine.createSpy("replace"),
    };
    plugin.doc = {
      event: {status: {isComposing: false}},
      root: {hostElement: root},
      overlayService: {
        createConnectedOverlay: jasmine
          .createSpy("createConnectedOverlay")
          .and.returnValue({componentRef}),
      },
      getBlockById: () => block,
      selection: {
        value: selectionValue,
        selectionChange$: selection$,
        setSuppressRecalculate: jasmine.createSpy("setSuppressRecalculate"),
      },
    };
    spyOn<any>(plugin, "createCommandPanelClose").and.returnValue(close$);

    if (kind === "emoji") plugin.openEmojiPicker(context);
    else plugin.openIconPicker(context);

    const dispatch = (
      key: string,
      shiftKey = false,
      target: HTMLElement = search,
    ) => {
      const event = new KeyboardEvent("keydown", {
        key,
        shiftKey,
        bubbles: true,
        cancelable: true,
      });
      target.dispatchEvent(event);
      return event;
    };
    const destroy = () => {
      close$.next();
      close$.complete();
      pickerOutput.complete();
      selection$.complete();
      source.remove();
      root.remove();
      pickerHost.remove();
    };

    return {
      plugin,
      close$,
      source,
      root,
      search,
      moveActive,
      moveCategory,
      selectActive,
      block,
      dispatch,
      destroy,
    };
  }

  it("routes IconPicker arrows, categories, and Enter while its search keeps focus", () => {
    const harness = createHarness("icon");
    harness.root.focus();
    expect(harness.dispatch("ArrowLeft", false, harness.root).defaultPrevented).toBeTrue();
    harness.search.focus();

    for (const key of ["ArrowRight", "ArrowUp", "ArrowDown"]) {
      expect(harness.dispatch(key).defaultPrevented).toBeTrue();
    }
    expect(harness.moveActive.calls.allArgs()).toEqual([
      ["left", {preserveFocus: true}],
      ["right", {preserveFocus: true}],
      ["up", {preserveFocus: true}],
      ["down", {preserveFocus: true}],
    ]);

    expect(harness.dispatch("Tab").defaultPrevented).toBeTrue();
    expect(harness.dispatch("Tab", true).defaultPrevented).toBeTrue();
    expect(harness.moveCategory.calls.allArgs()).toEqual([
      ["next", {preserveFocus: true}],
      ["previous", {preserveFocus: true}],
    ]);

    expect(harness.dispatch("Enter").defaultPrevented).toBeTrue();
    expect(harness.selectActive).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(harness.search);

    const text = harness.dispatch("a");
    expect(text.defaultPrevented).toBeFalse();
    expect(document.activeElement).toBe(harness.search);
    harness.destroy();
  });

  it("routes slash EmojiPicker through the same editor-owned keyboard session", () => {
    const harness = createHarness("emoji");
    harness.search.focus();

    const enter = harness.dispatch("Enter");
    expect(enter.defaultPrevented).toBeTrue();
    expect(harness.moveActive).toHaveBeenCalledOnceWith("first", {
      preserveFocus: true,
    });
    expect(harness.selectActive).toHaveBeenCalledTimes(1);

    expect(harness.dispatch("ArrowRight").defaultPrevented).toBeTrue();
    expect(harness.moveActive).toHaveBeenCalledWith("right", {
      preserveFocus: true,
    });
    expect(harness.dispatch("Tab").defaultPrevented).toBeTrue();
    expect(harness.moveCategory).toHaveBeenCalledOnceWith("next", {
      preserveFocus: true,
    });

    const escape = harness.dispatch("Escape");
    expect(escape.defaultPrevented).toBeTrue();
    expect(harness.plugin.activePickerSession).toBeUndefined();
    harness.destroy();
  });

  it("consumes picker navigation before an unavailable action can leak to the browser", () => {
    const harness = createHarness("icon");
    harness.search.focus();
    harness.moveActive.and.returnValue(false);
    harness.moveCategory.and.returnValue(false);
    harness.selectActive.and.returnValue(false);

    for (const key of ["ArrowDown", "Tab", "Enter"]) {
      const event = harness.dispatch(key);
      expect(event.defaultPrevented).withContext(key).toBeTrue();
    }
    expect(harness.moveActive).toHaveBeenCalledWith("down", {
      preserveFocus: true,
    });
    expect(harness.moveCategory).toHaveBeenCalledWith("next", {
      preserveFocus: true,
    });
    expect(harness.selectActive).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(harness.search);
    harness.destroy();
  });

  it("normalizes legacy WebKit arrow names and keyCode-only events", () => {
    const harness = createHarness("emoji");
    harness.search.focus();

    expect(harness.dispatch("Down").defaultPrevented).toBeTrue();
    const keyCodeOnly = new KeyboardEvent("keydown", {
      key: "Unidentified",
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(keyCodeOnly, "keyCode", {value: 37});
    harness.search.dispatchEvent(keyCodeOnly);

    expect(keyCodeOnly.defaultPrevented).toBeTrue();
    expect(harness.moveActive.calls.allArgs()).toEqual([
      ["down", {preserveFocus: true}],
      ["left", {preserveFocus: true}],
    ]);
    harness.destroy();
  });

  it("captures root-targeted keys while the native selection remains in the slash block", () => {
    const harness = createHarness("icon");
    const text = document.createTextNode("/icon");
    harness.source.append(text);
    const range = document.createRange();
    range.setStart(text, text.length);
    range.collapse(true);
    const selection = document.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    harness.root.focus();

    const rootKeyDown = jasmine.createSpy("rootKeyDown");
    const rootKeyUp = jasmine.createSpy("rootKeyUp");
    const rootBeforeInput = jasmine.createSpy("rootBeforeInput");
    harness.root.addEventListener("keydown", rootKeyDown);
    harness.root.addEventListener("keyup", rootKeyUp);
    harness.root.addEventListener("beforeinput", rootBeforeInput);

    for (const key of ["ArrowDown", "Tab", "Enter"]) {
      const down = harness.dispatch(key, false, harness.root);
      expect(down.defaultPrevented).withContext(`${key}:keydown`).toBeTrue();
      const up = new KeyboardEvent("keyup", {
        key,
        bubbles: true,
        cancelable: true,
      });
      harness.root.dispatchEvent(up);
      expect(up.defaultPrevented).withContext(`${key}:keyup`).toBeTrue();
    }

    expect(rootKeyDown).not.toHaveBeenCalled();
    expect(rootKeyUp).not.toHaveBeenCalled();
    expect(rootBeforeInput).not.toHaveBeenCalled();
    expect(selection.focusNode).toBe(text);
    expect(selection.focusOffset).toBe(text.length);
    expect(
      harness.plugin.doc.selection.setSuppressRecalculate,
    ).toHaveBeenCalledWith(true);

    const driftTarget = document.createTextNode("drift");
    harness.root.append(driftTarget);
    const driftRange = document.createRange();
    driftRange.setStart(driftTarget, 0);
    driftRange.collapse(true);
    selection.removeAllRanges();
    selection.addRange(driftRange);
    document.dispatchEvent(new Event("selectionchange"));
    expect(harness.block.setInlineRange).toHaveBeenCalledWith(5);
    harness.destroy();
  });

  it("swallows the Enter event tail after selection closes the picker on keydown", () => {
    const harness = createHarness("emoji");
    harness.search.focus();
    harness.selectActive.and.callFake(() => {
      harness.close$.next();
      return true;
    });
    const leaked: string[] = [];
    for (const type of ["keydown", "keypress", "keyup", "beforeinput"]) {
      document.body.addEventListener(type, () => leaked.push(type), {once: true});
    }

    expect(harness.dispatch("Enter").defaultPrevented).toBeTrue();
    const press = new KeyboardEvent("keypress", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    });
    harness.search.dispatchEvent(press);
    const beforeInput = new InputEvent("beforeinput", {
      inputType: "insertParagraph",
      bubbles: true,
      cancelable: true,
    });
    harness.search.dispatchEvent(beforeInput);
    const up = new KeyboardEvent("keyup", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    });
    harness.search.dispatchEvent(up);

    expect(press.defaultPrevented).toBeTrue();
    expect(beforeInput.defaultPrevented).toBeTrue();
    expect(up.defaultPrevented).toBeTrue();
    expect(leaked).toEqual([]);
    harness.destroy();
  });
});

describe("BlockTransformerPlugin external slash commands", () => {
  function command(id: string, label: string) {
    return {
      id,
      label,
      keywords: ['external'],
      run: jasmine.createSpy(`run:${id}:${label}`),
    }
  }

  it('supports runtime registration, stable-id override, and scoped disposal', () => {
    const original = command('host:insert-ticket', '插入工单')
    const override = command('host:insert-ticket', '插入新版工单')
    const plugin = new BlockTransformerPlugin({commands: [original]})

    const disposeOverride = plugin.registerCommand(override)
    expect(plugin.commands).toEqual([override])

    disposeOverride()
    expect(plugin.commands).toEqual([original])

    expect(plugin.unregisterCommand(original.id)).toBeTrue()
    expect(plugin.commands).toEqual([])
  })

  it('disposes a batch without removing a newer registration from another owner', () => {
    const plugin = new BlockTransformerPlugin()
    const batchCommand = command('host:shared', '批量注册')
    const disposeBatch = plugin.registerCommands([batchCommand])
    const newerCommand = command('host:shared', '后注册')
    plugin.registerCommand(newerCommand)

    disposeBatch()

    expect(plugin.commands).toEqual([newerCommand])
  })

  it('routes editor keyboard events to the active menu exactly once', () => {
    const plugin = new BlockTransformerPlugin() as any
    const activeMenu = {
      handleEditorKey: jasmine.createSpy('handleEditorKey').and.returnValue(true),
    }
    plugin.activeMenu = activeMenu
    const preventDefault = jasmine.createSpy('preventDefault')
    const stopPropagation = jasmine.createSpy('stopPropagation')
    const stopImmediatePropagation = jasmine.createSpy('stopImmediatePropagation')

    const handled = plugin.onKeyDown({
      preventDefault,
      get: () => ({
        raw: {
          key: 'ArrowDown',
          metaKey: false,
          ctrlKey: false,
          altKey: false,
          stopPropagation,
          stopImmediatePropagation,
        },
      }),
    } as any)

    expect(handled).toBeTrue()
    expect(activeMenu.handleEditorKey).toHaveBeenCalledOnceWith('ArrowDown')
    expect(preventDefault).toHaveBeenCalledTimes(1)
    expect(stopPropagation).toHaveBeenCalledTimes(1)
    expect(stopImmediatePropagation).toHaveBeenCalledTimes(1)
  })

  it('hands all arrow keys to the active colon Emoji session', () => {
    const plugin = new BlockTransformerPlugin() as any
    const activePickerSession = {
      handleEditorKey: jasmine.createSpy('handleEditorKey').and.returnValue(true),
    }
    const activeMenu = {
      handleEditorKey: jasmine.createSpy('handleEditorKey').and.returnValue(true),
    }
    plugin.activePickerSession = activePickerSession
    plugin.activeMenu = activeMenu
    const preventDefault = jasmine.createSpy('preventDefault')
    const stopPropagation = jasmine.createSpy('stopPropagation')
    const stopImmediatePropagation = jasmine.createSpy('stopImmediatePropagation')

    for (const key of [
      'ArrowUp',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
    ]) {
      expect(plugin.onKeyDown({
        preventDefault,
        get: () => ({
          raw: {
            key,
            metaKey: false,
            ctrlKey: false,
            altKey: false,
            stopPropagation,
            stopImmediatePropagation,
          },
        }),
      } as any)).toBeTrue()
    }

    expect(
      activePickerSession.handleEditorKey.calls.allArgs().map(args => args[0]),
    ).toEqual(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'])
    expect(activeMenu.handleEditorKey).not.toHaveBeenCalled()
    expect(preventDefault).toHaveBeenCalledTimes(4)
    expect(stopPropagation).toHaveBeenCalledTimes(4)
    expect(stopImmediatePropagation).toHaveBeenCalledTimes(4)
  })

  it('uses a transform description as a menu-only override and keeps hints separate', () => {
    const schema = {
      flavour: 'callout',
      nodeType: 'block',
      metadata: {
        label: '高亮块',
        description: 'Schema 简介',
      },
    }
    const plugin = new BlockTransformerPlugin({
      transformList: [{
        flavour: 'callout',
        description: '宿主覆盖简介',
        searchAlias: 'gl',
        markdown: /^!\s$/,
        markdownHint: '! + 空格',
        hotkey: {key: 'q', shortKey: true, shiftKey: true},
      }],
    }) as any
    plugin.doc = {
      canInsertChild: () => true,
      plugins: [],
      schemas: {
        getSchemaList: () => [schema],
        get: () => undefined,
      },
    };

    const item = plugin
      .buildMenuItems({ parentId: "root" })
      .find((candidate: any) => candidate.flavour === "callout");

    expect(item).toEqual(
      jasmine.objectContaining({
        description: "宿主覆盖简介",
        markdownHint: "! + 空格",
        shortcutHint: jasmine.any(String),
        searchHint: "/gl",
      }),
    );
    expect(schema.metadata.description).toBe("Schema 简介");
    expect(item.description).not.toContain("Markdown");
  });

  it("uses /hngs as the inline formula quick-search alias", () => {
    const plugin = new BlockTransformerPlugin() as any;
    plugin.doc = {
      canInsertChild: () => true,
      plugins: [],
      schemas: {
        getSchemaList: () => [],
        get: () => undefined,
      },
    };

    const item = plugin
      .buildMenuItems({ parentId: "root" })
      .find((candidate: any) => candidate.id === "inline:formula");

    expect(item).toEqual(
      jasmine.objectContaining({
        searchHint: "/hngs",
        keywords: jasmine.arrayContaining(["hngs"]),
      }),
    );
  });
});
