import {MarkdownAST} from "../type";
import {BlockMarkdownAdapterMatcher} from "../block-adapter";
import {BlockNodeType, DeltaInsert, generateId, IBlockSnapshot} from "../../../framework";
import {ParagraphBlockSchema, TableCellBlockSchema} from "../../../blocks";

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

      walkerContext.openNode(cellSnapshot, 'children');

      // tableCell children are phrasing content (inline), convert to paragraph
      if ('children' in o.node && o.node.children.length > 0) {
        const deltas = deltaConverter.astToDelta(o.node);
        walkerContext.openNode(
          ParagraphBlockSchema.createSnapshot(deltas),
          'children'
        ).closeNode();
        walkerContext.skipAllChildren();
        walkerContext.closeNode();
      }
    },
    leave: (o, context) => {
      if (o.node.type !== 'tableCell') return;
      const {walkerContext} = context;
      const currentNode = walkerContext.currentNode();
      if (currentNode?.flavour === 'table-cell') {
        // Ensure cell has at least one paragraph
        if (!currentNode.children.length) {
          walkerContext.openNode(ParagraphBlockSchema.createSnapshot()).closeNode();
        }
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
          type: 'tableCell',
          children: [],
        } as unknown as MarkdownAST,
        'children'
      );
    },
    leave: (o, context) => {
      if (o.node.flavour !== 'table-cell') return;
      if (o.node.props['display'] === 'none') return;
      context.walkerContext.closeNode();
    },
  },
};

// Matcher for paragraph blocks inside table cells (fromBlockSnapshot direction)
// Converts paragraph children of table-cell into inline content for markdown tableCell
export const tableCellParagraphMarkdownMatcher: BlockMarkdownAdapterMatcher = {
  toMatch: () => false, // Not used in toBlockSnapshot direction
  fromMatch: o =>
    o.node.flavour === 'paragraph' &&
    o.parent?.node.flavour === 'table-cell',
  toBlockSnapshot: {},
  fromBlockSnapshot: {
    enter: (o, context) => {
      const {walkerContext, deltaConverter} = context;
      const delta = o.node.children as DeltaInsert[];
      const phrasingContent = deltaConverter.deltaToAST(delta);
      // Push inline content directly into the parent tableCell
      const currentNode = walkerContext.currentNode();
      if (currentNode && 'children' in currentNode) {
        (currentNode as any).children.push(...phrasingContent);
      }
      walkerContext.skipAllChildren();
    },
  },
};
