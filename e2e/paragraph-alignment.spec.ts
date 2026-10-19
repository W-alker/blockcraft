import {expect, test, type Locator, type Page} from '@playwright/test';

async function start(page: Page) {
  await page.goto('/');
  await page.getByRole('button', {name: '初始化', exact: true}).click();
  await page.waitForFunction(() => (window as any).ng?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized);
}

async function lines(block: Locator) {
  return block.evaluate(host => {
    const content = host.querySelector<HTMLElement>('.edit-container')!;
    const rect = content.getBoundingClientRect();
    const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
    const rows: {top: number; left: number; right: number; bottom: number}[] = [];
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const atomic = node.parentElement?.closest('[contenteditable="false"],[data-zero-space]');
      if (atomic && atomic !== content && content.contains(atomic)) continue;
      for (let i = 0; i < node.textContent!.length; i++) {
        const range = document.createRange();
        range.setStart(node, i); range.setEnd(node, i + 1);
        const r = range.getBoundingClientRect();
        if (r.width < 0.1 || r.height < 1) continue;
        let row = rows.find(item => Math.abs(item.top - r.top) < 1);
        if (!row) { row = {top: r.top, bottom: r.bottom, left: r.left, right: r.right}; rows.push(row); }
        row.left = Math.min(row.left, r.left); row.right = Math.max(row.right, r.right);
      }
    }
    const image = content.querySelector('.bc-inline-image-frame')?.getBoundingClientRect();
    return {rows, left: rect.left, right: rect.right, width: rect.width,
      image: image ? {left: image.left, right: image.right, top: image.top, bottom: image.bottom, width: image.width} : null};
  });
}

test('paragraph and list alignment keeps normal/last lines and old modes on editor and snapshot', async ({page}, testInfo) => {
  await start(page);
  const ids = await page.evaluate(() => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc;
    const region = doc.schemas.createSnapshot('render-unit', [{}, {width: 560}]);
    const cases = ['paragraph', 'bullet', 'ordered', 'todo'].flatMap(flavour =>
      ['justify', 'distributed', 'center', 'right', undefined].map(textAlign => ({flavour, textAlign,
        snapshot: doc.schemas.createSnapshot(flavour, ['这是用于验证段落均匀分布的中文文字'.repeat(textAlign === 'justify' || textAlign === 'distributed' ? 4 : 1), {textAlign}])})));
    region.children = cases.map(c => c.snapshot);
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [region]);
    return cases.map(c => ({id: c.snapshot.id, flavour: c.flavour, align: c.textAlign ?? 'left'}));
  });
  for (const surface of ['block-craft-editor', 'bc-snapshot-viewer']) {
    if (surface === 'bc-snapshot-viewer') await page.locator('playground-home').evaluate(el => (window as any).ng.getComponent(el).syncSnapshotViewerFromEditor());
    for (const item of ids) {
      const block = page.locator(`${surface} [data-block-id="${item.id}"]`);
      await expect(block).toBeAttached();
      const content = block.locator('.edit-container');
      const isJustified = item.align === 'justify' || item.align === 'distributed';
      await expect(content).toHaveCSS('text-align', isJustified ? 'justify' : item.align === 'left' ? /left|start/ : item.align);
      const geometry = await lines(block);
      const last = geometry.rows.at(-1)!;
      if (isJustified) {
        expect(geometry.rows.length).toBeGreaterThan(1);
        expect(Math.abs(geometry.rows[0].right - geometry.right)).toBeLessThan(2);
        if (item.align === 'distributed') expect(Math.abs(last.right - geometry.right)).toBeLessThan(2);
        else expect(geometry.right - last.right).toBeGreaterThan(3);
      }
    }
    await page.locator(`${surface} [data-block-id="${ids[1].id}"]`).screenshot({path: testInfo.outputPath(`${surface}-distributed.png`)});
  }
});

test('mixed inline embeds keep dimensions, model offsets, typing and undo while changing toolbar alignment', async ({page}) => {
  await start(page);
  const fixture = await page.evaluate(() => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc;
    const canvas = document.createElement('canvas'); canvas.width = 80; canvas.height = 40;
    const delta = [{insert:'嵌入前'}, {insert:{image:new URL('/assets/debug/paragraph-alignment.svg',location.href).href}, attributes:{width:80,height:40}},
      {insert:'嵌入后'}, {insert:{icon:'bc_icon bc_wenben'}}, {insert:{date:'2026-09-23'},attributes:{format:'YYYY-MM-DD'}}, {insert:{mention:'张三'},attributes:{mentionId:'1'}}, {insert:'末尾中文'}];
    const p = doc.schemas.createSnapshot('paragraph', [delta]);
    const region = doc.schemas.createSnapshot('render-unit', [{}, {width:560}]); region.children = [p];
    doc.crud.insertBlockSnapshots(doc.rootId,0,[region]);
    doc.crud.undoManager.stopCapturing(); doc.crud.undoManager.clearHistory();
    doc.selection.setCursorAtBlock(p.id, false, false);
    return {id:p.id, delta};
  });
  const block = page.locator(`block-craft-editor [data-block-id="${fixture.id}"]`);
  await block.locator('.edit-container').click();
  for (const name of ['分散对齐', '两端对齐', '居中', '右对齐', '左对齐']) {
    await page.getByRole('button', {name: /^对齐方式：/}).click();
    await page.locator('bc-float-toolbar-item').filter({hasText:new RegExp(`^${name}$`)}).click();
    await expect(block.locator('.bc-inline-image-frame')).toHaveCSS('width','80px');
    const current = await block.evaluate(el => {
      const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc;
      const b = doc.getBlockById(el.getAttribute('data-block-id'));
      return {delta:b.textDeltas(), valid:Array.from({length:b.textLength+1}, (_,i) => {
        const p=b.runtime.modelPointToDom(i); return b.runtime.domPointToModel(p.node,p.offset)===i;
      }).every(Boolean)};
    });
    expect(current.delta).toEqual(fixture.delta); expect(current.valid).toBe(true);
  }
  await block.locator('.edit-container').click();
  await page.keyboard.press('End'); await page.keyboard.insertText('输入验证');
  await expect(block).toContainText('输入验证');
  await page.keyboard.press('ControlOrMeta+z'); await expect(block).not.toContainText('输入验证');
});

for (const side of ['right', 'left', 'auto']) {
  test(`image wrap ${side}: justified rows avoid image and resume full width below`, async ({page}, testInfo) => {
    await start(page);
    const ids = await page.evaluate(side => {
      const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc;
      const canvas = document.createElement('canvas'); canvas.width=140;canvas.height=90;
      canvas.getContext('2d')!.fillRect(0,0,140,90);
      const region=doc.schemas.createSnapshot('render-unit',[{}, {width:560}]);
      const children=['justify','distributed'].map(textAlign => doc.schemas.createSnapshot('paragraph', [[
        {insert:{image:new URL('/assets/debug/paragraph-alignment.svg',location.href).href},attributes:{width:140,height:90,wrap:true,side,x:side==='auto'?0.375:side==='left'?0.75:0,gap:12}},
        {insert:'这是环绕图片时需要均匀排布并且不能覆盖图片的中文文字'.repeat(14)},
      ],{textAlign}]));
      region.children=children;doc.crud.insertBlockSnapshots(doc.rootId,0,[region]);
      return children.map((p:any)=>p.id);
    },side);
    for (const [index,id] of ids.entries()) {
      const block=page.locator(`block-craft-editor [data-block-id="${id}"]`);
      await expect(block.locator('[data-bc-inline-float-owner]')).toBeAttached();
      if(side==='auto') await expect(block.locator('[data-bc-inline-fragment-group]')).toBeAttached();
      await expect.poll(async()=> (await lines(block)).image?.width).toBeCloseTo(140,0);
      const g=await lines(block);
      const beside=g.rows.filter(r=>r.top<g.image!.bottom && r.bottom>g.image!.top);
      expect(beside.length).toBeGreaterThan(1);
      if(side==='right') for(const row of beside) {
        expect(row.left).toBeGreaterThanOrEqual(g.image!.right+10);
        expect(Math.abs(row.right-g.right)).toBeLessThan(2);
      }
      if(side==='left') for(const row of beside) {
        expect(row.right).toBeLessThanOrEqual(g.image!.left-10);
        expect(Math.abs(row.right-(g.image!.left-12))).toBeLessThan(2);
      }
      if(side==='auto') {
        const fragments=block.locator('[data-bc-inline-fragment-side]');
        for(let n=0;n<await fragments.count();n++) {
          const metrics=await fragments.nth(n).evaluate(el=>{
            const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);
            const rs: DOMRect[]=[];let node: Node | null;let text='';
            while((node=walker.nextNode())) {
              if(node.parentElement?.closest('[contenteditable="false"],[data-zero-space]')) continue;
              const range=document.createRange();range.selectNodeContents(node);
              rs.push(...Array.from(range.getClientRects()).filter(r=>r.width>0 && r.height>0));text+=node.textContent;
            }
            const r=el.getBoundingClientRect();return {width:r.width, textRight:Math.max(...rs.map(x=>x.right)),right:r.right,left:r.left,text,side:el.getAttribute('data-bc-inline-fragment-side')};
          });
          expect(metrics.width).toBeGreaterThan(100);
          if(metrics.side==='left') expect(metrics.right).toBeLessThanOrEqual(g.image!.left-10);
          else expect(metrics.left).toBeGreaterThanOrEqual(g.image!.right+10);
          if(metrics.text && metrics.text.replace(/[\u200b\ufeff]/g,'').length>1) expect(Math.abs(metrics.textRight-metrics.right), JSON.stringify(metrics)).toBeLessThan(2);
        }
      }
      const below=g.rows.filter(r=>r.top>g.image!.bottom+15);
      expect(below.length).toBeGreaterThan(1);
      expect(Math.abs(below[0].right-g.right)).toBeLessThan(2);
      if(index===1) expect(Math.abs(g.rows.at(-1)!.right-g.right)).toBeLessThan(2);
      else expect(g.right-g.rows.at(-1)!.right).toBeGreaterThan(3);
      await block.screenshot({path:testInfo.outputPath(`wrap-${side}-${index}.png`)});
      // Exercise model <-> DOM points inside the projected fragments, then edit
      // beside the image and undo without losing the embed or its wrap data.
      const before = await block.evaluate(el => {
        const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc;
        const b=doc.getBlockById(el.getAttribute('data-block-id'));
        const delta=b.textDeltas();
        const valid=Array.from({length:b.textLength+1},(_,i)=>{
          const p=b.runtime.modelPointToDom(i);return b.runtime.domPointToModel(p.node,p.offset)===i;
        }).every(Boolean);
        doc.crud.undoManager.stopCapturing();
        doc.selection.setCursorAt(b,5);
        return {delta,valid};
      });
      expect(before.valid).toBe(true);
      await page.keyboard.insertText('编辑');
      await expect(block).toContainText('编辑');
      await page.keyboard.press('ControlOrMeta+z');
      await expect(block).not.toContainText('编辑');
      expect(await block.evaluate(el=>{
        const doc=(window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc;
        return doc.getBlockById(el.getAttribute('data-block-id')).textDeltas();
      })).toEqual(before.delta);
    }
  });
}

test('soft breaks and single lines keep alignment inside a narrow table cell and after pagination', async ({page}) => {
  await start(page);
  const ids=await page.evaluate(async ()=>{
    const doc=(window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc;
    const ps=['justify','distributed'].map(textAlign=>doc.schemas.createSnapshot('paragraph',[[
      {insert:'第一行文字\n第二行文字'},
    ],{textAlign}]));
    const table=doc.schemas.createSnapshot('table',[1,1]);
    table.props.colWidths=[280];table.children[0].children[0].children=ps;
    doc.crud.insertBlockSnapshots(doc.rootId,0,[table]);
    await doc.navigateToBlock(table.id);
    return ps.map((p:any)=>p.id);
  });
  for(const paginated of [false,true]) {
    if(paginated) await page.evaluate(()=>{
      const doc=(window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc;
      const p=doc.plugins.find((p:any)=>p.name==='pagination');
      p.updateConfig({pageSize:{width:720,height:540},margins:{top:48,right:48,bottom:48,left:48}});p.enable();p.recompute();
    });
    for(const [i,id] of ids.entries()) {
      const block=page.locator(`block-craft-editor [data-block-id="${id}"]`);
      await expect(block).toBeVisible();
      const g=await lines(block);expect(g.rows).toHaveLength(2);
      for(const row of g.rows) {
        if(i===1) expect(Math.abs(row.right-g.right)).toBeLessThan(2);
        else expect(g.right-row.right).toBeGreaterThan(20);
      }
    }
  }
});

test('debug console inserts editable alignment examples without replacing the document', async ({page}, testInfo) => {
  await start(page);
  const before=await page.locator('block-craft-editor').evaluate(el=>(window as any).ng.getComponent(el).doc.exportSnapshot().children.length);
  await page.getByRole('button',{name:'段落对齐案例',exact:true}).click();
  await expect(page.locator('block-craft-editor .paragraph-block').filter({hasText:'段落对齐测试案例'})).toBeVisible();
  const cases=await page.locator('block-craft-editor').evaluate(el=>{
    const doc=(window as any).ng.getComponent(el).doc;
    const children=doc.exportSnapshot().children;
    const samples=children.filter((s:any)=>['justify','distributed'].includes(s.props.textAlign));
    const dual=samples.find((s:any)=>s.props.textAlign==='distributed'&&s.children.some((d:any)=>d.attributes?.side==='auto'));
    return {count:children.length, samples:samples.length,dual:dual.id,virtualEnabled:doc.virtualization.enabled, fallback:doc.virtualization.fullMountFallback};
  });
  expect(cases.virtualEnabled).toBe(true);
  expect(cases.fallback).toBe(false);
  expect(cases.count).toBeGreaterThan(before+20);
  expect(cases.samples).toBeGreaterThan(10);
  await page.locator('block-craft-editor').evaluate(async (el,id)=>{
    await (window as any).ng.getComponent(el).doc.navigateToBlock(id);
  },cases.dual);
  const dual=page.locator(`block-craft-editor [data-block-id="${cases.dual}"]`);
  await expect(dual.locator('[data-bc-inline-fragment-group]')).toBeAttached();
  await dual.screenshot({path:testInfo.outputPath('debug-distributed-dual-wrap.png')});
  expect(await page.locator('block-craft-editor').evaluate(el=>(window as any).ng.getComponent(el).doc.virtualization.fullMountFallback)).toBe(false);
  await page.locator('block-craft-editor').evaluate(el=>(window as any).ng.getComponent(el).doc.crud.undoManager.undo());
  expect(await page.locator('block-craft-editor').evaluate(el=>(window as any).ng.getComponent(el).doc.exportSnapshot().children.length)).toBe(before);
});
