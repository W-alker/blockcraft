import {MarkdownAST} from "../type";
import {BlockMarkdownAdapterMatcher} from "../block-adapter";
import {List} from "mdast";
import {BlockNodeType, DeltaInsert, generateId} from "../../../framework";
import {TextUtils} from "../../utils";

const LIST_MDAST_TYPE = ['list', 'listItem'];
const listBlockFlavour = ['bullet', 'ordered', 'todo']

const isListMDASTType = (node: MarkdownAST) =>
  LIST_MDAST_TYPE.includes(node.type);

export const listBlockMarkdownAdapterMatcher: BlockMarkdownAdapterMatcher = {
  toMatch: o => o.node.type === 'listItem',
  fromMatch: o => listBlockFlavour.includes(o.node.flavour),
  toBlockSnapshot: {
    enter: (o, context) => {
      const {walkerContext, deltaConverter} = context;
      if (o.node.type === 'listItem') {
        const parentList = o.parent?.node as List;
        const listNumber = parentList.start
          ? parentList.start + parentList.children.indexOf(o.node)
          : null;
        walkerContext.openNode(
          {
            id: generateId(),
            nodeType: BlockNodeType.editable,
            flavour: o.node.checked !== null
              ? 'todo'
              : parentList.ordered
                ? 'ordered'
                : 'bullet',
            props: {
              checked: o.node.checked ?? false,
              order: listNumber,
            },
            meta: {},
            children: o.node.children[0] && o.node.children[0].type === 'paragraph'
              ? deltaConverter.astToDelta(o.node.children[0])
              : [],
          },
          'children'
        ).closeNode()
        if (o.node.children[0] && o.node.children[0].type === 'paragraph') {
          walkerContext.skipChildren(1);
        }
      }
    },
    leave: (o, context) => {
      const {walkerContext} = context;
      if (o.node.type === 'listItem') {
        walkerContext.closeNode();
      }
    },
  },
  fromBlockSnapshot: {
    enter: (o, context) => {
      const {walkerContext, deltaConverter} = context;
      const delta = o.node.children as DeltaInsert[];
      const currentTNode = walkerContext.currentNode();
      // check if the list is of the same type
      if (
        walkerContext.getNodeContext('list:parent') === o.parent &&
        currentTNode.type === 'list' &&
        currentTNode.ordered === (o.node.flavour === 'ordered') &&
        TextUtils.isNullish(currentTNode.children[0].checked) ===
        TextUtils.isNullish(
          o.node.flavour === 'todo'
            ? (o.node.props['checked'] as boolean)
            : undefined
        )
      ) {
        // if true, add the list item to the list
      } else {
        // if false, create a new list
        walkerContext
          .openNode(
            {
              type: 'list',
              ordered: o.node.flavour === 'ordered',
              spread: false,
              children: [],
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
        walkerContext.getPreviousNodeContext('list:parent') ===
        o.parent &&
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
          // If the next node is not a list or different type of list, close the list
          walkerContext.closeNode();
        }
      } else {
        walkerContext.closeNode().closeNode();
      }
    },
  },
};

