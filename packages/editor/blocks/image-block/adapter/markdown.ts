import {MarkdownAST} from "../../../adapters/markdown-adapter/type";
import {BlockMarkdownAdapterMatcher} from "../../../adapters/markdown-adapter/block-adapter";
import {
  decodeAdapterProps,
} from "../../../adapters/generic";
import {ImageBlockSchema} from "..";
import {imageSourceFromAdapter} from './source';

const IMAGE_DIRECTIVE = 'bc-image';

const isImageNode = (node: MarkdownAST) => node.type === 'image';

type ImageDirective = MarkdownAST & {
  type: 'containerDirective'
  name: typeof IMAGE_DIRECTIVE
  attributes?: Record<string, string | null | undefined> | null
  children: MarkdownAST[]
}

const isImageDirective = (node: MarkdownAST): node is ImageDirective =>
  node.type === 'containerDirective' &&
  (node as ImageDirective).name === IMAGE_DIRECTIVE;

export const imageBlockMarkdownAdapterMatcher: BlockMarkdownAdapterMatcher = {
  priority: 100,
  consumes: true,
  toMatch: o => isImageNode(o.node) || isImageDirective(o.node),
  fromMatch: o => o.node.flavour === 'image',
  toBlockSnapshot: {
    enter: (o, context) => {
      const {walkerContext} = context;

      if (isImageDirective(o.node)) {
        const props = decodeAdapterProps(o.node.attributes?.['props']);
        const src = imageSourceFromAdapter(props['src']);
        if (!src) {
          walkerContext.skipAllChildren();
          return;
        }
        const snapshot = ImageBlockSchema.createSnapshot(src);
        snapshot.props = {
          ...snapshot.props,
          ...props,
          src,
        } as typeof snapshot.props;
        walkerContext
          .openNode(snapshot, 'children')
          .setNodeContext('image-markdown:opened', true);
        return;
      }

      const imageURL = imageSourceFromAdapter(
        'url' in o.node ? o.node.url : '',
      );
      if (!imageURL) return;

      // Resource acquisition belongs to the mounted Image Block. Import must
      // produce the snapshot immediately so both editor and streaming renderers
      // can expose their loading frame before the browser starts loading src.
      walkerContext
        .openNode(ImageBlockSchema.createSnapshot(imageURL), 'children')
        .closeNode();
      walkerContext.skipAllChildren();
    },
    leave: (o, context) => {
      if (
        isImageDirective(o.node) &&
        context.walkerContext.getNodeContext('image-markdown:opened')
      ) {
        context.walkerContext.closeNode();
      }
    },
  },
  fromBlockSnapshot: {
    enter: (o, context) => {
      const {walkerContext} = context;
      walkerContext
        .openNode(
          {
            type: 'paragraph',
            children: [],
          },
          'children'
        )
        .openNode(
          {
            type: 'image',
            url: o.node.props['src'] as string,
            title: o.node.props['src'] as string,
          },
          'children'
        )
        .closeNode()
        .closeNode();
    },
    leave: (_, context) => {
      if (context.walkerContext.getNodeContext('image-markdown:opened')) {
        context.walkerContext.closeNode();
      }
    },
  },
};
