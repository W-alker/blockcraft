import type {PhrasingContent} from 'mdast';
import {MarkdownAST} from "../type";
import {BlockMarkdownAdapterMatcher} from "../block-adapter";
import {BlockNodeType, DeltaInsert, generateId, IBlockSnapshot} from "../../../framework";
import {ParagraphBlockSchema, TableCellBlockSchema} from "../../../blocks";
import {MarkdownDeltaConverter} from "../delta-converter";

// GFM table cells can only contain phrasing content. Convert each child block of
// a table-cell into inline phrasing, separated by `<br>` for multi-block cells.
const buildCellPhrasingContent = (
  cellSnapshot: IBlockSnapshot,
  deltaConverter: MarkdownDeltaConverter
): PhrasingContent[] => {
  const children = (cellSnapshot.children ?? []) as IBlockSnapshot[];
  const result: PhrasingContent[] = [];

  children.forEach((child, idx) => {
    if (idx > 0) {
      result.push({type: 'html', value: '<br>'} as PhrasingContent);
    }

    const flavour = child.flavour;
    const depth = Number(child.props?.['depth'] ?? 0);
    const indent = '  '.repeat(Math.max(0, depth));
    let prefix = '';

    if (flavour === 'bullet') {
      prefix = `${indent}- `;
    } else if (flavour === 'ordered') {
      const orderProp = child.props?.['order'];
      const startProp = child.props?.['start'];
      const displayedNum =
        typeof orderProp === 'number'
          ? orderProp + 1
          : typeof startProp === 'number'
            ? startProp
            : idx + 1;
      prefix = `${indent}${displayedNum}. `;
    } else if (flavour === 'todo') {
      const checked = !!child.props?.['checked'];
      prefix = `${indent}${checked ? '[x] ' : '[ ] '}`;
    }

    if (prefix) {
      result.push({type: 'text', value: prefix} as PhrasingContent);
    }

    const deltas = (child.children ?? []) as DeltaInsert[];
    if (deltas.length > 0) {
      result.push(...deltaConverter.deltaToAST(deltas));
    }
  });

  return result;
};

export const tableBlockMarkdownAdapterMatcher: BlockMarkdownAdapterMatcher = {
  toMatch: o => o.node.type === 'table',
  fromMatch: o => o.node.flavour === 'table',
  toBlockSnapshot: {
    enter: (o, context) => {
      const {walkerContext} = context;
      walkerContext.openNode(
        {
          id: generateId(),
          nodeType: BlockNodeType.block,
          flavour: 'table',
          props: {},
          meta: {},
          children: [],
        },
        'children'
      );
      // table children (tableRow) will be handled by tableRow matcher
    },
    leave: (o, context) => {
      if (o.node.type !== 'table') return;
      const {walkerContext} = context;
      const currentNode = walkerContext.currentNode()!;

      // Fill colWidths based on first row's cell count
      if (currentNode.flavour === 'table' && !currentNode.props['colWidths']) {
        const firstRow = currentNode.children[0] as IBlockSnapshot;
        if (firstRow) {
          currentNode.props['colWidths'] = new Array(firstRow.children.length).fill(120);
        }
      }

      walkerContext.closeNode();
    },
  },
  fromBlockSnapshot: {
    enter: (o, context) => {
      const {walkerContext} = context;
      walkerContext.openNode(
        {
          type: 'table',
          align: null,
          children: [],
        } as unknown as MarkdownAST,
        'children'
      );
    },
    leave: (o, context) => {
      if (o.node.flavour !== 'table') return;
      const {walkerContext} = context;
      walkerContext.closeNode();
    },
  },
};

export const tableRowBlockMarkdownAdapterMatcher: BlockMarkdownAdapterMatcher = {
  toMatch: o => o.node.type === 'tableRow',
  fromMatch: o => o.node.flavour === 'table-row',
  toBlockSnapshot: {
    enter: (o, context) => {
      const {walkerContext} = context;
      walkerContext.openNode(
        {
          id: generateId(),
          nodeType: BlockNodeType.block,
          flavour: 'table-row',
          props: {height: 60},
          meta: {},
          children: [],
        },
        'children'
      );
    },
    leave: (o, context) => {
      if (o.node.type !== 'tableRow') return;
      const {walkerContext} = context;
      if (walkerContext.currentNode()?.flavour === 'table-row') {
        walkerContext.closeNode();
      }
    },
  },
  fromBlockSnapshot: {
    enter: (o, context) => {
      if (o.node.props['display'] === 'none') {
        context.walkerContext.skipAllChildren();
        return;
      }
      const {walkerContext} = context;
      walkerContext.openNode(
        {
          type: 'tableRow',
          children: [],
        } as unknown as MarkdownAST,
        'children'
      );
    },
    leave: (o, context) => {
      if (o.node.flavour !== 'table-row') return;
      if (o.node.props['display'] === 'none') return;
      context.walkerContext.closeNode();
    },
  },
};

export const tableCellBlockMarkdownAdapterMatcher: BlockMarkdownAdapterMatcher = {
  toMatch: o => o.node.type === 'tableCell',
  fromMatch: o => o.node.flavour === 'table-cell',
  toBlockSnapshot: {
    enter: (o, context) => {
      const {walkerContext, deltaConverter} = context;
      const cellSnapshot = TableCellBlockSchema.createSnapshot();

      // tableCell children are phrasing content (inline), convert to paragraph
      if ('children' in o.node && o.node.children.length > 0) {
        const deltas = deltaConverter.astToDelta(o.node);
        // Replace default empty paragraph with content paragraph
        cellSnapshot.children = [ParagraphBlockSchema.createSnapshot(deltas)];
      }

      walkerContext.openNode(cellSnapshot, 'children');
      walkerContext.skipAllChildren();
      walkerContext.closeNode();
    },
    leave: (o, context) => {
    },
  },
  fromBlockSnapshot: {
    enter: (o, context) => {
      if (o.node.props['display'] === 'none') {
        context.walkerContext.skipAllChildren();
        return;
      }
      const {walkerContext, deltaConverter} = context;

      // Convert all child blocks of the cell into phrasing content up-front and
      // skip the walker's normal child traversal. Otherwise multiple block
      // matchers (paragraph / list) would also fire on the cell's children and
      // produce duplicated or invalid AST nodes inside the tableCell.
      // We must open AND close the node within enter, because skipAllChildren()
      // also prevents the walker from invoking the matcher's `leave` handler.
      const phrasingContent = buildCellPhrasingContent(o.node as IBlockSnapshot, deltaConverter);

      walkerContext
        .openNode(
          {
            type: 'tableCell',
            children: phrasingContent,
          } as unknown as MarkdownAST,
          'children'
        )
        .closeNode();
      walkerContext.skipAllChildren();
    },
  },
};
