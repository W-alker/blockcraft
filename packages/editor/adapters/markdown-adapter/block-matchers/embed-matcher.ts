import {BlockMarkdownAdapterMatcher} from "../block-adapter";

export function createEmbedBlockMarkdownAdapterMatcher(
  flavour: BlockCraft.BlockFlavour,
  {
    toMatch = () => false,
    fromMatch = o => o.node.flavour === flavour,
    toBlockSnapshot = {},
    fromBlockSnapshot = {
      enter: (o, context) => {
        const {walkerContext} = context;
        // Parse as link
        if (
          typeof o.node.props["title"] !== 'string' ||
          typeof o.node.props["url"] !== 'string'
        ) {
          return;
        }

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
              type: 'link',
              url: o.node.props['url'],
              children: [
                {
                  type: 'text',
                  value: o.node.props["title"],
                },
              ],
            },
            'children'
          )
          .closeNode()
          .closeNode();
      },
    },
  }: {
    toMatch?: BlockMarkdownAdapterMatcher['toMatch'];
    fromMatch?: BlockMarkdownAdapterMatcher['fromMatch'];
    toBlockSnapshot?: BlockMarkdownAdapterMatcher['toBlockSnapshot'];
    fromBlockSnapshot?: BlockMarkdownAdapterMatcher['fromBlockSnapshot'];
  } = Object.create(null)
): BlockMarkdownAdapterMatcher {
  return {
    toMatch,
    fromMatch,
    toBlockSnapshot,
    fromBlockSnapshot,
  };
}

export const embedFigmaBlockMarkdownAdapterMatcher = createEmbedBlockMarkdownAdapterMatcher('figma-embed');
export const embedJuejinBlockMarkdownAdapterMatcher = createEmbedBlockMarkdownAdapterMatcher('juejin-embed');
export const bookmarkBlockMarkdownAdapterMatcher = createEmbedBlockMarkdownAdapterMatcher('bookmark');
