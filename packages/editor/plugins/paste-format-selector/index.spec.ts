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
});
