import {expect, test} from '@playwright/test';

test.beforeEach(async ({page}) => {
  await page.routeWebSocket('**', socket => socket.close());
  await page.goto('/');
  await page.getByRole('button', {name: '初始化', exact: true}).click();
  await page.waitForFunction(() => (window as any).ng?.getComponent(
    document.querySelector('block-craft-editor'))?.doc?.isInitialized);
  await page.evaluate(() => {
    const source = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc;
    const viewport = document.createElement('section');
    viewport.id = 'readonly-attachment-fixture';
    viewport.style.cssText = 'position:fixed;inset:40px;overflow:auto;background:white;z-index:999;padding:80px 40px';
    const mount = document.createElement('div');
    viewport.append(mount);
    document.body.append(viewport);
    const attachment = source.schemas.createSnapshot('attachment', [{
      name: 'report.pdf', url: 'https://example.com/report.pdf', type: 'application/pdf', size: 1024,
    }]);
    const snapshot = source.schemas.createSnapshot('root', ['readonly-attachment', [attachment]]);
    const Plugin = source.config.plugins.find((plugin: any) => plugin.name === 'attachment-extension').constructor;
    const probe: any = {previews: [], downloads: []};
    const plugin = new Plugin({onPreview: (block: any) => probe.previews.push(block.id)});
    const doc = new source.constructor({...source.config, yDoc: new source.yDoc.constructor(), docId: snapshot.id,
      plugins: [plugin], readonly: true, scrollContainer: viewport, virtualization: {enabled: false}});
    doc.initBySnapshot(snapshot, mount);
    source.destroy();
    // 在宿主文件服务边界记录下载，避免测试真正访问远端文件。
    plugin.fileService = {downloadAttachment: (props: any) => probe.downloads.push(props.url)};
    Object.assign(probe, {doc, attachmentId: attachment.id, before: JSON.stringify(doc.exportSnapshot())});
    (window as any).readonlyAttachmentProbe = probe;
  });
});

test('只读附件可预览和下载，且不允许编辑正文或附件', async ({page}, testInfo) => {
  await page.locator('#readonly-attachment-fixture .attachment-block__name').hover();
  const toolbar = page.locator('.attachment-toolbar');
  await expect(toolbar).toBeVisible();
  await expect(toolbar.locator('[name="rename"], [name="delete"]')).toHaveCount(0);
  await page.screenshot({path: testInfo.outputPath('readonly-attachment-toolbar.png')});
  await toolbar.locator('[name="preview"]').click({delay: 120});
  await toolbar.locator('[name="download"]').click();
  // 删除键验证需要先明确选中附件；单纯悬停不会抢走浏览器焦点。
  await page.locator('#readonly-attachment-fixture .attachment-block__name').click();
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Delete');
  const result = await page.evaluate(() => {
    const probe = (window as any).readonlyAttachmentProbe;
    return {previews: probe.previews, downloads: probe.downloads, attachmentId: probe.attachmentId,
      unchanged: probe.before === JSON.stringify(probe.doc.exportSnapshot())};
  });
  expect(result.previews).toEqual([result.attachmentId]);
  expect(result.downloads).toEqual(['https://example.com/report.pdf']);
  expect(result.unchanged).toBe(true);
});

test('编辑工具栏切入只读时关闭，重新悬停后恢复预览', async ({page}) => {
  await page.evaluate(() => {
    const {doc} = (window as any).readonlyAttachmentProbe;
    doc.toggleReadonly(false);
  });
  await page.locator('#readonly-attachment-fixture .attachment-block__name').hover();
  const toolbar = page.locator('.attachment-toolbar');
  await expect(toolbar.locator('[name="rename"]')).toBeVisible();
  await expect(toolbar.locator('[name="delete"]')).toBeVisible();
  await toolbar.locator('[name="rename"]').click();
  const input = page.getByPlaceholder('输入文件名');
  await expect(input).toBeVisible();
  await input.fill('renamed');
  await input.press('Enter');
  await expect(page.locator('#readonly-attachment-fixture .attachment-block__name')).toHaveText('renamed.pdf');
  await page.locator('#readonly-attachment-fixture .attachment-block__name').hover();
  await expect(toolbar).toBeVisible();
  await page.evaluate(() => (window as any).readonlyAttachmentProbe.doc.toggleReadonly(true));
  await page.mouse.move(0, 0);
  await expect(toolbar).toHaveCount(0);
  await page.locator('#readonly-attachment-fixture .attachment-block__name').hover();
  await expect(toolbar).toBeVisible();
  await expect(toolbar.locator('[name="rename"], [name="delete"]')).toHaveCount(0);
  await toolbar.locator('[name="preview"]').click();
  expect(await page.evaluate(() => (window as any).readonlyAttachmentProbe.previews.length)).toBe(1);
  await page.evaluate(() => (window as any).readonlyAttachmentProbe.doc.destroy());
  await expect(toolbar).toHaveCount(0);
});


test('悬停不改选区，跨越间隙保留工具栏，离开与 Escape 关闭', async ({page}) => {
  const attachment = page.locator('#readonly-attachment-fixture .attachment-block');
  const toolbar = page.locator('.attachment-toolbar');
  await page.evaluate(() => {
    const probe = (window as any).readonlyAttachmentProbe;
    probe.selectionBeforeHover = probe.doc.selection.value;
  });
  const beforeHover = await attachment.evaluate(el => ({
    background: getComputedStyle(el).backgroundColor,
    border: getComputedStyle(el).borderTopColor,
  }));
  await attachment.hover();
  await expect(toolbar).toBeVisible();
  const afterHover = await attachment.evaluate(el => ({
    background: getComputedStyle(el).backgroundColor,
    border: getComputedStyle(el).borderTopColor,
  }));
  expect(afterHover.background).not.toBe(beforeHover.background);
  expect(afterHover.border).not.toBe(beforeHover.border);
  expect(await page.evaluate(() => {
    const p = (window as any).readonlyAttachmentProbe;
    return p.doc.selection.value === p.selectionBeforeHover;
  })).toBe(true);
  await toolbar.hover();
  await page.waitForTimeout(300);
  await expect(toolbar).toBeVisible();
  await attachment.hover();
  await page.waitForTimeout(300);
  await expect(toolbar).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(toolbar).toHaveCount(0);
  await page.evaluate(() => {
    const p = (window as any).readonlyAttachmentProbe;
    p.doc.selection.selectBlock(p.attachmentId);
  });
  await page.waitForTimeout(300);
  await expect(toolbar).toHaveCount(0);
  await attachment.hover();
  await expect(toolbar).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(toolbar).toHaveCount(0);
});

test('旧附件忽略旧图标标识，并按类型或文件名显示组件库图标', async ({page}, testInfo) => {
  const attachment = page.locator('#readonly-attachment-fixture .attachment-block');
  for (const [name, type, icon] of [
    ['report.pdf', 'application/pdf', 'file-pdf'],
    ['report.docx', '', 'file-docx'],
    ['report.xlsx', 'application/octet-stream', 'file-excel'],
    ['slides.pptx', '', 'file-ppt'],
    ['photo.png', 'image/png', 'file-img'],
    ['music.mp3', 'audio/mpeg', 'file-audio'],
    ['movie.mp4', 'video/mp4', 'file-video'],
    ['archive.gz', 'application/gzip', 'file-zip'],
    ['readme.txt', 'text/plain', 'file-txt'],
    ['README.md', '', 'file-md'],
    ['data.csv', 'text/csv', 'file-csv'],
    ['index.html', 'text/html', 'file-html'],
    ['unknown.bin', '', 'file-unknown'],
  ]) {
    await page.evaluate(({name, type}) => {
      const p = (window as any).readonlyAttachmentProbe;
      p.doc.toggleReadonly(false);
      p.doc.getBlockById(p.attachmentId).updateProps({name, type, icon: 'legacy-missing-icon'});
      p.doc.toggleReadonly(true);
    }, {name, type});
    const iconElement = attachment.locator('.attachment-block__icon-wrapper cs-icon');
    await expect(iconElement.locator('svg')).toBeVisible();
    expect(await iconElement.evaluate(el => (window as any).ng.getComponent(el).csType())).toBe(icon);
    expect(await iconElement.evaluate(el => getComputedStyle(el).fontSize)).toBe('28px');
  }
  await attachment.evaluate(el => (el as HTMLElement).style.width = '200px');
  await expect.poll(() => attachment.locator('.attachment-block__icon-wrapper cs-icon')
    .evaluate(el => getComputedStyle(el).fontSize)).toBe('28px');
  await page.screenshot({path: testInfo.outputPath('attachment-icons-narrow.png')});
});

test('目标删除和文档销毁会清理工具栏', async ({page}) => {
  const attachment = page.locator('#readonly-attachment-fixture .attachment-block');
  await attachment.hover();
  await expect(page.locator('.attachment-toolbar')).toBeVisible();
  await page.evaluate(() => {
    const p = (window as any).readonlyAttachmentProbe;
    p.doc.toggleReadonly(false);
    p.doc.crud.deleteBlockById(p.attachmentId);
  });
  await expect(page.locator('.attachment-toolbar')).toHaveCount(0);
  await page.evaluate(() => (window as any).readonlyAttachmentProbe.doc.destroy());
  await page.waitForTimeout(300);
  await expect(page.locator('.attachment-toolbar')).toHaveCount(0);
});

test('快照预览同样解析组件库图标，不依赖旧 SVG 注册', async ({page}) => {
  await page.evaluate(() => {
    const p = (window as any).readonlyAttachmentProbe;
    const app = (window as any).ng.getComponent(document.querySelector('playground-home'));
    app.snapshotViewerSnapshot = p.doc.exportSnapshot();
    app.activeMainTab = 'viewer';
    app.activeViewerMode = 'snapshot';
    app.cdr.detectChanges();
    document.getElementById('readonly-attachment-fixture')!.style.display = 'none';
  });
  const preview = page.locator('bc-snapshot-viewer .attachment-block');
  await expect(preview.locator('.attachment-block__icon-wrapper [data-file-icon="file-pdf"] svg')).toBeVisible();
  await expect(preview.locator('[data-file-icon="file-pdf"]')).toHaveCount(1);
  expect(await preview.locator('.attachment-block__icon-wrapper svg').evaluate(el => el.getBoundingClientRect().width)).toBe(28);
});

test('空附件保留上传入口与通用文件图标', async ({page}) => {
  await page.evaluate(() => {
    const p = (window as any).readonlyAttachmentProbe;
    p.doc.toggleReadonly(false);
    const block = p.doc.getBlockById(p.attachmentId);
    block.updateProps({url: ''});
    block.inputLocalFile = () => {p.uploadRequested = true;};
  });
  const empty = page.locator('#readonly-attachment-fixture .attachment-block__empty');
  await expect(empty.locator('cs-icon svg')).toBeVisible();
  await empty.hover();
  const toolbar = page.locator('.attachment-toolbar');
  await expect(toolbar.locator('[name="delete"]')).toBeVisible();
  await expect(toolbar.locator('[name="rename"], [name="preview"], [name="download"]')).toHaveCount(0);
  await empty.click();
  expect(await page.evaluate(() => (window as any).readonlyAttachmentProbe.uploadRequested)).toBe(true);
});


test.describe('触屏兼容', () => {
  test.use({hasTouch: true});
  test('点击附件仍能访问工具栏，点击外部关闭', async ({page}) => {
    await page.locator('#readonly-attachment-fixture .attachment-block__name').tap();
    const toolbar = page.locator('.attachment-toolbar');
    await expect(toolbar).toBeVisible();
    await toolbar.locator('[name="preview"]').tap();
    expect(await page.evaluate(() => (window as any).readonlyAttachmentProbe.previews.length)).toBe(1);
    await page.touchscreen.tap(60, 60);
    await expect(toolbar).toHaveCount(0);
  });
});


test('单行布局只保留一个图标，长文件名和窄容器不溢出', async ({page}, testInfo) => {
  const block = page.locator('#readonly-attachment-fixture .attachment-block');
  await expect(block.locator('cs-icon')).toHaveCount(1);
  await expect(block.locator('.attachment-block__prefix')).toHaveCount(0);
  const wide = await block.evaluate(el => {
    const icon = el.querySelector('.attachment-block__icon-wrapper')!.getBoundingClientRect();
    const name = el.querySelector('.attachment-block__name')!.getBoundingClientRect();
    const size = el.querySelector('.attachment-block__size')!.getBoundingClientRect();
    return {height: el.getBoundingClientRect().height, ordered: icon.right < name.left && name.right < size.left,
      aligned: Math.abs((name.top + name.bottom) - (size.top + size.bottom)) < 2};
  });
  expect(wide.height).toBe(52);
  expect(wide.ordered).toBe(true);
  expect(wide.aligned).toBe(true);
  await block.hover();
  await expect(page.locator('.attachment-toolbar')).toBeVisible();
  await page.screenshot({path: testInfo.outputPath('attachment-compact-hover.png')});
  await page.evaluate(() => {
    const p = (window as any).readonlyAttachmentProbe;
    p.doc.toggleReadonly(false);
    p.doc.getBlockById(p.attachmentId).updateProps({name: '完整项目需求说明书与验收清单-final-2026.pdf'});
  });
  await expect(block.locator('.attachment-block__name')).toHaveAttribute('title', '完整项目需求说明书与验收清单-final-2026.pdf');
  for (const width of [320, 200, 140, 100]) {
    await block.evaluate((el, width) => (el as HTMLElement).style.width = `${width}px`, width);
    const layout = await block.evaluate(el => {
      const rect = el.getBoundingClientRect();
      const size = el.querySelector('.attachment-block__size')!.getBoundingClientRect();
      const name = el.querySelector('.attachment-block__name')!.getBoundingClientRect();
      // Editor-owned gap cursors intentionally sit 1px outside the card.
      const content = Array.from(el.children).filter(child => !child.classList.contains('bc-block-gap'));
      const overflow = content.some(child => {
        const bounds = child.getBoundingClientRect();
        return bounds.left < rect.left || bounds.right > rect.right;
      });
      return {overflow, within: size.right <= rect.right && size.left >= rect.left,
        secondLine: size.top > name.bottom};
    });
    expect(layout.overflow, JSON.stringify({width, ...layout})).toBe(false);
    expect(layout.within).toBe(true);
    if (width <= 200) expect(layout.secondLine).toBe(true);
  }
  await block.evaluate(el => (el as HTMLElement).style.width = '320px');
  await expect.poll(async () => {
    const card = await block.boundingBox();
    const toolbar = await page.locator('.attachment-toolbar').boundingBox();
    return card && toolbar ? Math.abs(card.x + card.width - toolbar.x - toolbar.width) : Infinity;
  }).toBeLessThan(2);
  await page.evaluate(() => document.body.setAttribute('blockcraft-theme', 'dark'));
  await expect(block.locator('cs-icon svg')).toBeVisible();
  await page.screenshot({path: testInfo.outputPath('attachment-compact-dark.png')});
});

test('紧凑布局保留本地上传进度、完成状态和远端同步状态', async ({page}, testInfo) => {
  await page.evaluate(() => {
    const p = (window as any).readonlyAttachmentProbe;
    p.doc.toggleReadonly(false);
    const block = p.doc.getBlockById(p.attachmentId);
    const file = new File(['attachment'], 'report.pdf', {type: 'application/pdf'});
    block._fileService = {
      isLocalObjectURL: (url: string) => url.startsWith('blob:'),
      getFileByObjectURL: () => file,
      removeObjectURL: () => {},
      uploadAttachment: (_file: File, progress: (value: number) => void) => {
        p.uploadProgress = progress;
        return new Promise(resolve => p.finishUpload = resolve);
      },
    };
    block.updateProps({url: 'blob:attachment-test'});
    block.uploadFile('blob:attachment-test');
  });
  const block = page.locator('#readonly-attachment-fixture .attachment-block');
  await expect(block.locator('.attachment-block__size')).toHaveText('上传中...');
  await page.evaluate(() => (window as any).readonlyAttachmentProbe.uploadProgress(42));
  await expect(block.locator('.attachment-block__progress span')).toHaveText('42%');
  await expect(block.locator('cs-icon')).toHaveCount(0);
  await page.screenshot({path: testInfo.outputPath('attachment-upload-progress.png')});
  await page.evaluate(() => (window as any).readonlyAttachmentProbe.finishUpload({
    name: 'report.pdf', url: 'https://example.com/report.pdf', type: 'application/pdf', size: 1024,
  }));
  await expect(block.locator('.attachment-block__size')).toHaveText('1.02 KB');
  await expect(block.locator('cs-icon svg')).toBeVisible();
  await page.evaluate(() => {
    const p = (window as any).readonlyAttachmentProbe;
    const block = p.doc.getBlockById(p.attachmentId);
    block._fileService.getFileByObjectURL = () => undefined;
    block.updateProps({url: 'blob:remote-upload'});
  });
  await expect(block.locator('.attachment-block__size')).toHaveText('同步中...');
  await expect(block.locator('.attachment-block__spinner')).toBeVisible();
});

for (const mode of ['editor', 'snapshot'] as const) {
  test(`${mode} 附件优先显示后缀和大小，标题只使用剩余宽度`, async ({page}, testInfo) => {
    const card = page.locator(mode === 'editor'
      ? '#readonly-attachment-fixture .attachment-block'
      : 'bc-snapshot-viewer .attachment-block');
    const names = [
      ['完整项目需求说明书与验收清单-final-2026.DOCX', '.DOCX'],
      ['archive.backup.tar.gz', '.gz'],
      ['README', ''], ['.gitignore', ''], ['report.', ''],
      ['很长的文件标题.verylongextension', '.verylongextension'],
    ];
    for (const [name, suffix] of names) {
      await page.evaluate(({name, mode}) => {
        const p = (window as any).readonlyAttachmentProbe;
        p.doc.toggleReadonly(false);
        p.doc.getBlockById(p.attachmentId).updateProps({name, size: 123456789});
        if (mode === 'snapshot') {
          const app = (window as any).ng.getComponent(document.querySelector('playground-home'));
          app.snapshotViewerSnapshot = p.doc.exportSnapshot();
          app.activeMainTab = 'viewer';
          app.activeViewerMode = 'snapshot';
          app.cdr.detectChanges();
          document.getElementById('readonly-attachment-fixture')!.style.display = 'none';
        }
      }, {name, mode});
      await expect(card.locator('.attachment-block__name')).toHaveText(name);
      await expect(card.locator('.attachment-block__name')).toHaveAttribute('title', name);
      await expect(card.locator('.attachment-block__name-extension')).toHaveText(suffix);
      for (const width of [320, 200, 140, 100]) {
        await card.evaluate((el, width) => (el as HTMLElement).style.width = `${width}px`, width);
        const result = await card.evaluate(el => {
          const rect = el.getBoundingClientRect();
          const stem = el.querySelector<HTMLElement>('.attachment-block__name-stem')!;
          const parts = ['.attachment-block__name-extension', '.attachment-block__size'].map(selector => {
            const part = el.querySelector<HTMLElement>(selector)!;
            const bounds = part.getBoundingClientRect();
            return {selector, width: part.clientWidth, scrollWidth: part.scrollWidth,
              height: part.clientHeight, scrollHeight: part.scrollHeight,
              visible: part.scrollWidth <= part.clientWidth + 1 && part.scrollHeight <= part.clientHeight + 1 &&
                bounds.left >= rect.left && bounds.right <= rect.right && bounds.bottom <= rect.bottom};
          });
          return {visible: parts.every(part => part.visible), parts, truncated: stem.scrollWidth > stem.clientWidth,
            stemWidth: stem.clientWidth, stemScrollWidth: stem.scrollWidth, text: stem.textContent};
        });
        expect(result.visible, JSON.stringify({mode, name, width, ...result})).toBe(true);
        if (name.startsWith('完整')) expect(result.truncated, JSON.stringify({mode, width, ...result})).toBe(true);
        if (name.startsWith('完整') && width === 320) {
          await card.screenshot({path: testInfo.outputPath(`${mode}-suffix-priority.png`)});
        }
      }
    }
  });
}
