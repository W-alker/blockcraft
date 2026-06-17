import type {Blockquote, List, ListItem, Paragraph, Root, RootContent, Text} from 'mdast';
import remarkParse from 'remark-parse';
import {unified} from 'unified';
import {
  BlockNodeType,
  DeltaInsert,
  DocAttachmentInfo,
  DocFileService,
  IBlockSnapshot,
} from '../../framework';
import {remarkGfm} from './gfm';
import {MarkdownAdapter} from './markdown-adapter';

class TestDocFileService extends DocFileService {
  uploadImg(): Promise<string> {
    return Promise.resolve('');
  }

  uploadVideo(): Promise<DocAttachmentInfo> {
    return Promise.resolve({
      name: '',
      type: '',
      url: '',
      size: 0,
    });
  }

  uploadAttachment(): Promise<DocAttachmentInfo> {
    return Promise.resolve({
      name: '',
      type: '',
      url: '',
      size: 0,
    });
  }

  previewAttachment(): void {}

  previewImg(): void {}

  createObjectURL(): string {
    return '';
  }

  getFileByObjectURL(): File | undefined {
    return undefined;
  }

  getFilePreviewURLByObjectURL(): string {
    return '';
  }

  removeObjectURL(): void {}

  isLocalObjectURL(): boolean {
    return false;
  }

  isOverMaxSize(): boolean {
    return false;
  }
}

const createEditableSnapshot = (
  id: string,
  flavour: IBlockSnapshot['flavour'],
  text: string | DeltaInsert[],
  props: IBlockSnapshot['props']
): IBlockSnapshot => ({
  id,
  flavour,
  nodeType: BlockNodeType.editable,
  props,
  meta: {},
  children: Array.isArray(text) ? text : [{insert: text}],
});

const createVoidSnapshot = (
  id: string,
  flavour: IBlockSnapshot['flavour'],
  props: IBlockSnapshot['props']
): IBlockSnapshot => ({
  id,
  flavour,
  nodeType: BlockNodeType.void,
  props,
  meta: {},
  children: [],
});

const createRootSnapshot = (children: IBlockSnapshot[]): IBlockSnapshot => ({
  id: 'root',
  flavour: 'root',
  nodeType: BlockNodeType.root,
  props: {},
  meta: {},
  children,
});

const parseMarkdown = (markdown: string) =>
  unified().use(remarkParse).use(remarkGfm).parse(markdown) as Root;

const isList = (node: RootContent): node is List => node.type === 'list';

const isParagraph = (node: ListItem['children'][number]): node is Paragraph =>
  node.type === 'paragraph';

const isBlockquote = (node: RootContent): node is Blockquote => node.type === 'blockquote';

const getNodeText = (node: Paragraph | Text | ListItem['children'][number]): string => {
  if ('value' in node && typeof node.value === 'string') {
    return node.value;
  }

  if ('children' in node) {
    return node.children.map(child => getNodeText(child as Paragraph | Text)).join('');
  }

  return '';
};

const getParagraphText = (item: ListItem) => {
  const paragraph = item.children.find(isParagraph);
  return paragraph ? getNodeText(paragraph) : '';
};

describe('MarkdownAdapter', () => {
  const adapter = new MarkdownAdapter(new TestDocFileService());

  // ─── Paragraph tests ──────────────────────────────────────────────

  describe('paragraphs', () => {
    it('exports a single paragraph', async () => {
      const snapshot = createRootSnapshot([
        createEditableSnapshot('p1', 'paragraph', 'Hello world', {}),
      ]);
      const md = await adapter.toMarkdown(snapshot);
      expect(md.trim()).toBe('Hello world');
    });

    it('exports multiple paragraphs separated by blank lines', async () => {
      const snapshot = createRootSnapshot([
        createEditableSnapshot('p1', 'paragraph', 'First', {}),
        createEditableSnapshot('p2', 'paragraph', 'Second', {}),
        createEditableSnapshot('p3', 'paragraph', 'Third', {}),
      ]);
      const md = await adapter.toMarkdown(snapshot);
      const lines = md.split('\n');
      expect(lines.filter(l => l.trim() !== '').length).toBe(3);
      expect(md).toContain('First');
      expect(md).toContain('Second');
      expect(md).toContain('Third');
    });

    it('round-trips multiple paragraphs', async () => {
      const source = 'Alpha\n\nBeta\n\nGamma\n';
      const snapshot = await adapter.toBlockSnapshot(source);
      const md = await adapter.toMarkdown(snapshot);
      expect(md).toContain('Alpha');
      expect(md).toContain('Beta');
      expect(md).toContain('Gamma');
      const paras = (snapshot.children as IBlockSnapshot[]).filter(
        c => c.flavour === 'paragraph'
      );
      expect(paras.length).toBe(3);
    });

    it('exports empty paragraph without crashing', async () => {
      const snapshot = createRootSnapshot([
        createEditableSnapshot('p1', 'paragraph', '', {}),
      ]);
      const md = await adapter.toMarkdown(snapshot);
      expect(typeof md).toBe('string');
    });
  });

  // ─── Heading tests ─────────────────────────────────────────────────

  describe('headings', () => {
    it('exports headings at different levels', async () => {
      const snapshot = createRootSnapshot([
        createEditableSnapshot('h1', 'paragraph', 'Title', {heading: 1}),
        createEditableSnapshot('h2', 'paragraph', 'Subtitle', {heading: 2}),
        createEditableSnapshot('h3', 'paragraph', 'Section', {heading: 3}),
      ]);
      const md = await adapter.toMarkdown(snapshot);
      expect(md).toContain('# Title');
      expect(md).toContain('## Subtitle');
      expect(md).toContain('### Section');
    });

    it('round-trips headings', async () => {
      const source = '# H1\n\n## H2\n\n### H3\n';
      const snapshot = await adapter.toBlockSnapshot(source);
      const paras = snapshot.children as IBlockSnapshot[];
      expect(paras[0].props['heading']).toBe(1);
      expect(paras[1].props['heading']).toBe(2);
      expect(paras[2].props['heading']).toBe(3);

      const md = await adapter.toMarkdown(snapshot);
      expect(md).toContain('# H1');
      expect(md).toContain('## H2');
      expect(md).toContain('### H3');
    });
  });

  // ─── Blockquote tests ─────────────────────────────────────────────

  describe('blockquotes', () => {
    it('exports a simple blockquote', async () => {
      const snapshot = createRootSnapshot([
        createEditableSnapshot('bq1', 'blockquote', 'Quote content', {}),
      ]);
      const md = await adapter.toMarkdown(snapshot);
      expect(md).toContain('> Quote content');
    });

    it('imports a simple blockquote', async () => {
      const source = '> Hello blockquote\n';
      const snapshot = await adapter.toBlockSnapshot(source);
      const bq = (snapshot.children as IBlockSnapshot[]).find(
        c => c.flavour === 'blockquote'
      );
      expect(bq).toBeDefined();
      const text = (bq!.children as DeltaInsert[])
        .map(d => d.insert)
        .join('');
      expect(text).toContain('Hello blockquote');
    });

    it('preserves multi-paragraph blockquote content', async () => {
      const source = '> Para 1\n>\n> Para 2\n';
      const snapshot = await adapter.toBlockSnapshot(source);
      const bq = (snapshot.children as IBlockSnapshot[]).find(
        c => c.flavour === 'blockquote'
      );
      expect(bq).toBeDefined();
      const text = (bq!.children as DeltaInsert[])
        .map(d => d.insert)
        .join('');
      // Both paragraphs should be preserved with a separator
      expect(text).toContain('Para 1');
      expect(text).toContain('Para 2');
    });

    it('round-trips a blockquote', async () => {
      const source = '> Simple quote\n';
      const snapshot = await adapter.toBlockSnapshot(source);
      const md = await adapter.toMarkdown(snapshot);
      expect(md).toContain('> Simple quote');
    });

    it('blockquote does not affect subsequent paragraph formatting', async () => {
      const source = '> A quote\n\nNormal paragraph\n';
      const snapshot = await adapter.toBlockSnapshot(source);
      const md = await adapter.toMarkdown(snapshot);
      // The paragraph after blockquote should NOT have extra indentation
      expect(md).toContain('> A quote');
      const lines = md.split('\n');
      const normalLine = lines.find(l => l.includes('Normal paragraph'));
      expect(normalLine).toBeDefined();
      expect(normalLine!.startsWith(' ')).toBeFalse();
    });

    it('handles blockquote followed by multiple paragraphs', async () => {
      const source = '> Quote\n\nPara A\n\nPara B\n\nPara C\n';
      const snapshot = await adapter.toBlockSnapshot(source);
      const md = await adapter.toMarkdown(snapshot);
      // No paragraph should have leading spaces
      const contentLines = md.split('\n').filter(l => l.trim() !== '');
      for (const line of contentLines) {
        if (!line.startsWith('>')) {
          expect(line).toBe(line.trimStart());
        }
      }
    });
  });

  // ─── Inline formatting tests ──────────────────────────────────────

  describe('inline formatting', () => {
    it('round-trips bold text', async () => {
      const source = 'This is **bold** text\n';
      const snapshot = await adapter.toBlockSnapshot(source);
      const md = await adapter.toMarkdown(snapshot);
      expect(md).toContain('**bold**');
    });

    it('round-trips italic text', async () => {
      const source = 'This is *italic* text\n';
      const snapshot = await adapter.toBlockSnapshot(source);
      const md = await adapter.toMarkdown(snapshot);
      expect(md).toContain('*italic*');
    });

    it('round-trips strikethrough text', async () => {
      const source = 'This is ~~deleted~~ text\n';
      const snapshot = await adapter.toBlockSnapshot(source);
      const md = await adapter.toMarkdown(snapshot);
      expect(md).toContain('~~deleted~~');
    });

    it('round-trips inline code', async () => {
      const source = 'Use `console.log()` here\n';
      const snapshot = await adapter.toBlockSnapshot(source);
      const md = await adapter.toMarkdown(snapshot);
      expect(md).toContain('`console.log()`');
    });

    it('round-trips links', async () => {
      const source = 'Visit [Example](http://example.com) now\n';
      const snapshot = await adapter.toBlockSnapshot(source);
      const md = await adapter.toMarkdown(snapshot);
      expect(md).toContain('[Example](http://example.com)');
    });

    it('exports mention embeds as plain text', async () => {
      const snapshot = createRootSnapshot([
        createEditableSnapshot('paragraph-1', 'paragraph', [
          {insert: 'Hello '},
          {
            insert: {mention: 'Alice'},
            attributes: {
              mentionId: 'user-1',
              mentionType: 'user',
            },
          },
          {insert: ' world'},
        ], {depth: 0}),
      ]);

      const markdown = await adapter.toMarkdown(snapshot);
      expect(markdown.trim()).toBe('Hello Alice world');
    });

    it('does not crash when an op has a missing or non-object insert (legacy/edge data)', async () => {
      // delta-op 模型里 insert 本就是可选的（DeltaOperation.insert?），历史/异常持久化数据
      // 可能产生 insert 缺失、为 null 或为原始值的 op。导出 markdown 不能因为某一个坏 op
      // 整篇抛错。回归：Safari/WebKit 下 `'mention' in undefined` 抛 "undefined is not an Object"，
      // 导致整篇文档导出失败。坏 op 应被安全跳过，周围正常文本照常导出。
      const snapshot = createRootSnapshot([
        createEditableSnapshot('paragraph-1', 'paragraph', [
          {insert: 'before '},
          {insert: undefined},        // insert 显式 undefined
          {attributes: {bogus: 1}},   // 完全没有 insert 键
          {insert: null},             // insert 为 null
          {insert: 42},               // insert 为原始值（非 string / 非 object）
          {insert: ' after'},
        ] as unknown as DeltaInsert[], {depth: 0}),
      ]);

      const markdown = await adapter.toMarkdown(snapshot);
      expect(markdown).toContain('before');
      expect(markdown).toContain('after');
    });
  });

  describe('media blocks', () => {
    it('exports video blocks as markdown links with a media hint title', async () => {
      const snapshot = createRootSnapshot([
        createVoidSnapshot('video-1', 'video', {
          url: 'https://cdn.example.com/demo.mp4',
          name: 'Demo clip',
          sourceType: 'link',
          type: 'video/mp4',
        }),
      ]);

      const markdown = await adapter.toMarkdown(snapshot);
      expect(markdown.trim()).toBe(
        '[Demo clip](https://cdn.example.com/demo.mp4 "blockcraft:video")'
      );
    });

    it('exports audio blocks as markdown links with a media hint title', async () => {
      const snapshot = createRootSnapshot([
        createVoidSnapshot('audio-1', 'audio', {
          url: 'https://cdn.example.com/demo.ogg',
          name: 'Theme song',
          sourceType: 'link',
        }),
      ]);

      const markdown = await adapter.toMarkdown(snapshot);
      expect(markdown.trim()).toBe(
        '[Theme song](https://cdn.example.com/demo.ogg "blockcraft:audio")'
      );
    });

    it('imports markdown links with media hint titles as media blocks', async () => {
      const source = [
        '[Demo clip](https://cdn.example.com/demo.mp4 "blockcraft:video")',
        '',
        '[Theme song](https://cdn.example.com/demo.ogg "blockcraft:audio")',
      ].join('\n');

      const snapshot = await adapter.toBlockSnapshot(source);
      const children = snapshot.children as IBlockSnapshot[];

      expect(children[0]?.flavour).toBe('video');
      expect(children[0]?.props['url']).toBe('https://cdn.example.com/demo.mp4');
      expect(children[0]?.props['name']).toBe('Demo clip');

      expect(children[1]?.flavour).toBe('audio');
      expect(children[1]?.props['url']).toBe('https://cdn.example.com/demo.ogg');
      expect(children[1]?.props['name']).toBe('Theme song');
    });

    it('imports known video platform links as video blocks', async () => {
      const source = '[Watch](https://www.youtube.com/watch?v=dQw4w9WgXcQ)\n';
      const snapshot = await adapter.toBlockSnapshot(source);
      const firstChild = (snapshot.children as IBlockSnapshot[])[0];

      expect(firstChild?.flavour).toBe('video');
      expect(firstChild?.props['url']).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      expect(firstChild?.props['name']).toBe('Watch');
    });

    it('imports raw html media tags as media blocks', async () => {
      const source = [
        '<video src="https://cdn.example.com/demo.mp4" width="640" poster="https://cdn.example.com/poster.jpg" data-source-type="embed" data-type="video/mp4"></video>',
        '',
        '<audio src="https://cdn.example.com/theme.mp3" title="Theme song" data-size="2048"></audio>',
      ].join('\n');

      const snapshot = await adapter.toBlockSnapshot(source);
      const children = snapshot.children as IBlockSnapshot[];

      expect(children[0]?.flavour).toBe('video');
      expect(children[0]?.props['url']).toBe('https://cdn.example.com/demo.mp4');
      expect(children[0]?.props['width']).toBe(640);
      expect(children[0]?.props['poster']).toBe('https://cdn.example.com/poster.jpg');
      expect(children[0]?.props['sourceType']).toBe('embed');
      expect(children[0]?.props['type']).toBe('video/mp4');

      expect(children[1]?.flavour).toBe('audio');
      expect(children[1]?.props['url']).toBe('https://cdn.example.com/theme.mp3');
      expect(children[1]?.props['name']).toBe('Theme song');
      expect(children[1]?.props['size']).toBe(2048);
    });
  });

  // ─── List tests ────────────────────────────────────────────────────

  describe('lists', () => {
    it('preserves nested list structure when exporting snapshots', async () => {
      const snapshot = createRootSnapshot([
        createEditableSnapshot('bullet-1', 'bullet', '一级项目 A', {depth: 0}),
        createEditableSnapshot('bullet-2', 'bullet', '二级项目 A-1', {depth: 1}),
        createEditableSnapshot('bullet-3', 'bullet', '三级项目 A-1-a', {depth: 2}),
        createEditableSnapshot('bullet-4', 'bullet', '二级项目 A-2', {depth: 1}),
        createEditableSnapshot('bullet-5', 'bullet', '一级项目 B', {depth: 0}),
        createEditableSnapshot('ordered-1', 'ordered', '第二步', {
          depth: 0,
          order: 1,
          start: 2,
        }),
        createEditableSnapshot('ordered-2', 'ordered', '嵌套步骤', {
          depth: 1,
          order: 0,
          start: 1,
        }),
        createEditableSnapshot('todo-1', 'todo', '已完成', {
          depth: 0,
          checked: 1,
          created: 1,
        }),
        createEditableSnapshot('todo-2', 'todo', '待处理子项', {
          depth: 1,
          checked: 0,
          created: 2,
        }),
      ]);

      const markdown = await adapter.toMarkdown(snapshot);
      const ast = parseMarkdown(markdown);
      const topLevelLists = ast.children.filter(isList);

      expect(topLevelLists.length).toBe(3);

      const bulletList = topLevelLists[0]!;
      expect(bulletList.ordered).toBeFalse();
      expect(bulletList.children.length).toBe(2);
      expect(getParagraphText(bulletList.children[0]!)).toBe('一级项目 A');

      const secondLevelList = bulletList.children[0]!.children.find(
        (node): node is List => node.type === 'list'
      );
      expect(secondLevelList).toBeDefined();
      expect(secondLevelList!.children.length).toBe(2);
      expect(getParagraphText(secondLevelList!.children[0]!)).toBe('二级项目 A-1');

      const thirdLevelList = secondLevelList!.children[0]!.children.find(
        (node): node is List => node.type === 'list'
      );
      expect(thirdLevelList).toBeDefined();
      expect(thirdLevelList!.children.length).toBe(1);
      expect(getParagraphText(thirdLevelList!.children[0]!)).toBe('三级项目 A-1-a');

      const orderedList = topLevelLists[1]!;
      expect(orderedList.ordered).toBeTrue();
      expect(orderedList.start).toBe(2);
      expect(markdown).toContain('2. 第二步');

      const todoList = topLevelLists[2]!;
      expect(todoList.children[0]!.checked).toBeTrue();
      const nestedTodoList = todoList.children[0]!.children.find(
        (node): node is List => node.type === 'list'
      );
      expect(nestedTodoList).toBeDefined();
      expect(nestedTodoList!.children[0]!.checked).toBeFalse();
      expect(markdown).toContain('[x] 已完成');
      expect(markdown).toContain('[ ] 待处理子项');
    });

    it('keeps list nesting and ordered starts after markdown round-trip', async () => {
      const source = [
        '- 一级项目 A',
        '  - 二级项目 A-1',
        '    - 三级项目 A-1-a',
        '  - 二级项目 A-2',
        '- 一级项目 B',
        '',
        '2. 第二步',
        '   1. 嵌套步骤',
        '',
        '- [x] 已完成',
        '  - [ ] 待处理子项',
      ].join('\n');

      const snapshot = await adapter.toBlockSnapshot(source);
      const markdown = await adapter.toMarkdown(snapshot);
      const ast = parseMarkdown(markdown);
      const topLevelLists = ast.children.filter(isList);

      expect(topLevelLists.length).toBe(3);
      expect(topLevelLists[0]!.children[0]!.children.some(node => node.type === 'list')).toBeTrue();
      expect(topLevelLists[1]!.ordered).toBeTrue();
      expect(topLevelLists[1]!.start).toBe(2);
      expect(topLevelLists[2]!.children[0]!.checked).toBeTrue();
      expect(markdown).toContain('2. 第二步');
      expect(markdown).toContain('[x] 已完成');
    });

    it('round-trips simple bullet list', async () => {
      const source = '- Item A\n- Item B\n- Item C\n';
      const snapshot = await adapter.toBlockSnapshot(source);
      const md = await adapter.toMarkdown(snapshot);
      expect(md).toContain('Item A');
      expect(md).toContain('Item B');
      expect(md).toContain('Item C');

      const bullets = (snapshot.children as IBlockSnapshot[]).filter(
        c => c.flavour === 'bullet'
      );
      expect(bullets.length).toBe(3);
    });

    it('handles list followed by paragraph', async () => {
      const source = '- Item 1\n- Item 2\n\nFollowing paragraph\n';
      const snapshot = await adapter.toBlockSnapshot(source);
      const md = await adapter.toMarkdown(snapshot);
      expect(md).toContain('Item 1');
      expect(md).toContain('Item 2');
      expect(md).toContain('Following paragraph');
      // paragraph should not be indented
      const lines = md.split('\n');
      const paraLine = lines.find(l => l.includes('Following paragraph'));
      expect(paraLine).toBeDefined();
      expect(paraLine!.startsWith(' ')).toBeFalse();
    });
  });

  // ─── Code block tests ─────────────────────────────────────────────

  describe('code blocks', () => {
    it('round-trips a code block', async () => {
      const source = '```javascript\nconsole.log("hello");\n```\n';
      const snapshot = await adapter.toBlockSnapshot(source);
      const code = (snapshot.children as IBlockSnapshot[]).find(
        c => c.flavour === 'code'
      );
      expect(code).toBeDefined();
      expect(
        (code!.children as DeltaInsert[]).map(d => d.insert).join('')
      ).toBe('console.log("hello");');

      const md = await adapter.toMarkdown(snapshot);
      expect(md).toContain('console.log("hello");');
    });

    it('preserves code block with empty content', async () => {
      const source = '```\n\n```\n';
      const snapshot = await adapter.toBlockSnapshot(source);
      const code = (snapshot.children as IBlockSnapshot[]).find(
        c => c.flavour === 'code'
      );
      expect(code).toBeDefined();
    });
  });

  // ─── Divider tests ────────────────────────────────────────────────

  describe('dividers', () => {
    it('round-trips a divider', async () => {
      const source = 'Before\n\n---\n\nAfter\n';
      const snapshot = await adapter.toBlockSnapshot(source);
      const divider = (snapshot.children as IBlockSnapshot[]).find(
        c => c.flavour === 'divider'
      );
      expect(divider).toBeDefined();

      const md = await adapter.toMarkdown(snapshot);
      expect(md).toContain('Before');
      expect(md).toContain('After');
      // remark-stringify uses *** by default
      expect(md).toMatch(/\*\*\*|---|___/);
    });
  });

  // ─── Mixed content tests ──────────────────────────────────────────

  describe('mixed content', () => {
    it('handles heading + paragraph + list + divider sequence', async () => {
      const source = [
        '# Title',
        '',
        'A paragraph.',
        '',
        '- Bullet A',
        '- Bullet B',
        '',
        '---',
        '',
        'Final paragraph.',
      ].join('\n');

      const snapshot = await adapter.toBlockSnapshot(source);
      const children = snapshot.children as IBlockSnapshot[];
      const flavours = children.map(c => c.flavour);
      expect(flavours).toContain('paragraph');
      expect(flavours).toContain('bullet');
      expect(flavours).toContain('divider');

      const md = await adapter.toMarkdown(snapshot);
      expect(md).toContain('# Title');
      expect(md).toContain('A paragraph.');
      expect(md).toContain('Bullet A');
      expect(md).toContain('Final paragraph.');
    });

    it('does not produce excessive blank lines in mixed content', async () => {
      const snapshot = createRootSnapshot([
        createEditableSnapshot('h1', 'paragraph', 'Title', {heading: 1}),
        createEditableSnapshot('p1', 'paragraph', 'Content', {}),
        createEditableSnapshot('b1', 'bullet', 'Item', {depth: 0}),
        createEditableSnapshot('p2', 'paragraph', 'After', {}),
      ]);
      const md = await adapter.toMarkdown(snapshot);
      // No more than 2 consecutive newlines (1 blank line)
      expect(md).not.toMatch(/\n{4,}/);
    });

    it('handles blockquote between paragraphs without disruption', async () => {
      const snapshot = createRootSnapshot([
        createEditableSnapshot('p1', 'paragraph', 'Before quote', {}),
        createEditableSnapshot('bq1', 'blockquote', 'Quoted text', {}),
        createEditableSnapshot('p2', 'paragraph', 'After quote', {}),
      ]);
      const md = await adapter.toMarkdown(snapshot);
      expect(md).toContain('Before quote');
      expect(md).toContain('> Quoted text');
      expect(md).toContain('After quote');
      // "After quote" should not be indented
      const afterLine = md.split('\n').find(l => l.includes('After quote'));
      expect(afterLine).toBeDefined();
      expect(afterLine!).toBe('After quote');
    });
  });

  // ─── Table tests ──────────────────────────────────────────────────

  describe('tables', () => {
    const buildTableSnapshot = (rows: IBlockSnapshot[][]): IBlockSnapshot => ({
      id: 't1',
      flavour: 'table',
      nodeType: BlockNodeType.block,
      props: {colWidths: rows[0]?.map(() => 120) ?? []},
      meta: {},
      children: rows.map((cells, rIdx) => ({
        id: `r${rIdx}`,
        flavour: 'table-row',
        nodeType: BlockNodeType.block,
        props: {height: 60},
        meta: {},
        children: cells,
      })),
    });

    const buildCell = (id: string, children: IBlockSnapshot[]): IBlockSnapshot => ({
      id,
      flavour: 'table-cell',
      nodeType: BlockNodeType.block,
      props: {},
      meta: {},
      children,
    });

    it('round-trips a simple table', async () => {
      const source = '| A | B |\n| --- | --- |\n| 1 | 2 |\n';
      const snapshot = await adapter.toBlockSnapshot(source);
      const table = (snapshot.children as IBlockSnapshot[]).find(
        c => c.flavour === 'table'
      );
      expect(table).toBeDefined();

      const md = await adapter.toMarkdown(snapshot);
      expect(md).toContain('A');
      expect(md).toContain('B');
      expect(md).toContain('1');
      expect(md).toContain('2');
    });

    it('does not duplicate cell text on export (regression)', async () => {
      const snapshot = createRootSnapshot([
        buildTableSnapshot([
          [
            buildCell('c1', [createEditableSnapshot('p1', 'paragraph', 'Alpha', {})]),
            buildCell('c2', [createEditableSnapshot('p2', 'paragraph', 'Beta', {})]),
          ],
        ]),
      ]);

      const md = await adapter.toMarkdown(snapshot);

      // Each cell value must appear exactly once in the output.
      expect((md.match(/Alpha/g) ?? []).length).toBe(1);
      expect((md.match(/Beta/g) ?? []).length).toBe(1);
    });

    it('renders cell with multiple paragraphs joined by <br> (regression)', async () => {
      const snapshot = createRootSnapshot([
        buildTableSnapshot([
          [
            buildCell('c1', [
              createEditableSnapshot('p1', 'paragraph', 'Line1', {}),
              createEditableSnapshot('p2', 'paragraph', 'Line2', {}),
            ]),
          ],
        ]),
      ]);

      const md = await adapter.toMarkdown(snapshot);
      expect((md.match(/Line1/g) ?? []).length).toBe(1);
      expect((md.match(/Line2/g) ?? []).length).toBe(1);
      expect(md).toContain('Line1<br>Line2');
    });

    it('renders ordered list inside cell as inline numbered text (regression)', async () => {
      const snapshot = createRootSnapshot([
        buildTableSnapshot([
          [
            buildCell('c1', [
              createEditableSnapshot('o1', 'ordered', 'step1', {depth: 0, order: 0}),
              createEditableSnapshot('o2', 'ordered', 'step2', {depth: 0, order: 1}),
            ]),
          ],
        ]),
      ]);

      const md = await adapter.toMarkdown(snapshot);
      expect((md.match(/step1/g) ?? []).length).toBe(1);
      expect((md.match(/step2/g) ?? []).length).toBe(1);
      expect(md).toContain('1. step1');
      expect(md).toContain('2. step2');
    });
  });

  // ─── Formula tests ────────────────────────────────────────────────

  describe('formulas', () => {
    it('exports a formula block', async () => {
      const snapshot = createRootSnapshot([
        createVoidSnapshot('f1', 'formula', {latex: 'E = mc^2'}),
      ]);
      const md = await adapter.toMarkdown(snapshot);
      expect(md).toContain('E = mc^2');
    });

    it('round-trips a math block', async () => {
      const source = '$$\nE = mc^2\n$$\n';
      const snapshot = await adapter.toBlockSnapshot(source);
      const formula = (snapshot.children as IBlockSnapshot[]).find(
        c => c.flavour === 'formula'
      );
      expect(formula).toBeDefined();
      expect(formula!.props['latex']).toBe('E = mc^2');
    });
  });

  // ─── Edge cases ───────────────────────────────────────────────────

  describe('edge cases', () => {
    it('handles empty markdown input', async () => {
      const snapshot = await adapter.toBlockSnapshot('');
      expect(snapshot).toBeDefined();
      expect(snapshot.flavour).toBe('root');
    });

    it('handles markdown with only whitespace', async () => {
      const snapshot = await adapter.toBlockSnapshot('   \n\n   \n');
      expect(snapshot).toBeDefined();
    });

    it('handles snapshot with no children', async () => {
      const snapshot = createRootSnapshot([]);
      const md = await adapter.toMarkdown(snapshot);
      expect(typeof md).toBe('string');
    });

    it('handles multiple blockquotes in sequence', async () => {
      const source = '> Quote 1\n\n> Quote 2\n\nNormal text\n';
      const snapshot = await adapter.toBlockSnapshot(source);
      const md = await adapter.toMarkdown(snapshot);
      expect(md).toContain('Quote 1');
      expect(md).toContain('Quote 2');
      expect(md).toContain('Normal text');
      // Normal text should not be indented
      const normalLine = md.split('\n').find(l => l.includes('Normal text'));
      expect(normalLine!.startsWith(' ')).toBeFalse();
    });

    it('handles list immediately after blockquote', async () => {
      const source = '> Quote\n\n- Item\n';
      const snapshot = await adapter.toBlockSnapshot(source);
      const children = snapshot.children as IBlockSnapshot[];
      expect(children.some(c => c.flavour === 'blockquote')).toBeTrue();
      expect(children.some(c => c.flavour === 'bullet')).toBeTrue();

      const md = await adapter.toMarkdown(snapshot);
      expect(md).toContain('> Quote');
      expect(md).toContain('Item');
    });
  });
});
