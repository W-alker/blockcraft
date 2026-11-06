import {expect, test, type Page} from '@playwright/test';

// 仅用隔离 fixture 提供宿主权限和插件配置；被测选区与动作均由真实鼠标/键盘触发。
test.beforeEach(async ({page}) => {
  await page.goto('/');
  await page.getByRole('button', {name: '初始化', exact: true}).click();
  await page.waitForFunction(() => (window as any).ng?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized);
  await page.evaluate(() => {
    const source = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc;
    const viewport = document.createElement('section');
    viewport.id = 'readonly-toolbar-fixture';
    viewport.style.cssText = 'position:fixed;inset:40px;overflow:auto;background:white;color:black;z-index:999;padding:80px 40px';
    const controls = document.createElement('div');
    controls.style.cssText = 'position:fixed;top:44px;left:80px;display:flex;gap:12px';
    const mount = document.createElement('div');
    viewport.append(controls, mount);
    document.body.appendChild(viewport);
    const paragraphs = ['Select this text to add a comment.', 'Another paragraph remains unchanged.'].map(text => source.schemas.createSnapshot('paragraph', [[{insert: text}]]));
    const snapshot = source.schemas.createSnapshot('root', ['readonly-toolbar', paragraphs]);
    const Toolbar = source.config.plugins.find((plugin: any) => plugin.name === 'float-text-toolbar').constructor;
    const probe: any = {allowed: true, clicks: []};
    const plugin = new Toolbar({
      extraItems: [{name: 'edit-action', value: 'edit-action', label: '编辑态动作'}],
      readonlyExtraItems: [{name: 'comment', value: 'comment', icon: 'bc_huifu', label: '添加评论',
        visible: (selection: any) => probe.allowed && selection.isInSameBlock}],
      onExtraItemClick: (item: any, doc: any) => {
        probe.clicks.push({name: item.name, text: doc.selection.getSelectedText()});
        return true;
      },
    });
    const doc = new source.constructor({...source.config, yDoc: new source.yDoc.constructor(), docId: snapshot.id,
      plugins: [plugin], readonly: true, scrollContainer: viewport, virtualization: {enabled: false}});
    doc.initBySnapshot(snapshot, mount);
    source.destroy();
    probe.doc = doc;
    probe.paragraphId = paragraphs[0].id;
    probe.before = JSON.stringify(doc.exportSnapshot());
    (window as any).readonlyToolbarProbe = probe;
    for (const [label, action] of [
      ['撤回权限', () => {probe.allowed = false;}],
      ['切换编辑', () => doc.toggleReadonly(false)],
      ['销毁文档', () => doc.destroy()],
      ['关闭浮层偏好', () => plugin.setEnabled(false)],
    ] as const) {
      const button = document.createElement('button');
      button.textContent = label;
      button.addEventListener('click', action);
      controls.appendChild(button);
    }
  });
});

async function selectText(page: Page) {
  // A previous selection/heading submenu can survive resize. Close the menu
  // before measuring, then collapse the old range with a real click so the
  // following gesture selects text instead of dragging the selected content.
  await page.keyboard.press('Escape');
  const text = page.locator('#readonly-toolbar-fixture .paragraph-block c-text').first();
  await expect(text).toBeVisible();
  await text.scrollIntoViewIfNeeded();
  const readPoints = () => text.evaluate(element => {
    const range = element.ownerDocument.createRange();
    range.selectNodeContents(element);
    const rects = Array.from(range.getClientRects()).filter(rect => rect.width > 0 && rect.height > 0);
    const first = rects[0];
    const last = rects.at(-1);
    if (!first || !last) throw new Error('missing text fragments');
    const box = range.getBoundingClientRect();
    return {
      start: {x: first.left + .5, y: first.top + first.height / 2},
      end: {x: last.right - .5, y: last.top + last.height / 2},
      box: {x: box.x, y: box.y, width: box.width, height: box.height},
      selectedText: element.textContent ?? '',
    };
  });
  let points = await readPoints();
  await page.mouse.click(points.start.x, points.start.y);
  // Clicking may reveal the caret through the document scroll container.
  points = await readPoints();
  await page.mouse.move(points.start.x, points.start.y);
  await page.mouse.down();
  await page.mouse.move(points.end.x, points.end.y, {steps: 12});
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString() ?? ''))
    .toBe(points.selectedText);
  return points.box;
}
const toolbar = (page: Page) => page.locator('.float-text-toolbar');

test('只读拖选显示单个评论动作，点击保留选中文字且不改正文', async ({page}, testInfo) => {
  const textBox = await selectText(page);
  await expect(toolbar(page)).toBeVisible();
  await expect(toolbar(page).locator('bc-float-toolbar-item')).toHaveCount(1);
  await expect(toolbar(page)).toHaveText('添加评论');
  const box = await toolbar(page).boundingBox();
  expect(box!.width).toBeLessThan(200);
  expect(box!.y + box!.height).toBeLessThanOrEqual(textBox.y + 1);
  await page.screenshot({path: testInfo.outputPath('readonly-comment-toolbar.png')});
  await page.keyboard.press('ControlOrMeta+b');
  await toolbar(page).getByText('添加评论', {exact: true}).click();
  await expect(toolbar(page)).toHaveCount(0);
  const result = await page.evaluate(() => {
    const p = (window as any).readonlyToolbarProbe;
    return {clicks: p.clicks, unchanged: p.before === JSON.stringify(p.doc.exportSnapshot()), readonly: p.doc.isReadonly};
  });
  expect(result.clicks).toHaveLength(1);
  expect(result.clicks[0].text).toContain('this text');
  expect(result.unchanged).toBe(true);
  expect(result.readonly).toBe(true);
});

test('权限撤回后再次划词不出现按钮', async ({page}) => {
  await selectText(page);
  await expect(toolbar(page)).toBeVisible();
  await page.getByRole('button', {name: '撤回权限', exact: true}).click();
  await selectText(page);
  await expect(toolbar(page)).toHaveCount(0);
});

test('Escape、外部点击、偏好关闭和销毁均释放浮层', async ({page}) => {
  await selectText(page);
  await expect(toolbar(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(toolbar(page)).toHaveCount(0);
  await selectText(page);
  await expect(toolbar(page)).toBeVisible();
  await page.mouse.click(55, 55);
  await expect(toolbar(page)).toHaveCount(0);
  await selectText(page);
  await expect(toolbar(page)).toBeVisible();
  await page.getByRole('button', {name: '关闭浮层偏好', exact: true}).click();
  await selectText(page);
  await expect(toolbar(page)).toHaveCount(0);
  await page.getByRole('button', {name: '销毁文档', exact: true}).click();
  await expect(toolbar(page)).toHaveCount(0);
});

test('切回编辑后恢复原有格式与编辑态自定义动作', async ({page}) => {
  await page.getByRole('button', {name: '切换编辑', exact: true}).click();
  await selectText(page);
  await expect(toolbar(page)).toBeVisible();
  await expect(toolbar(page).getByText('编辑态动作', {exact: true})).toBeVisible();
  await expect(toolbar(page).getByText('添加评论', {exact: true})).toHaveCount(0);
  await expect(toolbar(page).locator('bc-float-toolbar-item[title="上标"], bc-float-toolbar-item[title="下标"], bc-float-toolbar-item[title="行内公式"]')).toHaveCount(0);
  await toolbar(page).locator('bc-float-toolbar-item[title^="加粗"]').click();
  await expect.poll(() => page.evaluate(() => {
    const doc = (window as any).readonlyToolbarProbe.doc;
    return doc.getBlockById((window as any).readonlyToolbarProbe.paragraphId).textDeltas().some((op: any) => op.attributes?.['a:bold']);
  })).toBe(true);
});

test('紧凑浮动工具栏保留文字入口、纵向菜单及窄屏格式操作', async ({page}, testInfo) => {
  await page.getByRole('button', {name: '切换编辑', exact: true}).click();
  await selectText(page);
  const bar = toolbar(page);
  const wrapper = bar.locator('.bc-float-toolbar__wrapper').first();
  const bold = bar.locator('bc-float-toolbar-item[title^="加粗"]');
  await expect(bold).toBeVisible();
  const square = await bold.boundingBox();
  expect(square!.width).toBe(28);
  expect(square!.height).toBe(square!.width);
  for (const theme of ['dark', 'light']) {
    await page.evaluate(theme => (window as any).readonlyToolbarProbe.doc.toggleTheme(theme), theme);
    await expect(wrapper).toHaveCSS('background-color', theme === 'dark' ? 'rgb(42, 42, 42)' : 'rgb(255, 255, 255)');
    await expect(bold).toHaveCSS('color', theme === 'dark' ? 'rgb(227, 227, 227)' : 'rgb(55, 53, 47)');
    await bar.screenshot({path: testInfo.outputPath(`compact-toolbar-${theme}.png`)});
  }
  const heading = bar.locator('bc-float-toolbar-item').filter({hasText: '正文'});
  expect((await heading.boundingBox())!.width).toBeGreaterThan(square!.width);
  await heading.hover();
  const option = page.locator('bc-float-toolbar[data-direction="column"] bc-float-toolbar-item').filter({hasText: '一级标题'});
  await expect(option).toBeVisible();
  expect((await option.boundingBox())!.width).toBeGreaterThan(square!.width * 2);
  await option.click();
  await expect.poll(() => page.evaluate(() => {
    const {doc, paragraphId} = (window as any).readonlyToolbarProbe;
    return doc.getBlockById(paragraphId).props.heading;
  })).toBe(1);

  // Only the fixture's surrounding chrome is reduced; toolbar layout stays production CSS.
  await page.evaluate(() => {
    const fixture = document.getElementById('readonly-toolbar-fixture')!;
    fixture.style.inset = '8px';
    fixture.style.padding = '150px 12px 20px';
  });
  await page.setViewportSize({width: 375, height: 760});
  await selectText(page);
  await expect(wrapper).toBeVisible();
  // Overlay fitting runs after attachment; assert the settled production
  // layout instead of reading a single frame before its viewport clamp.
  await expect(async () => {
    const bounds = await wrapper.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(375);
    expect(bounds!.height).toBeGreaterThan(36);
    expect(await wrapper.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
  }).toPass({timeout: 5000});
  await expect(bar.getByText('编辑态动作', {exact: true})).toBeVisible();
  await bar.screenshot({path: testInfo.outputPath('compact-toolbar-mobile.png')});
  await bold.click();
  await expect.poll(() => page.evaluate(() => {
    const {doc, paragraphId} = (window as any).readonlyToolbarProbe;
    return doc.getBlockById(paragraphId).textDeltas().some((op: any) => op.attributes?.['a:bold']);
  })).toBe(true);
});
