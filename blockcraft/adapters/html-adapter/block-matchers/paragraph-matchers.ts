import {BlockHtmlAdapterMatcher} from "../block-adapter";
import {HastUtils} from "../../index";
import {ParagraphBlockSchema} from "../../../blocks";
import {BlockNodeType, DeltaInsert, generateId} from "../../../framework";

const paragraphBlockMatchTags = [
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'blockquote',
  'body',
  'div',
  'span',
  'footer',
];

const headingBlockMatchTagsMap: Record<string, string> = {
  h1: '1',
  h2: '1',
  h3: '2',
  h4: '3',
  h5: '4',
  h6: '4',
}

// TODO 优化paragraph matcher
export const paragraphBlockHtmlAdapterMatcher: BlockHtmlAdapterMatcher = {
  toMatch: o =>
    HastUtils.isElement(o.node) &&
    paragraphBlockMatchTags.includes(o.node.tagName),
  fromMatch: o => o.node.flavour === 'paragraph' || o.node.flavour === 'blockquote',
  toBlockSnapshot: {
    enter: (o, context) => {
      if (!HastUtils.isElement(o.node)) {
        return;
      }
      const {walkerContext, deltaConverter} = context;
      switch (o.node.tagName) {
        case 'span':
        case 'body':
        case 'div':
        case 'footer': {
          if (
            o.parent?.node.type === 'element' &&
            !['li', 'p'].includes(o.parent.node.tagName) &&
            HastUtils.isParagraphLike(o.node)
          ) {
            walkerContext
              .openNode(
                {
                  nodeType: BlockNodeType.editable,
                  id: generateId(),
                  flavour: 'paragraph',
                  props: {},
                  meta: {},
                  children: deltaConverter.astToDelta(o.node),
                },
                'children'
              ).closeNode();
            walkerContext.skipAllChildren();
          }
          break;
        }
        case 'p': {
          walkerContext.openNode(
            {
              nodeType: BlockNodeType.editable,
              id: generateId(),
              flavour: 'paragraph',
              props: {},
              meta: {},
              children: deltaConverter.astToDelta(o.node),
            },
            'children'
          ).closeNode()
          walkerContext.skipAllChildren();
          break;
        }
        case 'blockquote': {
          walkerContext.openNode(
            {
              nodeType: BlockNodeType.editable,
              id: generateId(),
              flavour: 'blockquote',
              props: {},
              meta: {},
              children: deltaConverter.astToDelta(o.node),
            },
            'children'
          ).closeNode()
          walkerContext.skipAllChildren();
        }
        break
        case 'h1':
        case 'h2':
        case 'h3':
        case 'h4':
        case 'h5':
        case 'h6': {
          walkerContext
            .openNode(
              {
                nodeType: BlockNodeType.editable,
                id: generateId(),
                flavour: 'paragraph',
                props: {
                  heading: headingBlockMatchTagsMap[o.node.tagName],
                },
                meta: {},
                children: deltaConverter.astToDelta(o.node),
              },
              'children'
            )
            .closeNode();
          walkerContext.skipAllChildren();
          break;
        }
      }

    },
    leave: (o, context) => {
      if (!HastUtils.isElement(o.node)) {
        return;
      }
      const {walkerContext} = context;

      switch (o.node.tagName) {
        case 'div': {
          if (
            o.parent?.node.type === 'element' &&
            o.parent.node.tagName !== 'li'
          ) {
            walkerContext.closeNode();
          }
          break;
        }
        // case 'p': {
        //   if (
        //     o.next?.type === 'element' &&
        //     o.next.tagName === 'div'
        //   ) {
        //     // Close the node when leaving div indented
        //     break;
        //   }
        //   walkerContext.closeNode();
        //   break;
        // }
      }

    },
  },
  fromBlockSnapshot: {
    enter: (o, context) => {
      const delta = o.node.children as DeltaInsert[]
      const {walkerContext, deltaConverter} = context;
      switch (o.node.flavour) {
        case 'paragraph':
          if (o.node.props['heading']) {
            walkerContext
              .openNode({
                type: 'element',
                tagName: 'h' + o.node.props['heading'],
                properties: {},
                children: deltaConverter.deltaToAST(delta),
              }, 'children')
              .closeNode()
          } else {
            walkerContext
              .openNode(
                {
                  type: 'element',
                  tagName: 'p',
                  properties: {},
                  children: deltaConverter.deltaToAST(delta),
                },
                'children'
              )
              .closeNode()
          }
          break;
        case 'blockquote':
          walkerContext.openNode({
            type: 'element',
            tagName: 'blockquote',
            properties: {},
            children: deltaConverter.deltaToAST(delta),
          }, 'children').closeNode()
          break;
      }
    },
  },
};

