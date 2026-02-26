import {MarkdownAST} from "../type";
import {BlockMarkdownAdapterMatcher} from "../block-adapter";
import {List} from "mdast";
import {BlockNodeType, DeltaInsert, generateId, IBlockProps} from "../../../framework";
import {TextUtils} from "../../utils";

const listBlockFlavour = ['bullet', 'ordered', 'todo']

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
      const currentTNode = walkerContext.currentNode();

      // Check if we can reuse the current list container
      if (
        walkerContext.getNodeContext('list:parent') === o.parent &&
        currentTNode.type === 'list' &&
        currentTNode.ordered === (o.node.flavour === 'ordered') &&
        TextUtils.isNullish(currentTNode.children[0]?.checked) ===
        TextUtils.isNullish(
          o.node.flavour === 'todo'
            ? (o.node.props['checked'] as boolean)
            : undefined
        )
      ) {
        // Reuse existing list container
      } else {
        // Create a new list container
        walkerContext
          .openNode(
            {
              type: 'list',
              ordered: o.node.flavour === 'ordered',
              spread: false,
              children: [],
              start: (o.node.props['order'] as number) || 1,
            },
            'children'
          )
          .setNodeContext('list:parent', o.parent);
      }

      walkerContext
        .openNode(
          {
            type: 'listItem',
            checked:
              o.node.flavour === 'todo'
                ? (o.node.props['checked'] as boolean)
                : undefined,
            spread: false,
            children: [],
          },
          'children'
        )
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
      const currentTNode = walkerContext.currentNode();
      const previousTNode = walkerContext.previousNode();

      if (
        walkerContext.getPreviousNodeContext('list:parent') === o.parent &&
        currentTNode.type === 'listItem' &&
        previousTNode?.type === 'list' &&
        previousTNode.ordered === (o.node.flavour === 'ordered') &&
        TextUtils.isNullish(currentTNode.checked) ===
        TextUtils.isNullish(
          o.node.flavour === 'todo'
            ? (o.node.props['checked'] as boolean)
            : undefined
        )
      ) {
        walkerContext.closeNode();
        if (
          !o.next || !listBlockFlavour.includes(o.next.flavour) ||
          o.next.flavour !== o.node.flavour
        ) {
          // Next node is not the same list type, close the list container
          walkerContext.closeNode();
        }
      } else {
        walkerContext.closeNode().closeNode();
      }
    },
  },
};
