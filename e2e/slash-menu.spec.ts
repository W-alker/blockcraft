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
