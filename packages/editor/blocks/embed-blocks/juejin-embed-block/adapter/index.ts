import type {BlockAdapterContribution} from '../../../../adapters/registry'
import {
  createEmbedBlockHtmlAdapterMatcher,
  createEmbedBlockMarkdownAdapterMatcher,
} from '../../../../adapters/generic'

const defaultProps = {height: 424} as const

function isJuejinPostUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return /(?:^|\.)juejin\.cn$/i.test(url.hostname)
      && url.pathname.startsWith('/post/')
  } catch {
    return false
  }
}

export const embedJuejinBlockHtmlAdapterMatcher =
  createEmbedBlockHtmlAdapterMatcher('juejin-embed', {
    label: '掘金',
    defaultProps,
  })
export const embedJuejinBlockMarkdownAdapterMatcher =
  createEmbedBlockMarkdownAdapterMatcher('juejin-embed', {
    label: '掘金',
    defaultProps,
    matchesUrl: isJuejinPostUrl,
  })

export const juejinEmbedBlockAdapters: BlockAdapterContribution = {
  id: 'juejin-embed',
  flavours: ['juejin-embed'],
  html: [embedJuejinBlockHtmlAdapterMatcher],
  markdown: [embedJuejinBlockMarkdownAdapterMatcher],
}
