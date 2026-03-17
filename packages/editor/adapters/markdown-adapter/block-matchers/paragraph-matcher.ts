import {MarkdownAST} from "../type";
import {BlockMarkdownAdapterMatcher} from "../block-adapter";
import {BlockNodeType, DeltaInsert, generateId} from "../../../framework";
import {Heading} from "mdast";

const PARAGRAPH_MDAST_TYPE = ['paragraph', 'html', 'heading', 'blockquote'];

const isParagraphMDASTType = (node: MarkdownAST) =>
  PARAGRAPH_MDAST_TYPE.includes(node.type);

export const paragraphBlockMarkdownAdapterMatcher: BlockMarkdownAdapterMatcher =
  {
    toMatch: o => isParagraphMDASTType(o.node),
    fromMatch: o => o.node.flavour === 'paragraph' || o.node.flavour === 'blockquote',
    toBlockSnapshot: {
      enter: (o, context) => {
        const {walkerContext, deltaConverter} = context;
        switch (o.node.type) {
          case 'html': {
            walkerContext
              .openNode(
                {
                  id: generateId(),
                  nodeType: BlockNodeType.editable,
                  flavour: 'paragraph',
                  props: {},
                  meta: {},
                  children: [{
                    insert: o.node.value,
                  }],
                },
                'children'
              )
              .closeNode();
            break;
          }
          case 'paragraph': {
            walkerContext
              .openNode(
                {
                  id: generateId(),
                  nodeType: BlockNodeType.editable,
                  flavour: 'paragraph',
                  props: {},
                  meta: {},
                  children: deltaConverter.astToDelta(o.node),
                },
                'children'
              )
              .closeNode();
            break;
          }
          case 'heading': {
            walkerContext
              .openNode(
                {
                  id: generateId(),
                  nodeType: BlockNodeType.editable,
                  flavour: 'paragraph',
                  props: {
                    heading: Math.min(o.node.depth || 1, 4),
                  },
                  meta: {},
                  children: deltaConverter.astToDelta(o.node),
                },
                'children'
              )
              .closeNode();
            break;
          }
          case 'blockquote': {
            walkerContext
              .openNode(
                {
                  id: generateId(),
                  nodeType: BlockNodeType.editable,
                  flavour: 'blockquote',
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
    },
    fromBlockSnapshot: {
      enter: (o, context) => {
        const {walkerContext, deltaConverter} = context;
        const paragraphDepth = (walkerContext.getGlobalContext(
          'paragraph:depth'
        ) ?? 0) as number;

        switch (o.node.flavour) {
          case 'paragraph':
            if (o.node.props['heading']) {
              walkerContext
                .openNode(
                  {
                    type: 'heading',
                    depth: o.node.props['heading'] as Heading['depth'],
                    children: deltaConverter.deltaToAST(
                      (o.node.children as DeltaInsert[]),
                      paragraphDepth
                    ),
                  },
                  'children'
                )
                .closeNode();
            } else {
              walkerContext
                .openNode(
                  {
                    type: 'paragraph',
                    children: deltaConverter.deltaToAST(
                      (o.node.children as DeltaInsert[]),
                      paragraphDepth
                    ),
                  },
                  'children'
                )
                .closeNode();
            }
            break;
          case 'blockquote':
            walkerContext
              .openNode(
                {
                  type: 'blockquote',
                  children: [],
                },
                'children'
              )
              .openNode(
                {
                  type: 'paragraph',
                  children: deltaConverter.deltaToAST(o.node.children as DeltaInsert[]),
                },
                'children'
              )
              .closeNode()
              .closeNode();
        }


        walkerContext.setGlobalContext(
          'paragraph:depth',
          paragraphDepth + 1
        );
      },
      leave: (_, context) => {
        const {walkerContext} = context;
        walkerContext.setGlobalContext(
          'paragraph:depth',
          (walkerContext.getGlobalContext('paragraph:depth') as number) -
          1
        );
      },
    },
  };

