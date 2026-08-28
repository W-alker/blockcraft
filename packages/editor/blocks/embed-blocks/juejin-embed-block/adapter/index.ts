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
  markdownSyntax: [{
    id: 'block:juejin-embed',
    title: 'Juejin post link',
    description: 'Use a readable Juejin post URL link with the registered title hint.',
    kind: 'link',
    example: '[掘金文章](https://juejin.cn/post/123 "blockcraft:juejin-embed")',
  }],
}
