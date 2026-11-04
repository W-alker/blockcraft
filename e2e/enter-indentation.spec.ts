import {expect, test, type Page} from '@playwright/test';

const editorSelector = 'block-craft-editor';

test.beforeEach(async ({page}) => {
  await page.routeWebSocket('**', socket => socket.close());
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return ['http:', 'https:'].includes(url.protocol) && !['127.0.0.1', 'localhost'].includes(url.hostname)
      ? route.abort() : route.continue();
  });
  await page.goto('/');
  await page.getByRole('button', {name: '初始化', exact: true}).click();
  await page.waitForFunction(() =>
    (window as any).ng?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized);
});

async function readCaret(page: Page) {
  return page.locator(editorSelector).evaluate(editor => {
    const doc = (window as any).ng.getComponent(editor).doc;
    const point = doc.selection.value?.start;
    const block = point && doc.getBlockById(point.blockId);
    const node = document.getSelection()?.anchorNode;
    const nativeHost = (node instanceof Element ? node : node?.parentElement)?.closest('[data-block-id]');
    return block ? {
      id: block.id,
      flavour: block.flavour,
      depth: block.props.depth ?? 0,
      margin: Number.parseFloat(getComputedStyle(block.hostElement).marginLeft),
      type: point.type,
      offset: point.offset,
      nativeId: nativeHost?.getAttribute('data-block-id'),
    } : null;
  });
}

for (const flavour of ['image', 'callout', 'divider', 'formula', 'mermaid', 'table']) {
  test(`${flavour}: Enter at either gap inherits indentation and survives undo/redo`, async ({page}) => {
    for (const side of ['before', 'after'] as const) {
      const id = await page.locator(editorSelector).evaluate(async (editor, {flavour, side}) => {
        const doc = (window as any).ng.getComponent(editor).doc;
        let params: any[] = [];
        if (flavour === 'image') {
          const canvas = document.createElement('canvas');
          canvas.width = 240;
          canvas.height = 120;
          params = [{src: canvas.toDataURL(), wr: 25, ar: 2}];
        } else if (flavour === 'formula') params = ['x^2'];
        else if (flavour === 'mermaid') params = ['graph', 'mindmap\n  root((Root))\n    A\n    B'];
        else if (flavour === 'table') params = [1, 1];
        const snapshot = doc.schemas.createSnapshot(flavour, params);
        snapshot.props.depth = 2;
        doc.crud.insertBlockSnapshots(doc.rootId, 0, [snapshot]);
        await doc.navigateToBlock(snapshot.id);
        doc.selection.setGapCursor(snapshot.id, side);
        doc.crud.undoManager.clearHistory();
        return snapshot.id as string;
      }, {flavour, side});

      await page.keyboard.press('Enter');
      await expect.poll(() => readCaret(page)).toMatchObject({
        flavour: 'paragraph', depth: 2, margin: 64, type: 'text', offset: 0,
      });
      const paragraphId = (await readCaret(page))!.id;
      await expect.poll(() => readCaret(page)).toMatchObject({nativeId: paragraphId});
      await expect.poll(() => page.locator(editorSelector).evaluate((editor, {id, side}) => {
        const doc = (window as any).ng.getComponent(editor).doc;
        const siblingId = side === 'after' ? doc.model.getNextSiblingId(id) : doc.model.getPreviousSiblingId(id);
        return {siblingId, sourceDepth: doc.model.getProps(id).depth};
      }, {id, side})).toEqual({siblingId: paragraphId, sourceDepth: 2});

      await page.locator(editorSelector).evaluate(editor =>
        (window as any).ng.getComponent(editor).doc.crud.undoManager.undo());
      await expect.poll(() => page.locator(editorSelector).evaluate((editor, {id, paragraphId}) => {
        const doc = (window as any).ng.getComponent(editor).doc;
        return {source: doc.model.exists(id), paragraph: doc.model.exists(paragraphId)};
      }, {id, paragraphId})).toEqual({source: true, paragraph: false});
      await expect.poll(() => readCaret(page)).toMatchObject({id, type: 'gap', depth: 2});

      await page.locator(editorSelector).evaluate(editor =>
        (window as any).ng.getComponent(editor).doc.crud.undoManager.redo());
      await expect.poll(() => readCaret(page)).toMatchObject({
        id: paragraphId, flavour: 'paragraph', depth: 2, margin: 64, nativeId: paragraphId,
      });
    }
  });
}

test('empty blockquote exits to a body paragraph at the same indentation', async ({page}) => {
  const id = await page.locator(editorSelector).evaluate(async editor => {
    const doc = (window as any).ng.getComponent(editor).doc;
    const snapshot = doc.schemas.createSnapshot('blockquote', [[], {depth: 2}]);
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [snapshot]);
    await doc.navigateToBlock(snapshot.id);
    doc.selection.setCursorAt(doc.getBlockById(snapshot.id), 0);
    doc.crud.undoManager.clearHistory();
    return snapshot.id as string;
  });
  await page.keyboard.press('Enter');
  await expect.poll(() => readCaret(page)).toMatchObject({
    flavour: 'paragraph', depth: 2, margin: 64, type: 'text', offset: 0,
  });
  const paragraphId = (await readCaret(page))!.id;
  await page.locator(editorSelector).evaluate(editor =>
    (window as any).ng.getComponent(editor).doc.crud.undoManager.undo());
  await expect.poll(() => readCaret(page)).toMatchObject({id, flavour: 'blockquote', depth: 2, margin: 64, nativeId: id});
  await page.locator(editorSelector).evaluate(editor =>
    (window as any).ng.getComponent(editor).doc.crud.undoManager.redo());
  await expect.poll(() => readCaret(page)).toMatchObject({
    id: paragraphId, flavour: 'paragraph', depth: 2, margin: 64, nativeId: paragraphId,
  });
});

for (const flavour of ['paragraph', 'ordered', 'bullet', 'blockquote']) {
  test(`${flavour}: empty paragraph keeps the existing outdent rule when continuing its style`, async ({page}) => {
    const id = await page.locator(editorSelector).evaluate(async (editor, flavour) => {
      const doc = (window as any).ng.getComponent(editor).doc;
      const snapshot = doc.schemas.createSnapshot(flavour, [[], {depth: 2, nextParagraphStyle: 'same'}]);
      doc.crud.insertBlockSnapshots(doc.rootId, 0, [snapshot]);
      await doc.navigateToBlock(snapshot.id);
      doc.selection.setCursorAt(doc.getBlockById(snapshot.id), 0);
      return snapshot.id as string;
    }, flavour);
    await page.keyboard.press('Enter');
    await expect.poll(() => readCaret(page)).toMatchObject({id, flavour, depth: 1, margin: 32});
  });
}
