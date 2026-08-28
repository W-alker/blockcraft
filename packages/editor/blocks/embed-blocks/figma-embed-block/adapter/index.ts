import type {BlockAdapterContribution} from '../../../../adapters/registry'
import {
  createEmbedBlockHtmlAdapterMatcher,
  createEmbedBlockMarkdownAdapterMatcher,
} from '../../../../adapters/generic'
import {isFigmaUrl} from '../../../../global'

const defaultProps = {width: null, height: 424} as const

export const embedFigmaBlockHtmlAdapterMatcher =
  createEmbedBlockHtmlAdapterMatcher('figma-embed', {
    label: 'Figma',
    defaultProps,
  })
export const embedFigmaBlockMarkdownAdapterMatcher =
  createEmbedBlockMarkdownAdapterMatcher('figma-embed', {
    label: 'Figma',
    defaultProps,
    matchesUrl: isFigmaUrl,
  })

export const figmaEmbedBlockAdapters: BlockAdapterContribution = {
  id: 'figma-embed',
  flavours: ['figma-embed'],
  html: [embedFigmaBlockHtmlAdapterMatcher],
  markdown: [embedFigmaBlockMarkdownAdapterMatcher],
  markdownSyntax: [{
    id: 'block:figma-embed',
    title: 'Figma link',
    description: 'Use a readable Figma URL link with the registered title hint.',
    kind: 'link',
    example: '[Figma](https://www.figma.com/file/example "blockcraft:figma-embed")',
  }],
}
