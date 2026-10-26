import {PasteFormatSelectorPlugin} from "./index";

/**
 * These tests pin the *redesigned* format-switching contract:
 *  - switching replaces the tracked PasteRegion (no global-undo dependency)
 *  - the freshly returned region is threaded into the next switch (no erosion)
 *  - overlapping switches are serialized (no interleaved/orphaned writes)
 *
 * The end-to-end symptom (content growing/shrinking/vanishing) lives in the
 * editor runtime (Y.Text + selection + DOM) which this unit harness can't mount,
 * so we assert the control flow that caused it. `_reapplyPaste` is driven directly
 * to avoid standing up the CDK overlay.
 */
describe('PasteFormatSelectorPlugin – format switching', () => {
  let plugin: PasteFormatSelectorPlugin;
  let doc: any;
  let replacePasteRegion: jasmine.Spy;
  let undo: jasmine.Spy;

  const REGION_0 = {start: {blockId: 'b1', rel: null}, end: {blockId: 'b1', rel: null}} as any;
  const REGION_1 = {start: {blockId: 'b1', rel: null}, end: {blockId: 'b2', rel: null}} as any;

  const mdOption = {type: 'markdown', label: 'Markdown', payload: {kind: 'snapshot', snapshot: {} as any}} as any;
  const htmlOption = {type: 'html', label: '保留格式', payload: {kind: 'snapshot', snapshot: {} as any}} as any;
  const plainOption = {type: 'plain-text', label: '纯文本', payload: {kind: 'text', text: 'x'}} as any;

  const makeTextSelection = (block: any) => ({
    start: {blockId: block.id, type: 'text', offset: 0},
    end: {blockId: block.id, type: 'text', offset: 0},
    anchor: {blockId: block.id, type: 'text', offset: 0},
    head: {blockId: block.id, type: 'text', offset: 0},
    firstBlock: block,
    lastBlock: block,
    isInSameBlock: true,
    getTableCellSelection: () => null,
    getBoundarySelectedChildIds: () => null,
  }) as any;

  beforeEach(() => {
    undo = jasmine.createSpy('undo');
    replacePasteRegion = jasmine.createSpy('replacePasteRegion');
    doc = {
      clipboard: {replacePasteRegion, applyPasteOption: jasmine.createSpy('applyPasteOption')},
      crud: {undoManager: {undo}},
      logger: {warn: jasmine.createSpy('warn')},
    };

    plugin = new PasteFormatSelectorPlugin();
    (plugin as any).doc = doc;
    (plugin as any)._emitSessionView = jasmine.createSpy('_emitSessionView');
    (plugin as any)._clearSession = jasmine.createSpy('_clearSession').and.callFake(() => {
      (plugin as any)._session = null;
      (plugin as any)._region = null;
    });
    (plugin as any)._session = {
      anchorBlockId: 'b1',
      selectedType: 'html',
      options: [mdOption, htmlOption, plainOption],
    };
    (plugin as any)._region = REGION_0;
    (plugin as any)._collapsed = false;
  });

  it('switches by replacing the tracked region, never via the undo stack', async () => {
    replacePasteRegion.and.resolveTo({anchorBlockId: 'b2', region: REGION_1});

    await (plugin as any)._reapplyPaste('markdown');

    expect(replacePasteRegion).toHaveBeenCalledTimes(1);
    expect(replacePasteRegion).toHaveBeenCalledWith(REGION_0, mdOption, false);
    expect(undo).not.toHaveBeenCalled();
    expect((plugin as any)._region).toBe(REGION_1);
    expect((plugin as any)._session.selectedType).toBe('markdown');
  });

  it('forwards the collapsed flag so a cursor paste stays a cursor on switch', async () => {
    (plugin as any)._collapsed = true;
    replacePasteRegion.and.resolveTo({anchorBlockId: 'b2', region: REGION_1});

    await (plugin as any)._reapplyPaste('markdown');

    expect(replacePasteRegion).toHaveBeenCalledWith(REGION_0, mdOption, true);
  });

  it('threads the returned region into the next switch (no cross-switch erosion)', async () => {
    replacePasteRegion.and.resolveTo({anchorBlockId: 'b2', region: REGION_1});
    await (plugin as any)._reapplyPaste('markdown');

    const REGION_2 = {start: {blockId: 'b1', rel: null}, end: {blockId: 'b3', rel: null}} as any;
    replacePasteRegion.calls.reset();
    replacePasteRegion.and.resolveTo({anchorBlockId: 'b3', region: REGION_2});

    await (plugin as any)._reapplyPaste('html');

    // Uses the region produced by the previous switch — not the stale REGION_0.
    expect(replacePasteRegion).toHaveBeenCalledTimes(1);
    expect(replacePasteRegion).toHaveBeenCalledWith(REGION_1, htmlOption, false);
    expect((plugin as any)._region).toBe(REGION_2);
  });

  it('ignores a re-entrant switch while one is still in flight', async () => {
    let resolveFirst!: (v: any) => void;
    replacePasteRegion.and.returnValue(new Promise(r => (resolveFirst = r)));

    const first = (plugin as any)._reapplyPaste('markdown');
    const second = (plugin as any)._reapplyPaste('plain-text');
    await second;

    expect(replacePasteRegion).toHaveBeenCalledTimes(1);

    resolveFirst({anchorBlockId: 'b2', region: REGION_1});
    await first;
    expect((plugin as any)._reapplying).toBeFalse();
  });

  it('is a no-op when switching to the already-selected format', async () => {
    await (plugin as any)._reapplyPaste('html');
    expect(replacePasteRegion).not.toHaveBeenCalled();
  });

  it('clears the session when the region can no longer be resolved', async () => {
    replacePasteRegion.and.resolveTo(null);
    await (plugin as any)._reapplyPaste('markdown');
    expect((plugin as any)._clearSession).toHaveBeenCalled();
  });

  it('ignores an async format switch result after destroy', async () => {
    let resolveSwitch!: (value: any) => void;
    replacePasteRegion.and.returnValue(new Promise(resolve => {
      resolveSwitch = resolve;
    }));

    const inFlight = (plugin as any)._reapplyPaste('markdown');
    plugin.destroy();
    resolveSwitch({anchorBlockId: 'b2', region: REGION_1});
    await inFlight;

    expect((plugin as any)._region).toBe(REGION_0);
    expect((plugin as any)._session.selectedType).toBe('html');
    expect((plugin as any)._emitSessionView).not.toHaveBeenCalled();
  });

  it('does not create an overlay if destroyed before nextTick', async () => {
    const createConnectedOverlay = jasmine.createSpy('createConnectedOverlay');
    doc.getBlockById = jasmine.createSpy('getBlockById').and.returnValue(document.createElement('span'));
    doc.overlayService = {createConnectedOverlay};

    (plugin as any)._renderSession({
      anchorBlockId: 'b1',
      selectedType: 'html',
      options: [{type: 'html', label: '保留格式'}],
    });
    plugin.destroy();
    await new Promise(resolve => setTimeout(resolve, 0));
    await Promise.resolve();

    expect(createConnectedOverlay).not.toHaveBeenCalled();
  });

  it('does not start a format-switch session when the paste region is unavailable', async () => {
    await (plugin as any)._handlePasteCompleted({
      anchorBlockId: 'b1',
      appliedType: 'html',
      htmlSnapshot: {} as any,
      plainText: 'plain',
      markdownText: null,
      region: null,
      collapsed: false,
    });

    expect((plugin as any)._clearSession).toHaveBeenCalled();
    expect((plugin as any)._emitSessionView).not.toHaveBeenCalled();
    expect((plugin as any)._session).toBeNull();
  });

  it('ignores an older paste completion when a newer paste event wins the race', async () => {
    let resolveMarkdown!: (snapshot: any) => void;
    doc.injector = {
      get: () => ({
        getAdapter: () => ({
          toSnapshot: () => new Promise(resolve => {
            resolveMarkdown = resolve;
          }),
        }),
      }),
    };
    const newerRegion = {start: {blockId: 'new-1', rel: null}, end: {blockId: 'new-2', rel: null}} as any;

    const older = (plugin as any)._handlePasteCompleted({
      anchorBlockId: 'old',
      appliedType: 'plain-text',
      htmlSnapshot: null,
      plainText: 'old',
      markdownText: '**old**',
      region: REGION_0,
      collapsed: false,
    });

    await (plugin as any)._handlePasteCompleted({
      anchorBlockId: 'new',
      appliedType: 'html',
      htmlSnapshot: {} as any,
      plainText: 'new',
      markdownText: null,
      region: newerRegion,
      collapsed: true,
    });

    expect((plugin as any)._session.anchorBlockId).toBe('new');
    expect((plugin as any)._region).toBe(newerRegion);
    expect((plugin as any)._collapsed).toBeTrue();

    resolveMarkdown({} as any);
    await older;

    expect((plugin as any)._session.anchorBlockId).toBe('new');
    expect((plugin as any)._region).toBe(newerRegion);
    expect((plugin as any)._collapsed).toBeTrue();
  });

  it('skips spreadsheet paste when the target selection is stale after file parsing', async () => {
    const block = {id: 'p1', props: {depth: 2}};
    const selection = makeTextSelection(block);
    doc.getBlockById = jasmine.createSpy('getBlockById').and.throwError('missing block');
    doc.messageService = {warn: jasmine.createSpy('warn'), error: jasmine.createSpy('error')};
    doc.schemas = {createSnapshot: jasmine.createSpy('createSnapshot')};
    spyOn(plugin as any, '_readSpreadsheetMatrix').and.resolveTo([['A1']]);

    const seq = ++(plugin as any)._pasteEventSeq;
    await (plugin as any)._pasteSpreadsheetFile({} as File, selection, 2, seq);

    expect(doc.clipboard.applyPasteOption).not.toHaveBeenCalled();
    expect(doc.schemas.createSnapshot).not.toHaveBeenCalled();
    expect(doc.logger.warn).toHaveBeenCalledWith('spreadsheet paste target selection is stale, abort');
  });

  it('ignores a spreadsheet parse result after a newer paste event starts', async () => {
    const block = {id: 'p1', props: {depth: 1}};
    const selection = makeTextSelection(block);
    doc.getBlockById = jasmine.createSpy('getBlockById').and.returnValue(block);
    doc.messageService = {warn: jasmine.createSpy('warn'), error: jasmine.createSpy('error')};
    doc.schemas = {createSnapshot: jasmine.createSpy('createSnapshot')};
    let resolveMatrix!: (matrix: string[][]) => void;
    spyOn(plugin as any, '_readSpreadsheetMatrix').and.returnValue(new Promise(resolve => {
      resolveMatrix = resolve;
    }));

    const seq = ++(plugin as any)._pasteEventSeq;
    const inFlight = (plugin as any)._pasteSpreadsheetFile({} as File, selection, 1, seq);
    ++(plugin as any)._pasteEventSeq;
    resolveMatrix([['A1']]);
    await inFlight;

    expect(doc.clipboard.applyPasteOption).not.toHaveBeenCalled();
    expect(doc.schemas.createSnapshot).not.toHaveBeenCalled();
  });
});
