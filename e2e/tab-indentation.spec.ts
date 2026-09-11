import {expect, test, type Page} from '@playwright/test';

const editorSelector = 'block-craft-editor';

test.beforeEach(async ({page}) => {
  await page.goto('/');
  await page.getByRole('button', {name: '初始化', exact: true}).click();
  await expect(page.locator(`${editorSelector} .ordered-block`).first()).toBeVisible();
});

async function readBlock(page: Page, id: string) {
  return page.locator(editorSelector).evaluate((editor, blockId) => {
    const doc = (window as any).ng.getComponent(editor).doc;
    const block = doc.getBlockById(blockId);
    return {
      depth: doc.model.getProps(blockId).depth,
      margin: Number.parseFloat(getComputedStyle(block.hostElement).marginLeft),
      flavour: block.flavour,
    };
  }, id);
}

for (const flavour of ['paragraph', 'ordered', 'bullet']) {
  test(`${flavour}: initial indentation survives Enter and changes one level per Tab`, async ({page}) => {
    const id = await page.locator(editorSelector).evaluate(async (editor, blockFlavour) => {
      const doc = (window as any).ng.getComponent(editor).doc;
      const snapshot = doc.schemas.createSnapshot(blockFlavour, ['indentation', {depth: 1}]);
      doc.crud.insertBlockSnapshots(doc.rootId, 0, [snapshot]);
      await doc.navigateToBlock(snapshot.id);
      doc.selection.setCursorAt(doc.getBlockById(snapshot.id), 'indentation'.length);
      return snapshot.id;
    }, flavour);

    // A freshly mounted block must render its persisted depth immediately.
    await expect.poll(() => readBlock(page, id)).toEqual({depth: 1, margin: 32, flavour});
    await page.keyboard.press('Enter');
    const nextId = await page.locator(editorSelector).evaluate((editor, blockId) => {
      const doc = (window as any).ng.getComponent(editor).doc;
      return doc.model.getNextSiblingId(blockId) as string;
    }, id);
    await expect.poll(() => readBlock(page, nextId)).toEqual({depth: 1, margin: 32, flavour});
    await page.keyboard.type('next');
    await page.keyboard.press('Tab');
    await expect.poll(() => readBlock(page, nextId)).toEqual({depth: 2, margin: 64, flavour});
    await page.keyboard.press('Shift+Tab');
    await expect.poll(() => readBlock(page, nextId)).toEqual({depth: 1, margin: 32, flavour});
    await page.keyboard.press('Shift+Tab');
    await expect.poll(() => readBlock(page, nextId)).toEqual({depth: 0, margin: 0, flavour});
  });
}

test('absolute placement clears every margin and restores flow indentation', async ({page}) => {
  const id = await page.locator(editorSelector).evaluate(async editor => {
    const doc = (window as any).ng.getComponent(editor).doc;
    const snapshot = doc.schemas.createSnapshot('shape', ['rectangle']);
    snapshot.props.depth = 1;
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [snapshot]);
    await doc.navigateToBlock(snapshot.id);
    return snapshot.id;
  });
  await expect.poll(() => readBlock(page, id)).toEqual({depth: 1, margin: 32, flavour: 'shape'});
  await page.locator(editorSelector).evaluate((editor, blockId) => {
    const doc = (window as any).ng.getComponent(editor).doc;
    doc.placement.setMode(doc.getBlockById(blockId), 'absolute');
  }, id);
  await expect.poll(() => page.locator(`[data-block-id="${id}"]`).evaluate(element => {
    const style = getComputedStyle(element);
    return [style.marginTop, style.marginRight, style.marginBottom, style.marginLeft];
  })).toEqual(['0px', '0px', '0px', '0px']);
  await page.locator(editorSelector).evaluate((editor, blockId) => {
    const doc = (window as any).ng.getComponent(editor).doc;
    doc.placement.setMode(doc.getBlockById(blockId), 'relative');
  }, id);
  await expect.poll(() => readBlock(page, id)).toEqual({depth: 1, margin: 32, flavour: 'shape'});
});

test('paragraph spacing remains independent of absolute object margin resets', async ({page}) => {
  const id = await page.locator(editorSelector).evaluate(async editor => {
    const doc = (window as any).ng.getComponent(editor).doc;
    const paragraph = doc.schemas.createSnapshot('paragraph', ['spacing', {depth: 1}]);
    Object.assign(paragraph.props, {psb: 6, psa: 12});
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [paragraph]);
    doc.placement.insertAbsoluteSnapshot(doc.schemas.createSnapshot('shape', ['rectangle']));
    await doc.navigateToBlock(paragraph.id);
    return paragraph.id;
  });
  await expect.poll(() => page.locator(`[data-block-id="${id}"]`).evaluate(element => {
    const style = getComputedStyle(element);
    return {
      indent: Number.parseFloat(style.marginLeft),
      before: Number.parseFloat(style.paddingBlockStart),
      after: Number.parseFloat(style.marginBottom),
    };
  })).toEqual({indent: 32, before: 8, after: 16});
});
