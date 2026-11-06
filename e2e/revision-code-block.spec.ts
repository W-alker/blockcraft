import {expect, test, type Page} from '@playwright/test';

const editorSelector = 'block-craft-editor';
const codeSelector = `${editorSelector} div.code-block pre.edit-container`;

async function initialize(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', {name: '初始化', exact: true}).click();
  await expect(page.locator(codeSelector).first()).toBeVisible();
  await page.getByRole('button', {name: '开启修订', exact: true}).click();
  await expect(page.getByRole('button', {name: '关闭修订', exact: true})).toBeVisible();
}

async function placeCursorAtCodeEnd(page: Page): Promise<void> {
  await page.locator(codeSelector).first().evaluate(editor => {
    const textNodes = Array.from(editor.querySelectorAll('c-text'))
      .map(element => element.firstChild)
      .filter((node): node is Text => node instanceof Text);
    const last = textNodes.at(-1);
    const root = editor.closest<HTMLElement>('[data-blockcraft-root="true"]');
    const selection = window.getSelection();
    if (!last || !root || !selection) throw new Error('代码块光标目标不可用');
    root.focus({preventScroll: true});
    const range = document.createRange();
    range.setStart(last, last.length);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  });
}

async function prepareCodeComposition(
  page: Page,
): Promise<{blockId: string; offset: number; before: string}> {
  return page.locator(codeSelector).first().evaluate(async editor => {
    const editorElement = editor.closest('block-craft-editor')!;
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}};
    }).ng;
    const doc = debug.getComponent(editorElement).doc;
    const block = doc.getBlockById(editor.closest<HTMLElement>('[data-block-id]')!.dataset['blockId']);
    doc.selection.setCursorAt(block, block.textLength);
    await new Promise<void>(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    const root = editor.closest<HTMLElement>('[data-blockcraft-root="true"]');
    root?.focus({preventScroll: true});
    const selection = window.getSelection();
    if (!selection?.anchorNode || !editor.contains(selection.anchorNode)) {
      throw new Error('IME 光标未落在代码块');
    }
    return {
      blockId: block.id,
      offset: block.textLength,
      before: block.textContent(),
    };
  });
}

async function prepareMermaidComposition(
  page: Page,
): Promise<{blockId: string; offset: number; before: string; selector: string}> {
  const target = await page.locator(editorSelector).evaluate(async editor => {
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}};
    }).ng;
    const doc = debug.getComponent(editor).doc;
    const source = 'graph TD\nA-->B';
    const snapshot = doc.schemas.createSnapshot('mermaid', ['text', source]);
    const [mermaidId] = doc.crud.insertBlockSnapshots(
      doc.rootId,
      doc.model.getChildrenIds(doc.rootId).length,
      [snapshot],
    );
    const blockId = doc.model.getChildrenIds(mermaidId)[0];
    await doc.navigateToBlock(blockId);
    await new Promise<void>(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    const block = doc.getBlockById(blockId);
    doc.selection.setCursorAt(block, block.textLength);
    await new Promise<void>(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    const root = editor.querySelector<HTMLElement>('[data-blockcraft-root="true"]');
    root?.focus({preventScroll: true});
    return {
      blockId,
      offset: block.textLength,
      before: block.textContent(),
    };
  });
  const selector = `${editorSelector} div.mermaid-textarea[data-block-id="${target.blockId}"]`;
  await expect(page.locator(selector)).toBeVisible();
  const selectionIsInside = await page.locator(selector).evaluate(editor => {
    const selection = window.getSelection();
    return !!selection?.anchorNode && editor.contains(selection.anchorNode);
  });
  expect(selectionIsInside).toBe(true);
  return {...target, selector};
}

async function readNativeInlineCaret(
  page: Page,
  selector: string,
  blockId: string,
): Promise<number | null> {
  return page.locator(selector).first().evaluate((editor, id) => {
    const editorElement = editor.closest('block-craft-editor')!;
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}};
    }).ng;
    const doc = debug.getComponent(editorElement).doc;
    const block = doc.getBlockById(id);
    const selection = window.getSelection();
    if (!selection?.focusNode || !editor.contains(selection.focusNode)) return null;
    return block.runtime.mapper.domPointToModelPoint(
      block.containerElement,
      selection.focusNode,
      selection.focusOffset,
    );
  }, blockId);
}

async function dispatchComposition(
  page: Page,
  blockId: string,
  type: 'compositionstart' | 'compositionend',
  data = '',
): Promise<string> {
  return page.locator(editorSelector).evaluate((editor, args) => {
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}};
    }).ng;
    const doc = debug.getComponent(editor).doc;
    doc.getBlockById(args.blockId).containerElement.dispatchEvent(new CompositionEvent(args.type, {
      bubbles: true,
      cancelable: true,
      data: args.data,
    }));
    return doc.inputManger.compositionSession.phase as string;
  }, {blockId, type, data});
}

async function simulateTrailingImeDomWrite(
  page: Page,
  selector: string,
  text: string,
): Promise<void> {
  await page.locator(selector).first().evaluate((editor, committedText) => {
    const marked = Array.from(editor.querySelectorAll<HTMLElement>(
      'c-element[data-bc-revision-kind="insert"][data-bc-revision-state="pending"]',
    )).find(element => element.textContent?.includes(committedText));
    if (!marked) throw new Error('IME 尾部写入前未找到修订节点');

    // A real IME can perform its final native DOM write after compositionend
    // listeners have synchronously rebuilt the blot tree. Model that drift by
    // leaving the text in place while replacing its projected presentation.
    marked.removeAttribute('data-bc-revision-ids');
    marked.removeAttribute('data-bc-revision-kind');
    marked.removeAttribute('data-bc-revision-state');
    marked.style.color = 'rgb(36, 41, 46)';
    editor.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      composed: true,
      data: committedText,
      inputType: 'insertCompositionText',
      isComposing: false,
    }));
  }, text);
}

test('code block keeps pending insertion attribution and revision color after Shiki rerender', async ({page}) => {
  await initialize(page);
  await placeCursorAtCodeEnd(page);
  await page.keyboard.type('REVISION_INSERT');

  const insertion = page.locator(
    `${codeSelector} c-element[data-bc-revision-kind="insert"][data-bc-revision-state="pending"]`,
  ).filter({hasText: 'REVISION_INSERT'});
  await expect(insertion).toHaveCount(1);

  // Wait past CodeBlockComponent's debounced incremental highlight. The mark
  // must survive both the immediate projection and the later Shiki repaint.
  await page.waitForTimeout(500);
  await expect(insertion).toHaveCount(1);
  const presentation = await insertion.evaluate(element => {
    const root = element.closest<HTMLElement>('[data-blockcraft-root="true"]')!;
    const probe = document.createElement('span');
    probe.style.color = 'var(--bc-revision-insert-color)';
    root.appendChild(probe);
    const expectedColor = getComputedStyle(probe).color;
    probe.remove();
    return {
      inlineColor: (element as HTMLElement).style.color,
      color: getComputedStyle(element).color,
      expectedColor,
      textDecoration: getComputedStyle(element).textDecorationLine,
    };
  });

  expect(presentation.inlineColor).toBe('');
  expect(presentation.color).toBe(presentation.expectedColor);
  expect(presentation.textDecoration).toContain('underline');
});

test('code block keeps revision projection through a native Chromium IME commit', async ({
  page,
  context,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'CDP IME input is Chromium-only');
  test.setTimeout(45_000);

  await initialize(page);
  const target = await prepareCodeComposition(page);
  await page.locator(codeSelector).first().evaluate(editor => {
    const root = editor.closest<HTMLElement>('[data-blockcraft-root="true"]')!;
    const events: Array<{type: string; data: string | null; isComposing: boolean}> = [];
    for (const type of ['compositionstart', 'compositionupdate', 'compositionend', 'input']) {
      root.addEventListener(type, event => {
        const inputEvent = event as InputEvent;
        events.push({
          type: event.type,
          data: inputEvent.data ?? null,
          isComposing: inputEvent.isComposing ?? false,
        });
      });
    }
    (window as unknown as {__bcRevisionImeEvents: typeof events})
      .__bcRevisionImeEvents = events;
  });
  const cdp = await context.newCDPSession(page);
  try {
    await cdp.send('Input.imeSetComposition', {
      text: 'zhongwen',
      selectionStart: 8,
      selectionEnd: 8,
    });

    const composing = await page.locator(codeSelector).first().evaluate((editor, blockId) => {
      const editorElement = editor.closest('block-craft-editor')!;
      const debug = (window as unknown as {
        ng: {getComponent: (target: Element) => {doc: any}};
      }).ng;
      const doc = debug.getComponent(editorElement).doc;
      const block = doc.getBlockById(blockId);
      return {
        phase: doc.inputManger.compositionSession.phase,
        model: block.textContent(),
        revisionCount: doc.revisions.list().length,
        events: (window as unknown as {
          __bcRevisionImeEvents: Array<{
            type: string;
            data: string | null;
            isComposing: boolean;
          }>;
        }).__bcRevisionImeEvents,
      };
    }, target.blockId);
    expect(composing).toEqual(expect.objectContaining({
      phase: 'active',
      model: target.before,
      revisionCount: 0,
    }));
    expect(composing.events).toEqual(expect.arrayContaining([
      expect.objectContaining({type: 'compositionstart'}),
      expect.objectContaining({type: 'compositionupdate', data: 'zhongwen'}),
      expect.objectContaining({type: 'input', isComposing: true}),
    ]));

    await cdp.send('Input.insertText', {text: '中文输入'});

    await expect.poll(async () => page.locator(codeSelector).first().evaluate((editor, blockId) => {
      const editorElement = editor.closest('block-craft-editor')!;
      const debug = (window as unknown as {
        ng: {getComponent: (target: Element) => {doc: any}};
      }).ng;
      const doc = debug.getComponent(editorElement).doc;
      const block = doc.getBlockById(blockId);
      return {
        phase: doc.inputManger.compositionSession.phase,
        text: block.textContent(),
        revisionCount: doc.revisions.list().length,
        marked: editor.querySelectorAll(
          'c-element[data-bc-revision-kind="insert"]' +
          '[data-bc-revision-state="pending"]',
        ).length,
      };
    }, target.blockId), {timeout: 2_000}).toEqual({
      phase: 'idle',
      text: target.before + '中文输入',
      revisionCount: 1,
      marked: 1,
    });
    const eventTypes = await page.evaluate(() =>
      (window as unknown as {
        __bcRevisionImeEvents: Array<{type: string}>;
      }).__bcRevisionImeEvents.map(event => event.type),
    );
    expect(eventTypes).toContain('compositionend');
  } finally {
    await cdp.detach();
  }

  const insertion = page.locator(
    `${codeSelector} c-element[data-bc-revision-kind="insert"]` +
    '[data-bc-revision-state="pending"]',
  ).filter({hasText: '中文输入'});
  await expect(insertion).toHaveCount(1);

  // Wait past the asynchronous Shiki repaint and the post-composition frame.
  await page.waitForTimeout(700);
  await expect(insertion).toHaveCount(1);
  const presentation = await insertion.evaluate(element => {
    const root = element.closest<HTMLElement>('[data-blockcraft-root="true"]')!;
    const probe = document.createElement('span');
    probe.style.color = 'var(--bc-revision-insert-color)';
    root.appendChild(probe);
    const expectedColor = getComputedStyle(probe).color;
    probe.remove();
    return {
      inlineColor: (element as HTMLElement).style.color,
      color: getComputedStyle(element).color,
      expectedColor,
      textDecoration: getComputedStyle(element).textDecorationLine,
    };
  });
  expect(presentation.inlineColor).toBe('');
  expect(presentation.color).toBe(presentation.expectedColor);
  expect(presentation.textDecoration).toContain('underline');
  expect(await readNativeInlineCaret(page, codeSelector, target.blockId)).toBe(
    target.offset + '中文输入'.length,
  );
});

test('code block keeps pending insertion presentation after an IME commit', async ({page}) => {
  await initialize(page);
  const target = await prepareCodeComposition(page);
  expect(await dispatchComposition(page, target.blockId, 'compositionstart')).toBe('active');
  expect(await dispatchComposition(page, target.blockId, 'compositionend', '中文输入')).toBe('idle');

  const state = await page.locator(codeSelector).first().evaluate((editor, blockId) => {
    const editorElement = editor.closest('block-craft-editor')!;
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}};
    }).ng;
    const doc = debug.getComponent(editorElement).doc;
    const block = doc.getBlockById(blockId);
    return {
      text: block.textContent(),
      revisions: doc.revisions.list().map((revision: any) => ({
        id: revision.id,
        kind: revision.kind,
        status: revision.status,
        target: revision.target,
      })),
    };
  }, target.blockId);
  expect(state.text.endsWith('中文输入')).toBe(true);
  expect(state.text.split('中文输入')).toHaveLength(2);
  expect(state.revisions).toEqual([
    expect.objectContaining({kind: 'text-insert', status: 'pending'}),
  ]);

  const insertion = page.locator(
    `${codeSelector} c-element[data-bc-revision-kind="insert"][data-bc-revision-state="pending"]`,
  ).filter({hasText: '中文输入'});
  await expect(insertion).toHaveCount(1);

  // Let the compositionend microtask paint finish, then model the browser's
  // final native input/DOM write. The canonical revision projection must win
  // on the next frame instead of leaving a Shiki-colored unmarked run behind.
  await page.waitForTimeout(50);
  await simulateTrailingImeDomWrite(page, codeSelector, '中文输入');
  await page.waitForTimeout(500);
  await expect(insertion).toHaveCount(1);
  const presentation = await insertion.evaluate(element => {
    const root = element.closest<HTMLElement>('[data-blockcraft-root="true"]')!;
    const probe = document.createElement('span');
    probe.style.color = 'var(--bc-revision-insert-color)';
    root.appendChild(probe);
    const expectedColor = getComputedStyle(probe).color;
    probe.remove();
    return {
      inlineColor: (element as HTMLElement).style.color,
      color: getComputedStyle(element).color,
      expectedColor,
      textDecoration: getComputedStyle(element).textDecorationLine,
    };
  });
  expect(presentation.inlineColor).toBe('');
  expect(presentation.color).toBe(presentation.expectedColor);
  expect(presentation.textDecoration).toContain('underline');
  expect(await readNativeInlineCaret(page, codeSelector, target.blockId)).toBe(
    target.offset + '中文输入'.length,
  );
});

test('Mermaid textarea keeps pending insertion presentation after an IME commit', async ({page}) => {
  await initialize(page);
  const target = await prepareMermaidComposition(page);
  expect(await dispatchComposition(page, target.blockId, 'compositionstart')).toBe('active');
  expect(await dispatchComposition(page, target.blockId, 'compositionend', '中文节点')).toBe('idle');

  const state = await page.locator(target.selector).evaluate((editor, blockId) => {
    const editorElement = editor.closest('block-craft-editor')!;
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}};
    }).ng;
    const doc = debug.getComponent(editorElement).doc;
    const block = doc.getBlockById(blockId);
    return {
      text: block.textContent(),
      revisions: doc.revisions.list()
        .filter((revision: any) => revision.kind === 'text-insert')
        .map((revision: any) => ({
          kind: revision.kind,
          status: revision.status,
        })),
    };
  }, target.blockId);
  expect(state).toEqual({
    text: target.before + '中文节点',
    revisions: [expect.objectContaining({kind: 'text-insert', status: 'pending'})],
  });

  const insertion = page.locator(
    `${target.selector} c-element[data-bc-revision-kind="insert"]` +
    '[data-bc-revision-state="pending"]',
  ).filter({hasText: '中文节点'});
  await expect(insertion).toHaveCount(1);

  await page.waitForTimeout(50);
  await simulateTrailingImeDomWrite(page, target.selector, '中文节点');
  await page.waitForTimeout(500);
  await expect(insertion).toHaveCount(1);
  const presentation = await insertion.evaluate(element => {
    const root = element.closest<HTMLElement>('[data-blockcraft-root="true"]')!;
    const probe = document.createElement('span');
    probe.style.color = 'var(--bc-revision-insert-color)';
    root.appendChild(probe);
    const expectedColor = getComputedStyle(probe).color;
    probe.remove();
    return {
      inlineColor: (element as HTMLElement).style.color,
      color: getComputedStyle(element).color,
      expectedColor,
      textDecoration: getComputedStyle(element).textDecorationLine,
    };
  });
  expect(presentation.inlineColor).toBe('');
  expect(presentation.color).toBe(presentation.expectedColor);
  expect(presentation.textDecoration).toContain('underline');
  expect(await readNativeInlineCaret(page, target.selector, target.blockId)).toBe(
    target.offset + '中文节点'.length,
  );
});
