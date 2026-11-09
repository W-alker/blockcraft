import {expect, test, type BrowserContext, type Page} from '@playwright/test';
import * as decoding from 'lib0/decoding';
import * as Y from 'yjs';

const websocketPort = 12345;

interface TextRange {anchor: number; head: number}
interface Edit {at: number; remove: number; insert: string}

/** 只监听真实网络更新；测试镜像不向任一编辑器写入数据。 */
class NetworkOracle {
  readonly doc = new Y.Doc({gc: false});
  readonly errors: string[] = [];
  readonly sent = [0, 0];
  readonly received = [0, 0];

  observe(page: Page, room: string, client: number): void {
    page.on('websocket', socket => {
      const url = new URL(socket.url());
      if (url.port !== String(websocketPort) || url.pathname !== `/${room}`) return;
      const consume = (payload: string | Buffer, outbound: boolean) => {
        if (typeof payload === 'string') return;
        try {
          const decoder = decoding.createDecoder(new Uint8Array(payload));
          if (decoding.readVarUint(decoder) !== 0) return; // y-websocket sync envelope
          const type = decoding.readVarUint(decoder);
          if (type !== 1 && type !== 2) return; // SyncStep2 / Update; Step1 is a state vector
          Y.applyUpdate(this.doc, decoding.readVarUint8Array(decoder));
          (outbound ? this.sent : this.received)[client]++;
        } catch (error) {
          this.errors.push(String(error));
        }
      };
      socket.on('framesent', event => consume(event.payload, true));
      socket.on('framereceived', event => consume(event.payload, false));
    });
  }

  text(id: string): Y.Text | undefined {
    return this.doc.getMap<Y.Map<unknown>>('blocks').get(id)?.get('children') as Y.Text | undefined;
  }

  bookmark(id: string, range: TextRange): [Y.RelativePosition, Y.RelativePosition] {
    const text = this.text(id);
    if (!text) throw new Error('network mirror has no code Y.Text');
    return [range.anchor, range.head].map(offset =>
      Y.createRelativePositionFromTypeIndex(text, offset, 0)) as [Y.RelativePosition, Y.RelativePosition];
  }

  resolve(id: string, positions: [Y.RelativePosition, Y.RelativePosition]): TextRange {
    const offsets = positions.map(position => {
      const point = Y.createAbsolutePositionFromRelativePosition(position, this.doc);
      if (!point || point.type !== this.text(id)) throw new Error('remote selection bookmark lost its text');
      return point.index;
    });
    return {anchor: offsets[0], head: offsets[1]};
  }
}

async function prepareTransport(page: Page, room: string, baseURL: string): Promise<void> {
  // 初始化 demo 会启动外链预览；固定该无关响应，避免其延迟跨域错误
  // 在 demo 已删除后污染代码协同的 pageerror 断言。真实协同传输不拦截。
  await page.route('https://affine-worker.toeverything.workers.dev/api/worker/link-preview', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'POST, OPTIONS',
        'access-control-allow-headers': 'Content-Type',
      },
      body: '{}',
    }));
  // 只关闭开发服务 HMR，真实协同连接仍由现有 provider 建立。
  await page.routeWebSocket(url => url.port === new URL(baseURL).port, socket => socket.close());
  await page.addInitScript(({port, roomName}) => {
    const NativeWebSocket = window.WebSocket;
    window.WebSocket = new Proxy(NativeWebSocket, {
      construct(target, args) {
        const url = new URL(String(args[0]));
        if (url.hostname === '196.168.1.153' && url.port === '1234') {
          url.protocol = 'ws:';
          url.hostname = '127.0.0.1';
          url.port = String(port);
          url.pathname = `/${roomName}`;
          args[0] = url.toString();
        }
        return Reflect.construct(target, args);
      },
    });
  }, {port: websocketPort, roomName: room});
}

async function connect(page: Page, initialize: boolean): Promise<void> {
  await page.goto('/', {waitUntil: 'domcontentloaded'});
  if (initialize) {
    await page.getByRole('button', {name: '初始化', exact: true}).click();
    await page.waitForFunction(() => {
      const editor = document.querySelector('block-craft-editor');
      return !!editor && !!(window as any).ng?.getComponent(editor)?.doc?.isInitialized;
    });
  }
  await page.getByRole('button', {name: '进入协同', exact: true}).click();
  await page.waitForFunction(() => {
    const debug = (window as any).ng;
    const editor = document.querySelector('block-craft-editor');
    const app = document.querySelector('playground-home');
    return !!editor && !!app && debug?.getComponent(editor)?.doc?.isInitialized &&
      debug?.getComponent(app)?.provider?.wsconnected === true;
  });
}

async function createSharedCode(page: Page, source: string): Promise<string> {
  return page.locator('block-craft-editor').evaluate(async (editor, text) => {
    const doc = (window as any).ng.getComponent(editor).doc;
    const snapshot = doc.schemas.createSnapshot('code', [text]);
    snapshot.props.lang = 'TypeScript';
    snapshot.props.h = 400;
    const [id] = doc.crud.insertBlockSnapshots(doc.rootId, 0, [snapshot]);
    const others = doc.model.getChildrenIds(doc.rootId).length - 1;
    if (others > 0) doc.crud.deleteBlocks(doc.rootId, 1, others);
    await doc.navigateToBlock(id);
    return id as string;
  }, source);
}

async function installChecks(page: Page, id: string): Promise<void> {
  await page.waitForFunction(blockId => {
    const editor = document.querySelector('block-craft-editor');
    return !!editor && !!(window as any).ng?.getComponent(editor)?.doc?.model.getYBlock(blockId);
  }, id);
  await page.locator('block-craft-editor').evaluate(async (editor, blockId) => {
    const doc = (window as any).ng.getComponent(editor).doc;
    await doc.navigateToBlock(blockId);
    const block = doc.getBlockById(blockId);
    const state: any = {id: blockId, errors: [], requested: 0, pending: 0, highlighted: '', remoteChanges: 0};
    (window as any).__codeCollaborationStress = state;
    const equal = (label: string, actual: string, expected: string) => {
      if (actual === expected) return;
      let at = 0;
      while (at < Math.min(actual.length, expected.length) && actual[at] === expected[at]) at++;
      throw new Error(`${label}: mismatch at ${at}, length ${actual.length}/${expected.length}; ` +
        `${JSON.stringify(actual.slice(at, at + 40))}/${JSON.stringify(expected.slice(at, at + 40))}`);
    };
    state.assertView = (expected: string, range?: TextRange) => {
      equal('Y.Text', block.yText.toString(), expected);
      equal('block model', block.textContent(), expected);
      const container: HTMLElement = block.containerElement;
      // Awareness owns an empty span overlay in the inline host. Exclude only
      // that known shape; all other extra nodes remain a projection failure.
      const contentNodes = Array.from(container.childNodes).filter(node => !(
        node instanceof HTMLElement && node.localName === 'span' &&
        node.classList.contains('blockcraft-cursor') && node.textContent === '' &&
        Array.from(node.querySelectorAll('*')).every(child => child.localName === 'span')
      ));
      const rows = contentNodes.filter((node): node is HTMLElement => node instanceof HTMLElement);
      const expectedRows = expected.split('\n').map((line, index, all) =>
        line + (index < all.length - 1 ? '\n' : ''));
      if (contentNodes.length !== expectedRows.length || rows.length !== contentNodes.length ||
        rows.some(row => row.localName !== 'c-line')) {
        throw new Error(`canonical rows: ${contentNodes.length}/${expectedRows.length}`);
      }
      rows.forEach((row, index) => equal(`row ${index}`,
        Array.from(row.querySelectorAll('c-text')).filter(node => !node.closest('[data-cursor-blot]'))
          .map(node => node.textContent ?? '').join(''), expectedRows[index]));
      const gap = block.runtime.scrollBlot.leadingGapNode;
      if (rows[0]?.firstChild !== gap || gap?.parentNode !== rows[0] ||
        !rows.at(-1)?.querySelector('.bc-end-break > br') ||
        container.querySelector('[data-line-break], [data-bc-line-break]')) {
        throw new Error('canonical leading gap, terminal break or line markers changed');
      }
      if (!range) return;
      const selection = doc.selection.value;
      if (selection?.anchor?.blockId !== blockId || selection?.head?.blockId !== blockId ||
        selection.anchor.offset !== range.anchor || selection.head.offset !== range.head) {
        throw new Error(`model selection ${selection?.anchor?.offset}/${selection?.head?.offset}, ` +
          `expected ${range.anchor}/${range.head}`);
      }
      const native = document.getSelection();
      if (!native?.anchorNode || !native.focusNode || !container.contains(native.anchorNode) ||
        !container.contains(native.focusNode)) throw new Error('native selection left code');
      const anchor = block.runtime.domPointToModel(native.anchorNode, native.anchorOffset);
      const head = block.runtime.domPointToModel(native.focusNode, native.focusOffset);
      if (anchor !== range.anchor || head !== range.head) {
        throw new Error(`native selection ${anchor}/${head}, expected ${range.anchor}/${range.head}`);
      }
    };
    for (const name of ['renderCode', 'diffHighLight']) {
      const original = block.runtime[name].bind(block.runtime);
      block.runtime[name] = async (...args: unknown[]) => {
        const request = ++state.requested;
        const text = block.textContent();
        state.pending++;
        try {
          await original(...args);
          if (request === state.requested && text === block.textContent()) state.highlighted = text;
        } finally {
          state.pending--;
        }
      };
    }
    state.launch = () => {
      void block.runtime.renderCode().catch((error: unknown) => state.errors.push(String(error)));
      void block.runtime.diffHighLight([]).catch((error: unknown) => state.errors.push(String(error)));
    };
    await block.runtime.renderCode();
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    editor.querySelector<HTMLElement>('[data-blockcraft-root="true"]')?.focus({preventScroll: true});
    block.setInlineRange(0);
    doc.crud.undoManager.clearHistory();
    // DocCRUD 在同步投影视图后发布 onTextChange；Y.Text 的浅层 observer 早于该深层投影。
    const subscription = block.onTextChange.subscribe((event: any) => {
      if (!event.tr.local) state.remoteChanges++;
      try { state.assertView(block.textContent()); }
      catch (error) { state.errors.push(`synchronous projection: ${String(error)}`); }
    });
    doc.onDestroy(() => subscription.unsubscribe());
  }, id);
}

async function setRange(page: Page, range: TextRange): Promise<void> {
  await page.locator('block-craft-editor').evaluate((editor, value) => {
    const doc = (window as any).ng.getComponent(editor).doc;
    const id = (window as any).__codeCollaborationStress.id;
    editor.querySelector<HTMLElement>('[data-blockcraft-root="true"]')?.focus({preventScroll: true});
    doc.selection.replay({
      anchor: {type: 'text', blockId: id, offset: value.anchor},
      head: {type: 'text', blockId: id, offset: value.head},
      commonParent: doc.rootId,
    });
  }, range);
}

async function expectConverged(pages: Page[], oracle: NetworkOracle, id: string, text: string): Promise<void> {
  await expect.poll(async () => {
    if (oracle.errors.length) return oracle.errors.join('\n');
    if (oracle.text(id)?.toString() !== text) return 'network mirror pending';
    const results = await Promise.all(pages.map(page => page.evaluate(expected => {
      try {
        (window as any).__codeCollaborationStress.assertView(expected);
        return '';
      } catch (error) { return String(error); }
    }, text)));
    return results.filter(Boolean).join('\n');
  }, {timeout: 20_000, intervals: [20, 50, 100]}).toBe('');
}

async function expectRange(page: Page, text: string, range: TextRange): Promise<void> {
  await expect.poll(() => page.evaluate(({expected, selection}) => {
    try {
      (window as any).__codeCollaborationStress.assertView(expected, selection);
      return '';
    } catch (error) { return String(error); }
  }, {expected: text, selection: range}), {timeout: 15_000, intervals: [20, 50, 100]}).toBe('');
}

/** 完整 Shiki 解析是颜色 oracle；不读增量 tokens/fingerprints，也不触发 layout。 */
async function expectSyntax(page: Page, text: string): Promise<void> {
  await expect.poll(() => page.evaluate(expected => {
    const state = (window as any).__codeCollaborationStress;
    if (state.errors.length) return state.errors.join('\n');
    return state.pending || state.highlighted !== expected ? 'highlight pending' : '';
  }, text), {timeout: 20_000, intervals: [20, 50, 100]}).toBe('');
  const error = await page.locator('block-craft-editor').evaluate((editor, expectedText) => {
    const doc = (window as any).ng.getComponent(editor).doc;
    const state = (window as any).__codeCollaborationStress;
    state.assertView(expectedText);
    const block = doc.getBlockById(state.id);
    const ready = block.runtime._readySyntax;
    if (!ready) return 'full Shiki oracle unavailable';
    const tokens = ready.highlighter.codeToTokens(expectedText, {lang: ready.lang, theme: ready.theme}).tokens;
    const scratch = document.createElement('span');
    const colors = new Map<string, string>();
    const normalize = (color?: string) => {
      if (!color) return '';
      if (!colors.has(color)) {
        scratch.style.color = color;
        colors.set(color, scratch.style.color);
      }
      return colors.get(color)!;
    };
    type Run = {text: string; color: string};
    const append = (runs: Run[], value: string, color: string) => {
      if (!value) return;
      const last = runs.at(-1);
      if (last?.color === color) last.text += value;
      else runs.push({text: value, color});
    };
    const expected: Run[] = [];
    const endings = expectedText.match(/\r?\n/g) ?? [];
    tokens.forEach((line: {content: string; color?: string}[], index: number) => {
      line.forEach(token => append(expected, token.content, normalize(token.color)));
      if (index < tokens.length - 1) append(expected, endings[index] ?? '\n', '');
    });
    const actual: Run[] = [];
    for (const node of block.containerElement.querySelectorAll('c-text') as NodeListOf<HTMLElement>) {
      if (!node.closest('[data-cursor-blot]')) append(actual, node.textContent ?? '', node.parentElement!.style.color);
    }
    for (let index = 0; index < Math.max(actual.length, expected.length); index++) {
      if (actual[index]?.text !== expected[index]?.text || actual[index]?.color !== expected[index]?.color) {
        return `syntax run ${index}/${actual.length}/${expected.length}: ` +
          `${JSON.stringify(actual[index] ?? null).slice(0, 120)}/${JSON.stringify(expected[index] ?? null).slice(0, 120)}`;
      }
    }
    return '';
  }, text);
  expect(error).toBe('');
}

function editFor(text: string, round: number): Edit {
  const start = (fraction: number) => text.lastIndexOf('\n', Math.floor(text.length * fraction)) + 1;
  switch (round) {
    case 0: return {at: 0, remove: 0, insert: '// 双端中文🙂👩‍💻\n'};
    case 1: return {at: start(0.12) + 6, remove: 8, insert: '协同🙂'};
    case 2: return {at: start(0.3), remove: 0, insert: '\n\n'};
    case 3: {
      const at = start(0.45);
      return {at, remove: text.indexOf('\n', at) + 9 - at, insert: ''};
    }
    case 4: return {at: start(0.18), remove: 0, insert: '/* 跨行注释🙂\n'};
    case 5: return {at: start(0.65), remove: 0, insert: '\n*/\n'};
    case 6: return {at: start(0.27), remove: 0, insert: 'const template = `多行🙂\n'};
    case 7: return {at: start(0.7), remove: 0, insert: '\n`;\n'};
    case 8: return {at: start(0.4), remove: 0, insert: '// CRLF 中文🙂\r\nconst remote = true;\r\n'};
    case 9: {
      const at = text.indexOf('"', start(0.5));
      return {at, remove: 1, insert: "'"};
    }
    case 10: return {at: text.length, remove: 0, insert: '\n// 尾行🙂\n'};
    default: return {at: 0, remove: text.indexOf('\n') + 1, insert: ''};
  }
}

test('two clients keep 1000 code lines, syntax and relative selections through 12 edit/Undo/Redo rounds', async ({browser, baseURL}) => {
  test.setTimeout(240_000);
  if (!baseURL) throw new Error('Playground baseURL is required');
  const room = `code-collab-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const contexts: BrowserContext[] = [];
  const oracle = new NetworkOracle();
  const errors: string[] = [];
  try {
    for (let index = 0; index < 2; index++) {
      contexts.push(await browser.newContext({baseURL, viewport: {width: 1280, height: 720}}));
    }
    const pages = await Promise.all(contexts.map(context => context.newPage()));
    for (const [index, page] of pages.entries()) {
      oracle.observe(page, room, index);
      await prepareTransport(page, room, baseURL);
      page.on('console', message => {
        if (message.type() === 'error' && /\[CodeInlineRuntime\]|BlockCraftError|Block not found|Cannot read properties|virtualization(?:Reconcile|Fallback|FullMount)Error|children repair failed|syncYEvent: skip broken event/.test(message.text())) {
          errors.push(`client ${index}: ${message.text()}`);
        }
      });
    }
    let text = Array.from({length: 1000}, (_, index) =>
      `const value${index} = {label: "row${index}", enabled: true};`).join('\n');
    await connect(pages[0], true);
    const id = await createSharedCode(pages[0], text);
    await connect(pages[1], false);
    await Promise.all(pages.map(page => installChecks(page, id)));
    // 其余 demo 已清除后才记录脚本错误，避免无关外链资源噪声。
    pages.forEach((page, index) => page.on('pageerror', error => errors.push(`client ${index}: ${error.message}`)));
    await expectConverged(pages, oracle, id, text);
    await Promise.all(pages.map(page => expectSyntax(page, text)));

    for (let round = 0; round < 12; round++) {
      const client = round % 2;
      const sender = pages[client];
      const receiver = pages[1 - client];
      const edit = editFor(text, round);
      const before = text;
      const after = before.slice(0, edit.at) + edit.insert + before.slice(edit.at + edit.remove);
      for (const action of ['edit', 'undo', 'redo'] as const) {
        await test.step(`client ${client + 1}, round ${round + 1}, ${action}`, async () => {
          // 远端观察者交替保留 caret / backward range，期待坐标由网络镜像的相对位置解析。
          const base = text.lastIndexOf('\n', Math.floor(text.length * 0.88)) + 1;
          const remoteRange = {anchor: base + 14, head: base + (round % 2 ? 3 : 14)};
          await setRange(receiver, remoteRange);
          await expectRange(receiver, text, remoteRange);
          const bookmark = oracle.bookmark(id, remoteRange);
          const expected = action === 'undo' ? before : after;
          const caret = action === 'undo' ? edit.at : edit.at + edit.insert.length;
          await sender.locator('block-craft-editor').evaluate((editor, operation) => {
            const doc = (window as any).ng.getComponent(editor).doc;
            const state = (window as any).__codeCollaborationStress;
            const block = doc.getBlockById(state.id);
            const undo = doc.crud.undoManager;
            state.launch(); // 请求旧快照后立即变更；不等待旧高亮或 debounce。
            if (operation.action === 'edit') {
              block.setInlineRange(operation.edit.at);
              undo.stopCapturing();
              undo.captureSelectionBeforeChange();
              doc.crud.transact(() => block.replaceText(operation.edit.at, operation.edit.remove, operation.edit.insert));
              block.setInlineRange(operation.edit.at + operation.edit.insert.length);
              undo.stopCapturing();
            } else {
              if (operation.action === 'undo' ? !undo.isCanUndo() : !undo.isCanRedo()) {
                throw new Error(`${operation.action} history ended early`);
              }
              undo[operation.action]();
            }
            state.assertView(operation.expected);
            state.launch();
          }, {action, edit, expected});
          await expectConverged(pages, oracle, id, expected);
          const remoteExpected = oracle.resolve(id, bookmark);
          await Promise.all([
            expectRange(sender, expected, {anchor: caret, head: caret}),
            expectRange(receiver, expected, remoteExpected),
          ]);
          text = expected;
          // 注释/引号的 Undo 也独立回查颜色；其它轮在最终 Redo 后统一回查。
          if (action === 'redo' || (action === 'undo' && round >= 4 && round <= 9)) {
            await Promise.all(pages.map(page => expectSyntax(page, text)));
            await Promise.all([
              expectRange(sender, text, {anchor: caret, head: caret}),
              expectRange(receiver, text, remoteExpected),
            ]);
          }
        });
      }
    }
    await expectConverged(pages, oracle, id, text);
    await Promise.all(pages.map(page => expectSyntax(page, text)));
    for (const [index, page] of pages.entries()) {
      const state = await page.evaluate(() => {
        const value = (window as any).__codeCollaborationStress;
        return {errors: value.errors, remoteChanges: value.remoteChanges};
      });
      expect(state.errors).toEqual([]);
      expect(state.remoteChanges).toBeGreaterThanOrEqual(18);
      expect(oracle.sent[index]).toBeGreaterThanOrEqual(18);
      expect(oracle.received[index]).toBeGreaterThanOrEqual(18);
    }
    expect(oracle.errors).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    await Promise.all(contexts.map(context => context.close()));
    oracle.doc.destroy();
  }
});
