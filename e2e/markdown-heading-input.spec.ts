import {expect, test, type Page} from '@playwright/test';

async function initializeParagraph(page: Page, text = '') {
  await page.routeWebSocket('**', socket => socket.close());
  await page.goto('/');
  await page.getByRole('button', {name: '初始化', exact: true}).click();
  await page.waitForFunction(() =>
    (window as any).ng?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized);
  const id = await page.locator('block-craft-editor').evaluate(async (editor, text) => {
    const doc = (window as any).ng.getComponent(editor).doc;
    const paragraph = doc.schemas.createSnapshot('paragraph', [text]);
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [paragraph]);
    await doc.navigateToBlock(paragraph.id);
    doc.selection.setCursorAt(doc.getBlockById(paragraph.id), 0);
    doc.crud.undoManager.clearHistory();
    return paragraph.id as string;
  }, text);
  await expect.poll(() => readState(page, id)).toMatchObject({offset: 0, nativeBlockId: id});
  return id;
}

async function readState(page: Page, id: string) {
  return page.locator('block-craft-editor').evaluate((editor, id) => {
    const doc = (window as any).ng.getComponent(editor).doc;
    const selection = doc.selection.value;
    const native = document.getSelection();
    const node = native?.focusNode;
    const element = node instanceof Element ? node : node?.parentElement;
    return {
      text: doc.getBlockById(id).textContent(),
      heading: doc.model.getProps(id).heading ?? null,
      offset: selection?.start.offset ?? null,
      blockId: selection?.start.blockId ?? null,
      nativeBlockId: element?.closest('[data-block-id]')?.getAttribute('data-block-id') ?? null,
      focused: doc.root.hostElement.contains(document.activeElement),
    };
  }, id);
}

async function compose(page: Page, id: string, text: string) {
  // Exercise the framework's real composition event routing. This does not
  // automate the operating system's IME candidate window.
  const phase = await page.locator('block-craft-editor').evaluate((editor, id) => {
    const doc = (window as any).ng.getComponent(editor).doc;
    doc.getBlockById(id).containerElement.dispatchEvent(new CompositionEvent('compositionstart', {
      bubbles: true, cancelable: true,
    }));
    return doc.inputManger.compositionSession.phase;
  }, id);
  expect(phase).toBe('active');
  await page.locator('block-craft-editor').evaluate((editor, {id, text}) => {
    const doc = (window as any).ng.getComponent(editor).doc;
    doc.getBlockById(id).containerElement.dispatchEvent(new CompositionEvent('compositionend', {
      bubbles: true, cancelable: true, data: text,
    }));
  }, {id, text});
}

async function history(page: Page, action: 'stopCapturing' | 'undo' | 'redo') {
  await page.locator('block-craft-editor').evaluate((editor, action) => {
    (window as any).ng.getComponent(editor).doc.crud.undoManager[action]();
  }, action);
}

test('Markdown heading keeps editing after the first letter', async ({page}) => {
  const id = await initializeParagraph(page);
  await page.keyboard.type('# ');
  await expect.poll(() => readState(page, id)).toMatchObject({text: '', heading: 1, offset: 0});
  // Typing must also work after the temporary selection suppression expires.
  await page.waitForTimeout(500);
  await page.keyboard.type('abc');
  await expect.poll(() => readState(page, id)).toMatchObject({
    text: 'abc', heading: 1, blockId: id, offset: 3, nativeBlockId: id, focused: true,
  });
});

for (const level of [1, 2, 3, 4]) {
  test(`Markdown H${level} accepts IME, Latin input and body continuation`, async ({page}) => {
    const id = await initializeParagraph(page);
    await page.keyboard.type(`${'#'.repeat(level)} `);
    await expect.poll(() => readState(page, id)).toMatchObject({
      text: '', heading: level, offset: 0, blockId: id, nativeBlockId: id,
    });
    await expect(page.locator(`[data-block-id="${id}"]`)).toHaveAttribute('data-heading', String(level));
    await compose(page, id, '标题');
    await expect.poll(() => readState(page, id)).toMatchObject({
      text: '标题', heading: level, offset: 2, blockId: id, nativeBlockId: id, focused: true,
    });
    await page.keyboard.type('abc');
    await expect.poll(() => readState(page, id)).toMatchObject({text: '标题abc', offset: 5});
    await page.keyboard.press('Enter');
    const nextId = await page.locator('block-craft-editor').evaluate(editor =>
      (window as any).ng.getComponent(editor).doc.selection.value.start.blockId);
    expect(nextId).not.toBe(id);
    await page.keyboard.type('body');
    await expect.poll(() => readState(page, nextId)).toMatchObject({text: 'body', offset: 4});
    await expect(page.locator(`[data-block-id="${nextId}"]`)).not.toHaveAttribute('data-heading');
  });
}

test('heading conversion preserves following text and inserts IME at its start', async ({page}) => {
  const id = await initializeParagraph(page, '原有正文');
  await page.keyboard.type('## ');
  await expect.poll(() => readState(page, id)).toMatchObject({text: '原有正文', heading: 2, offset: 0});
  await compose(page, id, '新增');
  await expect.poll(() => readState(page, id)).toMatchObject({text: '新增原有正文', offset: 2});
  await expect(page.locator(`[data-block-id="${id}"] c-text`)).toHaveText('新增原有正文');
});

test('undo and redo restore an empty heading that still accepts IME', async ({page}) => {
  const id = await initializeParagraph(page);
  await page.keyboard.type('# ');
  await expect.poll(() => readState(page, id)).toMatchObject({text: '', heading: 1, offset: 0});
  await history(page, 'stopCapturing');
  await compose(page, id, '标题');
  await expect.poll(() => readState(page, id)).toMatchObject({text: '标题', offset: 2});
  await history(page, 'undo');
  await expect.poll(() => readState(page, id)).toMatchObject({text: '', heading: 1, offset: 0});
  await history(page, 'redo');
  await expect.poll(() => readState(page, id)).toMatchObject({text: '标题', heading: 1, offset: 2});
  await history(page, 'undo');
  await expect.poll(() => readState(page, id)).toMatchObject({text: '', heading: 1, offset: 0});
  await history(page, 'undo');
  await expect(page.locator(`[data-block-id="${id}"]`)).not.toHaveAttribute('data-heading');
  await history(page, 'redo');
  await expect.poll(() => readState(page, id)).toMatchObject({text: '', heading: 1, offset: 0});
  await compose(page, id, '重写');
  await expect.poll(() => readState(page, id)).toMatchObject({text: '重写', heading: 1, offset: 2});
});

const blockConversions = [
  {prefix: '- ', flavour: 'bullet', caretFlavour: 'bullet'},
  {prefix: '+ ', flavour: 'bullet', caretFlavour: 'bullet'},
  {prefix: '1. ', flavour: 'ordered', caretFlavour: 'ordered'},
  {prefix: 'a. ', flavour: 'ordered', caretFlavour: 'ordered'},
  {prefix: '[] ', flavour: 'todo', caretFlavour: 'todo'},
  {prefix: '> ', flavour: 'blockquote', caretFlavour: 'blockquote'},
  {prefix: '! ', flavour: 'callout', caretFlavour: 'paragraph'},
  {prefix: '--- ', flavour: 'divider', caretFlavour: 'paragraph'},
  {prefix: '``` ', flavour: 'code', caretFlavour: 'code'},
];

async function replacementCaret(page: Page, oldId: string) {
  await page.waitForFunction(oldId => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc;
    const point = doc.selection.value?.start;
    return point?.type === 'text' && point.blockId !== oldId && point.offset === 0;
  }, oldId);
  return page.locator('block-craft-editor').evaluate(editor =>
    (window as any).ng.getComponent(editor).doc.selection.value.start.blockId as string);
}

for (const {prefix, flavour, caretFlavour} of blockConversions) {
  test(`Markdown ${JSON.stringify(prefix)} conversion still accepts IME`, async ({page}) => {
    const oldId = await initializeParagraph(page);
    await page.keyboard.type(prefix);
    const id = await replacementCaret(page, oldId);
    await expect(page.locator(`[data-block-id="${id}"]`)).toHaveClass(new RegExp(`${caretFlavour}-block`));
    if (flavour === 'callout' || flavour === 'divider') {
      const actualFlavour = await page.locator('block-craft-editor').evaluate((editor, {id, flavour}) => {
        const doc = (window as any).ng.getComponent(editor).doc;
        const parentId = doc.model.getParentId(id);
        if (flavour === 'callout') return doc.model.getFlavour(parentId);
        const siblings = doc.model.getChildrenIds(parentId);
        return doc.model.getFlavour(siblings[siblings.indexOf(id) - 1]);
      }, {id, flavour});
      expect(actualFlavour).toBe(flavour);
    }
    await compose(page, id, '内容');
    await expect.poll(() => readState(page, id)).toMatchObject({text: '内容', offset: 2, nativeBlockId: id});
    await page.keyboard.type('abc');
    await expect.poll(() => readState(page, id)).toMatchObject({text: '内容abc', offset: 5, nativeBlockId: id});
  });
}

for (const {query, flavour, heading} of [
  {query: 'h1', flavour: 'paragraph', heading: 1},
  {query: 'h4', flavour: 'paragraph', heading: 4},
  {query: 'wxlb', flavour: 'bullet', heading: null},
  {query: 'db', flavour: 'todo', heading: null},
  {query: 'yy', flavour: 'blockquote', heading: null},
  {query: 'dm', flavour: 'code', heading: null},
]) {
  test(`slash /${query} conversion accepts IME`, async ({page}) => {
    const oldId = await initializeParagraph(page);
    await page.keyboard.type('/');
    const menu = page.locator('block-transformer-contextmenu');
    await expect(menu).toBeVisible();
    await page.keyboard.type(query);
    if (query === 'dm') {
      // /dm 也匹配 /dmht（代码绘图）；确认当前将执行代码块。
      await expect(menu.getByRole('option', {name: /^代码块 /})).toHaveAttribute('aria-selected', 'true');
    } else {
      await expect(menu.getByRole('option')).toHaveCount(1);
    }
    await page.keyboard.press('Enter');
    await expect(menu).toHaveCount(0);
    const id = await replacementCaret(page, oldId);
    await expect(page.locator(`[data-block-id="${id}"]`)).toHaveClass(new RegExp(`${flavour}-block`));
    if (heading) await expect.poll(() => readState(page, id)).toMatchObject({heading});
    await compose(page, id, '输入');
    await expect.poll(() => readState(page, id)).toMatchObject({text: '输入', offset: 2, nativeBlockId: id});
  });
}

test('heading hotkeys preserve an existing caret for IME', async ({page}) => {
  const id = await initializeParagraph(page, '原文');
  for (const level of [1, 2, 3, 4, 0]) {
    await page.keyboard.press(`ControlOrMeta+${level}`);
    await expect.poll(() => readState(page, id)).toMatchObject({
      heading: level || null, offset: 0, text: '原文',
    });
  }
  await compose(page, id, '新增');
  await expect.poll(() => readState(page, id)).toMatchObject({text: '新增原文', offset: 2});
});
