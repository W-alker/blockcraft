import {BlockHtmlAdapterMatcher} from "../../../adapters/html-adapter/block-adapter";
import {HastUtils} from "../../../adapters";
import {ParagraphBlockSchema} from "..";
import {BlockNodeType, DeltaInsert, generateId} from "../../../framework";
import {isMediaContainerHtmlNode} from "../../video-block/adapter/html";
import {
  editableTypographyFromHtml,
  editableTypographyToHtmlProperties,
} from '../../../adapters/html-adapter/typography';

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

const headingBlockMatchTagsMap: Record<string, number> = {
  h1: 1,
  h2: 1,
  h3: 2,
  h4: 3,
  h5: 4,
  h6: 4,
}

const hasInlineContent = (node: Parameters<typeof HastUtils.hasTextContent>[0]) =>
  HastUtils.hasTextContent(node) || (
    HastUtils.isElement(node) &&
    node.children.some(child => HastUtils.isElement(child) && child.tagName === 'img')
  )

// TODO 优化paragraph matcher
export const paragraphBlockHtmlAdapterMatcher: BlockHtmlAdapterMatcher = {
  toMatch: o =>
    (o.node.type === 'text' && o.node.value !== '\n') ||
    (HastUtils.isElement(o.node) && paragraphBlockMatchTags.includes(o.node.tagName)),
  fromMatch: o => o.node.flavour === 'paragraph' || o.node.flavour === 'blockquote',
  toBlockSnapshot: {
    enter: (o, context) => {

      if (!HastUtils.isElement(o.node)) {
        return;
      }
      const {walkerContext, deltaConverter} = context;

      const currentNode = walkerContext.currentNode()

      if (currentNode?.nodeType === 'editable') {
        // @ts-ignore
        currentNode?.children.push(...deltaConverter.astToDelta(o.node))
        walkerContext.skipAllChildren()
        return
      }

      switch (o.node.tagName) {
        case 'span':
        case 'body':
        case 'div':
        case 'footer': {
          if (isMediaContainerHtmlNode(o.node)) return;
          if (!HastUtils.isParagraphLike(o.node)) return;
          if (o.parent?.node.type === 'element' && !['li', 'p'].includes(o.parent.node.tagName)) {
            const p = ParagraphBlockSchema.createSnapshot()
            // Body typography belongs to the document root. A fallback
            // paragraph created for direct body text should inherit it rather
            // than persisting the same line-height as a block override.
            if (o.node.tagName !== 'body') {
              Object.assign(p.props, editableTypographyFromHtml(o.node))
            }
            walkerContext.openNode(p, 'children')
            if (HastUtils.hasTextContent(o.node)) {
              (p.children as DeltaInsert[]).push(...deltaConverter.astToDelta(o.node))
              walkerContext.skipAllChildren()
              walkerContext.closeNode()
            }
          }
          break;
        }
        case 'p': {
          if (hasInlineContent(o.node)) {
            const paragraph = ParagraphBlockSchema.createSnapshot(deltaConverter.astToDelta(o.node))
            Object.assign(paragraph.props, editableTypographyFromHtml(o.node))
            walkerContext.openNode(paragraph, 'children').closeNode()
            walkerContext.skipAllChildren()
          } else {
            const paragraph = ParagraphBlockSchema.createSnapshot()
            Object.assign(paragraph.props, editableTypographyFromHtml(o.node))
            walkerContext.openNode(paragraph, 'children')
          }
          break;
        }
        case 'blockquote': {
          // Process each child element separately to preserve paragraph boundaries
          const bqChildren = HastUtils.isElement(o.node) ? o.node.children : [];
          const deltas: DeltaInsert[] = [];
          for (let i = 0; i < bqChildren.length; i++) {
            if (i > 0 && deltas.length > 0) {
              deltas.push({insert: '\n'});
            }
            deltas.push(...deltaConverter.astToDelta(bqChildren[i]));
          }
          walkerContext.openNode(
            {
              nodeType: BlockNodeType.editable,
              id: generateId(),
              flavour: 'blockquote',
              props: editableTypographyFromHtml(o.node),
              meta: {},
              children: deltas,
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
                  ...editableTypographyFromHtml(o.node),
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

      if (walkerContext.currentNode()?.flavour !== 'paragraph') {
        return;
      }

      walkerContext.closeNode();

      switch (o.node.tagName) {
        // case 'div': {
        //   if (
        //     o.parent?.node.type === 'element' &&
        //     o.parent.node.tagName !== 'li'
        //   ) {
        //     walkerContext.closeNode();
        //   }
        //   break;
        // }
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
                properties: editableTypographyToHtmlProperties(o.node.props),
                children: deltaConverter.deltaToAST(delta),
              }, 'children')
              .closeNode()
          } else {
            walkerContext
              .openNode(
                {
                  type: 'element',
                  tagName: 'p',
                  properties: editableTypographyToHtmlProperties(o.node.props),
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
            properties: editableTypographyToHtmlProperties(o.node.props),
            children: [
              {
                type: 'element',
                tagName: 'p',
                properties: {},
                children: deltaConverter.deltaToAST(delta),
              }
            ],
          }, 'children').closeNode()
          break;
      }
    },
  },
};
