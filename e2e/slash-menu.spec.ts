import {expect, test, type Page} from "@playwright/test";

const editorSelector = "block-craft-editor";

async function initialize(page: Page) {
  await page.goto("/");
  await page.getByRole("button", {name: "初始化", exact: true}).click();
  await page.waitForFunction((selector) => {
    const editor = document.querySelector(selector);
    const debug = (window as unknown as {
      ng?: {getComponent: (target: Element) => {doc?: {isInitialized?: boolean}}};
    }).ng;
    return !!editor && debug?.getComponent(editor)?.doc?.isInitialized === true;
  }, editorSelector);
}

async function createEmptyParagraphWithCaret(page: Page) {
  return page.evaluate(async (selector) => {
    const editor = document.querySelector(selector)!;
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}};
    }).ng;
    const doc = debug.getComponent(editor).doc;
    const snapshot = doc.schemas.createSnapshot("paragraph", [[]]);
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [snapshot]);
    await new Promise<void>(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    const block = doc.getBlockById(snapshot.id);
    doc.selection.setCursorAt(block, 0);
    return snapshot.id as string;
  }, editorSelector);
}

async function editorSelectionSnapshot(page: Page) {
  return page.evaluate(() => {
    const selection = document.getSelection();
    const focusNode = selection?.focusNode ?? null;
    const element = focusNode instanceof Element
      ? focusNode
      : focusNode?.parentElement ?? null;
    return {
      blockId: element?.closest<HTMLElement>("[data-block-id]")?.dataset["blockId"] ?? null,
      focusOffset: selection?.focusOffset ?? -1,
      activeTag: document.activeElement?.tagName ?? null,
    };
  });
}

async function expectParagraphText(page: Page, blockId: string, expected: string) {
  await expect.poll(() => page.evaluate(({selector, id}) => {
    const doc = (window as any).ng.getComponent(document.querySelector(selector)).doc;
    return {
      model: doc.getBlockById(id).yText.toString(),
      // WebKit projects a zero-width placeholder beside the native caret.
      dom: document.querySelector(`[data-block-id="${id}"]`)?.textContent?.replace(/[\u200B\u200C\uFEFF]/g, ''),
    };
  }, {selector: editorSelector, id: blockId})).toEqual({model: expected, dom: expected});
}

for (const prefix of ['正文', 'https://example.com']) {
  test(`slash trigger stays closed immediately after non-space text (${prefix})`, async ({page}) => {
    await initialize(page);
    const blockId = await createEmptyParagraphWithCaret(page);
    await page.keyboard.insertText(prefix);
    await page.keyboard.type('/path');
    await expectParagraphText(page, blockId, prefix + '/path');
    await page.evaluate(() => new Promise<void>(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    ));
    await expect(page.locator('block-transformer-contextmenu')).toHaveCount(0);
  });
}

for (const [name, space] of [['ASCII', ' '], ['NBSP', '\u00a0'], ['full-width', '\u3000']] as const) {
  test(`slash trigger opens inline commands after ${name} space`, async ({page}) => {
    await initialize(page);
    const blockId = await createEmptyParagraphWithCaret(page);
    await page.keyboard.insertText('正文' + space);
    await page.keyboard.type('/');
    const menu = page.locator('block-transformer-contextmenu');
    await expect(menu.getByRole('option', {name: /^日期/})).toBeVisible();
    await expect(menu.getByRole('option', {name: /^emoji/i})).toBeVisible();
    await expect(menu.getByRole('option', {name: /高亮块|一级标题/})).toHaveCount(0);
    await expectParagraphText(page, blockId, '正文' + space + '/');
  });
}

test('slash query stays open while backspacing and closes only when the slash is deleted', async ({page}) => {
  await initialize(page);
  const blockId = await createEmptyParagraphWithCaret(page);
  await page.keyboard.type('/');
  const menu = page.locator('block-transformer-contextmenu');
  await expect(menu).toBeVisible();
  const initialCount = await menu.getByRole('option').count();
  await page.keyboard.type('gl');
  await expect(menu.getByRole('option')).toHaveCount(1);

  await page.keyboard.press('Backspace');
  await expect.poll(() => menu.getByRole('option').count()).toBeGreaterThan(1);
  await expect(menu).toBeVisible();
  await page.keyboard.press('Backspace');
  await expect(menu.getByRole('option')).toHaveCount(initialCount);
  await expectParagraphText(page, blockId, '/');
  await page.keyboard.press('Backspace');
  await expect(menu).toHaveCount(0);
  expect((await editorSelectionSnapshot(page)).blockId).toBe(blockId);
});

test('slash query can delete a character before the caret and recover matching commands', async ({page}) => {
  await initialize(page);
  const blockId = await createEmptyParagraphWithCaret(page);
  await page.keyboard.type('/');
  const menu = page.locator('block-transformer-contextmenu');
  await expect(menu).toBeVisible();
  await page.keyboard.type('gxl');
  await expect(menu.getByRole('option')).toHaveCount(0);
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Backspace');
  await expect(menu.getByRole('option', {name: /高亮块/})).toBeVisible();
  await expect(menu.getByRole('option')).toHaveCount(1);
  await expectParagraphText(page, blockId, '/gl');
  expect((await editorSelectionSnapshot(page)).blockId).toBe(blockId);
});

for (const character of ['x', '𠮷']) {
  test(`slash query closes after seven Unicode characters (${character}) and releases editor keys`, async ({page}) => {
    await initialize(page);
    const blockId = await createEmptyParagraphWithCaret(page);
    await page.keyboard.type('/');
    const menu = page.locator('block-transformer-contextmenu');
    await expect(menu).toBeVisible();
    await page.keyboard.insertText(character.repeat(7));
    await expect(menu.getByRole('option')).toHaveCount(0);
    await expect(menu).toBeVisible();
    await page.keyboard.insertText(character);
    await expect(menu).toHaveCount(0);
    await expectParagraphText(page, blockId, '/' + character.repeat(8));
    await page.keyboard.press('Backspace');
    await expectParagraphText(page, blockId, '/' + character.repeat(7));
    await expect(menu).toHaveCount(0);
    await page.keyboard.type('stilltyping');
    await expectParagraphText(page, blockId, '/' + character.repeat(7) + 'stilltyping');
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await editorSelectionSnapshot(page)).blockId).not.toBe(blockId);
  });
}

test('slash query waits for native IME commit before applying the seven-character limit', async ({page, context, browserName}) => {
  test.skip(browserName !== 'chromium', 'Chromium native composition protocol');
  await initialize(page);
  const blockId = await createEmptyParagraphWithCaret(page);
  await page.keyboard.type('/');
  const menu = page.locator('block-transformer-contextmenu');
  await expect(menu).toBeVisible();
  const cdp = await context.newCDPSession(page);
  try {
    for (const [draft, committed, withinLimit] of [
      ['riqiriqi', '日期', true],
      ['putongzhengwen', '这是普通正文', false],
    ] as const) {
      await cdp.send('Input.imeSetComposition', {text: draft, selectionStart: draft.length, selectionEnd: draft.length});
      await expect.poll(() => page.evaluate(() => {
        const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc;
        return doc.inputManger.compositionSession.phase;
      })).toBe('active');
      await expect(menu).toBeVisible();
      await cdp.send('Input.insertText', {text: committed});
      if (withinLimit) await expect(menu.getByRole('option', {name: /^日期/})).toBeVisible();
      else await expect(menu).toHaveCount(0);
    }
    await expectParagraphText(page, blockId, '/日期这是普通正文');
    expect((await editorSelectionSnapshot(page)).blockId).toBe(blockId);
  } finally {
    await cdp.detach();
  }
});

for (const command of ['icon', 'emoji', 'date'] as const) {
  for (const query of ['', command]) {
    test(`slash ${command} preserves adjacent paragraph text with query ${query || '(empty)'}`, async ({page}) => {
      await initialize(page);
      const blockId = await createEmptyParagraphWithCaret(page);
      await page.evaluate(({selector, id}) => {
        const doc = (window as any).ng.getComponent(document.querySelector(selector)).doc;
        const block = doc.getBlockById(id);
        block.insertText(0, '原有正文withoutSpaces', {bold: true});
        doc.selection.setCursorAt(block, 0);
      }, {selector: editorSelector, id: blockId});
      await page.keyboard.type('/');
      const menu = page.locator('block-transformer-contextmenu');
      await expect(menu).toBeVisible();
      if (query) await page.keyboard.type(query);
      await page.evaluate(selector => {
        (window as any).ng.getComponent(document.querySelector(selector)).doc.crud.undoManager.stopCapturing();
      }, editorSelector);
      await menu.getByRole('option', {
        name: command === 'date' ? /^日期/ : new RegExp(`^${command}`, 'i'),
      }).click();
      if (command !== 'date') {
        await page.locator(`.cs-${command}-picker__option`).first().click();
        await expect(page.locator(`.cs-${command}-picker__panel`)).toHaveCount(0);
      }
      const paragraph = page.locator(`[data-block-id="${blockId}"]`);
      await expect(paragraph).toContainText('原有正文withoutSpaces');
      const deltas = await page.evaluate(({selector, id}) => {
        const doc = (window as any).ng.getComponent(document.querySelector(selector)).doc;
        return doc.getBlockById(id).textDeltas();
      }, {selector: editorSelector, id: blockId});
      expect(deltas.at(-1)).toMatchObject({insert: '原有正文withoutSpaces', attributes: {bold: true}});
      expect(deltas.some((delta: any) => typeof delta.insert === 'string' && delta.insert.includes('/'))).toBe(false);
      if (command !== 'emoji') expect(deltas[0].insert).toHaveProperty(command);
      await page.evaluate(selector => {
        (window as any).ng.getComponent(document.querySelector(selector)).doc.crud.undoManager.undo();
      }, editorSelector);
      // WebKit renders a zero-width cursor placeholder after restoring selection.
      await expect.poll(() => paragraph.textContent().then(text =>
        text?.replace(/[\u200B\u200C\uFEFF]/g, ''),
      )).toBe(`/${query}原有正文withoutSpaces`);
      expect(await page.evaluate(({selector, id}) => {
        const doc = (window as any).ng.getComponent(document.querySelector(selector)).doc;
        return doc.getBlockById(id).yText.toString();
      }, {selector: editorSelector, id: blockId})).toBe(`/${query}原有正文withoutSpaces`);
      await page.evaluate(selector => {
        (window as any).ng.getComponent(document.querySelector(selector)).doc.crud.undoManager.redo();
      }, editorSelector);
      await expect(paragraph).toContainText('原有正文withoutSpaces');
      await expect.poll(() => page.evaluate(({selector, id}) => {
        const doc = (window as any).ng.getComponent(document.querySelector(selector)).doc;
        return doc.getBlockById(id).textDeltas();
      }, {selector: editorSelector, id: blockId})).toEqual(deltas);
    });
  }
}

test('slash local inline image loads and survives snapshot reconstruction', async ({page}) => {
  await initialize(page);
  const blockId = await createEmptyParagraphWithCaret(page);
  await page.keyboard.type('/');
  await page.locator('block-transformer-contextmenu')
    .getByRole('option', {name: /^行内图片/}).click();
  const picker = page.locator('media-creator');
  await picker.getByRole('button', {name: '本地上传'}).click();
  await picker.locator('input[type=file]').setInputFiles({
    name: 'inline-image.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="32"><rect width="64" height="32" fill="red"/></svg>'),
  });
  await picker.getByRole('button', {name: '确定', exact: true}).click();
  const image = page.locator(`[data-block-id="${blockId}"] img.bc-inline-image`);
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((element: HTMLImageElement) =>
    element.complete && element.naturalWidth === 64,
  )).toBe(true);
  await expect(image).not.toHaveAttribute('src', /__blockcraft_local__:/);

  const copyId = await page.evaluate(({selector, id}) => {
    const doc = (window as any).ng.getComponent(document.querySelector(selector)).doc;
    const original = doc.getBlockById(id).toSnapshot(true);
    const imageDelta = original.children.find((delta: any) => delta.insert?.image);
    if (!imageDelta || imageDelta.insert.image.startsWith('__blockcraft_local__:')) {
      throw new Error('Snapshot still contains an unuploaded image');
    }
    const copy = doc.schemas.createSnapshot('paragraph', [original.children]);
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [copy]);
    return copy.id as string;
  }, {selector: editorSelector, id: blockId});
  const restored = page.locator(`[data-block-id="${copyId}"] img.bc-inline-image`);
  await expect.poll(() => restored.evaluate((element: HTMLImageElement) =>
    element.complete && element.naturalWidth === 64,
  )).toBe(true);
});

test("slash menu supports arrow navigation and Chinese pinyin-initial search", async ({page}) => {
  await initialize(page);
  const blockId = await createEmptyParagraphWithCaret(page);
  const calloutCountBefore = await page.locator(
    `${editorSelector} .callout-block[data-block-id]`,
  ).count();

  await page.keyboard.type("/");
  const menu = page.locator("block-transformer-contextmenu");
  await expect(menu).toBeVisible();
  const activeItem = menu.locator(".list__item.active");
  const initialLabel = await activeItem.locator(".list__label").textContent();

  await page.keyboard.press("ArrowDown");
  await expect.poll(
    () => activeItem.locator(".list__label").textContent(),
  ).not.toBe(initialLabel);

  await page.keyboard.type("gl");
  const highlighter = menu.getByRole("option", {name: /高亮块/});
  await expect(highlighter).toBeVisible();
  await expect(menu.locator(".list__item")).toHaveCount(1);
  await expect(highlighter).toHaveClass(/\bactive\b/);
  await expect(highlighter.locator(".list__description"))
    .toHaveText("突出展示重要信息");
  await expect(highlighter).not.toContainText("Markdown:");
  await expect(highlighter.locator(".list__hint--markdown"))
    .toHaveText("! + 空格");
  const hintRows = await highlighter.evaluate(element => {
    const description = element.querySelector<HTMLElement>(".list__description");
    const shortcuts = element.querySelector<HTMLElement>(".list__hints");
    const markdown = element.querySelector<HTMLElement>(".list__markdown");
    if (!description || !shortcuts || !markdown) return null;
    return {
      descriptionLeft: description.getBoundingClientRect().left,
      shortcutsTop: shortcuts.getBoundingClientRect().top,
      shortcutsRight: shortcuts.getBoundingClientRect().right,
      markdownTop: markdown.getBoundingClientRect().top,
      markdownLeft: markdown.getBoundingClientRect().left,
      markdownRight: markdown.getBoundingClientRect().right,
    };
  });
  expect(hintRows).not.toBeNull();
  expect(hintRows!.markdownTop).toBeGreaterThan(hintRows!.shortcutsTop);
  expect(hintRows!.markdownLeft).toBeGreaterThan(hintRows!.descriptionLeft);
  expect(Math.abs(hintRows!.markdownRight - hintRows!.shortcutsRight))
    .toBeLessThan(1);
  await expect(highlighter.locator(".list__hint--shortcut"))
    .toHaveText(/Q$/);
  await expect(highlighter.locator(".list__hint--search"))
    .toHaveText("/gl");

  await page.keyboard.press("ArrowUp");
  await expect(highlighter).toHaveClass(/\bactive\b/);
  await page.keyboard.press("Enter");

  await expect(menu).toHaveCount(0);
  await expect(page.locator(
    `${editorSelector} .callout-block[data-block-id]`,
  )).toHaveCount(calloutCountBefore + 1);
  await expect(page.locator(
    `${editorSelector} .paragraph-block[data-block-id="${blockId}"]`,
  )).toHaveCount(0);
});

for (const picker of [
  {
    query: "emoji",
    panel: ".cs-emoji-picker__panel",
    search: ".cs-emoji-picker__search",
    option: ".cs-emoji-picker__option",
    active: ".cs-emoji-picker__option--keyboard-active",
  },
  {
    query: "icon",
    panel: ".cs-icon-picker__panel",
    search: ".cs-icon-picker__search input",
    option: ".cs-icon-picker__option",
    active: ".cs-icon-picker__option--keyboard-active",
  },
] as const) {
  test(`slash ${picker.query} picker owns arrows, Tab, and Enter`, async ({page}) => {
    await initialize(page);
    await createEmptyParagraphWithCaret(page);

    await page.keyboard.type("/");
    const menu = page.locator("block-transformer-contextmenu");
    const command = menu.getByRole("option", {
      name: new RegExp(`^${picker.query}`, "i"),
    });
    await expect(command).toBeVisible();
    await command.click();

    const panel = page.locator(picker.panel);
    const search = panel.locator(picker.search);
    await expect(panel).toBeVisible();
    await expect(search).toBeVisible();
    await expect(panel.locator(picker.option).first()).toBeVisible();
    await search.focus();

    await page.keyboard.press("ArrowDown");
    await expect(panel.locator(picker.active)).toHaveCount(1);

    await page.keyboard.press("Tab");
    await expect(search).toBeFocused();
    await expect(panel.locator(picker.active)).toHaveCount(1);

    await page.keyboard.press("Enter");
    await expect(panel).toHaveCount(0);
  });

  test(`slash ${picker.query} picker owns editor-root keys and their event tail`, async ({page}) => {
    await page.addInitScript(() => {
      const types = ["keydown", "keypress", "keyup", "beforeinput"];
      (window as any).__pickerOuterEvents = [];
      for (const type of types) {
        window.addEventListener(type, event => {
          const keyboard = event as KeyboardEvent;
          const input = event as InputEvent;
          (window as any).__pickerOuterEvents.push({
            type,
            key: keyboard.key ?? null,
            inputType: input.inputType ?? null,
          });
        }, false);
      }
    });
    await initialize(page);
    const blockId = await createEmptyParagraphWithCaret(page);
    await page.keyboard.type("/");
    const menu = page.locator("block-transformer-contextmenu");
    await menu.getByRole("option", {
      name: new RegExp(`^${picker.query}`, "i"),
    }).click();

    const panel = page.locator(picker.panel);
    await expect(panel.locator(picker.option).first()).toBeVisible();
    await page.evaluate(() => ((window as any).__pickerOuterEvents = []));
    const before = await editorSelectionSnapshot(page);
    expect(before.blockId).toBe(blockId);

    await page.keyboard.press("ArrowDown");
    const afterArrow = await editorSelectionSnapshot(page);
    expect(afterArrow.blockId).toBe(before.blockId);
    expect(afterArrow.focusOffset).toBe(before.focusOffset);
    await expect(panel.locator(picker.active)).toHaveCount(1);

    await page.keyboard.press("Tab");
    const afterTab = await editorSelectionSnapshot(page);
    expect(afterTab.blockId).toBe(before.blockId);
    expect(afterTab.focusOffset).toBe(before.focusOffset);

    await page.keyboard.press("Enter");
    await expect(panel).toHaveCount(0);
    const leaked = await page.evaluate(() => (window as any).__pickerOuterEvents);
    expect(leaked).toEqual([]);
  });
}

test('colon emoji closes on no match, preserves text and releases editor keys', async ({page}) => {
  await initialize(page);
  const blockId = await createEmptyParagraphWithCaret(page);
  await page.keyboard.type(':');
  const panel = page.locator('.cs-emoji-picker__panel');
  await expect(panel.locator('.cs-emoji-picker__option').first()).toBeVisible();
  await page.keyboard.type('xiao');
  await expect(panel.locator('.cs-emoji-picker__option').first()).toBeVisible();
  await page.keyboard.type('zzzzzzzz');
  await expect(panel).toHaveCount(0);
  const paragraph = page.locator(`[data-block-id="${blockId}"]`);
  await expect.poll(() => paragraph.textContent().then(text => text?.replace(/[\u200B\u200C\uFEFF]/g, ''))).toBe(':xiaozzzzzzzz');
  expect((await editorSelectionSnapshot(page)).blockId).toBe(blockId);
  await page.keyboard.type('stilltyping');
  await expect.poll(() => paragraph.textContent().then(text => text?.replace(/[\u200B\u200C\uFEFF]/g, ''))).toBe(':xiaozzzzzzzzstilltyping');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await editorSelectionSnapshot(page)).blockId).not.toBe(blockId);
});

test('slash emoji keeps its search panel open for no match', async ({page}) => {
  await initialize(page);
  await createEmptyParagraphWithCaret(page);
  await page.keyboard.type('/');
  await page.locator('block-transformer-contextmenu').getByRole('option', {name: /^emoji/i}).click();
  const panel = page.locator('.cs-emoji-picker__panel');
  await expect(panel.locator('.cs-emoji-picker__option').first()).toBeVisible();
  await panel.locator('input').fill('zzzzzzzz');
  await expect(panel.locator('.cs-emoji-picker__empty')).toBeVisible();
  await expect(panel).toBeVisible();
});

test('colon emoji waits for native IME commit before closing unmatched results', async ({page, context, browserName}) => {
  test.skip(browserName !== 'chromium', 'Chromium native composition protocol');
  await initialize(page);
  const blockId = await createEmptyParagraphWithCaret(page);
  const panel = page.locator('.cs-emoji-picker__panel');
  await page.keyboard.type(':');
  await expect(panel.locator('.cs-emoji-picker__option').first()).toBeVisible();
  const cdp = await context.newCDPSession(page);
  try {
    for (const [draft, committed, matching] of [
      ['xiaoxxxxxxxxxx', '笑', true],
      ['zzzzzzzz', '找不到的表情', false],
    ] as const) {
      await cdp.send('Input.imeSetComposition', {text: draft, selectionStart: draft.length, selectionEnd: draft.length});
      await expect.poll(() => page.evaluate(() => {
        const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc;
        return doc.inputManger.compositionSession.phase;
      })).toBe('active');
      await expect(panel).toBeVisible();
      await cdp.send('Input.insertText', {text: committed});
      // A terminal IME key with keyCode 229 must neither select an emoji nor split text.
      await page.evaluate(() => {
        document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Enter', keyCode: 229, bubbles: true, cancelable: true,
        }));
      });
      if (matching) await expect(panel.locator('.cs-emoji-picker__option').first()).toBeVisible();
      else await expect(panel).toHaveCount(0);
    }
    const paragraph = page.locator(`[data-block-id="${blockId}"]`);
    await expect(paragraph).toHaveText(':笑找不到的表情');
    expect((await editorSelectionSnapshot(page)).blockId).toBe(blockId);
    expect(await page.evaluate(id => {
      const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc;
      return doc.getBlockById(id).yText.toString();
    }, blockId)).toBe(':笑找不到的表情');
  } finally {
    await cdp.detach();
  }
});
