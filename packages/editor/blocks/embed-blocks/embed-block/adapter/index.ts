import {EMBED_OBJECT_SIZING} from '../../components/embed-sizing'
import type {BlockAdapterContribution} from '../../../../adapters/registry'
import {
  createEmbedBlockHtmlAdapterMatcher,
  createEmbedBlockMarkdownAdapterMatcher,
} from '../../../../adapters/generic'

export const embedBlockAdapters: BlockAdapterContribution = {
  id: 'embed', flavours: ['embed'],
  html: [createEmbedBlockHtmlAdapterMatcher('embed', {label: '网页嵌入'})],
  markdown: [createEmbedBlockMarkdownAdapterMatcher('embed', {label: '网页嵌入', defaultProps: {wr: EMBED_OBJECT_SIZING.defaultWr, ar: EMBED_OBJECT_SIZING.defaultAr}})],
  markdownSyntax: [{
    id: 'block:embed', title: '网页嵌入', description: '显式嵌入标记支持网页或 HTML 文件链接；普通链接仍是正文链接。',
    kind: 'link', example: '[网页嵌入](https://example.com/report.html "blockcraft:embed")',
  }],
}
