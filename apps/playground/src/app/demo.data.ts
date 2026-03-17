import {
  AttachmentBlockSchema,
  BlockquoteBlockSchema,
  BookmarkBlockSchema,
  BulletBlockSchema,
  CalloutBlockSchema,
  CodeBlockSchema,
  ColumnBlockSchema,
  ColumnsBlockSchema,
  DividerBlockSchema,
  FigmaEmbedBlockSchema,
  FormulaBlockSchema,
  ImageBlockSchema,
  JuejinEmbedBlockSchema,
  MermaidBlockSchema,
  OrderedBlockSchema,
  ParagraphBlockSchema,
  RootBlockSchema,
  TableBlockSchema,
  TodoBlockSchema,
  type IBlockSnapshot
} from '@blockcraft/editor';

const ROOT_ID = '689ac2b31a9abe3ae8a6788d';

const setEditableText = (block: IBlockSnapshot, text: unknown[]) => {
  block.children = text as never;
  return block;
};

const setTableCellText = (table: IBlockSnapshot, row: number, col: number, text: string) => {
  const tableRow = table.children[row] as IBlockSnapshot;
  const cell = tableRow.children[col] as IBlockSnapshot;
  const paragraph = cell.children[0] as IBlockSnapshot;
  paragraph.children = [{ insert: text }] as never;
};

const createIntroParagraph = () =>
  ParagraphBlockSchema.createSnapshot([
    { insert: 'Blockcraft 2.0 Playground：' },
    { insert: '用真实 block 组合', attributes: { 'a:bold': true } },
    { insert: ' 展示正式编辑器需要覆盖的内容结构，包括 ' },
    { insert: { mention: 'Alice Chen' }, attributes: { mentionId: 'user_alice', mentionType: 'user' } },
    { insert: '、' },
    { insert: { link: '产品文档' }, attributes: { 'd:href': 'https://blockcraft.dev/docs' } },
    { insert: ' 和行内公式 ' },
    { insert: { latex: 'E=mc^2' } },
    { insert: '。' }
  ], { heading: 1 });

const createOverviewParagraph = () =>
  ParagraphBlockSchema.createSnapshot([
    { insert: '这个初始化样本会覆盖段落、列表、待办、引用、提示块、代码、表格、多栏、图片、附件、网页卡片、嵌入块、Mermaid 和公式。' }
  ]);

const createCallout = () => {
  const callout = CalloutBlockSchema.createSnapshot();
  callout.props = {
    ...callout.props,
    prefix: '💡',
    backColor: '#E0F2FE',
    borderColor: '#7DD3FC',
    color: '#0F172A'
  };
  callout.children = [
    ParagraphBlockSchema.createSnapshot('这是一条产品说明，强调当前样本覆盖了所有已注册 block 类型。'),
    BulletBlockSchema.createSnapshot('提示块内部也可以继续嵌套普通文本块。'),
    OrderedBlockSchema.createSnapshot('后续重构时可直接用它回归测试嵌套场景。')
  ] as never;
  return callout;
};

const createLists = () => {
  const todoDone = TodoBlockSchema.createSnapshot('为 Selection / inline / IME 重构预留回归用例');
  todoDone.props = { ...todoDone.props, checked: 1 };

  return [
    OrderedBlockSchema.createSnapshot('先稳定架构，再重构复杂交互。'),
    BulletBlockSchema.createSnapshot('样本内容应该尽量贴近真实产品文档，而不是纯随机文本。'),
    TodoBlockSchema.createSnapshot('验证 block 级 schema 和 snapshot 是否都能正确渲染'),
    todoDone
  ];
};

const createQuote = () =>
  BlockquoteBlockSchema.createSnapshot('好的初始化数据，本身就是编辑器架构回归测试的一部分。');

const createCodeBlock = () => {
  const code = CodeBlockSchema.createSnapshot([
    { insert: 'type EditorSurface = "flow" | "grid" | "nested-editor";\n' },
    { insert: 'const boot = async () => {\n' },
    { insert: '  console.log("Blockcraft playground ready");\n' },
    { insert: '};\n' },
    { insert: 'void boot();' }
  ]);
  code.props = {
    ...code.props,
    lang: 'TypeScript',
    blockName: 'selection-kernel.ts'
  };
  return code;
};

const createMermaid = () =>
  MermaidBlockSchema.createSnapshot(
    'text',
    `flowchart LR
  A[Selection Bridge] --> B[Selection Kernel]
  B --> C[Inline Surface]
  B --> D[Grid Surface]
  C --> E[DOM Range Sync]`
  );

const createImage = () =>
  ImageBlockSchema.createSnapshot(
    'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1600&q=80',
    1200,
    720,
    '图 1：用于调试图片、caption 与导出链路。'
  );

const createBookmark = () =>
  BookmarkBlockSchema.createSnapshot('https://angular.dev');

const createFigmaEmbed = () =>
  FigmaEmbedBlockSchema.createSnapshot('https://www.figma.com/design/abcdefghijklmnopqrstuvwx/Blockcraft-Design-System');

const createJuejinEmbed = () =>
  JuejinEmbedBlockSchema.createSnapshot('https://juejin.cn/post/7312345678901234567');

const createAttachment = () =>
  AttachmentBlockSchema.createSnapshot({
    name: 'Blockcraft-PRD.pdf',
    url: 'https://example.com/files/blockcraft-prd.pdf',
    type: 'application/pdf',
    size: 2_483_200
  });

const createColumns = () => {
  const leftColumn = ColumnBlockSchema.createSnapshot([
    ParagraphBlockSchema.createSnapshot('左栏用于展示布局型 block。'),
    BulletBlockSchema.createSnapshot('适合放概览、短列表、摘要信息。')
  ]);

  const middleColumn = ColumnBlockSchema.createSnapshot([
    ParagraphBlockSchema.createSnapshot('中栏嵌入一个小代码块。'),
    (() => {
      const code = CodeBlockSchema.createSnapshot('console.log("column preview");');
      code.props = { ...code.props, lang: 'JavaScript', blockName: 'column.ts' };
      return code;
    })()
  ]);

  const rightTodo = TodoBlockSchema.createSnapshot('右栏也能放待办块');
  rightTodo.props = { ...rightTodo.props, checked: 1 };

  const rightColumn = ColumnBlockSchema.createSnapshot([
    ParagraphBlockSchema.createSnapshot('右栏适合承载状态信息。'),
    rightTodo
  ]);

  const columns = ColumnsBlockSchema.createSnapshot(3);
  columns.children = [leftColumn, middleColumn, rightColumn] as never;
  columns.props = {
    ...columns.props,
    columnCount: 3,
    columnWidths: [34, 33, 33]
  };
  return columns;
};

const createTable = () => {
  const table = TableBlockSchema.createSnapshot(3, 3);
  setTableCellText(table, 0, 0, '模块');
  setTableCellText(table, 0, 1, '状态');
  setTableCellText(table, 0, 2, '备注');
  setTableCellText(table, 1, 0, 'Selection');
  setTableCellText(table, 1, 1, '待重构');
  setTableCellText(table, 1, 2, '需要 surface adapter');
  setTableCellText(table, 2, 0, 'Inline');
  setTableCellText(table, 2, 1, '规划中');
  setTableCellText(table, 2, 2, '目标是 segment 级更新');
  table.props = {
    ...table.props,
    colWidths: [180, 160, 320]
  };
  return table;
};

const createFormula = () =>
  FormulaBlockSchema.createSnapshot('\\int_{0}^{1} x^2 \\, dx = \\frac{1}{3}');

const createDivider = () => {
  const divider = DividerBlockSchema.createSnapshot();
  divider.props = { ...divider.props, style: 'dashed' };
  return divider;
};

const createDocument = (): IBlockSnapshot => {
  const intro = createIntroParagraph();
  const overview = createOverviewParagraph();
  const callout = createCallout();
  const quote = createQuote();
  const code = createCodeBlock();
  const mermaid = createMermaid();
  const image = createImage();
  const bookmark = createBookmark();
  const figma = createFigmaEmbed();
  const juejin = createJuejinEmbed();
  const attachment = createAttachment();
  const columns = createColumns();
  const table = createTable();
  const formula = createFormula();
  const divider = createDivider();

  return RootBlockSchema.createSnapshot(ROOT_ID, [
    intro,
    overview,
    callout,
    ...createLists(),
    quote,
    divider,
    code,
    mermaid,
    formula,
    image,
    bookmark,
    figma,
    juejin,
    attachment,
    columns,
    table
  ]);
};

export const demoJSON = createDocument();
