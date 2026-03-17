import type {List, ListItem, Paragraph, Root, RootContent, Text} from 'mdast';
import remarkParse from 'remark-parse';
import {unified} from 'unified';
import {
  BlockNodeType,
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
}

const createEditableSnapshot = (
  id: string,
  flavour: IBlockSnapshot['flavour'],
  text: string,
  props: IBlockSnapshot['props']
): IBlockSnapshot => ({
  id,
  flavour,
  nodeType: BlockNodeType.editable,
  props,
  meta: {},
  children: [{insert: text}],
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
    expect(markdown).toContain('- [x] 已完成');
    expect(markdown).toContain('- [ ] 待处理子项');
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
    expect(markdown).toContain('- [x] 已完成');
  });
});
