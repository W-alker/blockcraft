import {expect, test, type Page} from '@playwright/test';

test.use({viewport: {width: 1440, height: 1000}});
const fixture = '#object-context-fixture';
const menu = (page: Page) => page.locator('bc-editor-context-menu');

async function setup(page: Page, flavour = 'shape', layout = 'over') {
  await page.routeWebSocket('**', socket => socket.close());
  await page.goto('/');
  await page.getByRole('button', {name: '初始化', exact: true}).click();
  await page.waitForFunction(() => (window as any).ng?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized);
  return page.evaluate(({flavour, layout, fixture}) => {
    const source = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc;
    const viewport = document.createElement('div');
    viewport.id = fixture.slice(1);
    viewport.style.cssText = 'position:fixed;left:40px;top:40px;width:1100px;height:850px;overflow:auto;background:white;z-index:20;padding:60px;box-sizing:border-box';
    const mount = document.createElement('div');
    viewport.append(mount); document.body.append(viewport);
    const canvas = document.createElement('canvas');
    canvas.width = 240; canvas.height = 140;
    canvas.getContext('2d')!.fillStyle = '#84bdf5';
    canvas.getContext('2d')!.fillRect(0, 0, 240, 140);
    const first = source.schemas.createSnapshot(flavour, flavour === 'image'
      ? [{src: canvas.toDataURL(), wr: 25, ar: 240 / 140}]
      : flavour === 'shape' ? ['rectangle', '对象内部文字'] : ['对象内部文字', {width: 240, height: 140}]);
    if (flavour === 'shape') Object.assign(first.props, {width: 240, height: 140});
    const second = source.schemas.createSnapshot('shape', ['rectangle', '第二个对象']);
    Object.assign(second.props, {width: 180, height: 100});
    const before = source.schemas.createSnapshot('paragraph', ['此前聚焦的正文']);
    const after = source.schemas.createSnapshot('paragraph', ['菜单范围外正文']);
    const Plugin = (name: string) => source.plugins.find((plugin: any) => plugin.name === name).constructor;
    const Format = Plugin('object-format-toolbar'), Context = Plugin('context-menu'), Image = Plugin('img-toolbar'), Drag = Plugin('ObjectDrag');
    const format = new Format({collapsed: true});
    const doc = new source.constructor({...source.config, yDoc: new source.yDoc.constructor(),
      plugins: [format, new Image({collapsed: true}), new Drag(), new Context()], readonly: false,
      virtualization: {enabled: false}, scrollContainer: viewport});
    doc.initBySnapshot({...source.model.toSnapshot(source.rootId), children: [before, first, second, after]}, mount);
    for (const [index, object] of [first, second].entries()) {
      doc.placement.setObjectLayout(object.id, layout);
      if (layout !== 'top-bottom') doc.placement.updateAbsolute(object.id, {x: 100 + index * 320, y: 220});
    }
    source.destroy();
    doc.selection.setCursorAtBlock(before.id, true, false);
    doc.crud.undoManager.clearHistory();
    ;(window as any).objectContextFixture = {doc, first: first.id, second: second.id, before: before.id, after: after.id, format};
    return {first: first.id as string, second: second.id as string, before: before.id as string, after: after.id as string};
  }, {flavour, layout, fixture});
}

async function open(page: Page, id: string) {
  const point = await page.locator(`${fixture} [data-block-id="${id}"]`).evaluate(block => {
    const surface = block.querySelector<HTMLElement>('[data-bc-object-surface], .img-wrapper') ?? block as HTMLElement;
    const rect = surface.getBoundingClientRect();
    return {x: rect.x + 3, y: rect.y + Math.min(35, rect.height / 3)};
  });
  await page.mouse.click(point.x, point.y, {button: 'right'});
  await expect(menu(page)).toBeVisible();
}

async function selected(page: Page) {
  return page.evaluate(() => (window as any).objectContextFixture.doc.selection.value?.toJSON());
}

async function selectPair(page: Page) {
  await page.evaluate(() => {
    const {doc, first, second} = (window as any).objectContextFixture;
    const parent = doc.model.getParentId(first), children = doc.model.getChildrenIds(parent);
    doc.selection.setSelection({type: 'boundary', blockId: parent, index: children.indexOf(first)},
      {type: 'boundary', blockId: parent, index: children.indexOf(second) + 1});
  });
}

for (const flavour of ['shape', 'text-box', 'word-art', 'image']) {
  for (const layout of ['top-bottom', 'over']) {
    test(`${flavour} ${layout}: right-click owns the object and exposes only applicable commands`, async ({page}) => {
      const {first} = await setup(page, flavour, layout);
      await open(page, first);
      await expect.poll(() => selected(page)).toMatchObject({anchor: {blockId: first, type: 'selected'}});
      const duplicate = menu(page).getByRole('menuitem', {name: /^复制副本/});
      await expect(duplicate).toBeVisible();
      await expect(duplicate.locator('small')).toHaveCount(layout === 'over' ? 1 : 0);
      if (layout === 'over') {
        const prefix = await page.evaluate(() => /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+');
        await expect(duplicate.locator('small')).toHaveText(`${prefix}D`);
      }
      await expect(menu(page).getByRole('menuitem', {name: '文字环绕', exact: true})).toBeVisible();
      await expect(menu(page).getByRole('menuitem', {name: '排列', exact: true})).toHaveCount(layout === 'over' ? 1 : 0);
      await expect(menu(page).getByRole('menuitem', {name: '解除组合', exact: true})).toHaveCount(0);
      await expect(menu(page).getByRole('menuitem', {name: '文本设置', exact: true})).toHaveCount(0);
      await expect(menu(page).getByRole('menuitem', {name: /图片布局|布局设置/})).toHaveCount(0);
      if (flavour === 'shape' && layout === 'over') {
        await page.screenshot({path: '/tmp/blockcraft-object-menu-review/.impeccable/review/desktop.png'});
      }
      await expect(menu(page).getByRole('menuitem', {name: /外观设置|文字选项|段落设置|文本设置/})).toHaveCount(0);
      await expect(page.locator('bc-object-format-toolbar .object-format__panel:visible')).toHaveCount(0);
      expect(await page.evaluate(() => (window as any).objectContextFixture.format.collapsed)).toBe(true);
      expect(await page.evaluate(() => (window as any).objectContextFixture.doc.crud.undoManager.isCanUndo())).toBe(false);
    });
  }
}

test('layout submenu supports keyboard entry, return, active state and atomic undo', async ({page}) => {
  const {first} = await setup(page, 'image', 'top-bottom');
  await open(page, first);
  const trigger = menu(page).getByRole('menuitem', {name: '文字环绕', exact: true});
  await trigger.focus();
  await page.keyboard.press('ArrowRight');
  const submenu = page.getByRole('menu', {name: '文字环绕', exact: true});
  await expect(submenu).toBeVisible();
  await expect(submenu.locator('button:focus')).toHaveCount(1);
  await expect(submenu.getByRole('menuitem', {name: '上下型', exact: true})).toHaveAttribute('aria-current', 'true');
  await page.keyboard.press('ArrowLeft');
  await expect(submenu).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await submenu.getByRole('menuitem', {name: '浮于文字上方', exact: true}).click();
  await expect.poll(() => page.evaluate(id => (window as any).objectContextFixture.doc.placement.getObjectLayout(id), first)).toBe('over');
  await page.evaluate(() => (window as any).objectContextFixture.doc.crud.undoManager.undo());
  await expect.poll(() => page.evaluate(id => (window as any).objectContextFixture.doc.placement.getObjectLayout(id), first)).toBe('top-bottom');
});

test('the displayed duplicate shortcut performs the same floating-object command', async ({page}) => {
  const {first} = await setup(page, 'image');
  await open(page, first);
  const hint = await menu(page).getByRole('menuitem', {name: /^复制副本/}).locator('small').innerText();
  await page.keyboard.press('Escape');
  await page.keyboard.press(hint.startsWith('⌘') ? 'Meta+d' : 'Control+d');
  await expect.poll(async () => (await selected(page))?.anchor.blockId).not.toBe(first);
  const copy = (await selected(page))!.anchor.blockId;
  expect(await page.evaluate(id => (window as any).objectContextFixture.doc.model.getFlavour(id), copy)).toBe('image');
  await page.evaluate(() => (window as any).objectContextFixture.doc.crud.undoManager.undo());
  await expect.poll(() => page.evaluate(id => (window as any).objectContextFixture.doc.model.exists(id), copy)).toBe(false);
});

for (const layout of ['top-bottom', 'over']) {
  test(`duplicate ${layout} object preserves content and undo, without using the clipboard`, async ({page}) => {
    const {first} = await setup(page, 'text-box', layout);
    const before = await page.evaluate(id => (window as any).objectContextFixture.doc.model.toSnapshot(id), first);
    await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', {configurable: true, value: {
      read: () => { throw new Error('duplicate must not read clipboard'); },
      write: () => { throw new Error('duplicate must not write clipboard'); },
    }}));
    await open(page, first);
    await menu(page).getByRole('menuitem', {name: /^复制副本/}).click();
    await expect.poll(async () => (await selected(page))?.anchor.blockId).not.toBe(first);
    const copy = (await selected(page))!.anchor.blockId;
    const snapshot = await page.evaluate(id => (window as any).objectContextFixture.doc.model.toSnapshot(id), copy);
    expect(snapshot.flavour).toBe(before.flavour);
    expect(snapshot.children[0].children).toEqual(before.children[0].children);
    expect(snapshot.children[0].id).not.toBe(before.children[0].id);
    await page.evaluate(() => (window as any).objectContextFixture.doc.crud.undoManager.undo());
    await expect.poll(() => page.evaluate(id => (window as any).objectContextFixture.doc.model.exists(id), copy)).toBe(false);
    expect(await page.evaluate(id => (window as any).objectContextFixture.doc.model.toSnapshot(id), first)).toEqual(before);
  });
}

test('multi-selection retains targets and groups, then right-clicking a member keeps the selected group', async ({page}) => {
  const {first, second} = await setup(page);
  await selectPair(page);
  await open(page, first);
  await expect(menu(page).getByRole('menuitem', {name: '组合', exact: true})).toBeVisible();
  await menu(page).getByRole('menuitem', {name: '组合', exact: true}).click();
  const group = (await selected(page))!.anchor.blockId;
  expect(group).not.toBe(first);
  expect(await page.evaluate(id => (window as any).objectContextFixture.doc.model.getChildrenIds(id), group)).toEqual([first, second]);
  await open(page, first);
  await expect.poll(() => selected(page)).toMatchObject({anchor: {blockId: group}});
  await menu(page).getByRole('menuitem', {name: '解除组合', exact: true}).click();
  await expect.poll(() => page.evaluate(id => (window as any).objectContextFixture.doc.model.exists(id), group)).toBe(false);
  expect(await page.evaluate(id => (window as any).objectContextFixture.doc.model.exists(id), first)).toBe(true);
});

test('deletion uses object semantics and Undo restores the original object', async ({page}) => {
  const {first} = await setup(page, 'image');
  const before = await page.evaluate(id => (window as any).objectContextFixture.doc.model.toSnapshot(id), first);
  await open(page, first);
  await menu(page).getByRole('menuitem', {name: '删除对象', exact: true}).click();
  await expect.poll(() => page.evaluate(id => (window as any).objectContextFixture.doc.model.exists(id), first)).toBe(false);
  await page.evaluate(() => (window as any).objectContextFixture.doc.crud.undoManager.undo());
  await expect.poll(() => page.evaluate(id => (window as any).objectContextFixture.doc.model.toSnapshot(id), first)).toEqual(before);
});

test('moving a contiguous object selection one layer preserves its relative order and a single Undo', async ({page}) => {
  const {first, second} = await setup(page);
  const third = await page.evaluate(() => {
    const {doc} = (window as any).objectContextFixture;
    const snapshot = doc.schemas.createSnapshot('shape', ['rectangle', '未选对象']);
    const id = doc.placement.insertAbsoluteSnapshot(snapshot, {anchorRect: null});
    doc.placement.updateAbsolute(id, {x: 740, y: 220});
    doc.crud.undoManager.clearHistory();
    return id as string;
  });
  const order = () => page.evaluate(id => {
    const {doc} = (window as any).objectContextFixture;
    return doc.model.getChildrenIds(doc.model.getParentId(id));
  }, first);
  expect(await order()).toEqual([first, second, third]);
  await selectPair(page);
  await open(page, first);
  await menu(page).getByRole('menuitem', {name: '排列', exact: true}).hover();
  const arrange = page.getByRole('menu', {name: '排列', exact: true});
  await arrange.getByRole('menuitem', {name: '上移一层', exact: true}).click();
  await expect.poll(order).toEqual([third, first, second]);
  await open(page, first);
  await menu(page).getByRole('menuitem', {name: '排列', exact: true}).hover();
  await expect(arrange.getByRole('menuitem', {name: '上移一层', exact: true})).toBeDisabled();
  await page.keyboard.press('Escape');
  await page.evaluate(() => (window as any).objectContextFixture.doc.crud.undoManager.undo());
  await expect.poll(order).toEqual([first, second, third]);
});

test('a selected underlay image keeps object commands when text covers its surface', async ({page}) => {
  const {first} = await setup(page, 'image', 'under');
  await page.evaluate(id => (window as any).objectContextFixture.doc.selection.selectBlock(id), first);
  await open(page, first);
  await expect(menu(page).getByRole('menuitem', {name: '文字环绕', exact: true})).toBeVisible();
  await expect(menu(page).getByRole('menuitem', {name: '删除对象', exact: true})).toBeVisible();
  await menu(page).getByRole('menuitem', {name: '文字环绕', exact: true}).hover();
  await expect(page.getByRole('menu', {name: '文字环绕', exact: true})
    .getByRole('menuitem', {name: '衬于文字下方', exact: true})).toHaveAttribute('aria-current', 'true');
});

test('multi-object flow conversion keeps both objects and a single Undo restores placement', async ({page}) => {
  const {first, second} = await setup(page);
  await selectPair(page);
  await open(page, first);
  await menu(page).getByRole('menuitem', {name: '文字环绕', exact: true}).hover();
  const layout = page.getByRole('menu', {name: '文字环绕', exact: true});
  await expect(layout.getByRole('menuitem', {name: '嵌入型', exact: true})).toHaveCount(0);
  await layout.getByRole('menuitem', {name: '上下型', exact: true}).click();
  const states = () => page.evaluate(ids => {
    const {doc} = (window as any).objectContextFixture;
    return ids.map(id => ({exists: doc.model.exists(id), mode: doc.placement.getState(id).mode}));
  }, [first, second]);
  await expect.poll(states).toEqual([{exists: true, mode: 'relative'}, {exists: true, mode: 'relative'}]);
  await page.evaluate(() => (window as any).objectContextFixture.doc.crud.undoManager.undo());
  await expect.poll(states).toEqual([{exists: true, mode: 'absolute'}, {exists: true, mode: 'absolute'}]);
});

test('single-image inline conversion uses the existing adapter and Undo restores the object', async ({page}) => {
  const {first} = await setup(page, 'image');
  await open(page, first);
  await menu(page).getByRole('menuitem', {name: '文字环绕', exact: true}).hover();
  await page.getByRole('menu', {name: '文字环绕', exact: true}).getByRole('menuitem', {name: '嵌入型', exact: true}).click();
  await expect.poll(() => page.evaluate(id => (window as any).objectContextFixture.doc.model.exists(id), first)).toBe(false);
  await expect(page.locator(`${fixture} .bc-inline-image-frame`)).toHaveCount(1);
  await page.evaluate(() => (window as any).objectContextFixture.doc.crud.undoManager.undo());
  await expect.poll(() => page.evaluate(id => (window as any).objectContextFixture.doc.model.exists(id), first)).toBe(true);
});

test('a lock applied while the menu is open rejects the stale delete action', async ({page}) => {
  const {first} = await setup(page);
  await open(page, first);
  await page.evaluate(id => (window as any).objectContextFixture.doc.setBlockReadonly(id, true), first);
  await menu(page).getByRole('menuitem', {name: '删除对象', exact: true}).click();
  expect(await page.evaluate(id => (window as any).objectContextFixture.doc.model.exists(id), first)).toBe(true);
});

test('inner text retains its range and has no whole-object or popup settings entries', async ({page}) => {
  const {first} = await setup(page, 'text-box');
  const child = await page.evaluate(id => {
    const {doc} = (window as any).objectContextFixture;
    const child = doc.model.getChildrenIds(id)[0];
    doc.selection.setSelection({blockId: child, type: 'text', offset: 1}, {blockId: child, type: 'text', offset: 4});
    return child;
  }, first);
  const before = await selected(page);
  await page.locator(`[data-block-id="${child}"]`).click({button: 'right', position: {x: 14, y: 10}});
  await expect(menu(page)).toBeVisible();
  expect(await selected(page)).toEqual(before);
  await expect(menu(page).getByRole('menuitem', {name: '删除对象', exact: true})).toHaveCount(0);
  await expect(menu(page).getByRole('menuitem', {name: /外观设置|文字选项|文本设置|段落设置/})).toHaveCount(0);
});

test('right-click direct commands remain independent of floating toolbars and respect readonly', async ({page}) => {
  const {first} = await setup(page);
  await page.evaluate(() => (window as any).objectContextFixture.doc.interactionMode.set('immersive'));
  await open(page, first);
  await expect(menu(page).getByRole('menuitem', {name: '外观设置…', exact: true})).toHaveCount(0);
  await expect(menu(page).getByRole('menuitem', {name: '文字环绕', exact: true})).toBeVisible();
  await page.keyboard.press('Escape');
  await page.evaluate(() => (window as any).objectContextFixture.doc.toggleReadonly(true));
  await open(page, first);
  await expect(menu(page).getByRole('menuitem', {name: '复制副本', exact: true})).toHaveCount(0);
  await expect(menu(page).getByRole('menuitem', {name: '删除对象', exact: true})).toHaveCount(0);
  await expect(menu(page).getByRole('menuitem', {name: /^复制/})).toBeEnabled();
});

test('object menu and its submenu stay within a narrow viewport', async ({page}) => {
  const {first} = await setup(page);
  await page.setViewportSize({width: 720, height: 640});
  await page.evaluate(() => {
    const viewport = document.querySelector('#object-context-fixture') as HTMLElement;
    viewport.style.cssText = 'position:fixed;inset:16px;overflow:auto;background:white;z-index:20;padding:40px;box-sizing:border-box';
  });
  await open(page, first);
  await menu(page).getByRole('menuitem', {name: '文字环绕', exact: true}).hover();
  const submenu = page.getByRole('menu', {name: '文字环绕', exact: true});
  await expect(submenu).toBeVisible();
  for (const panel of [menu(page), submenu]) {
    const rect = (await panel.boundingBox())!;
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.y).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(720);
    expect(rect.y + rect.height).toBeLessThanOrEqual(640);
  }
  await page.screenshot({path: '/tmp/blockcraft-object-menu-review/.impeccable/review/narrow.png'});
});
