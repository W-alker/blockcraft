import {expect, test, type Page} from '@playwright/test';

const stacked = '我̵̠̬̖̪̱̗̗̝͉͔̲͚̪͔̭͕̭̖̳͖̘̗̭̓̆̅́͛̅̌̃̂̒͑̅́̐̌̅̎̑̆̂̅̂̄ͅ';
const sample = '昨天不是才1号喵，怎么今天就7号了喵？' + stacked + '会一直看着你们👁👁';
const ordinary = '普通 cafe\u0301 ไทย हिन्दी العربية 👨‍👩‍👧‍👦';

async function mount(page: Page, readonly = false, preserve = false) {
  await page.goto('/');
  await page.waitForFunction(() => (window as any).ng?.getComponent(document.querySelector('block-craft-editor'))?.doc);
  return page.evaluate(({readonly, ordinary, preserve}) => {
    const source = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc;
    const viewport = document.createElement('div');
    viewport.id = 'paste-marks-fixture';
    viewport.style.cssText = 'position:fixed;left:20px;top:20px;width:850px;height:550px;overflow:auto;background:white;z-index:99999;padding:24px';
    const target = document.createElement('div');
    viewport.append(target);
    document.body.append(viewport);
    const paragraph = source.schemas.createSnapshot('paragraph', [ordinary]);
    const snapshot = source.schemas.createSnapshot('root', ['paste-safety', [paragraph]]);
    const doc = new source.constructor({...source.config, docId: snapshot.id,
      yDoc: new source.yDoc.constructor(), plugins: [], readonly, scrollContainer: viewport,
      pasteTextPolicy: preserve ? 'preserve' : 'remove-stacked-marks',
      virtualization: {enabled: false}});
    doc.initBySnapshot(snapshot, target);
    doc.crud.undoManager.stopCapturing();
    doc.crud.undoManager.clearHistory();
    (window as any).pasteMarksFixture = {doc, id: paragraph.id};
    return paragraph.id;
  }, {readonly, ordinary, preserve});
}

async function paste(page: Page, formats: Record<string, string>) {
  return page.evaluate(async formats => {
    const {doc, id} = (window as any).pasteMarksFixture;
    const block = doc.getBlockById(id);
    block.hostElement.querySelector('.edit-container').focus();
    doc.selection.setCursorAt(block, block.textLength);
    const data = new DataTransfer();
    for (const [type, value] of Object.entries(formats)) data.setData(type, value);
    const event = new ClipboardEvent('paste', {bubbles: true, cancelable: true, clipboardData: data});
    Object.defineProperty(event, 'clipboardData', {value: data});
    const start = performance.now();
    block.hostElement.dispatchEvent(event);
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    return {prevented: event.defaultPrevented, twoFramesMs: performance.now() - start};
  }, formats);
}

async function state(page: Page) {
  return page.evaluate(() => {
    const {doc, id} = (window as any).pasteMarksFixture;
    const block = doc.getBlockById(id);
    const texts = Array.from(block.hostElement.querySelectorAll('c-text')) as HTMLElement[];
    return {model: block.textContent(), display: texts.map(node => node.textContent).join(''),
      deltas: block.textDeltas(), nodes: texts.length,
      cursor: doc.selection.value?.start.offset, snapshot: doc.exportSnapshot()};
  });
}

test('纯文本粘贴保存转化结果，光标、真实输入、撤销及快照重建保持一致', async ({page}) => {
  await mount(page);
  expect((await paste(page, {'text/plain': sample})).prevented).toBe(true);
  const safe = sample.replace(/\p{M}{9,}/gu, '');
  await expect.poll(async () => (await state(page)).model).toBe(ordinary + safe);
  const after = await state(page);
  expect(after.display).toBe(after.model);
  expect(after.cursor).toBe(after.model.length);
  expect(JSON.stringify(after.snapshot)).not.toContain('\u200c');

  await page.evaluate(() => (window as any).pasteMarksFixture.doc.crud.undoManager.stopCapturing());
  await page.keyboard.type('x');
  await expect.poll(async () => (await state(page)).model).toBe(ordinary + safe + 'x');
  await page.evaluate(() => {
    const {doc} = (window as any).pasteMarksFixture;
    doc.crud.undoManager.undo();
  });
  await expect.poll(async () => (await state(page)).model).toBe(ordinary + safe);
  await page.evaluate(() => (window as any).pasteMarksFixture.doc.crud.undoManager.undo());
  await expect.poll(async () => (await state(page)).model).toBe(ordinary);
  await page.evaluate(() => (window as any).pasteMarksFixture.doc.crud.undoManager.redo());
  await expect.poll(async () => (await state(page)).model).toBe(ordinary + safe);

  const copied = await page.evaluate(async () => {
    const {doc, id} = (window as any).pasteMarksFixture;
    const block = doc.getBlockById(id);
    doc.selection.setSelection({type: 'text', blockId: id, offset: 0},
      {type: 'text', blockId: id, offset: block.textLength});
    const data = new DataTransfer();
    await doc.clipboard.copyFromSelection(doc.selection.value, data);
    return data.getData('text/plain');
  });
  expect(copied).toBe(ordinary + safe);

  const restored = await page.evaluate(async () => {
    const {doc, id} = (window as any).pasteMarksFixture;
    const snapshot = doc.exportSnapshot();
    const target = document.createElement('div');
    document.querySelector('#paste-marks-fixture')!.append(target);
    const rebuilt = new doc.constructor({...doc.config, yDoc: new doc.yDoc.constructor(), plugins: []});
    rebuilt.initBySnapshot(snapshot, target);
    const block = rebuilt.getBlockById(id);
    const result = {model: block.textContent(), display: Array.from(block.hostElement.querySelectorAll('c-text'))
      .map((node: any) => node.textContent).join(''),
      sameSnapshot: JSON.stringify(rebuilt.exportSnapshot()) === JSON.stringify(snapshot)};
    const yDoc = rebuilt.yDoc;
    rebuilt.destroy(); yDoc.destroy(); target.remove();
    return result;
  });
  expect(restored).toEqual({model: ordinary + safe, display: ordinary + safe, sameSnapshot: true});
});

for (const format of ['html', 'snapshot']) {
  test(`${format} 粘贴跨格式组合符号保留文字与实际样式`, async ({page}) => {
    await mount(page);
    const formats = await page.evaluate(format => {
      const {doc} = (window as any).pasteMarksFixture;
      const first = '我' + '\u0300'.repeat(5), second = '\u0300'.repeat(7) + '你';
      if (format === 'html') return {'text/html': `<p><strong>${first}</strong><em>${second}</em></p>`};
      const paragraph = doc.schemas.createSnapshot('paragraph', [[
        {insert: first, attributes: {'a:bold': true}}, {insert: second, attributes: {'a:italic': true}}
      ]]);
      const snapshot = doc.schemas.createSnapshot('root', ['incoming', [paragraph]]);
      return {'application/x-blockcraft-snapshot+json': JSON.stringify(snapshot)};
    }, format) as Record<string, string>;
    await paste(page, formats);
    await expect.poll(async () => (await state(page)).model).toBe(ordinary + '我你');
    const after = await state(page);
    expect(after.display).toBe(after.model);
    expect(after.deltas.slice(-2)).toEqual([
      {insert: '我', attributes: {'a:bold': true}}, {insert: '你', attributes: {'a:italic': true}}
    ]);
    const styles = await page.evaluate(() => {
      const {doc, id} = (window as any).pasteMarksFixture;
      return Array.from(doc.getBlockById(id).hostElement.querySelectorAll('c-text')).map((node: any) => ({
        text: node.textContent, weight: getComputedStyle(node).fontWeight, style: getComputedStyle(node).fontStyle
      }));
    });
    expect(styles.find((item: any) => item.text === '我')?.weight).toBe('700');
    expect(styles.find((item: any) => item.text === '你')?.style).toBe('italic');
  });
}

test('只读拒绝粘贴，普通组合文字不被转化', async ({page}) => {
  await mount(page, true);
  await paste(page, {'text/plain': sample});
  expect((await state(page)).model).toBe(ordinary);
  await mount(page);
  await paste(page, {'text/plain': ordinary});
  expect((await state(page)).model).toBe(ordinary.repeat(2));
});

test('保留策略维持消息等其他编辑实例的原始粘贴内容', async ({page}) => {
  await mount(page, false, true);
  await paste(page, {'text/plain': stacked});
  expect((await state(page)).model).toBe(ordinary + stacked);
  expect((await state(page)).display).toBe(ordinary + stacked);
});

test('大样本只在粘贴入口转化，后续输入保持原有文本节点路径', async ({page}, testInfo) => {
  await mount(page);
  const payload = sample.repeat(500);
  const metrics = await paste(page, {'text/plain': payload});
  const safe = payload.replace(/\p{M}{9,}/gu, '');
  await expect.poll(async () => (await state(page)).model).toBe(ordinary + safe);
  const after = await state(page);
  expect(after.display).toBe(after.model);
  expect(after.nodes).toBe(1);
  await page.keyboard.type('x');
  await expect.poll(async () => (await state(page)).model).toBe(ordinary + safe + 'x');
  await testInfo.attach('paste-metrics', {body: JSON.stringify({browser: testInfo.project.name,
    incomingUnits: payload.length, storedUnits: after.model.length, ...metrics}), contentType: 'application/json'});
  console.log(testInfo.project.name, {incomingUnits: payload.length, storedUnits: after.model.length, ...metrics});
});
