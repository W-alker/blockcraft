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
}
