import {expect, test, Page} from '@playwright/test';

const menu = (page: Page) => page.locator('bc-editor-context-menu');
async function setup(page: Page, text = '原有内容') {
  await page.goto('/');
  await page.getByRole('button', {name: '初始化', exact: true}).click();
  await expect(page.locator('block-craft-editor .paragraph-block').first()).toBeVisible();
  return page.locator('block-craft-editor').evaluate((editor, text) => {
    const doc = (window as any).ng.getComponent(editor).doc;
    const snapshot = doc.schemas.createSnapshot('paragraph', [text]);
    doc.crud.insertBlocks(doc.rootId, 0, [snapshot]);
    const block = doc.getBlockById(snapshot.id);
    doc.selection.setSelection({blockId: block.id, type: 'text', index: 0, length: block.textLength});
    return snapshot.id as string;
  }, text);
}
async function open(page: Page, id: string) {
  await page.locator(`[data-block-id="${id}"]`).click({button: 'right', position: {x: 12, y: 12}});
  await expect(menu(page)).toBeVisible();
}
async function clipboard(page: Page, formats: Record<string, string>) {
  await page.evaluate(formats => {
    Object.defineProperty(navigator, 'clipboard', {configurable: true, value: {
      read: async () => [{types: Object.keys(formats), getType: async (type: string) => new Blob([formats[type]], {type})}],
      write: async () => {},
    }});
    document.execCommand = () => false;
  }, formats);
}
const read = (page: Page, id: string) => page.locator('block-craft-editor').evaluate((editor, id) => {
  const doc = (window as any).ng.getComponent(editor).doc;
  return doc.model.getTextDeltas(id);
}, id);

for (const backwards of [false, true]) {
  test(`cross-container range survives right click on selected background (${backwards ? 'backward' : 'forward'})`, async ({page}) => {
    await page.setViewportSize({width: 1440, height: 1200});
    await setup(page);
    const ids = await page.locator('block-craft-editor').evaluate(editor => {
      const doc = (window as any).ng.getComponent(editor).doc;
      doc.crud.deleteBlocks(doc.rootId, 0, doc.root.childrenLength);
      const first = doc.schemas.createSnapshot('paragraph', ['前文开头选中正文']);
      const callout = doc.schemas.createSnapshot('callout', []);
      callout.children = [
        doc.schemas.createSnapshot('paragraph', ['提示块内部正文']),
        doc.schemas.createSnapshot('bullet', ['提示块内部列表']),
        doc.schemas.createSnapshot('ordered', ['提示块内部编号']),
      ];
      const last = doc.schemas.createSnapshot('ordered', ['末尾选中后文结尾']);
      doc.crud.insertBlocks(doc.rootId, 0, [first, callout, last]);
      return {first: first.id, callout: callout.id, child: callout.children[1].id, last: last.id};
    });
    const state = () => page.locator('block-craft-editor').evaluate(editor => {
      const doc = (window as any).ng.getComponent(editor).doc;
      return {model: doc.selection.value.toJSON(), text: window.getSelection()?.toString()};
    });
    const characterPoint = (id: string, offset: number) =>
      page.locator('block-craft-editor').evaluate((editor, {id, offset}) => {
        const doc = (window as any).ng.getComponent(editor).doc;
        const block = doc.getBlockById(id);
        const start = block.runtime.mapper.modelPointToDomPoint(block.containerElement, offset);
        const end = block.runtime.mapper.modelPointToDomPoint(block.containerElement, offset + 1);
        const range = document.createRange();
        range.setStart(start.node, start.offset);
        range.setEnd(end.node, end.offset);
        const rect = range.getBoundingClientRect();
        return {x: rect.left + 1, y: rect.top + rect.height / 2};
      }, {id, offset});
    await page.locator(`[data-block-id="${ids.callout}"]`).scrollIntoViewIfNeeded();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const firstPoint = await characterPoint(ids.first, 4);
    const lastPoint = await characterPoint(ids.last, 4);
    const [anchor, head] = backwards ? [lastPoint, firstPoint] : [firstPoint, lastPoint];
    await page.mouse.move(anchor.x, anchor.y);
    await page.mouse.down();
    await page.mouse.move(head.x, head.y, {steps: 20});
    await page.mouse.up();
    await expect.poll(async () => (await state()).model).toMatchObject({
      anchor: {blockId: backwards ? ids.last : ids.first, offset: 4},
      head: {blockId: backwards ? ids.first : ids.last, offset: 4},
    });
    const before = await state();
    const clickCharacter = async (id: string, offset: number) => {
      const point = await characterPoint(id, offset);
      await page.mouse.click(point.x, point.y, {button: 'right'});
      await expect(menu(page)).toBeVisible();
    };
    for (const id of [ids.callout, ids.child]) {
      const block = page.locator(`[data-block-id="${id}"]`);
      await block.scrollIntoViewIfNeeded();
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const box = await block.boundingBox();
      // Right-click on container padding or a nested list must not replace
      // the range, regardless of native text rectangle coverage.
      await page.mouse.click(box!.x + box!.width - 5, box!.y + box!.height / 2, {button: 'right'});
      await expect(menu(page)).toBeVisible();
      await expect.poll(state).toEqual(before);
      await page.keyboard.press('Escape');
    }
    for (const [id, offset] of [[ids.first, 6], [ids.last, 2]] as const) {
      await clickCharacter(id, offset);
      await expect.poll(state).toEqual(before);
      await page.keyboard.press('Escape');
    }
    // Copy the complete cross-container range through the real serialization path.
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', {configurable: true, value: {
        write: async (items: ClipboardItem[]) => {
          (window as any).copiedRangeText = await (await items[0].getType('text/plain')).text();
        },
      }});
      document.execCommand = () => false;
    });
    await clickCharacter(ids.last, 2);
    await menu(page).getByRole('menuitem', {name: /^复制/}).click();
    await expect.poll(() => page.evaluate(() => (window as any).copiedRangeText)).toBe(
      '选中正文\n提示块内部正文\n提示块内部列表\n提示块内部编号\n末尾选中');
    // Right-click is a menu gesture even outside the highlighted characters.
    await clickCharacter(ids.first, 1);
    await expect.poll(state).toEqual(before);
  });
}

for (const keyboard of [false, true]) {
  test(`select all keeps the new document selection (${keyboard ? 'keyboard' : 'pointer'})`, async ({page}) => {
    const id = await setup(page);
    await open(page, id);
    if (keyboard) {
      await page.keyboard.press('ArrowDown');
      await expect(menu(page).getByRole('menuitem', {name: /^剪切/})).toBeFocused();
      await page.keyboard.press('End');
      await expect(menu(page).getByRole('menuitem', {name: /^全选/})).toBeFocused();
      await page.keyboard.press('Enter');
    } else {
      await menu(page).getByRole('menuitem', {name: /^全选/}).click();
    }
    await expect(menu(page)).toHaveCount(0);
    // Let asynchronous bookmark restoration and virtual projection settle.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await expect.poll(() => page.locator('block-craft-editor').evaluate(editor => {
      const doc = (window as any).ng.getComponent(editor).doc;
      const selection = doc.selection.value;
      return {
        start: selection?.start.type,
        end: selection?.end.type,
        root: selection?.start.blockId === doc.rootId && selection?.end.blockId === doc.rootId,
        from: selection?.start.index,
        entire: selection?.end.index === doc.root.childrenLength,
      };
    })).toEqual({start: 'boundary', end: 'boundary', root: true, from: 0, entire: true});
  });
}

test('delayed text toolbar stays behind overlapping context menu items', async ({page}) => {
  // Keep the taller settings menu below the selection so the two overlays overlap.
  await page.setViewportSize({width: 1280, height: 1000});
  const id = await setup(page);
  await expect(page.locator('.float-text-toolbar')).toBeVisible();
  await page.evaluate(() => {
    const timing = {opened: 0, toolbar: 0};
    (window as any).contextMenuTiming = timing;
    document.addEventListener('contextmenu', () => timing.opened = performance.now(), {capture: true, once: true});
    const observer = new MutationObserver(records => {
      if (!timing.opened) return;
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof Element && (node.matches('.float-text-toolbar') || node.querySelector('.float-text-toolbar'))) {
            timing.toolbar = performance.now();
            observer.disconnect();
          }
        }
      }
    });
    observer.observe(document.body, {childList: true, subtree: true});
  });
  await open(page, id);
  await expect.poll(() => page.evaluate(() => (window as any).contextMenuTiming.toolbar)).toBeGreaterThan(0);
  await expect(page.locator('.float-text-toolbar')).toBeVisible();
  const overlap = await menu(page).evaluate(contextMenu => {
    const menuRect = contextMenu.getBoundingClientRect();
    const toolbarRect = document.querySelector('.float-text-toolbar')!.getBoundingClientRect();
    const left = Math.max(menuRect.left, toolbarRect.left);
    const right = Math.min(menuRect.right, toolbarRect.right);
    const top = Math.max(menuRect.top, toolbarRect.top);
    const bottom = Math.min(menuRect.bottom, toolbarRect.bottom);
    const x = (left + right) / 2;
    const y = (top + bottom) / 2;
    const hit = document.elementFromPoint(x, y);
    return {width: right - left, height: bottom - top, menuReceivesPointer: contextMenu.contains(hit), x, y};
  });
  expect(overlap.width).toBeGreaterThan(0);
  expect(overlap.height).toBeGreaterThan(0);
  expect(overlap.menuReceivesPointer).toBe(true);
  await clipboard(page, {'text/plain': ''});
  await page.mouse.click(overlap.x, overlap.y);
  await expect(menu(page)).toHaveCount(0);
});

test('right click preserves range, menu is opaque and keyboard Escape restores selection', async ({page}) => {
  const id = await setup(page);
  await open(page, id);
  await expect(page.locator('.float-text-toolbar')).toBeVisible();
  expect(await menu(page).getByRole('menuitem', {name: /^剪切/}).evaluate(button => {
    const rect = button.getBoundingClientRect();
    return button.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2));
  })).toBe(true);
  await expect(menu(page).getByRole('menuitem', {name: /^复制/})).toBeEnabled();
  const native = () => page.locator('block-craft-editor').evaluate(e => ({
    text: window.getSelection()?.toString().replace(/[\u200b-\u200d\ufeff]/g, ''),
    focused: e.contains(document.activeElement),
    model: (window as any).ng.getComponent(e).doc.selection.value?.collapsed,
  }));
  await expect.poll(native).toEqual({text: '原有内容', focused: true, model: false});
  await menu(page).getByRole('menuitem', {name: '粘贴为'}).hover();
  await expect.poll(native).toEqual({text: '原有内容', focused: true, model: false});
  await expect(page.getByRole('menu', {name: '粘贴为', exact: true})).toBeVisible();
  await menu(page).getByRole('menuitem', {name: /^复制/}).hover();
  const style = await menu(page).getByRole('menu').evaluate(e => {
    const style = getComputedStyle(e);
    const rect = e.getBoundingClientRect();
    return {background: style.backgroundColor, inside: rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight};
  });
  expect(style.background).not.toBe('rgba(0, 0, 0, 0)');
  expect(style.inside).toBe(true);
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.blockcraft-cursor > span').first()).toBeVisible();
  await expect(menu(page).getByRole('menuitem', {name: /^剪切/})).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(menu(page).getByRole('menuitem', {name: /^复制/})).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(menu(page).getByRole('menuitem', {name: /^粘贴 /})).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(menu(page).getByRole('menuitem', {name: '粘贴为'})).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('menu', {name: '粘贴为', exact: true}).getByRole('menuitem', {name: '保留格式'})).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(menu(page).getByRole('menuitem', {name: '粘贴为'})).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu(page)).toHaveCount(0);
  await expect(page.locator('.blockcraft-cursor')).toHaveCount(0);
  expect(await page.locator('block-craft-editor').evaluate(e => (window as any).ng.getComponent(e).doc.selection.value.collapsed)).toBe(false);
});

for (const format of ['保留格式', '纯文本', 'Markdown']) {
  test(`selective paste ${format} replaces only selected content and can undo`, async ({page}) => {
    const id = await setup(page);
    await clipboard(page, {'text/plain': '**新内容**', 'text/html': '<p><strong>新内容</strong></p>'});
    await open(page, id);
    await menu(page).getByRole('menuitem', {name: '粘贴为'}).hover();
    await page.getByRole('menu', {name: '粘贴为', exact: true}).getByRole('menuitem', {name: format, exact: true}).click();
    await expect.poll(async () => (await read(page, id)).map((d: any) => d.insert).join('')).toBe(format === '纯文本' ? '**新内容**' : '新内容');
    const deltas = await read(page, id);
    expect(deltas.some((d: any) => d.attributes?.['a:bold'])).toBe(format !== '纯文本');
    await page.locator('block-craft-editor').evaluate(e => (window as any).ng.getComponent(e).doc.crud.undoManager.undo());
    await expect.poll(async () => (await read(page, id)).map((d: any) => d.insert).join('')).toBe('原有内容');
  });
}

test('clipboard denial leaves cut content intact', async ({page}) => {
  const id = await setup(page);
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {configurable: true, value: {write: async () => { throw new Error('denied'); }}});
    document.execCommand = () => false;
  });
  await open(page, id);
  await menu(page).getByRole('menuitem', {name: /^剪切/}).click();
  await expect.poll(async () => (await read(page, id)).map((d: any) => d.insert).join('')).toBe('原有内容');
  await expect(page.getByText('无法写入剪贴板，请使用系统复制或剪切快捷键', {exact: true})).toBeVisible();
});

test('successful cut deletes once and undo restores the range', async ({page}) => {
  const id = await setup(page);
  await clipboard(page, {});
  await open(page, id);
  await menu(page).getByRole('menuitem', {name: /^剪切/}).click();
  await expect.poll(async () => (await read(page, id)).map((d: any) => d.insert).join('')).toBe('');
  await page.locator('block-craft-editor').evaluate(e => (window as any).ng.getComponent(e).doc.crud.undoManager.undo());
  await expect.poll(async () => (await read(page, id)).map((d: any) => d.insert).join('')).toBe('原有内容');
});

test('readonly keeps copy available and disables mutations', async ({page}) => {
  const id = await setup(page);
  await page.locator('block-craft-editor').evaluate(e => (window as any).ng.getComponent(e).doc.toggleReadonly(true));
  await open(page, id);
  await expect(menu(page).getByRole('menuitem', {name: /^复制/})).toBeEnabled();
  await expect(menu(page).getByRole('menuitem', {name: /^剪切/})).toBeDisabled();
  await expect(menu(page).getByRole('menuitem', {name: /^粘贴 /})).toBeDisabled();
  await expect(menu(page).getByRole('menuitem', {name: '文本设置'})).toBeDisabled();
  await expect(menu(page).getByRole('menuitem', {name: '段落设置'})).toBeDisabled();
});

test('context text settings preserve the range through cancel, confirm and undo', async ({page}) => {
  await page.setViewportSize({width: 1440, height: 1000});
  const id = await setup(page, '设置文字');
  await page.locator('block-craft-editor').evaluate((editor, id) => {
    const doc = (window as any).ng.getComponent(editor).doc;
    doc.selection.setSelection({blockId: id, type: 'text', offset: 0}, {blockId: id, type: 'text', offset: 2});
    doc.crud.undoManager.clearHistory();
  }, id);
  const dialog = page.locator('bc-font-settings-dialog');
  const openSettings = async () => {
    await open(page, id);
    await menu(page).getByRole('menuitem', {name: '文本设置'}).click();
    await expect(dialog).toBeVisible();
    await expect(menu(page)).toHaveCount(0);
  };
  await openSettings();
  await dialog.locator('[data-setting-field="font-size"] input').fill('24');
  await page.getByRole('button', {name: '取消', exact: true}).click();
  await expect(dialog).toBeHidden();
  expect(await read(page, id)).toEqual([{insert: '设置文字'}]);
  await openSettings();
  await dialog.locator('[data-setting-field="font-size"] input').fill('24');
  await dialog.locator('[data-setting-field="font-size"] input').press('Tab');
  await page.getByRole('button', {name: '确定', exact: true}).click();
  await expect(dialog).toBeHidden();
  const text = page.locator(`[data-block-id="${id}"] c-text`);
  await expect(text.first()).toHaveText('设置');
  await expect(text.first()).toHaveCSS('font-size', '24px');
  expect((await read(page, id)).at(-1)).toEqual({insert: '文字'});
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => read(page, id)).toEqual([{insert: '设置文字'}]);
});

test('context paragraph settings apply to the saved paragraph and cancel on readonly', async ({page}) => {
  await page.setViewportSize({width: 1440, height: 1000});
  const id = await setup(page);
  const dialog = page.locator('bc-paragraph-settings-dialog');
  await open(page, id);
  await menu(page).getByRole('menuitem', {name: '段落设置'}).click();
  await expect(dialog).toBeVisible();
  await dialog.locator('[data-setting-field="paragraph-align"] cs-select').click();
  await page.getByRole('option', {name: '右对齐', exact: true}).click();
  await page.getByRole('button', {name: '确定', exact: true}).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator(`[data-block-id="${id}"]`)).toHaveCSS('text-align', 'right');
  await open(page, id);
  await menu(page).getByRole('menuitem', {name: '段落设置'}).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('[data-setting-field="paragraph-align"]')).toContainText('右对齐');
  await page.locator('block-craft-editor').evaluate(e => (window as any).ng.getComponent(e).doc.toggleReadonly(true));
  await expect(dialog).toBeHidden();
  await expect(page.locator(`[data-block-id="${id}"]`)).toHaveCSS('text-align', 'right');
});

test('delayed paste resolves the original target after concurrent insertion', async ({page}) => {
  const id = await setup(page, '目标');
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {configurable: true, value: {read: () => new Promise(resolve => {
      (window as any).releaseRead = () => resolve([{types: ['text/plain'], getType: async () => new Blob(['替换'], {type: 'text/plain'})}]);
    })}});
  });
  await open(page, id);
  await menu(page).getByRole('menuitem', {name: /^粘贴 /}).click();
  await page.waitForFunction(() => !!(window as any).releaseRead);
  await page.locator('block-craft-editor').evaluate((editor, id) => {
    const doc = (window as any).ng.getComponent(editor).doc;
    doc.getBlockById(id).insertText(0, '前缀');
    (window as any).releaseRead();
  }, id);
  await expect.poll(async () => (await read(page, id)).map((d: any) => d.insert).join('')).toBe('前缀替换');
});

test('a concurrent edit during clipboard write cancels deletion', async ({page}) => {
  const id = await setup(page);
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {configurable: true, value: {write: () => new Promise<void>(resolve => {
      (window as any).releaseWrite = resolve;
    })}});
    document.execCommand = () => false;
  });
  await open(page, id);
  await menu(page).getByRole('menuitem', {name: /^剪切/}).click();
  await page.waitForFunction(() => !!(window as any).releaseWrite);
  await page.locator('block-craft-editor').evaluate((editor, id) => {
    const doc = (window as any).ng.getComponent(editor).doc;
    doc.getBlockById(id).insertText(0, '新增');
    (window as any).releaseWrite();
  }, id);
  await expect.poll(async () => (await read(page, id)).map((d: any) => d.insert).join('')).toBe('新增原有内容');
});

test('copy menu writes configured HTML and Markdown adapters to real clipboard', async ({page, context, browserName}) => {
  test.skip(browserName !== 'chromium', 'System clipboard permissions are tested in Chromium');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const id = await setup(page, '系统剪贴板内容');
  await page.locator('block-craft-editor').evaluate((editor, id) => {
    const doc = (window as any).ng.getComponent(editor).doc;
    const block = doc.getBlockById(id);
    block.formatText(0, block.textLength, {'a:bold': true});
    (window as any).copiedAdapterTypes = [];
    for (const adapter of doc.clipboard.adapter.supportedAdapters) {
      const fromSnapshot = adapter.fromSnapshot.bind(adapter);
      adapter.fromSnapshot = async (snapshot: any) => {
        (window as any).copiedAdapterTypes.push(adapter.type);
        return fromSnapshot(snapshot);
      };
    }
  }, id);
  await open(page, id);
  await menu(page).getByRole('menuitem', {name: /^复制/}).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('系统剪贴板内容');
  const html = await page.evaluate(async () => {
    const items = await navigator.clipboard.read();
    return (await items[0].getType('text/html')).text();
  });
  expect(html).toContain('系统剪贴板内容');
  expect(html).toContain('data-bc-clipboard-format');
  expect(await page.evaluate(() => (window as any).copiedAdapterTypes)).toEqual(
    expect.arrayContaining(['text/html', 'text/markdown']));
  // ClipboardItem.read can hide custom MIME; a real paste event exposes the
  // formats offered to a receiving application.
  await page.evaluate(() => {
    const target = document.createElement('textarea');
    target.setAttribute('aria-label', 'clipboard receiver');
    document.body.appendChild(target);
    target.addEventListener('paste', event => {
      event.preventDefault();
      (window as any).receivedClipboard = Object.fromEntries(
        Array.from(event.clipboardData!.types).map(type => [type, event.clipboardData!.getData(type)]));
    });
    target.focus();
  });
  await page.keyboard.press('ControlOrMeta+V');
  await expect.poll(() => page.evaluate(() => (window as any).receivedClipboard?.['text/markdown'])).toContain('**系统剪贴板内容**');
  expect(await page.evaluate(() => (window as any).receivedClipboard['text/html'])).toContain('系统剪贴板内容');
});

test('collapsed caret stays focused while hovering the submenu', async ({page}) => {
  const id = await setup(page);
  await page.locator('block-craft-editor').evaluate((e, id) => {
    const doc = (window as any).ng.getComponent(e).doc;
    doc.selection.setCursorAt(doc.getBlockById(id), 1);
  }, id);
  await open(page, id);
  await menu(page).getByRole('menuitem', {name: '粘贴为'}).hover();
  await expect(page.getByRole('menu', {name: '粘贴为', exact: true})).toBeVisible();
  await expect.poll(() => page.locator('block-craft-editor').evaluate(e => {
    const selection = window.getSelection();
    return !!selection?.rangeCount && selection.isCollapsed && e.contains(document.activeElement) &&
      (window as any).ng.getComponent(e).doc.selection.value?.collapsed;
  })).toBe(true);
  expect(await page.locator('block-craft-editor').evaluate(e =>
    (window as any).ng.getComponent(e).doc.selection.value.start.offset)).toBe(1);
});

test('submenu flips at viewport edge and closes with its parent', async ({page}) => {
  await page.setViewportSize({width: 900, height: 700});
  const id = await setup(page);
  await page.locator(`[data-block-id="${id}"]`).evaluate(el => el.dispatchEvent(new MouseEvent('contextmenu', {bubbles: true, cancelable: true, clientX: 885, clientY: 600})));
  await expect(menu(page)).toBeVisible();
  await menu(page).getByRole('menuitem', {name: '粘贴为'}).hover();
  const child = page.getByRole('menu', {name: '粘贴为', exact: true});
  await expect(child).toBeVisible();
  const parentBox = await menu(page).getByRole('menu', {name: '编辑菜单', exact: true}).boundingBox();
  const childBox = await child.boundingBox();
  expect(childBox!.x + childBox!.width).toBeLessThanOrEqual(parentBox!.x + 10);
  expect(childBox!.y + childBox!.height).toBeLessThanOrEqual(700);
  await page.keyboard.press('Escape');
  await expect(menu(page)).toHaveCount(0);
  await expect(child).toHaveCount(0);
});

test('clipboard read denial does not replace the selection', async ({page}) => {
  const id = await setup(page);
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {configurable: true, value: {read: async () => {throw new Error('denied');}}});
  });
  await open(page, id);
  await menu(page).getByRole('menuitem', {name: /^粘贴 /}).click();
  await expect(page.getByText('无法读取剪贴板，请允许剪贴板访问或使用系统粘贴快捷键', {exact: true})).toBeVisible();
  expect((await read(page, id)).map((d: any) => d.insert).join('')).toBe('原有内容');
});
