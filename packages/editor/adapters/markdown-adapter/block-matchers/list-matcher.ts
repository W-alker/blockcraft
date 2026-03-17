import {MarkdownAST} from "../type";
import {BlockMarkdownAdapterMatcher} from "../block-adapter";
import {List} from "mdast";
import {BlockNodeType, DeltaInsert, generateId, IBlockProps, IBlockSnapshot} from "../../../framework";
import {ASTWalkerContext} from "../../base/context";

const listBlockFlavour = ['bullet', 'ordered', 'todo']
type ListBlockFlavour = typeof listBlockFlavour[number];
type ActiveListState = {
  flavour: ListBlockFlavour;
};

const isListBlockSnapshot = (
  node?: IBlockSnapshot | null
): node is IBlockSnapshot =>
  !!node && listBlockFlavour.includes(node.flavour);

const getListDepth = (node: IBlockSnapshot) =>
  Math.max(0, Number(node.props['depth'] ?? 0));

const getListStateStack = (
  walkerContext: ASTWalkerContext<MarkdownAST>
) => {
  const existingStack = walkerContext.getGlobalContext('list:state-stack');
  if (existingStack instanceof Array) {
    return existingStack as ActiveListState[];
  }

  const nextStack: ActiveListState[] = [];
  walkerContext.setGlobalContextStack('list:state-stack', nextStack);
  return nextStack;
};

const getOrderedListStart = (node: IBlockSnapshot) => {
  if (typeof node.props['start'] === 'number' && node.props['start'] > 0) {
    return node.props['start'];
  }

  if (typeof node.props['order'] === 'number') {
    return node.props['order'] + 1;
  }

  return 1;
};

/**
 * Markdown list structure (MDAST):
 *   list (ordered)
 *     └─ listItem
 *          ├─ paragraph "text"
 *          └─ list (nested)          ← nested list is a CHILD of listItem
 *               └─ listItem
 *                    └─ paragraph "sub text"
 *
 * BlockSnapshot structure (flat, editable blocks can't have children):
 *   bullet { depth: 0, children: [delta] }
 *   bullet { depth: 1, children: [delta] }
 *
 * Strategy:
 *   - `list` node: push/pop depth counter via globalContext
 *   - `listItem` node: create editable block with current depth, extract first paragraph as delta
 *   - Skip the first paragraph child (already consumed), let nested lists be visited normally
 */
export const listBlockMarkdownAdapterMatcher: BlockMarkdownAdapterMatcher = {
  toMatch: o => o.node.type === 'listItem' || o.node.type === 'list',
  fromMatch: o => listBlockFlavour.includes(o.node.flavour),
  toBlockSnapshot: {
    enter: (o, context) => {
      const {walkerContext, deltaConverter} = context;

      if (o.node.type === 'list') {
        // Track list nesting depth
        const currentDepth = (walkerContext.getGlobalContext('list:depth') ?? -1) as number;
        walkerContext.setGlobalContext('list:depth', currentDepth + 1);
        // Save list node info for children to access (ordered, start, etc.)
        walkerContext.pushGlobalContextStack('list:stack', o.node);
        return;
      }

      if (o.node.type === 'listItem') {
        const depth = (walkerContext.getGlobalContext('list:depth') ?? 0) as number;
        const listStack = walkerContext.getGlobalContextStack<List>('list:stack');
        const parentList = listStack[listStack.length - 1];

        const curIndex = parentList?.children?.indexOf(o.node) ?? 0;

        const listNumber = parentList?.start
          ? parentList.start + curIndex - 1
          : null;

        let flavour: string;
        if (o.node.checked !== null && o.node.checked !== undefined) {
          flavour = 'todo';
        } else if (parentList?.ordered) {
          flavour = 'ordered';
        } else {
          flavour = 'bullet';
        }

        // Extract first paragraph child as inline delta content
        const firstParagraph = 'children' in o.node
          ? o.node.children.find((c: MarkdownAST) => c.type === 'paragraph')
          : null;

        const deltas = firstParagraph
          ? deltaConverter.astToDelta(firstParagraph)
          : [];

        const props: IBlockProps = {depth};
        if (flavour === 'todo') {
          props['checked'] = o.node.checked ? 1 : 0;
          props['created'] = Date.now();
        }
        if (flavour === 'ordered') {
          props['order'] = listNumber ?? 0;
          if(parentList?.start && curIndex === 0) {
            props['start'] = parentList.start;
          }
        }

        walkerContext.openNode(
          {
            id: generateId(),
            nodeType: BlockNodeType.editable,
            flavour: flavour as any,
            props,
            meta: {},
            children: deltas,
          },
          'children'
        ).closeNode();

        // Skip the first paragraph child since we already consumed it
        if (firstParagraph && 'children' in o.node) {
          const paragraphIndex = o.node.children.indexOf(firstParagraph);
          if (paragraphIndex === 0) {
            walkerContext.skipChildren(1);
          }
        }
      }
    },
    leave: (o, context) => {
      const {walkerContext} = context;
      if (o.node.type === 'list') {
        // Pop depth
        const currentDepth = (walkerContext.getGlobalContext('list:depth') ?? 0) as number;
        walkerContext.setGlobalContext('list:depth', currentDepth - 1);
        const listStack = walkerContext.getGlobalContextStack<List>('list:stack');
        listStack.pop();
      }
    },
  },
  fromBlockSnapshot: {
    enter: (o, context) => {
      const {walkerContext, deltaConverter} = context;
      const delta = o.node.children as DeltaInsert[];
      const listStateStack = getListStateStack(walkerContext);
      const activeDepth = listStateStack.length - 1;
      const requestedDepth = getListDepth(o.node);
      const targetDepth =
        listStateStack.length === 0
          ? 0
          : Math.min(requestedDepth, activeDepth + 1);

      while (listStateStack.length <= targetDepth) {
        walkerContext.openNode(
          {
            type: 'list',
            ordered: o.node.flavour === 'ordered',
            spread: false,
            children: [],
            start:
              o.node.flavour === 'ordered'
                ? getOrderedListStart(o.node)
                : undefined,
          },
          'children'
        );
        listStateStack.push({
          flavour: o.node.flavour as ListBlockFlavour,
        });
      }

      walkerContext
        .openNode(
          {
            type: 'listItem',
            checked:
              o.node.flavour === 'todo'
                ? Boolean(o.node.props['checked'])
                : undefined,
            spread: false,
            children: [],
          },
          'children'
        )
        .setNodeContext('list:depth', targetDepth)
        .openNode(
          {
            type: 'paragraph',
            children: deltaConverter.deltaToAST(delta),
          },
          'children'
        )
        .closeNode();
    },
    leave: (o, context) => {
      const {walkerContext} = context;
      const listStateStack = getListStateStack(walkerContext);
      const currentDepth =
        (walkerContext.getNodeContext('list:depth') as number | undefined) ?? 0;
      const nextNode = isListBlockSnapshot(o.next) ? o.next : null;

      if (!nextNode) {
        walkerContext.closeNode();

        while (listStateStack.length > 0) {
          walkerContext.closeNode();
          listStateStack.pop();
          if (listStateStack.length > 0) {
            walkerContext.closeNode();
          }
        }
        return;
      }

      const nextDepth = getListDepth(nextNode);

      if (nextDepth > currentDepth) {
        return;
      }

      walkerContext.closeNode();

      if (nextDepth === currentDepth) {
        if (nextNode.flavour !== o.node.flavour) {
          walkerContext.closeNode();
          listStateStack.pop();
        }
        return;
      }

      while (listStateStack.length - 1 > nextDepth) {
        walkerContext.closeNode();
        listStateStack.pop();
        walkerContext.closeNode();
      }

      if (
        listStateStack.length > 0 &&
        listStateStack[listStateStack.length - 1]?.flavour !== nextNode.flavour
      ) {
        walkerContext.closeNode();
        listStateStack.pop();
      }
    },
  },
};
