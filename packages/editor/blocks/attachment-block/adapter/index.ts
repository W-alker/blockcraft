import type {BlockAdapterContribution} from '../../../adapters/registry'
import type {IBlockSnapshot} from '../../../framework'
import {
  createEmbedBlockHtmlAdapterMatcher,
  createEmbedBlockMarkdownAdapterMatcher,
} from '../../../adapters/generic'

const defaultProps = {name: '', url: '', type: '', size: 0, icon: ''} as const

function attachmentLabel(snapshot: IBlockSnapshot): string {
  const name = String(snapshot.props['name'] ?? '').trim()
  const url = String(snapshot.props['url'] ?? '').trim()
  return name || url || '附件'
}

export const attachmentBlockHtmlAdapterMatcher =
  createEmbedBlockHtmlAdapterMatcher('attachment', {
    label: attachmentLabel,
    defaultProps,
    titleProp: 'name',
  })

export const attachmentBlockMarkdownAdapterMatcher =
  createEmbedBlockMarkdownAdapterMatcher('attachment', {
    label: attachmentLabel,
    defaultProps,
    titleProp: 'name',
  })

export const attachmentBlockAdapters: BlockAdapterContribution = {
  id: 'attachment',
  flavours: ['attachment'],
  html: [attachmentBlockHtmlAdapterMatcher],
  markdown: [attachmentBlockMarkdownAdapterMatcher],
}
