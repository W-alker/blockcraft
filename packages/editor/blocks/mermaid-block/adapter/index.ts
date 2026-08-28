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
  markdownSyntax: [{
    id: 'block:mermaid',
    title: 'Mermaid diagram',
    description: 'Use the standard Mermaid fenced-code form. The Adapter creates the Mermaid block and owns its source child.',
    kind: 'fenced-code',
    example: '```mermaid\ngraph TD\n  A --> B\n```',
  }],
}

export {mermaidBlockMarkdownAdapterMatcher}
export {isMermaidMarkdownLanguage} from './language'
