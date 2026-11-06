import {expect, test, type Page} from '@playwright/test';

test.use({viewport: {width: 2200, height: 1000}});

async function setup(page: Page, empty = false) {
  await page.routeWebSocket('**', socket => socket.close());
  await page.goto('/');
  await page.getByRole('button', {name: '初始化', exact: true}).click();
  await page.waitForFunction(() => (window as any).ng?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized);
  return page.evaluate(async empty => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc;
    doc.crud.updateBlockProps(doc.rootId, {fs: 16, lh: 1.5});
    const props = {fs: 28, pfs: 1.5, lh: 2.5, psb: 6, psa: 8, textDefaults: {
      't:px': 24, 't:fs': 2, 'a:bold': true, 's:color': '#ff0000',
    }};
    const content = empty ? [] : [
      {insert: 'AB', attributes: {'t:px': 24, 't:fs': 2, 'a:bold': true, 's:color': '#ff0000'}},
      {insert: 'CD', attributes: {'s:fontSize': '40px', 'a:italic': true}},
    ];
    const blocks = [doc.schemas.createSnapshot('paragraph', [content, props]), doc.schemas.createSnapshot('paragraph', ['outside', {fs: 22}])];
    doc.crud.insertBlockSnapshots(doc.rootId, 0, blocks);
    await doc.navigateToBlock(blocks[0].id);
    doc.selection.setCursorAt(doc.getBlockById(blocks[0].id), 0);
    doc.crud.undoManager.clearHistory();
    return blocks.map(block => block.id) as string[];
  }, empty);
}

async function state(page: Page, id: string) {
  return page.evaluate(id => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc;
    const block = doc.getBlockById(id);
    return {
      props: doc.model.getProps(id), deltas: doc.model.getTextDeltas(id),
      sizes: Array.from(block.hostElement.querySelectorAll('c-text')).map((el: Element) => getComputedStyle(el).fontSize),
      lineHeight: getComputedStyle(block.hostElement).lineHeight,
    };
  }, id);
}

async function setRange(page: Page, id: string, start: number, end = start) {
  await page.evaluate(({id, start, end}) => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc;
    doc.selection.setSelection({blockId: id, type: 'text', offset: start}, {blockId: id, type: 'text', offset: end});
  }, {id, start, end});
}

async function toolbarHeading(page: Page) {
  await page.locator('bc-fixed-toolbar .toolbar-btn--style').hover();
  await page.locator('.bc-fixed-toolbar-dropdown bc-float-toolbar-item').filter({hasText: '一级标题'}).click();
}

for (const entry of ['toolbar-caret', 'toolbar-range', 'shortcut', 'floating', 'block-menu']) {
  test(`${entry}: heading resets the whole paragraph, keeps other formats, and undoes atomically`, async ({page}) => {
    const [id, outside] = await setup(page);
    await setRange(page, id, 1, entry.endsWith('range') || entry === 'floating' ? 3 : 1);
    const before = await state(page, id);
    const untouched = await state(page, outside);
    if (entry === 'shortcut') await page.keyboard.press('ControlOrMeta+1');
    else if (entry === 'block-menu') {
      await page.locator(`[data-block-id="${id}"]`).hover();
      await expect.poll(() => page.locator('bc-drag-handle').evaluate(element =>
        (window as any).ng.getComponent(element).activeBlock?.id)).toBe(id);
      await page.locator('bc-drag-handle .btn').hover();
      await page.locator('.base-list__item[title^="一级标题"]').click();
    }
    else if (entry === 'floating') {
      const toolbar = page.locator('.float-text-toolbar');
      await expect(toolbar).toBeVisible();
      await toolbar.locator('bc-float-toolbar-item').first().hover();
      await page.locator('bc-float-toolbar-item').filter({hasText: '一级标题'}).click();
    } else await toolbarHeading(page);
    await expect.poll(() => state(page, id)).toMatchObject({
      props: {heading: 1, psb: 6, psa: 8}, sizes: ['32px', '32px'], lineHeight: '48px',
    });
    const after = await state(page, id);
    for (const key of ['fs', 'pfs', 'lh']) expect(after.props[key]).toBeUndefined();
    expect(after.props.textDefaults).toEqual({'a:bold': true, 's:color': '#ff0000'});
    expect(after.deltas).toEqual([
      {insert: 'AB', attributes: {'a:bold': true, 's:color': '#ff0000'}},
      {insert: 'CD', attributes: {'a:italic': true}},
    ]);
    expect(await state(page, outside)).toEqual(untouched);
    await page.evaluate(() => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.crud.undoManager.undo());
    await expect.poll(() => state(page, id)).toEqual(before);
    await page.evaluate(() => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.crud.undoManager.redo());
    await expect.poll(() => state(page, id)).toEqual(after);
    await setRange(page, id, 4);
    await page.keyboard.type('X');
    await expect(page.locator(`[data-block-id="${id}"] c-text`).last()).toHaveCSS('font-size', '32px');
  });
}

test('empty heading clears pending size but preserves pending emphasis and accepts typing', async ({page}) => {
  const [id] = await setup(page, true);
  await page.evaluate(id => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc;
    doc.inputManger.setNextInsertAttrs({'t:px': 50, 't:fs': 2, 'a:italic': true}, {blockId: id, index: 0});
    doc.crud.undoManager.clearHistory();
  }, id);
  await toolbarHeading(page);
  await page.keyboard.type('X');
  await expect.poll(() => state(page, id)).toMatchObject({props: {heading: 1}, deltas: [{insert: 'X', attributes: {'a:italic': true}}], sizes: ['32px']});
});

test('reapplying a heading resets newly added direct sizes; ordinary size editing still works', async ({page}) => {
  const [id] = await setup(page);
  await toolbarHeading(page);
  await setRange(page, id, 0, 4);
  await page.locator('bc-fixed-toolbar .toolbar-btn--font-size').hover();
  await page.locator('bc-float-toolbar-item[name="font-size"]').filter({hasText: /^24$/}).click();
  await expect.poll(async () => (await state(page, id)).sizes).toEqual(['24px', '24px']);
  await toolbarHeading(page);
  await expect.poll(async () => (await state(page, id)).sizes).toEqual(['32px', '32px']);
});

for (const entry of ['markdown', 'slash']) {
  test(`${entry}: an empty heading inherits its semantic size after formatted input`, async ({page}) => {
    const [original] = await setup(page, true);
    await page.keyboard.type(entry === 'markdown' ? '# ' : '/');
    if (entry === 'slash') {
      await expect(page.locator('block-transformer-contextmenu')).toBeVisible();
      await page.keyboard.type('h1');
      await expect(page.locator('block-transformer-contextmenu').getByRole('option')).toHaveCount(1);
      await page.keyboard.press('Enter');
      await page.waitForFunction(original => {
        const point = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.selection.value?.start;
        return point?.type === 'text' && point.blockId !== original && point.offset === 0;
      }, original);
    }
    const id = await page.evaluate(() => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.selection.value.start.blockId as string);
    if (entry === 'markdown') expect(id).toBe(original);
    await expect.poll(async () => (await state(page, id)).props.heading).toBe(1);
    await page.keyboard.type('X');
    await expect.poll(async () => (await state(page, id)).sizes).toEqual(['32px']);
    const result = await state(page, id);
    for (const key of ['fs', 'pfs', 'lh']) expect(result.props[key] ?? null).toBeNull();
    expect(result.deltas[0].attributes?.['t:px']).toBeUndefined();
  });
}
