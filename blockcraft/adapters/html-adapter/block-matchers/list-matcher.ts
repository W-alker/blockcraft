import {BlockHtmlAdapterMatcher} from "../block-adapter";
import {HastUtils, TextUtils} from "../../utils";
import {BlockNodeType, DeltaInsert, generateId, STR_LINE_BREAK} from "../../../framework";
import {Element} from 'hast'

const listBlockFlavour = ['bullet', 'ordered', 'todo']

export const listBlockAdapterMatcher: BlockHtmlAdapterMatcher = {
  toMatch: o => HastUtils.isElement(o.node) && (['ul', 'ol', 'li'].includes(o.node.tagName)),
  fromMatch: o => listBlockFlavour.includes(o.node.flavour),
  toBlockSnapshot: {
    enter: (o, context) => {
      if (!HastUtils.isElement(o.node)) {
        return;
      }

      if (o.node.tagName !== 'li') {
        o.node.children = o.node.children.filter(c => c.type !== 'text' || c.value !== STR_LINE_BREAK)
        return;
      }

      const {walkerContext, deltaConverter} = context;
      const curr = walkerContext.currentNode()

      let depth = 0
      if (listBlockFlavour.includes(curr?.flavour)) {
        depth = (curr.props.depth || 0) + 1
        walkerContext.closeNode()
      }

      if (typeof o.node.properties['bc:depth'] === 'number') {
        depth = o.node.properties['bc:depth']
      }

      if (o.next && HastUtils.isElement(o.next) && o.next.tagName === 'li') {
        o.next.properties['bc:depth'] = depth
      }

      const parentList = o.parent?.node as unknown as Element;
      let listType = 'bullet';
      if (parentList.tagName === 'ol') {
        listType = 'ordered';
      }

      walkerContext.openNode(
        {
          id: generateId(),
          flavour: <any>listType,
          nodeType: BlockNodeType.editable,
          props: {
            depth,
            order: listType === 'ordered' ? o.index : undefined
          },
          meta: {},
          children: deltaConverter.astToDelta(HastUtils.getInlineOnlyElementAST(o.node))
        },
        'children'
      )
      walkerContext.setNodeContext('list:parent', o.node)
    },
    leave: (o, context) => {
      const {walkerContext} = context;
      if (!HastUtils.isElement(o.node) || !listBlockFlavour.includes(walkerContext.currentNode()?.flavour)) {
        return;
      }
      walkerContext.closeNode()
    }
  },
  fromBlockSnapshot: {
    enter: (o, context) => {
      const delta = o.node.children as DeltaInsert[]
      const {deltaConverter, walkerContext} = context;
      const currentTNode = walkerContext.currentNode();
      const liChildren = deltaConverter.deltaToAST(delta);

      if (o.node.flavour === 'todo') {
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
                className: 'todo-list'
              },
              children: [],
            },
          ],
        });
      }
      // check if the list is of the same type
      if (
        walkerContext.getNodeContext('list:parent') === o.parent &&
        currentTNode.type === 'element' &&
        currentTNode.tagName === (o.node.flavour === 'ordered' ? 'ol' : 'ul') &&
        !(
          Array.isArray(currentTNode.properties["className"]) &&
          currentTNode.properties["className"].includes('todo-list')
        ) ===
        TextUtils.isNullish(
          o.node.flavour === 'todo'
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
            tagName: o.node.flavour === 'ordered' ? 'ol' : 'ul',
            properties: {
              style:
                o.node.props["type"] === 'todo'
                  ? 'list-style-type: none; padding-inline-start: 18px;'
                  : null,
            },
            children: [],
          },
          'children'
        );
        walkerContext.setNodeContext('list:parent', o.parent);
      }

      walkerContext.openNode(
        {
          type: 'element',
          tagName: 'li',
          properties: {},
          children: liChildren,
        },
        'children'
      );
    },
    leave: (o, context) => {
      const {walkerContext} = context;
      const currentTNode = walkerContext.currentNode() as unknown as Element;
      const previousTNode = walkerContext.previousNode() as unknown as Element;
      if (
        walkerContext.getPreviousNodeContext('list:parent') ===
        o.parent &&
        currentTNode.tagName === 'li' &&
        previousTNode.tagName ===
        (o.node.flavour === 'ordered' ? 'ol' : 'ul') &&
        !(
          Array.isArray(previousTNode.properties["className"]) &&
          previousTNode.properties["className"].includes('todo-list')
        ) ===
        TextUtils.isNullish(
          o.node.flavour === 'todo'
            ? (o.node.props["checked"] as boolean)
            : undefined
        )
      ) {
        walkerContext.closeNode();
        if (
          // @ts-ignore
          (o.next?.flavour !== 'bullet' && o.next?.flavour !== 'ordered')
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
