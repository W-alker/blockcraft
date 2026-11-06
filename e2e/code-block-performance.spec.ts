import {expect, test, type Page} from '@playwright/test';

const source = Array.from({length: 120}, (_, index) =>
  `const value${index} = {label: "row${index}", enabled: true};`,
).join('\n');

async function initialize(page: Page, text = source): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', {name: '初始化', exact: true}).click();
  await expect(page.locator('div.code-block').first()).toBeVisible();
  await page.locator('block-craft-editor').evaluate(async (editor, content) => {
    const doc = (window as any).ng.getComponent(editor).doc;
    const snapshot = doc.schemas.createSnapshot('code', [content]);
    snapshot.props.lang = 'TypeScript';
    const [id] = doc.crud.insertBlockSnapshots(doc.rootId, 0, [snapshot]);
    await doc.navigateToBlock(id);
    const block = doc.getBlockById(id);
    const state = {id, lastHighlighted: '', completed: 0, requested: 0};
    (window as any).__codePerformanceTest = state;
    for (const name of ['renderCode', 'diffHighLight']) {
      const original = block.runtime[name].bind(block.runtime);
      block.runtime[name] = async (...args: unknown[]) => {
        const request = ++state.requested;
        await original(...args);
        if (request !== state.requested) return;
        state.lastHighlighted = block.textContent();
        state.completed++;
      };
    }
    await block.runtime.renderCode();
    doc.crud.undoManager.clearHistory();
  }, text);
  await expectText(page, text);
}

async function readState(page: Page) {
  return page.locator('block-craft-editor').evaluate(editor => {
    const doc = (window as any).ng.getComponent(editor).doc;
    const state = (window as any).__codePerformanceTest;
    const block = doc.getBlockById(state.id);
    const selection = window.getSelection();
    const caret = selection?.focusNode && block.containerElement.contains(selection.focusNode)
      ? block.runtime.domPointToModel(selection.focusNode, selection.focusOffset) : null;
    return {
      model: block.textContent(),
      dom: Array.from(block.containerElement.querySelectorAll('c-text'))
        .map((node: any) => node.textContent).join(''),
      lastHighlighted: state.lastHighlighted,
      completed: state.completed,
      caret,
      colors: Array.from(new Set(Array.from(block.containerElement.querySelectorAll('c-text'))
        .map((node: any) => getComputedStyle(node).color))),
    };
  });
}

async function expectText(page: Page, expected: string): Promise<void> {
  await expect.poll(async () => {
    const state = await readState(page);
    return {model: state.model, dom: state.dom, highlighted: state.lastHighlighted};
  }).toEqual({model: expected, dom: expected, highlighted: expected});
}

async function setSelection(page: Page, start: number, length = 0): Promise<void> {
  await page.locator('block-craft-editor').evaluate((editor, args) => {
    const doc = (window as any).ng.getComponent(editor).doc;
    const block = doc.getBlockById((window as any).__codePerformanceTest.id);
    block.setInlineRange(args.start, args.length);
    editor.querySelector<HTMLElement>('[data-blockcraft-root="true"]')?.focus({preventScroll: true});
  }, {start, length});
}

async function readLines(page: Page) {
  return page.locator('block-craft-editor').evaluate(editor => {
    const doc = (window as any).ng.getComponent(editor).doc;
    const block = doc.getBlockById((window as any).__codePerformanceTest.id);
    const container: HTMLElement = block.containerElement;
    const lines = Array.from(container.querySelectorAll<HTMLElement>(':scope > c-line'));
    return {
      children: Array.from(container.children).map(node => node.localName),
      text: lines.map(line => Array.from(line.querySelectorAll('c-text')).map(node => node.textContent).join('')),
      leadingGapInFirstLine: !!lines[0]?.querySelector('[data-zero-space]'),
      endBreakInLastLine: !!lines.at(-1)?.querySelector('.bc-end-break'),
      legacyMarkers: container.querySelectorAll('[data-bc-line-break], [data-line-break]').length,
      reset: getComputedStyle(container).counterReset,
      lineHeight: parseFloat(getComputedStyle(container).lineHeight),
      rows: lines.map(line => {
        const style = getComputedStyle(line);
        const before = getComputedStyle(line, '::before');
        const rect = line.getBoundingClientRect();
        return {top: rect.top, height: rect.height, display: style.display,
          increment: style.counterIncrement, content: before.content,
          visibility: before.visibility,
          userSelect: before.getPropertyValue('user-select') || before.getPropertyValue('-webkit-user-select')};
      }),
    };
  });
}

async function expectLines(page: Page, text: string): Promise<void> {
  const expected = text.split('\n').map((line, index, lines) => line + (index < lines.length - 1 ? '\n' : ''));
  await expect.poll(async () => (await readLines(page)).text).toEqual(expected);
  const actual = await readLines(page);
  expect(actual.children).toEqual(expected.map(() => 'c-line'));
  expect(actual.leadingGapInFirstLine).toBe(true);
  expect(actual.endBreakInLastLine).toBe(true);
  expect(actual.legacyMarkers).toBe(0);
}

async function prepareCompositionIdentity(page: Page, offset: number): Promise<void> {
  await setSelection(page, offset);
  await page.locator('block-craft-editor').evaluate(editor => {
    const doc = (window as any).ng.getComponent(editor).doc;
    const state = (window as any).__codePerformanceTest;
    const block = doc.getBlockById(state.id);
    const lines = Array.from(block.containerElement.querySelectorAll('c-line')) as HTMLElement[];
    state.imeIdentity = {firstLine: lines[0], lastLine: lines.at(-1),
      firstLeaf: lines[0].querySelector('c-text'), lastLeaf: lines.at(-1)!.querySelector('c-text'), builds: 0};
    const build = block.runtime.scrollBlot.build.bind(block.runtime.scrollBlot);
    block.runtime.scrollBlot.build = (...args: unknown[]) => {
      state.imeIdentity.builds++;
      return build(...args);
    };
  });
}

async function dispatchCodeComposition(page: Page, type: 'compositionstart' | 'compositionend', data = '') {
  return page.locator('block-craft-editor').evaluate((editor, args) => {
    const doc = (window as any).ng.getComponent(editor).doc;
    const block = doc.getBlockById((window as any).__codePerformanceTest.id);
    block.containerElement.dispatchEvent(new CompositionEvent(args.type, {
      bubbles: true, cancelable: true, data: args.data,
    }));
    return doc.inputManger.compositionSession.phase;
  }, {type, data});
}

async function expectCompositionIdentity(page: Page, expected: string, caret: number): Promise<void> {
  await expectText(page, expected);
  // Flush compositionend's queued native-DOM recovery and the next paint.
  await page.evaluate(() => new Promise<void>(resolve =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  ));
  await expectText(page, expected);
  expect((await readState(page)).caret).toBe(caret);
  const identity = await page.locator('block-craft-editor').evaluate(editor => {
    const doc = (window as any).ng.getComponent(editor).doc;
    const state = (window as any).__codePerformanceTest;
    const block = doc.getBlockById(state.id);
    const stable = state.imeIdentity;
    const lines = block.containerElement.querySelectorAll('c-line');
    return {firstLine: lines[0] === stable.firstLine,
      lastLine: lines[lines.length - 1] === stable.lastLine,
      firstLeaf: stable.firstLeaf.isConnected, lastLeaf: stable.lastLeaf.isConnected,
      builds: stable.builds, phase: doc.inputManger.compositionSession.phase};
  });
  expect(identity).toEqual({firstLine: true, lastLine: true, firstLeaf: true, lastLeaf: true,
    builds: 0, phase: 'idle'});
}

test('localized code edits preserve untouched DOM and the native caret', async ({page}) => {
  await initialize(page);
  const offset = source.indexOf('"row60"') + 4;
  await page.locator('block-craft-editor').evaluate(editor => {
    const doc = (window as any).ng.getComponent(editor).doc;
    const block = doc.getBlockById((window as any).__codePerformanceTest.id);
    (window as any).__codeStableNodes = [
      block.containerElement.querySelector('c-line'),
      block.containerElement.querySelectorAll('c-line')[119],
      block.containerElement.querySelector('c-text'),
      block.containerElement.querySelectorAll('c-text')[block.containerElement.querySelectorAll('c-text').length - 1],
    ];
  });
  await setSelection(page, offset);
  // insertText() uses an IME commit in Firefox, whose canonical recovery may
  // legitimately rebuild the whole block. This case measures ordinary typing.
  await page.keyboard.type('X');
  const expected = source.slice(0, offset) + 'X' + source.slice(offset);
  await expectText(page, expected);
  await expectLines(page, expected);
  expect((await readState(page)).caret).toBe(offset + 1);
  expect(await page.evaluate(() => (window as any).__codeStableNodes.every((node: Node) => node.isConnected))).toBe(true);
});

test('multiline paste and deletion round-trip through Undo and Redo', async ({page}) => {
  await initialize(page);
  const offset = source.indexOf('const value60');
  const pasted = '// 中文 👩‍💻\nconst pasted = `first\nsecond`;\n';
  await setSelection(page, offset);
  await page.locator('block-craft-editor').evaluate((editor, content) => {
    const doc = (window as any).ng.getComponent(editor).doc;
    const block = doc.getBlockById((window as any).__codePerformanceTest.id);
    const data = new DataTransfer();
    data.setData('text/plain', content);
    const event = new ClipboardEvent('paste', {bubbles: true, cancelable: true});
    // Firefox ignores ClipboardEventInit.clipboardData on synthetic events.
    Object.defineProperty(event, 'clipboardData', {value: data});
    block.containerElement.dispatchEvent(event);
  }, pasted);
  const inserted = source.slice(0, offset) + pasted + source.slice(offset);
  await expectText(page, inserted);
  await page.keyboard.press('ControlOrMeta+z');
  await expectText(page, source);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expectText(page, inserted);
  await page.locator('block-craft-editor').evaluate(editor => {
    (window as any).ng.getComponent(editor).doc.crud.undoManager.stopCapturing();
  });
  await setSelection(page, offset, pasted.length);
  await page.keyboard.press('Backspace');
  await expectText(page, source);
  expect((await readState(page)).caret).toBe(offset);
});

test('language and theme changes invalidate cached highlight colors without changing text', async ({page}) => {
  await initialize(page);
  const initial = await readState(page);
  expect(initial.colors.length).toBeGreaterThan(1);
  await page.locator('block-craft-editor').evaluate(editor => {
    const doc = (window as any).ng.getComponent(editor).doc;
    doc.toggleTheme('dark');
  });
  await expect.poll(async () => (await readState(page)).completed).toBeGreaterThan(initial.completed);
  const dark = await readState(page);
  expect(dark.colors).not.toEqual(initial.colors);
  await expectText(page, source);
  await page.locator('block-craft-editor').evaluate(editor => {
    const doc = (window as any).ng.getComponent(editor).doc;
    doc.getBlockById((window as any).__codePerformanceTest.id).changeLanguage('PlainText');
  });
  await expect.poll(async () => (await readState(page)).completed).toBeGreaterThan(dark.completed);
  expect((await readState(page)).colors.length).toBe(1);
  await expectText(page, source);
});

test('multiline grammar state propagates to later lines and recovers after deletion', async ({page}) => {
  const code = 'const before = true;\nconst first = 1;\nconst second = 2;\nconst last = 3;';
  await initialize(page, code);
  const offset = code.indexOf('const first');
  const originalColors = await page.locator('block-craft-editor').evaluate(editor => {
    const doc = (window as any).ng.getComponent(editor).doc;
    const block = doc.getBlockById((window as any).__codePerformanceTest.id);
    return Array.from(block.containerElement.querySelectorAll('c-text'))
      .flatMap((node: any) => Array.from(node.textContent as string)
        .map(character => [character, getComputedStyle(node).color]));
  });
  await setSelection(page, offset);
  await page.keyboard.insertText('/*');
  await expectText(page, code.slice(0, offset) + '/*' + code.slice(offset));
  const commentColors = await page.locator('block-craft-editor').evaluate(editor => {
    const doc = (window as any).ng.getComponent(editor).doc;
    const block = doc.getBlockById((window as any).__codePerformanceTest.id);
    const colors = Array.from(block.containerElement.querySelectorAll('c-text'))
      .flatMap((node: any) => Array.from(node.textContent as string)
        .map(() => getComputedStyle(node).color));
    const start = block.textContent().indexOf('const second');
    return colors.slice(start, start + 'const second = 2;'.length);
  });
  expect(new Set(commentColors).size).toBe(1);
  expect(commentColors[0]).not.toBe(originalColors[code.indexOf('const second')][1]);
  await setSelection(page, offset, 2);
  await page.keyboard.press('Backspace');
  await expectText(page, code);
  const restoredColors = await page.locator('block-craft-editor').evaluate(editor => {
    const doc = (window as any).ng.getComponent(editor).doc;
    const block = doc.getBlockById((window as any).__codePerformanceTest.id);
    return Array.from(block.containerElement.querySelectorAll('c-text'))
      .flatMap((node: any) => Array.from(node.textContent as string)
        .map(character => [character, getComputedStyle(node).color]));
  });
  expect(restoredColors).toEqual(originalColors);
});

test('composition in another paragraph does not block code theme and language highlighting', async ({page}) => {
  const code = 'const value = {label: "first", enabled: true};';
  await initialize(page, code);
  const before = await readState(page);
  try {
    await page.locator('block-craft-editor').evaluate(async editor => {
      const doc = (window as any).ng.getComponent(editor).doc;
      const snapshot = doc.schemas.createSnapshot('paragraph', ['正在输入']);
      const [id] = doc.crud.insertBlockSnapshots(doc.rootId, 1, [snapshot]);
      await doc.navigateToBlock(id);
      doc.inputManger.compositionSession.start(doc.getBlockById(id), 0);
      doc.toggleTheme('dark');
    });
    await expect.poll(async () => (await readState(page)).completed).toBeGreaterThan(before.completed);
    const dark = await readState(page);
    expect(dark.colors).not.toEqual(before.colors);
    await page.locator('block-craft-editor').evaluate(editor => {
      const doc = (window as any).ng.getComponent(editor).doc;
      doc.getBlockById((window as any).__codePerformanceTest.id).changeLanguage('PlainText');
    });
    await expect.poll(async () => (await readState(page)).completed).toBeGreaterThan(dark.completed);
    expect((await readState(page)).colors.length).toBe(1);
    await expectText(page, code);
    expect(await page.locator('block-craft-editor').evaluate(editor =>
      (window as any).ng.getComponent(editor).doc.inputManger.compositionSession.isActive,
    )).toBe(true);
  } finally {
    await page.locator('block-craft-editor').evaluate(editor => {
      (window as any).ng.getComponent(editor).doc.inputManger.compositionSession.reset();
    });
  }
});

test('asynchronous highlight preserves a newer backward native selection', async ({page}) => {
  const code = 'const first = 1;\nconst second = "value";\nconst third = true;';
  await initialize(page, code);
  const before = await readState(page);
  await setSelection(page, 2);
  await page.locator('block-craft-editor').evaluate(editor => {
    const doc = (window as any).ng.getComponent(editor).doc;
    const state = (window as any).__codePerformanceTest;
    const block = doc.getBlockById(state.id);
    const original = block.runtime._tokenize;
    block.runtime._tokenize = async (...args: unknown[]) => {
      const result = await original.apply(block.runtime, args);
      await new Promise<void>(resolve => { state.releaseHighlight = resolve; });
      return result;
    };
    state.restoreTokenizer = () => { block.runtime._tokenize = original; };
    doc.toggleTheme('dark');
  });
  await page.waitForFunction(() => !!(window as any).__codePerformanceTest.releaseHighlight);
  const anchor = code.length - 2;
  const head = code.indexOf('second');
  const beforeRelease = await page.locator('block-craft-editor').evaluate((editor, selection) => {
    const doc = (window as any).ng.getComponent(editor).doc;
    const state = (window as any).__codePerformanceTest;
    const block = doc.getBlockById(state.id);
    const anchorPoint = block.runtime.modelPointToDom(selection.anchor);
    const headPoint = block.runtime.modelPointToDom(selection.head);
    const native = window.getSelection()!;
    // Model a new native drag selection while the previous highlight awaits.
    native.setBaseAndExtent(anchorPoint.node, anchorPoint.offset, headPoint.node, headPoint.offset);
    const actual = {
      anchor: block.runtime.domPointToModel(native.anchorNode, native.anchorOffset),
      head: block.runtime.domPointToModel(native.focusNode, native.focusOffset),
    };
    state.restoreTokenizer();
    state.releaseHighlight();
    return actual;
  }, {anchor, head});
  expect(beforeRelease).toEqual({anchor, head});
  await expect.poll(async () => (await readState(page)).completed).toBeGreaterThan(before.completed);
  await expectText(page, code);
  const endpoints = await page.locator('block-craft-editor').evaluate(editor => {
    const doc = (window as any).ng.getComponent(editor).doc;
    const block = doc.getBlockById((window as any).__codePerformanceTest.id);
    const selection = window.getSelection()!;
    return {
      anchor: block.runtime.domPointToModel(selection.anchorNode, selection.anchorOffset),
      head: block.runtime.domPointToModel(selection.focusNode, selection.focusOffset),
      selected: selection.toString(),
    };
  });
  expect(endpoints).toEqual({anchor, head, selected: code.slice(head, anchor)});
});

for (const [name, code] of [
  ['empty code', ''],
  ['leading and middle empty lines plus trailing LF', '\nconst first = 1;\n\nconst last = 2;\n'],
] as const) {
  test(`logical c-line structure preserves ${name}`, async ({page}) => {
    await initialize(page, code);
    await expectLines(page, code);
    const lines = await readLines(page);
    expect(lines.lineHeight).toBeGreaterThan(0);
    for (const [index, row] of lines.rows.entries()) {
      expect(row.display).toBe('block');
      expect(row.height).toBeCloseTo(lines.lineHeight, 0);
      if (index) expect(row.top - lines.rows[index - 1].top).toBeCloseTo(lines.lineHeight, 0);
    }
    // The empty final line must be a real caret destination, including when
    // there is no text leaf and the zero-length BreakBlot owns the destination.
    await setSelection(page, code.length);
    expect((await readState(page)).caret).toBe(code.length);
    await page.keyboard.type('X');
    await expectText(page, code + 'X');
    await expectLines(page, code + 'X');
  });
}

test('Enter splits a c-line and Backspace removes empty lines and merges text lines', async ({page}) => {
  const code = 'const first = 1;\nconst second = 2;';
  const offset = code.indexOf('\n');
  await initialize(page, code);
  await setSelection(page, offset);
  await page.keyboard.press('Enter');
  const split = code.slice(0, offset) + '\n' + code.slice(offset);
  await expectText(page, split);
  await expectLines(page, split);
  expect((await readState(page)).caret).toBe(offset + 1);
  await page.keyboard.press('Backspace');
  await expectText(page, code);
  await expectLines(page, code);
  await setSelection(page, offset + 1);
  await page.keyboard.press('Backspace');
  const merged = code.replace('\n', '');
  await expectText(page, merged);
  await expectLines(page, merged);
  expect((await readState(page)).caret).toBe(offset);
});

test('cross-line selection copies exact model text without generated line numbers', async ({page}) => {
  const code = 'const first = "中文";\n\nconst second = "👩‍💻";\nconst last = true;\n';
  await initialize(page, code);
  const start = code.indexOf('first');
  const end = code.indexOf('last') + 'last'.length;
  await setSelection(page, start, end - start);
  const result = await page.locator('block-craft-editor').evaluate(editor => {
    const doc = (window as any).ng.getComponent(editor).doc;
    const block = doc.getBlockById((window as any).__codePerformanceTest.id);
    const selection = window.getSelection()!;
    const before = block.textContent();
    const data = new DataTransfer();
    const event = new ClipboardEvent('copy', {bubbles: true, cancelable: true});
    Object.defineProperty(event, 'clipboardData', {value: data});
    block.containerElement.dispatchEvent(event);
    return {copied: data.getData('text/plain'), selected: selection.toString(),
      anchor: block.runtime.domPointToModel(selection.anchorNode, selection.anchorOffset),
      head: block.runtime.domPointToModel(selection.focusNode, selection.focusOffset),
      prevented: event.defaultPrevented, unchanged: before === block.textContent()};
  });
  expect(result).toEqual({copied: code.slice(start, end), selected: code.slice(start, end),
    anchor: start, head: end, prevented: true, unchanged: true});
  await expectLines(page, code);
});

test('CSS counters follow logical lines and show their gutter only while code is focused', async ({page}) => {
  const code = 'const first = 1;\n\nconst last = 2;\n';
  await initialize(page, code);
  await setSelection(page, 2);
  await expect.poll(async () => (await readLines(page)).rows.map(row => row.visibility))
    .toEqual(code.split('\n').map(() => 'visible'));
  const focused = await readLines(page);
  expect(focused.reset).toMatch(/\bline\b/);
  for (const row of focused.rows) {
    expect(row.increment).toMatch(/\bline\b/);
    expect(row.content).toContain('counter(line)');
    expect(row.userSelect).toBe('none');
  }
  // Moving the selection into another real block exercises the existing
  // focused state instead of manually changing classes in the fixture.
  await page.locator('block-craft-editor').evaluate(async editor => {
    const doc = (window as any).ng.getComponent(editor).doc;
    const snapshot = doc.schemas.createSnapshot('paragraph', ['outside code']);
    const [id] = doc.crud.insertBlockSnapshots(doc.rootId, 1, [snapshot]);
    await doc.navigateToBlock(id);
    doc.getBlockById(id).setInlineRange(1, 0);
  });
  await expect.poll(async () => (await readLines(page)).rows.map(row => row.visibility))
    .toEqual(code.split('\n').map(() => 'hidden'));
});

test('readonly snapshot keeps logical code lines through initial render and updated content', async ({page}) => {
  const code = '\nconst value = "snapshot";\n\n';
  await initialize(page, code);
  const id = await page.evaluate(() => (window as any).__codePerformanceTest.id as string);
  const snapshotCode = page.locator(`bc-snapshot-viewer .code-block[data-block-id="${id}"]`);
  const inspectSnapshot = () => snapshotCode.evaluate(block => {
    const container = block.querySelector<HTMLElement>('.edit-container')!;
    const lines = Array.from(container.querySelectorAll<HTMLElement>(':scope > c-line'));
    return {
      text: lines.map(line => Array.from(line.querySelectorAll('c-text')).map(node => node.textContent).join('')),
      children: Array.from(container.children).map(node => node.localName),
      legacyMarkers: container.querySelectorAll('[data-bc-line-break], [data-line-break]').length,
      editable: container.isContentEditable,
      reset: getComputedStyle(container).counterReset,
      lineHeight: parseFloat(getComputedStyle(container).lineHeight),
      rows: lines.map(line => ({height: line.getBoundingClientRect().height,
        increment: getComputedStyle(line).counterIncrement,
        content: getComputedStyle(line, '::before').content})),
      colors: new Set(Array.from(container.querySelectorAll('c-text')).map(node => getComputedStyle(node).color)).size,
    };
  });
  for (const content of [code, code + '// appended']) {
    if (content !== code) {
      await page.getByRole('tab', {name: '编辑器', exact: true}).click();
      await setSelection(page, code.length);
      await page.keyboard.type('// appended');
      await expectText(page, content);
    }
    await page.getByRole('tab', {name: 'Snapshot Viewer', exact: true}).click();
    await expect(snapshotCode).toBeVisible();
    const expected = content.split('\n').map((line, index, lines) => line + (index < lines.length - 1 ? '\n' : ''));
    await expect.poll(async () => (await inspectSnapshot()).text).toEqual(expected);
    await expect.poll(async () => (await inspectSnapshot()).colors).toBeGreaterThan(1);
    const state = await inspectSnapshot();
    expect(state.children).toEqual(expected.map(() => 'c-line'));
    expect(state.legacyMarkers).toBe(0);
    expect(state.editable).toBe(false);
    expect(state.reset).toMatch(/\bline\b/);
    for (const row of state.rows) {
      expect(row.height).toBeCloseTo(state.lineHeight, 0);
      expect(row.increment).toMatch(/\bline\b/);
      expect(row.content).toContain('counter(line)');
    }
  }
});

test('a wrapped logical line keeps one counter and advances following lines by its full height', async ({page}) => {
  const code = `const long = "${'wrapped words '.repeat(40)}";\n\nconst last = 2;\n`;
  await page.setViewportSize({width: 1280, height: 900});
  await initialize(page, code);
  await expectLines(page, code);
  const lines = await readLines(page);
  expect(lines.rows).toHaveLength(4);
  expect(lines.rows[0].height).toBeGreaterThan(lines.lineHeight * 2);
  for (const [index, row] of lines.rows.entries()) {
    expect(row.increment).toMatch(/^line(?: 1)?$/);
    expect(row.content).toContain('counter(line)');
    if (index) {
      const previous = lines.rows[index - 1];
      expect(row.top - previous.top).toBeCloseTo(previous.height, 0);
      expect(row.height).toBeCloseTo(lines.lineHeight, 0);
    }
  }
});

test('a hidden revision at a logical line start keeps a visible mapping and its model offset', async ({page}) => {
  const code = 'const first = 1;\nOLDconst second = 2;';
  const offset = code.indexOf('OLD');
  await initialize(page, code);
  await page.getByRole('button', {name: '开启修订', exact: true}).click();
  await expect(page.getByRole('button', {name: '关闭修订', exact: true})).toBeVisible();
  await setSelection(page, offset, 3);
  await page.keyboard.press('Backspace');
  await expect.poll(async () => page.locator('block-craft-editor').evaluate(editor => {
    const doc = (window as any).ng.getComponent(editor).doc;
    return doc.revisions.list().some((record: any) =>
      doc.revisions.readRevisionContent(record.id) === 'OLD');
  })).toBe(true);
  await page.locator('block-craft-editor').evaluate(editor => {
    (window as any).ng.getComponent(editor).doc.revisions.setViewMode('final');
  });
  await expect.poll(async () => page.locator('block-craft-editor').evaluate((editor, offset) => {
    const doc = (window as any).ng.getComponent(editor).doc;
    const block = doc.getBlockById((window as any).__codePerformanceTest.id);
    let cursor = 0;
    const pieces: {text: string; hidden: boolean}[] = [];
    for (const node of block.containerElement.querySelectorAll('c-text')) {
      const text = node.textContent ?? '';
      const start = Math.max(offset, cursor);
      const end = Math.min(offset + 3, cursor + text.length);
      if (end > start) pieces.push({text: text.slice(start - cursor, end - cursor),
        hidden: getComputedStyle(node.closest('c-element')).display === 'none'});
      cursor += text.length;
    }
    return {connected: block.containerElement.isConnected,
      text: pieces.map(piece => piece.text).join(''), hidden: pieces.every(piece => piece.hidden)};
  }, offset)).toEqual({connected: true, text: 'OLD', hidden: true});
  const state = await page.locator('block-craft-editor').evaluate((editor, offset) => {
    const doc = (window as any).ng.getComponent(editor).doc;
    const block = doc.getBlockById((window as any).__codePerformanceTest.id);
    const point = block.runtime.mapper.modelPointToDomPoint(block.containerElement, offset, 'after');
    const line = block.containerElement.querySelectorAll('c-line')[1];
    const native = window.getSelection()!;
    native.setBaseAndExtent(point.node, point.offset, point.node, point.offset);
    return {model: block.textContent(), pointIsVisibleLine: point.node === line,
      display: getComputedStyle(line).display, height: line.getBoundingClientRect().height,
      offset: block.runtime.domPointToModel(native.focusNode, native.focusOffset),
      editable: block.containerElement.isContentEditable};
  }, offset);
  expect(state).toMatchObject({model: code, pointIsVisibleLine: true, display: 'block', offset, editable: false});
  expect(state.height).toBeGreaterThan(0);
});

test('IME simulated commit preserves untouched code lines and leaves', async ({page}) => {
  await initialize(page);
  const offset = source.indexOf('"row60"') + 4;
  await prepareCompositionIdentity(page, offset);
  expect(await dispatchCodeComposition(page, 'compositionstart')).toBe('active');
  expect(await dispatchCodeComposition(page, 'compositionend', '中文输入')).toBe('idle');
  await expectCompositionIdentity(page, source.slice(0, offset) + '中文输入' + source.slice(offset), offset + 4);
});

test('IME cancellation preserves the original code and untouched DOM', async ({page}) => {
  await initialize(page);
  const offset = source.indexOf('"row60"') + 4;
  await prepareCompositionIdentity(page, offset);
  expect(await dispatchCodeComposition(page, 'compositionstart')).toBe('active');
  expect(await dispatchCodeComposition(page, 'compositionend')).toBe('idle');
  await expectCompositionIdentity(page, source, offset);
});

test('IME multiline comment commit updates grammar without rebuilding untouched outer lines', async ({page}) => {
  const code = 'const first = 1;\nconst target = 2;\nconst inside = 3;\n*/\nconst last = true;';
  await initialize(page, code);
  const offset = code.indexOf('const target');
  const inserted = '/* 中文注释\n';
  const initialKeywordColor = await page.locator('block-craft-editor').evaluate(editor => {
    const doc = (window as any).ng.getComponent(editor).doc;
    const block = doc.getBlockById((window as any).__codePerformanceTest.id);
    return getComputedStyle(block.containerElement.querySelector('c-text')).color;
  });
  await prepareCompositionIdentity(page, offset);
  expect(await dispatchCodeComposition(page, 'compositionstart')).toBe('active');
  expect(await dispatchCodeComposition(page, 'compositionend', inserted)).toBe('idle');
  const expected = code.slice(0, offset) + inserted + code.slice(offset);
  await expectText(page, expected);
  const insideColors = await page.locator('block-craft-editor').evaluate(editor => {
    const doc = (window as any).ng.getComponent(editor).doc;
    const block = doc.getBlockById((window as any).__codePerformanceTest.id);
    const colors = Array.from(block.containerElement.querySelectorAll('c-text'))
      .flatMap((node: any) => Array.from(node.textContent as string).map(() => getComputedStyle(node).color));
    const start = block.textContent().indexOf('const inside');
    return colors.slice(start, start + 'const inside = 3;'.length);
  });
  expect(new Set(insideColors).size).toBe(1);
  expect(insideColors[0]).not.toBe(initialKeywordColor);
  await expectCompositionIdentity(page, expected, offset + inserted.length);
});

for (const cancel of [false, true]) {
  test(`IME native Chromium ${cancel ? 'cancellation' : 'commit'} preserves untouched code DOM`, async ({page, context, browserName}) => {
    test.skip(browserName !== 'chromium', 'CDP IME input is Chromium-only');
    await initialize(page);
    const offset = source.indexOf('"row60"') + 4;
    await prepareCompositionIdentity(page, offset);
    const cdp = await context.newCDPSession(page);
    try {
      await cdp.send('Input.imeSetComposition', {text: 'zhongwen', selectionStart: 8, selectionEnd: 8});
      expect(await page.locator('block-craft-editor').evaluate(editor => {
        const doc = (window as any).ng.getComponent(editor).doc;
        return {phase: doc.inputManger.compositionSession.phase,
          text: doc.getBlockById((window as any).__codePerformanceTest.id).textContent()};
      })).toEqual({phase: 'active', text: source});
      if (cancel) {
        await cdp.send('Input.imeSetComposition', {text: '', selectionStart: 0, selectionEnd: 0});
      } else {
        await cdp.send('Input.insertText', {text: '中文输入'});
      }
      await expectCompositionIdentity(page,
        cancel ? source : source.slice(0, offset) + '中文输入' + source.slice(offset),
        cancel ? offset : offset + 4);
    } finally {
      await cdp.detach();
    }
  });
}
