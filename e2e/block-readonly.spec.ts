import {expect, test, type Page} from '@playwright/test';

const editorSelector = 'block-craft-editor';
const firstParagraphSelector = `${editorSelector} p.paragraph-block`;

async function initialize(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', {name: '初始化', exact: true}).click();
  await expect(page.locator(firstParagraphSelector).first()).toBeVisible();
}

async function exportSnapshot(page: Page): Promise<unknown> {
  return page.evaluate((selector) => {
    const editorElement = document.querySelector(selector);
    const ngDebug = (window as unknown as {
      ng: {getComponent: (element: Element) => {doc: {exportSnapshot: () => unknown}}};
    }).ng;
    if (!editorElement || !ngDebug) throw new Error('Angular editor debug API is unavailable');
    return ngDebug.getComponent(editorElement).doc.exportSnapshot();
  }, editorSelector);
}

async function exportBlockSnapshot(page: Page, blockId: string): Promise<unknown> {
  const snapshot = await exportSnapshot(page) as {
    id: string;
    children?: unknown[];
  };
  const find = (block: any): unknown => {
    if (block?.id === blockId) return block;
    for (const child of block?.children ?? []) {
      const match = find(child);
      if (match) return match;
    }
    return null;
  };
  return find(snapshot);
}

async function setBlockReadonly(page: Page, blockSelector: string, readonly: boolean): Promise<string> {
  return page.evaluate(({editorSelector, blockSelector, readonly}) => {
    const editorElement = document.querySelector(editorSelector);
    const blockElement = document.querySelector<HTMLElement>(blockSelector);
    const ngDebug = (window as unknown as {
      ng: {getComponent: (element: Element) => {
        doc: {setBlockReadonly: (blockId: string, value: boolean) => void};
      }};
    }).ng;
    const blockId = blockElement?.dataset['blockId'];
    if (!editorElement || !blockElement || !blockId || !ngDebug) {
      throw new Error(`Cannot resolve editor block: ${blockSelector}`);
    }
    ngDebug.getComponent(editorElement).doc.setBlockReadonly(blockId, readonly);
    return blockId;
  }, {editorSelector, blockSelector, readonly});
}

async function selectParagraphText(page: Page, paragraphSelector: string): Promise<void> {
  await page.evaluate((selector) => {
    const paragraph = document.querySelector(selector);
    const selection = window.getSelection();
    if (!paragraph || !selection) throw new Error('Paragraph selection target is unavailable');
    const range = document.createRange();
    range.selectNodeContents(paragraph);
    selection.removeAllRanges();
    selection.addRange(range);
  }, paragraphSelector);
  await page.waitForFunction(() => window.getSelection()?.rangeCount === 1);
  await page.evaluate(() => new Promise<void>(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

async function dispatchCompositionStart(
  page: Page,
  paragraphSelector: string,
): Promise<{defaultPrevented: boolean; rangeCount: number}> {
  return page.evaluate((selector) => {
    const paragraph = document.querySelector(selector);
    if (!paragraph) throw new Error('Composition target is unavailable');
    const event = new CompositionEvent('compositionstart', {
      bubbles: true,
      cancelable: true,
      data: '',
    });
    paragraph.dispatchEvent(event);
    const result = {
      defaultPrevented: event.defaultPrevented,
      rangeCount: window.getSelection()?.rangeCount ?? 0,
    };
    paragraph.dispatchEvent(new CompositionEvent('compositionend', {
      bubbles: true,
      cancelable: true,
      data: 'blocked',
    }));
    return result;
  }, paragraphSelector);
}

async function dispatchClipboard(page: Page, paragraphSelector: string, type: 'copy' | 'paste', text = ''): Promise<string> {
  return page.evaluate(({selector, type, text}) => {
    const paragraph = document.querySelector(selector);
    if (!paragraph) throw new Error('Clipboard target is unavailable');
    const clipboardData = new DataTransfer();
    if (text) clipboardData.setData('text/plain', text);
    paragraph.dispatchEvent(new ClipboardEvent(type, {
      bubbles: true,
      cancelable: true,
      clipboardData,
    }));
    return clipboardData.getData('text/plain');
  }, {selector: paragraphSelector, type, text});
}

test('block readonly protects writes while retaining read interactions and inheritance', async ({page}) => {
  await initialize(page);

  const paragraph = page.locator(firstParagraphSelector).first();
  const paragraphSelector = `${firstParagraphSelector}:first-of-type`;
  const paragraphId = await setBlockReadonly(page, paragraphSelector, true);
  await expect(paragraph).toHaveAttribute('data-bc-readonly', 'self');
  await expect(paragraph).toHaveAttribute('contenteditable', 'false');

  const lockedSnapshot = await exportBlockSnapshot(page, paragraphId);
  await selectParagraphText(page, paragraphSelector);
  expect(await dispatchCompositionStart(page, paragraphSelector)).toEqual({
    defaultPrevented: true,
    rangeCount: 0,
  });
  await selectParagraphText(page, paragraphSelector);
  await page.keyboard.type('blocked');
  await page.keyboard.press('Backspace');
  await dispatchClipboard(page, paragraphSelector, 'paste', 'blocked paste');
  expect(await exportBlockSnapshot(page, paragraphId)).toEqual(lockedSnapshot);

  await selectParagraphText(page, paragraphSelector);
  const copied = await dispatchClipboard(page, paragraphSelector, 'copy');
  expect(copied.length).toBeGreaterThan(0);

  await setBlockReadonly(page, paragraphSelector, false);
  await expect(paragraph).not.toHaveAttribute('data-bc-readonly');
  await paragraph.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' unlocked');
  expect(await exportBlockSnapshot(page, paragraphId)).not.toEqual(lockedSnapshot);

  const calloutSelector = `${editorSelector} div.callout-block`;
  const calloutChildSelector = `${calloutSelector} p.paragraph-block`;
  await setBlockReadonly(page, calloutSelector, true);
  await expect(page.locator(calloutSelector)).toHaveAttribute('data-bc-readonly', 'self');
  await expect(page.locator(calloutChildSelector).first()).toHaveAttribute('data-bc-readonly', 'inherited');

  const tableSelector = `${editorSelector} div.table-block`;
  await setBlockReadonly(page, tableSelector, true);
  await page.locator(`${tableSelector} td.table-cell-block`).first().hover();
  await expect(page.locator(`${tableSelector} .table-col-resize-bar`)).toBeHidden();
  await expect(page.locator(`${tableSelector} table-col-bar`)).toBeHidden();
  await expect(page.locator(`${tableSelector} table-row-bar`)).toBeHidden();
});

test('typing over selected blocks and undo never re-check removed block ids', async ({page}) => {
  const blockErrors: string[] = [];
  page.on('pageerror', error => {
    if (/Block not found|BlockCraftError/i.test(error.message)) blockErrors.push(error.message);
  });
  page.on('console', message => {
    if (/Block not found|BlockCraftError/i.test(message.text())) blockErrors.push(message.text());
  });

  await initialize(page);

  const selected = await page.evaluate((selector) => {
    const editorElement = document.querySelector(selector);
    const ngDebug = (window as unknown as {
      ng: {getComponent: (element: Element) => {doc: any}};
    }).ng;
    if (!editorElement || !ngDebug) throw new Error('Angular editor debug API is unavailable');

    const doc = ngDebug.getComponent(editorElement).doc;
    const rootId = doc.root.id as string;
    const blockIds = (doc.model.getChildrenIds(rootId) as string[]).slice(1, 4);
    const selectionJSON = {
      anchor: {blockId: blockIds[0], type: 'selected'},
      head: {blockId: blockIds[2], type: 'selected'},
      commonParent: rootId,
    };
    const selection = doc.selection.createSelection(selectionJSON);
    if (!selection) throw new Error('Cannot create selected-block range');
    doc.selection._commitSelection(selection);
    return {blockIds, selectionJSON};
  }, editorSelector);
  const before = await Promise.all(selected.blockIds.map(id => exportBlockSnapshot(page, id)));

  await page.keyboard.type('替');
  await page.keyboard.press('ControlOrMeta+z');

  await expect.poll(
    () => Promise.all(selected.blockIds.map(id => exportBlockSnapshot(page, id))),
  ).toEqual(before);
  const restoredSelection = await page.evaluate((selector) => {
    const editorElement = document.querySelector(selector);
    const ngDebug = (window as unknown as {
      ng: {getComponent: (element: Element) => {doc: any}};
    }).ng;
    return ngDebug.getComponent(editorElement!).doc.selection.value?.toJSON() ?? null;
  }, editorSelector);
  expect(restoredSelection?.anchor).toEqual(selected.selectionJSON.anchor);
  expect(restoredSelection?.head).toEqual(selected.selectionJSON.head);
  expect(blockErrors).toEqual([]);
});

test('typing over a selected attachment closes its toolbar without stale readonly queries', async ({page}) => {
  const blockErrors: string[] = [];
  page.on('pageerror', error => {
    if (/Block not found|BlockCraftError/i.test(error.message)) blockErrors.push(error.message);
  });
  page.on('console', message => {
    if (/Block not found|BlockCraftError/i.test(message.text())) blockErrors.push(message.text());
  });

  await initialize(page);
  const attachment = page.locator(`${editorSelector} div.attachment-block`);
  await attachment.evaluate((element, selector) => {
    const editorElement = document.querySelector(selector);
    const ngDebug = (window as unknown as {
      ng: {getComponent: (element: Element) => {doc: any}};
    }).ng;
    if (!editorElement || !ngDebug) throw new Error('Angular editor debug API is unavailable');
    const doc = ngDebug.getComponent(editorElement).doc;
    const blockId = (element as HTMLElement).dataset['blockId'];
    if (!blockId) throw new Error('Attachment block id is unavailable');
    doc.selection.selectBlock(doc.getBlockById(blockId));
  }, editorSelector);
  await expect(page.locator('div.attachment-toolbar')).toBeVisible();

  await page.keyboard.type('替');

  await expect(attachment).toHaveCount(0);
  await page.evaluate(() => Promise.resolve());
  expect(blockErrors).toEqual([]);
});

test('block controller moves smoothly between protected complex blocks without a ghost handle', async ({page}) => {
  await initialize(page);

  const codeSelector = `${editorSelector} div.code-block`;
  const mermaidSelector = `${editorSelector} div.mermaid-block`;
  const handle = page.locator(`${editorSelector} bc-drag-handle`);
  await expect(handle).toBeHidden();

  await setBlockReadonly(page, codeSelector, true);
  await setBlockReadonly(page, mermaidSelector, true);

  await page.locator(codeSelector).first().dispatchEvent('mouseover');
  await expect(handle).toBeVisible();
  await expect(handle).toHaveCount(1);
  const codePosition = await handle.evaluate(element => {
    const host = element as HTMLElement;
    return `${host.style.left}:${host.style.top}`;
  });

  await page.locator(mermaidSelector).dispatchEvent('mouseover');
  await expect(handle).toHaveCount(1);
  await expect.poll(
    () => handle.evaluate(element => {
      const host = element as HTMLElement;
      return `${host.style.left}:${host.style.top}`;
    }),
  ).not.toBe(codePosition);

  const motion = await handle.evaluate(element => {
    const style = getComputedStyle(element);
    return {
      properties: style.transitionProperty.split(',').map(value => value.trim()).sort(),
      durations: style.transitionDuration.split(',').map(value => value.trim()),
      transform: style.transform,
    };
  });
  expect(motion.properties).toEqual(['left', 'top']);
  expect(motion.durations.every(duration => duration !== '0s')).toBeTruthy();
  expect(motion.transform).toBe('none');
});
