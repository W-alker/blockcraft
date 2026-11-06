import {BlockHtmlAdapterMatcher} from "../../../adapters/html-adapter/block-adapter";
import {HastUtils, TextUtils} from "../../../adapters/utils";
import {BlockNodeType, DeltaInsert, generateId, IBlockSnapshot, STR_LINE_BREAK} from "../../../framework";
import type {Element} from 'hast'
import {
  editableTypographyFromHtml,
  editableTypographyToHtmlProperties,
} from '../../../adapters/html-adapter/typography';
import {
  orderedListHtmlProperties,
  orderedListTypeForProps,
  orderedMarkerFromHtml,
} from './ordered-marker';

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

      const parentList = o.parent && HastUtils.isElement(o.parent.node)
        ? o.parent.node as Element
        : undefined;
      const checkbox = HastUtils.querySelector(o.node, 'input')
      let listType = 'bullet';
      if (parentList?.tagName === 'ol') {
        listType = 'ordered';
      } else if (checkbox?.properties?.['type'] === 'checkbox') {
        listType = 'todo'
      }

      const openNode = {
        id: generateId(),
        flavour: <any>listType,
        nodeType: BlockNodeType.editable,
        props: {
          depth,
          order: listType === 'ordered' ? o.index : undefined,
          checked: listType === 'todo'
            ? checkbox?.properties?.['checked'] === true
            : undefined,
          ...editableTypographyFromHtml(o.node),
          ...(listType === 'ordered' ? orderedMarkerFromHtml(parentList) : {}),
        },
        meta: {},
        children: deltaConverter.astToDelta(HastUtils.getInlineOnlyElementAST(o.node))
      } as IBlockSnapshot

      if (listType === 'ordered') {
        //   if (o.index === 0) {
        //     openNode.props['start'] = 1
        //     openNode.props['order'] = 0
        //   } else {
        //     openNode.props['order'] = (o.index || 0)
        //   }
      }

      walkerContext.openNode(openNode, 'children')

      if (!o.node.children?.length) return

      const firChild = o.node.children[0]
      if (HastUtils.isElement(firChild) && HastUtils.isTagInline(firChild.tagName)) {
        walkerContext.skipAllChildren()
      }

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
                className: ['todo-list']
              },
              children: [],
            },
          ],
        });
      }

      const listTag = o.node.flavour === 'ordered' ? 'ol' : 'ul';
      const currentTNode = walkerContext.currentNode() as unknown as Element | undefined;
      const desiredListType = o.node.flavour === 'ordered'
        ? orderedListTypeForProps(o.node.props)
        : null;
      const isInMatchingList = currentTNode?.type === 'element'
        && currentTNode?.tagName === listTag
        && (currentTNode.properties?.['type'] ?? null) === desiredListType;

      if (!isInMatchingList) {
        walkerContext.openNode(
          {
            type: 'element',
            tagName: listTag,
            properties: o.node.flavour === 'ordered'
              ? orderedListHtmlProperties(o.node.props)
              : {},
            children: [],
          },
          'children'
        );
      }

      walkerContext.openNode(
        {
          type: 'element',
          tagName: 'li',
          properties: {
            ...editableTypographyToHtmlProperties(o.node.props),
          },
          children: liChildren,
        },
        'children'
      ).closeNode();
    },
    leave: (o, context) => {
      const {walkerContext} = context;
      const listTag = o.node.flavour === 'ordered' ? 'ol' : 'ul';
      const next = o.next;
      const nextListTag = next && listBlockFlavour.includes(next.flavour)
        ? (next.flavour === 'ordered' ? 'ol' : 'ul')
        : null;
      const currentListType = o.node.flavour === 'ordered'
        ? orderedListTypeForProps(o.node.props)
        : null;
      const nextListType = next?.flavour === 'ordered'
        ? orderedListTypeForProps(next.props)
        : null;

      if (nextListTag !== listTag || nextListType !== currentListType) {
        walkerContext.closeNode();
      }
    },
  }
}
