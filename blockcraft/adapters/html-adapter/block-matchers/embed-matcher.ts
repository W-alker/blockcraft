import {BlockHtmlAdapterMatcher} from "../block-adapter";

export function createEmbedBlockHtmlAdapterMatcher(
  flavour: BlockCraft.BlockFlavour,
  {
    toMatch = () => false,
    fromMatch = o => o.node.flavour === flavour,
    toBlockSnapshot = {},
    fromBlockSnapshot = {
      enter: (o, context) => {
        const { walkerContext } = context;
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
              type: 'element',
              tagName: 'div',
              properties: {},
              children: [],
            },
            'children'
          )
          .openNode(
            {
              type: 'element',
              tagName: 'a',
              properties: {
                href: o.node.props["url"],
              },
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
    toMatch?: BlockHtmlAdapterMatcher['toMatch'];
    fromMatch?: BlockHtmlAdapterMatcher['fromMatch'];
    toBlockSnapshot?: BlockHtmlAdapterMatcher['toBlockSnapshot'];
    fromBlockSnapshot?: BlockHtmlAdapterMatcher['fromBlockSnapshot'];
  } = Object.create(null)
): BlockHtmlAdapterMatcher {
  return {
    toMatch,
    fromMatch,
    toBlockSnapshot,
    fromBlockSnapshot,
  };
}

export const embedFigmaBlockHtmlAdapterMatcher = createEmbedBlockHtmlAdapterMatcher('figma-embed');
export const embedJuejinBlockHtmlAdapterMatcher = createEmbedBlockHtmlAdapterMatcher('juejin-embed');
export const bookmarkBlockHtmlAdapterMatcher = createEmbedBlockHtmlAdapterMatcher('bookmark');
