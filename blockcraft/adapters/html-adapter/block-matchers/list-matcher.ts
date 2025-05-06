import {BlockHtmlAdapterMatcher} from "../block-adapter";
import {HastUtils, TextUtils} from "../../utils";
import {BlockNodeType, DeltaInsert, generateId} from "../../../framework";
import {Element} from 'hast'

export const listBlockAdapterMatcher: BlockHtmlAdapterMatcher = {
  toMatch: o => HastUtils.isElement(o.node) && o.node.tagName === 'li',
  fromMatch: o => o.node.flavour === 'bullet' || o.node.flavour === 'ordered',
  toBlockSnapshot: {
    enter: (o, context) => {
      if (!HastUtils.isElement(o.node)) {
        return;
      }

      const parentList = o.parent?.node as unknown as Element;
      let listType = 'bullet';
      if (parentList.tagName === 'ol') {
        listType = 'ordered';
      }

      const { walkerContext, deltaConverter } = context;
      walkerContext.openNode(
        {
          id: generateId(),
          flavour: <any>listType,
          nodeType: BlockNodeType.editable,
          props: {},
          meta: {},
          children: deltaConverter.astToDelta(o.node)
        },
        'children'
      );
      walkerContext.skipAllChildren();
    },
    leave: (_, context) => {
      const { walkerContext } = context;
      walkerContext.closeNode();
    },
  },
  fromBlockSnapshot: {
    enter: (o, context) => {
      const text = (o.node.props["text"] ?? { delta: [] }) as {
        delta: DeltaInsert[];
      };
      const { deltaConverter, walkerContext } = context;
      const currentTNode = walkerContext.currentNode();
      const liChildren = deltaConverter.deltaToAST(text.delta);
      if (o.node.props["type"] === 'todo') {
        liChildren.unshift({
          type: 'element',
          tagName: 'input',
          properties: {
            type: 'checkbox',
            checked: o.node.props["checked"] as boolean,
          },
          children: [
            {
              type: 'element',
              tagName: 'label',
              properties: {
                style: 'margin-right: 3px;',
              },
              children: [],
            },
          ],
        });
      }
      // check if the list is of the same type
      if (
        walkerContext.getNodeContext('affine:list:parent') === o.parent &&
        currentTNode.type === 'element' &&
        currentTNode.tagName ===
        (o.node.props["type"] === 'numbered' ? 'ol' : 'ul') &&
        !(
          Array.isArray(currentTNode.properties["className"]) &&
          currentTNode.properties["className"].includes('todo-list')
        ) ===
        TextUtils.isNullish(
          o.node.props["type"] === 'todo'
            ? (o.node.props["checked"] as boolean)
            : undefined
        )
      ) {
        // if true, add the list item to the list
      } else {
        // if false, create a new list
        walkerContext.openNode(
          {
            type: 'element',
            tagName: o.node.props["type"] === 'numbered' ? 'ol' : 'ul',
            properties: {
              style:
                o.node.props["type"] === 'todo'
                  ? 'list-style-type: none; padding-inline-start: 18px;'
                  : null,
              className: [o.node.props["type"] + '-list'],
            },
            children: [],
          },
          'children'
        );
        walkerContext.setNodeContext('affine:list:parent', o.parent);
      }

      walkerContext.openNode(
        {
          type: 'element',
          tagName: 'li',
          properties: {
            className: ['affine-list-block-container'],
          },
          children: liChildren,
        },
        'children'
      );
    },
    leave: (o, context) => {
      const { walkerContext } = context;
      const currentTNode = walkerContext.currentNode() as unknown as Element;
      const previousTNode = walkerContext.previousNode() as unknown as Element;
      if (
        walkerContext.getPreviousNodeContext('affine:list:parent') ===
        o.parent &&
        currentTNode.tagName === 'li' &&
        previousTNode.tagName ===
        (o.node.props["type"] === 'numbered' ? 'ol' : 'ul') &&
        !(
          Array.isArray(previousTNode.properties["className"]) &&
          previousTNode.properties["className"].includes('todo-list')
        ) ===
        TextUtils.isNullish(
          o.node.props["type"] === 'todo'
            ? (o.node.props["checked"] as boolean)
            : undefined
        )
      ) {
        walkerContext.closeNode();
        if (
          (o.next?.flavour !== 'bullet' && o.next?.flavour !== 'ordered') ||
          o.next.props["type"] !== o.node.props["type"]
        ) {
          // If the next node is not a list or different type of list, close the list
          walkerContext.closeNode();
        }
      } else {
        walkerContext.closeNode().closeNode();
      }
    },
  }
}
