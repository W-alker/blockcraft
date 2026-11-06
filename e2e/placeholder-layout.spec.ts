import {expect, test, type Locator, type Page} from '@playwright/test';

async function start(page: Page) {
  await page.routeWebSocket('**', socket => socket.close());
  await page.goto('/');
  await page.getByRole('button', {name: '初始化', exact: true}).click();
  await page.waitForFunction(() => (window as any).ng?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized);
}

async function typography(target: Locator) {
  return target.evaluate(element => {
    const read = (style: CSSStyleDeclaration) => ({
      size: style.fontSize, family: style.fontFamily, weight: style.fontWeight,
      italic: style.fontStyle, spacing: style.letterSpacing, decoration: style.textDecorationLine,
    });
    const gap = element.querySelector('[data-zero-space]');
    return {hint: read(getComputedStyle(element, '::before')), gap: gap ? read(getComputedStyle(gap)) : null};
  });
}

test('placeholder follows empty text defaults, updates, undo and input without changing content', async ({page}) => {
  await start(page);
  const id = await page.evaluate(async () => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc;
    const block = doc.schemas.createSnapshot('paragraph', [[], {pfs: 1.5, textDefaults: {
      't:ff': 'serif', 't:px': 24, 't:fs': 1.25, 't:ls': .1,
      'a:bold': true, 'a:italic': true, 'a:underline': true, 's:color': '#ff0000',
    }}]);
    block.meta = {...block.meta, plh: '请填写内容', plhMode: 'always'};
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [block]);
    await doc.navigateToBlock(block.id);
    doc.selection.setCursorAt(doc.getBlockById(block.id), 0);
    doc.crud.undoManager.clearHistory();
    return block.id as string;
  });
  const target = page.locator(`block-craft-editor [data-block-id="${id}"] .edit-container`);
  await expect(target).toHaveAttribute('data-placeholder', '请填写内容');
  const before = await typography(target);
  expect(before.hint).toMatchObject({size: '45px', weight: '700', italic: 'italic', spacing: '4.5px', decoration: 'underline'});
  expect(before.hint.family).toContain('serif');
  expect(await target.evaluate(el => getComputedStyle(el, '::before').color)).not.toBe('rgb(255, 0, 0)');

  await page.evaluate(id => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc;
    doc.crud.updateBlockProps(id, {textDefaults: {'s:fontSize': '20px', 's:fontFamily': 'monospace', 's:fontWeight': '500'}});
    doc.crud.undoManager.stopCapturing();
  }, id);
  await expect.poll(async () => (await typography(target)).hint.size).toBe('20px');
  const changed = await typography(target);
  expect(changed.hint).toEqual(changed.gap);
  expect(changed.hint.weight).toBe('500');
  expect(changed.hint.italic).toBe('normal');

  await page.evaluate(id => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc;
    doc.crud.updateBlockProps(id, {textDefaults: undefined});
    doc.crud.undoManager.stopCapturing();
  }, id);
  const cleared = await typography(target);
  expect(cleared.hint).toEqual(cleared.gap);
  expect(cleared.hint.size).not.toBe(changed.hint.size);
  await page.evaluate(() => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.crud.undoManager.undo());
  await expect.poll(async () => (await typography(target)).hint).toEqual(changed.hint);

  await target.dispatchEvent('compositionstart', {data: ''});
  const host = page.locator(`block-craft-editor [data-block-id="${id}"]`);
  await expect(target).not.toHaveAttribute('data-placeholder');
  await host.dispatchEvent('compositionend', {data: ''});
  await expect(target).toHaveAttribute('data-placeholder', '请填写内容');
  await page.keyboard.insertText('输入');
  await expect(target).not.toHaveAttribute('data-placeholder');
  await expect(host.locator('c-text')).toHaveText('输入');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(target).toHaveAttribute('data-placeholder', '请填写内容');
  expect((await typography(target)).hint).toEqual(changed.hint);
  expect(await host.evaluate(el => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc;
    return doc.model.getTextLength(el.getAttribute('data-block-id'));
  })).toBe(0);
});

test('long hints fit nested paragraph and list content, resize, and match snapshot typography', async ({page}, testInfo) => {
  await start(page);
  const fixture = await page.evaluate(async () => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc;
    const region = doc.schemas.createSnapshot('render-unit', [{}, {width: 360}]);
    const blocks = ['paragraph', 'bullet', 'ordered', 'todo', 'blockquote'].map(flavour => {
      const block = doc.schemas.createSnapshot(flavour, [[], {textDefaults: {'t:ff': 'mono', 't:px': 22}}]);
      block.meta = {...block.meta, plh: '这是应当限制在所属块内容宽度内的长提示'.repeat(8), plhMode: 'always'};
      return block;
    });
    region.children = blocks;
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [region]);
    await doc.navigateToBlock(region.id);
    return {region: region.id as string, ids: blocks.map((block: any) => block.id) as string[]};
  });
  const liveFonts = [];
  for (const surface of ['block-craft-editor', 'bc-snapshot-viewer']) {
    if (surface === 'bc-snapshot-viewer') {
      await page.locator('playground-home').evaluate(el => (window as any).ng.getComponent(el).syncSnapshotViewerFromEditor());
    }
    for (const width of [360, 180]) {
      await page.locator(`${surface} [data-block-id="${fixture.region}"]`).evaluate((el: HTMLElement, width) => {
        el.style.width = `${width}px`;
        el.style.maxWidth = `${width}px`;
      }, width);
      for (const [index, id] of fixture.ids.entries()) {
        const host = page.locator(`${surface} [data-block-id="${id}"]`);
        const target = page.locator(`${surface} [data-block-id="${id}"].bc-placeholder-target, ${surface} [data-block-id="${id}"] .bc-placeholder-target`);
        await expect(target).toBeAttached();
        const bounds = await host.evaluate(el => {
          const target = el.matches('.bc-placeholder-target') ? el : el.querySelector('.bc-placeholder-target')!;
          const style = getComputedStyle(target, '::before');
          return {width: target.getBoundingClientRect().width, hostWidth: el.getBoundingClientRect().width,
            hintWidth: parseFloat(style.width), clientWidth: target.clientWidth, scrollWidth: target.scrollWidth,
            overflow: style.overflowX, ellipsis: style.textOverflow, content: style.content};
        });
        expect(bounds.width).toBeGreaterThan(50);
        expect(bounds.width).toBeLessThanOrEqual(bounds.hostWidth + 1);
        expect(bounds.hintWidth).toBeLessThanOrEqual(bounds.clientWidth + 1);
        expect(bounds.scrollWidth).toBeLessThanOrEqual(bounds.clientWidth + 1);
        expect(bounds.overflow).toBe('hidden');
        expect(bounds.ellipsis).toBe('ellipsis');
        // Firefox preserves attr() in computed content; the other engines resolve it.
        expect(bounds.content).not.toBe('none');
        await expect(target).toHaveAttribute('data-placeholder', /长提示/);
        const fonts = await typography(target);
        if (surface === 'block-craft-editor') {
          expect(fonts.hint.size).toBe('22px');
          expect(fonts.hint.family).toContain('monospace');
          liveFonts[index] = fonts.hint;
        } else expect(fonts.hint).toEqual(liveFonts[index]);
      }
    }
    await page.locator(`${surface} [data-block-id="${fixture.region}"]`).screenshot({path: testInfo.outputPath(`${surface}-placeholders.png`)});
  }
});

test('unformatted headings inherit size and filled lists keep their original sizing', async ({page}) => {
  await start(page);
  const ids = await page.evaluate(async () => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc;
    const heading = doc.schemas.createSnapshot('paragraph', [[], {heading: 1}]);
    heading.meta = {...heading.meta, plh: '标题', plhMode: 'always'};
    const list = doc.schemas.createSnapshot('bullet', ['原有文字']);
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [heading, list]);
    await doc.navigateToBlock(heading.id);
    return [heading.id, list.id] as string[];
  });
  const heading = page.locator(`block-craft-editor [data-block-id="${ids[0]}"] .bc-placeholder-target`);
  await expect(heading).toHaveAttribute('data-placeholder', '标题');
  const fonts = await typography(heading);
  expect(fonts.hint).toEqual(fonts.gap);
  expect(parseFloat(fonts.hint.size)).toBeGreaterThan(20);
  const list = page.locator(`block-craft-editor [data-block-id="${ids[1]}"] .edit-container`);
  await expect(list).toHaveCSS('flex-grow', '0');
  await list.click();
  await page.keyboard.press('End');
  await page.keyboard.insertText('追加');
  await expect.poll(async () => (await list.locator('c-text').allTextContents()).join('')).toBe('原有文字追加');
  await expect(list).toHaveCSS('flex-grow', '0');
});

test('template inspector hints remain visible after saving and opening the use page', async ({page}, testInfo) => {
  await page.goto('/template');
  await page.waitForFunction(() => (window as any).ng?.getComponent(document.querySelector('template-edit-surface'))?.doc?.isInitialized);
  const target = page.locator('template-edit-surface .paragraph-block .edit-container').first();
  await target.click();
  const text = '这是模板页设置的长提示'.repeat(15);
  await page.getByRole('textbox', {name: '常驻提示文字'}).fill(text);
  await page.getByRole('checkbox', {name: '始终显示'}).check();

  const check = async (target: Locator) => {
    await expect(target).toHaveAttribute('data-placeholder', text);
    const layout = await target.evaluate(element => {
      const style = getComputedStyle(element, '::before');
      return {height: parseFloat(style.height), marginBottom: parseFloat(style.marginBottom),
        width: parseFloat(style.width), available: element.clientWidth, overflow: style.overflowX};
    });
    expect(layout.height).toBeGreaterThan(10);
    expect(layout.height + layout.marginBottom).toBeCloseTo(0, 1);
    expect(layout.width).toBeLessThanOrEqual(layout.available + 1);
    expect(layout.overflow).toBe('hidden');
  };
  await check(target);
  await page.locator('template-edit-surface .paragraph-block').first().screenshot({path: testInfo.outputPath('template-hint.png')});
  // The explicit navigation flushes the template store before opening the use surface.
  await page.getByRole('button', {name: '使用模版', exact: true}).click();
  await page.waitForFunction(() => (window as any).ng?.getComponent(document.querySelector('template-use-surface'))?.doc?.isInitialized);
  await check(page.locator('template-use-surface .paragraph-block .edit-container').first());
  await page.reload();
  await check(page.locator('template-use-surface .paragraph-block .edit-container').first());
});

for (const side of ['left', 'right']) {
  test(`template placeholder beside a ${side} floating logo keeps the caret and paragraph layout`, async ({page}, testInfo) => {
    await page.goto('/template');
    await page.waitForFunction(() => (window as any).ng?.getComponent(document.querySelector('template-edit-surface'))?.doc?.isInitialized);
    const fixture = await page.evaluate(side => {
      const doc = (window as any).ng.getComponent(document.querySelector('template-edit-surface')).doc;
      const canvas = document.createElement('canvas');
      canvas.width = 180; canvas.height = 160;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#dbeafe'; ctx.fillRect(0, 0, 180, 160);
      const image = doc.schemas.createSnapshot('logo', []);
      image.props = {...image.props, src: canvas.toDataURL(), wr: 25, ar: 180 / 160, float: side};
      const paragraph = doc.schemas.createSnapshot('paragraph', []);
      paragraph.meta = {...paragraph.meta, plh: '请输入内容', plhMode: 'always'};
      const following = doc.schemas.createSnapshot('paragraph', ['后续段落']);
      doc.crud.insertBlockSnapshots(doc.rootId, 0, [image, paragraph, following]);
      doc.selection.setCursorAt(doc.getBlockById(paragraph.id), 0);
      return {image: image.id as string, paragraph: paragraph.id as string, following: following.id as string};
    }, side);
    const target = page.locator(`template-edit-surface [data-block-id="${fixture.paragraph}"] .bc-placeholder-target`);
    await expect(target).toHaveAttribute('data-placeholder', '请输入内容');
    const layout = await target.evaluate((element, fixture) => {
      const caret = () => {
        const gap = element.querySelector('[data-zero-space]')!;
        const range = document.createRange(); range.selectNodeContents(gap);
        const rect = range.getBoundingClientRect();
        return {x: rect.x, y: rect.y};
      };
      const following = document.querySelector(`[data-block-id="${fixture.following}"]`)!;
      const image = document.querySelector(`[data-block-id="${fixture.image}"]`)!;
      const imageRect = image.getBoundingClientRect();
      const sample = () => ({caret: caret(), height: element.getBoundingClientRect().height, nextY: following.getBoundingClientRect().y});
      const visible = sample();
      const style = getComputedStyle(element, '::before');
      const hintHeight = parseFloat(style.height);
      element.classList.remove('bc-placeholder-target');
      const hidden = sample();
      element.classList.add('bc-placeholder-target');
      return {visible, hidden, hintHeight, float: getComputedStyle(image).float,
        image: {left: imageRect.left, right: imageRect.right, bottom: imageRect.bottom}};
    }, fixture);
    expect(layout.hintHeight).toBeGreaterThan(10);
    expect(layout.visible).toEqual(layout.hidden);
    expect(layout.float).toBe(side);
    expect(layout.visible.caret.y).toBeLessThan(layout.image.bottom);
    if (side === 'left') expect(layout.visible.caret.x).toBeGreaterThanOrEqual(layout.image.right - 1);
    else expect(layout.visible.caret.x).toBeLessThan(layout.image.left);
    await page.locator('template-edit-surface .editor-container').screenshot({path: testInfo.outputPath(`template-${side}-float-hint.png`)});
  });
}
