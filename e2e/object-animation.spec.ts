import {expect, test, type Page} from '@playwright/test';

async function setup(page: Page, main = false) {
  await page.routeWebSocket('**', socket => socket.close());
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return ['http:', 'https:'].includes(url.protocol) && !['localhost', '127.0.0.1'].includes(url.hostname)
      ? route.abort() : route.continue();
  });
  await page.goto('/');
  await page.getByRole('button', {name: '初始化', exact: true}).click();
  await page.waitForFunction(() => (window as any).ng?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized);
  const id = await page.evaluate(main => {
    const source = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc;
    let doc = source;
    if (!main) {
      const viewport = document.createElement('div');
      viewport.id = 'animation-fixture';
      viewport.style.cssText = 'position:fixed;left:40px;top:40px;width:800px;height:400px;overflow:auto;background:white;z-index:99999';
      const mount = document.createElement('div');
      viewport.append(mount);
      // Give the fixture a stable scroll extent in all engines, including when
      // the absolute object's virtual view is unmounted.
      const spacer = document.createElement('div'); spacer.style.height = '2200px';
      viewport.append(spacer); document.body.append(viewport);
      doc = new source.constructor({...source.config, yDoc: new source.yDoc.constructor(), plugins: [], scrollContainer: viewport,
        readonly: false, virtualization: {enabled: true}});
      doc.initBySnapshot({...source.model.toSnapshot(source.rootId), props: {}, children: []}, mount);
    } else doc.crud.deleteBlocks(doc.rootId, 0, doc.root.childrenLength);
    (window as any).__animationDoc = doc;
    const snapshot = doc.schemas.createSnapshot('shape', ['rect']);
    snapshot.props = {...snapshot.props, width: 160, height: 80, rotation: 20};
    const id = doc.placement.insertAbsoluteSnapshot(snapshot, {anchorRect: null});
    doc.crud.updateBlockProps(id, {position: '50 50'});

    return id as string;
  }, main);
  await expect(block(page, id)).toBeVisible();
  if (main) await page.evaluate(id => {
    const doc = (window as any).__animationDoc;
    doc.selection.selectBlock(doc.getBlockById(id));
  }, id);
  return id;
}
const run = <T>(page: Page, fn: (doc: any) => T) => page.evaluate(fn => {
  return (0, eval)(`(${fn})`)((window as any).__animationDoc);
}, fn.toString()) as Promise<T>;
const block = (page: Page, id: string) => page.locator(`[data-block-id="${id}"]`).last();
const active = (page: Page, id: string) => block(page, id).evaluate(el => el.getAnimations().filter(a => 'animationName' in a).length);

// The serialized value is browser CSS, with no parallel duration/effect props.
test('draft settings auto preview, confirm saves once, closing discards and undo restores CSS', async ({page}, testInfo) => {
  const id = await setup(page, true);
  const panel = page.getByRole('dialog', {name: '块动画设置'});
  const saved = () => page.evaluate(id => (window as any).__animationDoc.model.getProps(id).animation ?? null, id);
  const undoCount = () => run(page, doc => doc.crud.undoManager['_yUndoManager'].undoStack.length);
  const open = async () => {
    await page.evaluate(id => {
      const doc = (window as any).__animationDoc; doc.selection.selectBlock(doc.getBlockById(id));
    }, id);
    await page.locator('bc-object-format-toolbar').getByRole('button', {name: '动画', exact: true}).click();
    await expect(panel).toBeVisible();
  };
  await open();
  await expect(panel.getByRole('button', {name: '停止', exact: true})).toHaveCount(0);
  const history = await undoCount();
  await panel.getByRole('button', {name: '淡入', exact: true}).click();
  await panel.locator('cs-input-number[aria-label="动画时长"] input').fill('2');
  await panel.locator('cs-input-number[aria-label="动画时长"] input').press('Tab');
  await expect.poll(() => active(page, id)).toBe(1);
  expect(await saved()).toBeNull();
  expect(await undoCount()).toBe(history);
  await page.screenshot({path: testInfo.outputPath('animation-sidebar-draft.png')});
  await panel.getByRole('button', {name: '关闭动画设置'}).click();
  await expect.poll(() => active(page, id)).toBe(0);
  expect(await saved()).toBeNull();

  await open();
  await expect(panel.getByRole('button', {name: '无', exact: true})).toHaveAttribute('aria-pressed', 'true');
  await panel.getByRole('button', {name: '淡入', exact: true}).click();
  await panel.locator('cs-input-number[aria-label="动画时长"] input').fill('2');
  await panel.locator('cs-input-number[aria-label="动画时长"] input').press('Tab');
  await panel.getByRole('button', {name: '确定', exact: true}).click();
  await expect(panel).toHaveCount(0);
  expect(await saved()).toBe('bc-fade-in 2000ms ease-out 0ms 1 normal both');
  expect(await undoCount()).toBe(history + 1);
  await expect.poll(() => active(page, id)).toBe(1);
  await run(page, doc => doc.crud.undoManager.undo());
  expect(await saved()).toBeNull();
  await run(page, doc => doc.crud.undoManager.redo());
  expect(await saved()).toContain('2000ms');

  await open();
  await panel.getByRole('button', {name: '无', exact: true}).click();
  expect(await saved()).toContain('bc-fade-in');
  await panel.getByRole('button', {name: '确定', exact: true}).click();
  expect(await saved()).toBeNull();
});

test('repeat dropdown remembers count and category browsing preserves the draft', async ({page}, testInfo) => {
  const id = await setup(page, true);
  const rail = page.locator('bc-object-format-toolbar');
  await rail.getByRole('button', {name: '动画', exact: true}).click();
  const panel = page.getByRole('dialog', {name: '块动画设置'});
  await panel.getByRole('button', {name: '强调', exact: true}).click();
  await panel.getByRole('button', {name: '呼吸', exact: true}).click();
  const count = panel.locator('cs-input-number[aria-label="播放次数"] input');
  const repeat = async (label: string) => {
    await panel.locator('cs-select[aria-label="动画重复"]').click();
    await page.getByRole('option', {name: label, exact: true}).click();
  };
  await expect(count).toHaveCount(0);
  await repeat('指定次数');
  await expect(count).toHaveValue('2');
  await count.fill('3'); await count.press('Tab');
  await repeat('持续循环');
  await expect(count).toHaveCount(0);
  await expect.poll(() => block(page, id).evaluate(el => el.getAnimations()[0]?.effect?.getTiming().iterations)).toBe(2);
  await repeat('单次');
  await expect(count).toHaveCount(0);
  await repeat('指定次数');
  await expect(count).toHaveValue('3');
  await panel.getByRole('button', {name: '进入', exact: true}).click();
  await panel.getByRole('button', {name: '强调', exact: true}).click();
  await expect(panel.getByRole('button', {name: '呼吸', exact: true})).toHaveAttribute('aria-pressed', 'true');
  await repeat('持续循环');
  await page.screenshot({path: testInfo.outputPath('animation-loop-draft.png')});
  await rail.getByRole('button', {name: '布局与排列', exact: true}).click();
  await expect(panel).toHaveCount(0);
  await page.waitForTimeout(250);
  expect(await active(page, id)).toBe(0);
  expect(await page.evaluate(id => (window as any).__animationDoc.model.getProps(id).animation ?? null, id)).toBeNull();
  await rail.getByRole('button', {name: '动画', exact: true}).click();
  await expect(panel.getByRole('button', {name: '无', exact: true})).toHaveAttribute('aria-pressed', 'true');
});

test('reading plays on visibility, finite animation does not replay after virtual remount', async ({page}) => {
  const id = await setup(page);
  await run(page, doc => {
    const id = doc.placement.getAbsoluteBlockIds()[0];
    doc.objectAnimation.update([id], 'bc-fade-in 2s ease-out 0s 1 normal both');
    doc.crud.updateBlockProps(id, {position: '50 1600'});
    doc.toggleReadonly(true);
  });
  await page.waitForTimeout(150);
  expect(await page.locator('[data-bc-animating]').count()).toBe(0);
  await page.locator('#animation-fixture').evaluate(el => { el.scrollTop = 1500; });
  await expect(block(page, id)).toBeVisible();
  await expect.poll(() => active(page, id)).toBe(1);
  await expect.poll(() => active(page, id), {timeout: 4000}).toBe(0);
  await page.locator('#animation-fixture').evaluate(el => { el.scrollTop = 0; });
  await expect(block(page, id)).toHaveCount(0);
  await page.locator('#animation-fixture').evaluate(el => { el.scrollTop = 1500; });
  await expect(block(page, id)).toBeVisible();
  expect(await active(page, id)).toBe(0);
});

test('loops stop outside viewport, reduced motion and print stay static', async ({page}) => {
  const id = await setup(page);
  await run(page, doc => {
    const id = doc.placement.getAbsoluteBlockIds()[0];
    doc.objectAnimation.update([id], 'bc-pulse 1s ease-in-out 0s infinite normal both');
    const end = doc.schemas.createSnapshot('shape', ['rect']);
    const endId = doc.placement.insertAbsoluteSnapshot(end, {anchorRect: null});
    doc.crud.updateBlockProps(endId, {position: '50 1800'});
    doc.toggleReadonly(true);
  });
  await expect.poll(() => active(page, id)).toBe(1);
  await page.emulateMedia({reducedMotion: 'reduce'});
  await expect.poll(() => active(page, id)).toBe(0);
  await page.emulateMedia({reducedMotion: 'no-preference'});
  await expect.poll(() => active(page, id)).toBe(1);
  await page.emulateMedia({media: 'print'});
  await expect.poll(() => active(page, id)).toBe(0);
  await page.emulateMedia({media: 'screen'});
  await expect.poll(() => active(page, id)).toBe(1);
  await page.locator('#animation-fixture').evaluate(el => { el.scrollTop = 1700; });
  await expect(block(page, id)).toHaveCount(0);
  expect(await page.locator('[data-bc-animating]').count()).toBe(0);
  await page.locator('#animation-fixture').evaluate(el => { el.scrollTop = 0; });
  await expect.poll(() => active(page, id)).toBe(1);
});

test('preview interruption preserves rotation, geometry and CSS; save/reopen replays in reader', async ({page}) => {
  const id = await setup(page);
  const before = await run(page, doc => doc.model.getProps(doc.placement.getAbsoluteBlockIds()[0]));
  await run(page, doc => {
    const id = doc.placement.getAbsoluteBlockIds()[0];
    doc.objectAnimation.update([id], 'bc-swing 2s ease-in-out 0s infinite normal both');
    doc.objectAnimation.preview([id]);
  });
  await expect.poll(() => active(page, id)).toBe(1);
  const visual = await block(page, id).evaluate(el => {
    const animation = el.getAnimations()[0];
    animation.pause(); animation.currentTime = 1000;
    return {rotate: getComputedStyle(el).rotate, transform: getComputedStyle(el.querySelector('.shape-block__shell')!).transform};
  });
  expect(parseFloat(visual.rotate)).toBeCloseTo(3);
  expect(visual.transform).not.toBe('none');
  await block(page, id).dispatchEvent('pointerdown', {button: 0});
  await expect.poll(() => active(page, id)).toBe(0);
  const after = await run(page, doc => doc.model.getProps(doc.placement.getAbsoluteBlockIds()[0]));
  expect({...after, animation: undefined}).toEqual({...before, animation: undefined});
  expect(await block(page, id).evaluate(el => (el as HTMLElement).style.animation)).toBe('');
  await run(page, doc => {
    const snapshot = doc.model.toSnapshot(doc.rootId);
    const config = {...doc.config, yDoc: new doc.yDoc.constructor(), readonly: true};
    const viewport = document.getElementById('animation-fixture')!;
    doc.destroy(); viewport.replaceChildren();
    const mount = document.createElement('div'); viewport.append(mount);
    const reopened = new doc.constructor(config);
    reopened.initBySnapshot(snapshot, mount);
    (window as any).__animationDoc = reopened;
  });
  await expect.poll(() => active(page, id)).toBe(1);
});


test('snapshot reader plays and keeps loop animation after incremental updates', async ({page}) => {
  const id = await setup(page, true);
  await run(page, doc => doc.objectAnimation.update([doc.placement.getAbsoluteBlockIds()[0]], 'bc-pulse 1s ease-in-out 0s infinite normal both'));
  await page.getByRole('tab', {name: 'Snapshot Viewer', exact: true}).click();
  const viewerBlock = page.locator(`bc-snapshot-viewer [data-block-id="${id}"]`);
  await viewerBlock.evaluate(el => el.scrollIntoView({block: 'nearest'}));
  await expect.poll(() => viewerBlock.evaluate(el => el.getAnimations().length)).toBe(1);
  await page.locator('bc-snapshot-viewer').evaluate(viewer => {
    const component = (window as any).ng.getComponent(viewer);
    const doc = (window as any).__animationDoc;
    const id = doc.placement.getAbsoluteBlockIds()[0];
    doc.crud.updateBlockProps(id, {rotation: 35});
    component.renderer.update(doc.model.toSnapshot(doc.rootId));
  });
  await expect.poll(() => viewerBlock.evaluate(el => el.getAnimations().length)).toBe(1);
});

test('all built-in floatable families share settings; unsupported blocks and readonly writes are rejected', async ({page}) => {
  await setup(page);
  const result = await run(page, doc => {
    const fixtures = [
      ['image', [{src: '', wr: 20, ar: 2}]], ['sticker', ['sunburst']], ['shape', ['rect']],
      ['text-box', []], ['word-art', []], ['date-card', []], ['weather', []], ['person-card', []],
    ];
    const ids = fixtures.map(([flavour, args]) => {
      const snapshot = doc.schemas.createSnapshot(flavour, args);
      return doc.placement.insertAbsoluteSnapshot(snapshot, {anchorRect: null});
    });
    const applied = doc.objectAnimation.update(ids, 'bc-fade-in 1s ease-out');
    const values = ids.map(id => doc.model.getProps(id).animation);
    doc.crud.undoManager.undo();
    const undo = ids.every(id => !doc.model.getProps(id).animation);
    doc.crud.undoManager.redo();
    const redo = ids.every(id => !!doc.model.getProps(id).animation);
    const paragraph = doc.schemas.createSnapshot('paragraph', ['正文']);
    doc.crud.insertBlocks(doc.rootId, 0, [paragraph]);
    const unsupported = doc.objectAnimation.update([paragraph.id], 'bc-pulse 1s');
    doc.toggleReadonly(true);
    const readonly = doc.objectAnimation.update(ids, null);
    return {applied, values, undo, redo, unsupported, readonly};
  });
  expect(result).toEqual({applied: true, values: Array(8).fill('bc-fade-in 1000ms ease-out 0ms 1 normal none'), undo: true, redo: true, unsupported: false, readonly: false});
});

test('animation tab switches with existing format tabs and non-format objects share a side rail', async ({page}) => {
  await setup(page, true);
  const rail = page.locator('bc-object-format-toolbar');
  await expect(rail.locator('.bc_donghua')).toBeVisible();
  await rail.getByRole('button', {name: '动画', exact: true}).click();
  await expect(page.getByRole('dialog', {name: '块动画设置'})).toBeVisible();
  await rail.getByRole('button', {name: '布局与排列', exact: true}).click();
  await expect(page.getByRole('dialog', {name: '块动画设置'})).toHaveCount(0);
  for (const flavour of ['image', 'sticker', 'date-card', 'weather', 'person-card']) {
    const id = await page.evaluate(flavour => {
      const doc = (window as any).__animationDoc;
      const args = flavour === 'image' ? [{src: '', wr: 20, ar: 2}] : flavour === 'sticker' ? ['sunburst'] : [];
      const snapshot = doc.schemas.createSnapshot(flavour, args);
      const id = doc.placement.insertAbsoluteSnapshot(snapshot, {anchorRect: null});
      doc.crud.updateBlockProps(id, {position: '50 50'});
      return id;
    }, flavour);
    await expect(block(page, id)).toBeVisible();
    await page.evaluate(id => {
      const doc = (window as any).__animationDoc; doc.selection.selectBlock(doc.getBlockById(id));
    }, id);
    const sideRail = page.locator('bc-object-animation-toolbar');
    await expect(sideRail.locator('.bc_donghua')).toBeVisible();
    await sideRail.getByRole('button', {name: '动画', exact: true}).click();
    const panel = page.getByRole('dialog', {name: '块动画设置'});
    await panel.getByRole('button', {name: '淡入', exact: true}).click();
    await panel.getByRole('button', {name: '确定', exact: true}).click();
    expect(await page.evaluate(id => (window as any).__animationDoc.model.getProps(id).animation, id)).toContain('bc-fade-in');
  }
});

test('group animation has a side tab and closing editor panels does not cancel reader playback', async ({page}) => {
  await setup(page, true);
  const id = await run(page, doc => {
    const first = doc.placement.getAbsoluteBlockIds()[0];
    const second = doc.placement.insertAbsoluteSnapshot(doc.schemas.createSnapshot('shape', ['rect']), {anchorRect: null});
    doc.crud.updateBlockProps(second, {position: '250 50'});
    return doc.placement.group([first, second]);
  }) as string;
  await expect(block(page, id)).toBeVisible();
  await page.evaluate(id => {
    const doc = (window as any).__animationDoc; doc.selection.selectBlock(doc.getBlockById(id));
  }, id);
  const tab = page.locator('bc-object-animation-toolbar').getByRole('button', {name: '动画', exact: true});
  await tab.click();
  const panel = page.getByRole('dialog', {name: '块动画设置'});
  await panel.getByRole('button', {name: '强调', exact: true}).click();
  await panel.getByRole('button', {name: '呼吸', exact: true}).click();
  await panel.getByRole('button', {name: '预览', exact: true}).click();
  await expect.poll(() => active(page, id)).toBe(1);
  await run(page, doc => {
    doc.objectAnimation.update(doc.placement.getAbsoluteBlockIds(), 'bc-pulse 1s ease-in-out 0s infinite normal both');
    doc.toggleReadonly(true);
  });
  await expect(panel).toHaveCount(0);
  await expect.poll(() => active(page, id)).toBe(1);
});


test('all presets have playable CSS keyframes and restore authored appearance without changing the model', async ({page}) => {
  const id = await setup(page);
  const result = await page.evaluate(id => {
    const doc = (window as any).__animationDoc;
    const host = document.querySelector(`#animation-fixture [data-block-id="${id}"]`) as HTMLElement;
    const effects = ['fade', 'slide', 'zoom', 'bounce', 'flip', 'rotate', 'roll', 'drop',
      'pulse', 'swing', 'heartbeat', 'shake', 'hop', 'float', 'wobble', 'spin'];
    const before = JSON.stringify(doc.model.getProps(id));
    const baseline = {rotate: getComputedStyle(host).rotate, scale: getComputedStyle(host).scale,
      translate: getComputedStyle(host).translate, opacity: getComputedStyle(host).opacity};
    return effects.map(effect => {
      doc.objectAnimation.preview([id], {effect, duration: 2000});
      const animation = host.getAnimations()[0] as CSSAnimation | undefined;
      if (!animation) return {effect, valid: false};
      animation.pause(); animation.currentTime = 600;
      const frames = (animation.effect as KeyframeEffect).getKeyframes();
      const visual = getComputedStyle(host);
      const changed = ['rotate', 'scale', 'translate', 'opacity'].some(key => visual[key as any] !== baseline[key as keyof typeof baseline]);
      const valid = frames.length >= 2 && changed && !!animation.animationName;
      doc.objectAnimation.stop();
      const restored = getComputedStyle(host);
      return {effect, valid, restored: Object.entries(baseline).every(([key, value]) => restored[key as any] === value),
        unchanged: JSON.stringify(doc.model.getProps(id)) === before};
    });
  }, id);
  for (const preset of result) expect(preset, preset.effect).toMatchObject({valid: true, restored: true, unchanged: true});
});


test('new entrance and emphasis presets confirm and reopen in the saved category', async ({page}) => {
  const id = await setup(page, true);
  const panel = page.getByRole('dialog', {name: '块动画设置'});
  const open = async () => {
    await page.evaluate(id => {
      const doc = (window as any).__animationDoc; doc.selection.selectBlock(doc.getBlockById(id));
    }, id);
    await page.locator('bc-object-format-toolbar').getByRole('button', {name: '动画', exact: true}).click();
  };
  await open();
  await expect(panel.getByRole('group', {name: '动画效果'}).getByRole('button')).toHaveCount(9);
  await panel.getByRole('button', {name: '翻入', exact: true}).click();
  await panel.getByRole('button', {name: '确定', exact: true}).click();
  expect(await page.evaluate(id => (window as any).__animationDoc.model.getProps(id).animation, id)).toContain('bc-flip-in');
  await open();
  await expect(panel.getByRole('button', {name: '翻入', exact: true})).toHaveAttribute('aria-pressed', 'true');
  await panel.getByRole('button', {name: '强调', exact: true}).click();
  await expect(panel.getByRole('group', {name: '动画效果'}).getByRole('button')).toHaveCount(9);
  await panel.getByRole('button', {name: '心跳', exact: true}).click();
  await panel.locator('cs-select[aria-label="动画重复"]').click();
  await page.getByRole('option', {name: '指定次数', exact: true}).click();
  await panel.getByRole('button', {name: '确定', exact: true}).click();
  expect(await page.evaluate(id => (window as any).__animationDoc.model.getProps(id).animation, id)).toBe('bc-heartbeat 600ms ease-out 0ms 2 normal both');
  await open();
  await expect(panel.getByRole('button', {name: '强调', exact: true})).toHaveAttribute('aria-pressed', 'true');
  await expect(panel.getByRole('button', {name: '心跳', exact: true})).toHaveAttribute('aria-pressed', 'true');
  await expect(panel.locator('cs-input-number[aria-label="播放次数"] input')).toHaveValue('2');
});


test('confirm keeps infinite editor playback; selection pauses only edited objects and blur resumes', async ({page}) => {
  const id = await setup(page, true);
  const panel = page.getByRole('dialog', {name: '块动画设置'});
  await page.locator('bc-object-format-toolbar').getByRole('button', {name: '动画', exact: true}).click();
  await panel.getByRole('button', {name: '强调', exact: true}).click();
  await panel.getByRole('button', {name: '呼吸', exact: true}).click();
  await panel.locator('cs-select[aria-label="动画重复"]').click();
  await page.getByRole('option', {name: '持续循环', exact: true}).click();
  await panel.getByRole('button', {name: '确定', exact: true}).click();
  await expect(panel).toHaveCount(0);
  await expect.poll(() => active(page, id)).toBe(1);
  expect(await block(page, id).evaluate(el => el.getAnimations()[0].effect!.getTiming().iterations)).toBe(Infinity);
  expect(await run(page, doc => doc.selection.value)).toBeNull();
  await page.waitForTimeout(1500); // Beyond the two-iteration draft preview limit.
  expect(await active(page, id)).toBe(1);
  const other = await run(page, doc => {
    const second = doc.placement.insertAbsoluteSnapshot(doc.schemas.createSnapshot('shape', ['rect']), {anchorRect: null});
    doc.crud.updateBlockProps(second, {position: '250 50'});
    doc.objectAnimation.update([second], {effect: 'swing', iterations: 'infinite', duration: 2000});
    return second;
  }) as string;
  await expect.poll(() => active(page, other)).toBe(1);
  // Native pointer capture suspends before selection/drag computes geometry.
  const rect = await block(page, id).boundingBox();
  await page.mouse.click(rect!.x + rect!.width / 2, rect!.y + rect!.height / 2);
  await expect.poll(() => active(page, id)).toBe(0);
  expect(await active(page, other)).toBe(1);
  expect(await block(page, id).evaluate(el => getComputedStyle(el).scale)).toBe('none');
  const beforeDrag = await block(page, id).boundingBox();
  await page.mouse.move(beforeDrag!.x + beforeDrag!.width / 2, beforeDrag!.y + beforeDrag!.height / 2);
  await page.mouse.down();
  await page.mouse.move(beforeDrag!.x + beforeDrag!.width / 2 + 40, beforeDrag!.y + beforeDrag!.height / 2 + 20, {steps: 5});
  expect(await active(page, id)).toBe(0);
  await page.mouse.up();
  // Drag completion clears the editor selection by design, so the saved loop resumes.
  expect(await page.evaluate(id => (window as any).__animationDoc.model.getProps(id).position, id)).toBe('90 70');
  await expect.poll(() => active(page, id)).toBe(1);
  await page.evaluate(id => {
    const doc = (window as any).__animationDoc; doc.selection.selectBlock(doc.getBlockById(id));
  }, id);
  await expect.poll(() => active(page, id)).toBe(0);
  const afterDrag = await block(page, id).boundingBox();
  expect(afterDrag!.x - beforeDrag!.x).toBeCloseTo(40, 0);
  expect(afterDrag!.y - beforeDrag!.y).toBeCloseTo(20, 0);
  const saved = await page.evaluate(id => (window as any).__animationDoc.model.getProps(id).animation, id);
  // Native form focus clears model selection, but the open toolbar still pauses its object.
  await page.locator('bc-object-format-toolbar').getByRole('button', {name: '动画', exact: true}).click();
  await panel.locator('cs-select[aria-label="动画重复"]').click();
  await page.getByRole('option', {name: '持续循环', exact: true}).click();
  await panel.getByRole('button', {name: '关闭动画设置'}).click();
  await page.evaluate(other => {
    const doc = (window as any).__animationDoc; doc.selection.selectBlock(doc.getBlockById(other));
  }, other);
  await expect.poll(() => active(page, id)).toBe(1);
  await expect.poll(() => active(page, other)).toBe(0);
  expect(await page.evaluate(id => (window as any).__animationDoc.model.getProps(id).animation, id)).toBe(saved);
  await run(page, doc => doc.selection.blur());
  await expect.poll(() => active(page, other)).toBe(1);
});

test('editor finite playback resumes its progress and selecting group descendants pauses the group', async ({page}) => {
  const id = await setup(page);
  await run(page, doc => doc.objectAnimation.update(doc.placement.getAbsoluteBlockIds(), {effect: 'spin', duration: 4000}));
  await expect.poll(() => active(page, id)).toBe(1);
  await block(page, id).evaluate(el => { el.getAnimations()[0].currentTime = 1200; });
  await page.evaluate(id => { const doc = (window as any).__animationDoc; doc.selection.selectBlock(doc.getBlockById(id)); }, id);
  await expect.poll(() => active(page, id)).toBe(0);
  expect(await block(page, id).evaluate(el => getComputedStyle(el).rotate)).toBe('none');
  await run(page, doc => doc.selection.blur());
  await expect.poll(() => active(page, id)).toBe(1);
  const time = await block(page, id).evaluate(el => Number(el.getAnimations()[0].currentTime));
  expect(time).toBeGreaterThanOrEqual(1200);
  expect(time).toBeLessThan(2500);
  const group = await run(page, doc => {
    const first = doc.placement.getAbsoluteBlockIds()[0];
    const second = doc.placement.insertAbsoluteSnapshot(doc.schemas.createSnapshot('shape', ['rect']), {anchorRect: null});
    doc.crud.updateBlockProps(second, {position: '250 50'});
    const group = doc.placement.group([first, second]);
    doc.selection.blur();
    doc.objectAnimation.update([group], {effect: 'pulse', iterations: 'infinite'});
    return group;
  }) as string;
  await expect.poll(() => active(page, group)).toBe(1);
  await page.evaluate(id => { const doc = (window as any).__animationDoc; doc.selection.selectBlock(doc.getBlockById(id)); }, id);
  await expect.poll(() => active(page, group)).toBe(0);
  await run(page, doc => doc.selection.blur());
  await expect.poll(() => active(page, group)).toBe(1);
});


test('editing text inside an animated object pauses playback without changing animation props', async ({page}) => {
  await setup(page);
  const ids = await run(page, doc => {
    const id = doc.placement.insertAbsoluteSnapshot(doc.schemas.createSnapshot('text-box', []), {anchorRect: null});
    doc.crud.updateBlockProps(id, {position: '250 50'});
    doc.selection.blur();
    doc.objectAnimation.update([id], {effect: 'float', iterations: 'infinite'});
    return {id, text: doc.model.getChildrenIds(id)[0], animation: doc.model.getProps(id).animation};
  }) as {id: string; text: string; animation: string};
  await expect.poll(() => active(page, ids.id)).toBe(1);
  await page.evaluate(ids => {
    const doc = (window as any).__animationDoc; doc.selection.setCursorAt(doc.getBlockById(ids.text), 0);
  }, ids);
  await expect.poll(() => active(page, ids.id)).toBe(0);
  await run(page, doc => doc.selection.blur());
  await expect.poll(() => active(page, ids.id)).toBe(1);
  expect(await page.evaluate(id => (window as any).__animationDoc.model.getProps(id).animation, ids.id)).toBe(ids.animation);
});


test('external geometry updates cancel temporary preview and restore saved editor playback', async ({page}) => {
  const id = await setup(page);
  await run(page, doc => {
    const id = doc.placement.getAbsoluteBlockIds()[0];
    doc.objectAnimation.update([id], {effect: 'pulse', iterations: 'infinite'});
    doc.objectAnimation.preview([id], {effect: 'shake', duration: 4000});
  });
  await expect.poll(() => block(page, id).evaluate(el => (el.getAnimations()[0] as CSSAnimation)?.animationName)).toBe('bc-shake');
  await page.evaluate(id => (window as any).__animationDoc.crud.updateBlockProps(id, {position: '80 50'}), id);
  await expect.poll(() => block(page, id).evaluate(el => (el.getAnimations()[0] as CSSAnimation)?.animationName)).toBe('bc-pulse');
  expect(await page.evaluate(id => (window as any).__animationDoc.model.getProps(id).animation, id)).toContain('infinite');
});
