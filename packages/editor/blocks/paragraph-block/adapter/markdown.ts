import {MarkdownAST} from "../../../adapters/markdown-adapter/type";
import {BlockMarkdownAdapterMatcher} from "../../../adapters/markdown-adapter/block-adapter";
import {BlockNodeType, DeltaInsert, generateId} from "../../../framework";
import {Heading} from "mdast";
import {isMediaMarkdownNode} from "../../video-block/adapter/markdown";

const PARAGRAPH_MDAST_TYPE = ['paragraph', 'html', 'heading', 'blockquote'];

const isStandaloneImageParagraph = (node: MarkdownAST) => {
  if (node.type !== 'paragraph') return false;
  const meaningfulChildren = node.children.filter(child =>
    child.type !== 'text' || child.value.trim().length > 0
  );
  return meaningfulChildren.length === 1 && meaningfulChildren[0].type === 'image';
};

const isParagraphMDASTType = (node: MarkdownAST) =>
  PARAGRAPH_MDAST_TYPE.includes(node.type) &&
  !isStandaloneImageParagraph(node) &&
  !isMediaMarkdownNode(node);

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
            walkerContext.skipAllChildren();
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
            // Process each child paragraph separately to preserve boundaries
            const bqChildren = 'children' in o.node ? (o.node.children as MarkdownAST[]) : [];
            const deltas: DeltaInsert[] = [];
            for (let i = 0; i < bqChildren.length; i++) {
              if (i > 0 && deltas.length > 0) {
                deltas.push({insert: '\n'});
              }
              deltas.push(...deltaConverter.astToDelta(bqChildren[i]));
            }
            walkerContext
              .openNode(
                {
                  id: generateId(),
                  nodeType: BlockNodeType.editable,
                  flavour: 'blockquote',
                  props: {},
                  meta: {},
                  children: deltas,
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
