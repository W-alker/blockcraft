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
  // 'blockquote',
  'body',
  'div',
  'span',
  'footer',
];

const headingBlockMatchTagsMap: Record<string, BlockCraft.BlockFlavour> = {
  h1: 'heading-one',
  h2: 'heading-one',
  h3: 'heading-two',
  h4: 'heading-three',
  h5: 'heading-four',
  h6: 'heading-four',
}

export const paragraphBlockHtmlAdapterMatcher: BlockHtmlAdapterMatcher = {
  toMatch: o =>
    HastUtils.isElement(o.node) &&
    paragraphBlockMatchTags.includes(o.node.tagName),
  fromMatch: o => o.node.flavour === ParagraphBlockSchema.flavour || o.node.flavour.startsWith('heading'),
  toBlockSnapshot: {
    enter: (o, context) => {
      if (!HastUtils.isElement(o.node)) {
        return;
      }
      const { walkerContext, deltaConverter } = context;
      switch (o.node.tagName) {
        case 'body':
        case 'div':
        case 'span':
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
                  children:  deltaConverter.astToDelta(o.node),
                },
                'children'
              )
              .closeNode();
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
              props: {
                // type: walkerContext.getGlobalContext('hast:blockquote')
                //   ? 'quote'
                //   : 'text',
              },
              meta: {},
              children: deltaConverter.astToDelta(o.node),
            },
            'children'
          );
          break;
        }
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
                flavour: headingBlockMatchTagsMap[o.node.tagName] || 'heading-four',
                props: {},
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
      const { walkerContext } = context;
      walkerContext.closeNode();

      // switch (o.node.tagName) {
      //   case 'div': {
      //     if (
      //       o.parent?.node.type === 'element' &&
      //       o.parent.node.tagName !== 'li' &&
      //       Array.isArray(o.node.properties?.["className"])
      //     ) {
      //       if (
      //         o.node.properties["className"].includes(
      //           'paragraph-block'
      //         ) ) {
      //         walkerContext.closeNode();
      //       }
      //     }
      //     break;
      //   }
      //   case 'p': {
      //     if (
      //       o.next?.type === 'element' &&
      //       o.next.tagName === 'div' &&
      //       Array.isArray(o.next.properties?.['className']) &&
      //       (o.next.properties?.['className'].includes(
      //           'affine-block-children-container'
      //         ) ||
      //         o.next.properties?.['className'].includes('indented'))
      //     ) {
      //       // Close the node when leaving div indented
      //       break;
      //     }
      //     break;
      //   }
      // }
    },
  },
  fromBlockSnapshot: {
    enter: (o, context) => {
      const text = (o.node.props["text"] ?? { delta: [] }) as {
        delta: DeltaInsert[];
      };
      const { walkerContext, deltaConverter } = context;
      switch (o.node.props["type"]) {
        case 'text': {
          walkerContext
            .openNode(
              {
                type: 'element',
                tagName: 'div',
                properties: {
                  className: ['affine-paragraph-block-container'],
                },
                children: [],
              },
              'children'
            )
            .openNode(
              {
                type: 'element',
                tagName: 'p',
                properties: {},
                children: deltaConverter.deltaToAST(text.delta),
              },
              'children'
            )
            .closeNode()
            .openNode(
              {
                type: 'element',
                tagName: 'div',
                properties: {
                  className: ['affine-block-children-container'],
                  style: 'padding-left: 26px;',
                },
                children: [],
              },
              'children'
            );
          break;
        }
        case 'h1':
        case 'h2':
        case 'h3':
        case 'h4':
        case 'h5':
        case 'h6': {
          walkerContext
            .openNode(
              {
                type: 'element',
                tagName: 'div',
                properties: {
                  className: ['affine-paragraph-block-container'],
                },
                children: [],
              },
              'children'
            )
            .openNode(
              {
                type: 'element',
                tagName: o.node.props["type"],
                properties: {},
                children: deltaConverter.deltaToAST(text.delta),
              },
              'children'
            )
            .closeNode()
            .openNode(
              {
                type: 'element',
                tagName: 'div',
                properties: {
                  className: ['affine-block-children-container'],
                  style: 'padding-left: 26px;',
                },
                children: [],
              },
              'children'
            );
          break;
        }
        case 'quote': {
          walkerContext
            .openNode(
              {
                type: 'element',
                tagName: 'div',
                properties: {
                  className: ['affine-paragraph-block-container'],
                },
                children: [],
              },
              'children'
            )
            .openNode(
              {
                type: 'element',
                tagName: 'blockquote',
                properties: {
                  className: ['quote'],
                },
                children: [],
              },
              'children'
            )
            .openNode(
              {
                type: 'element',
                tagName: 'p',
                properties: {},
                children: deltaConverter.deltaToAST(text.delta),
              },
              'children'
            )
            .closeNode()
            .closeNode()
            .openNode(
              {
                type: 'element',
                tagName: 'div',
                properties: {
                  className: ['affine-block-children-container'],
                  style: 'padding-left: 26px;',
                },
                children: [],
              },
              'children'
            );
          break;
        }
      }
    },
    leave: (_, context) => {
      const { walkerContext } = context;
      walkerContext.closeNode().closeNode();
    },
  },
};

