import {BlockNodeType} from '../../../framework'
import type {BlockAdapterContribution} from '../../../adapters/registry'
import {
  createGenericHtmlBlockMatcher,
  createGenericMarkdownBlockMatcher,
} from '../../../adapters/generic'
import {mermaidBlockMarkdownAdapterMatcher} from './markdown'

const mermaid = {
  flavour: 'mermaid' as const,
  nodeType: BlockNodeType.block,
  htmlTag: 'figure',
}
const textarea = {
  flavour: 'mermaid-textarea' as const,
  nodeType: BlockNodeType.editable,
  htmlTag: 'pre',
}

export const mermaidBlockAdapters: BlockAdapterContribution = {
  id: 'mermaid-family',
  flavours: ['mermaid', 'mermaid-textarea'],
  html: [
    createGenericHtmlBlockMatcher(mermaid),
    createGenericHtmlBlockMatcher(textarea),
  ],
  markdown: [
    mermaidBlockMarkdownAdapterMatcher,
    createGenericMarkdownBlockMatcher(textarea),
  ],
}

export {mermaidBlockMarkdownAdapterMatcher}
export {isMermaidMarkdownLanguage} from './language'
