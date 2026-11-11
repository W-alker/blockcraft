import {BlockNodeType} from '../../../framework'
import type {BlockAdapterContribution} from '../../../adapters/registry'
import {
  createGenericMarkdownBlockMatcher,
  createGenericMarkdownSyntaxDescriptor,
} from '../../../adapters/generic'
import {textBoxBlockHtmlAdapterMatcher} from './html'

const markdownOptions = {
  flavour: 'text-box' as const,
  nodeType: BlockNodeType.block,
  markdownDirective: true,
  markdownSyntax: {
    title: 'Text box',
    description: 'Use a text-box container only when the content must remain a typed text box. Keep the body readable; optional parameters use the leading YAML metadata section inside the directive.',
    example: ':::bc-text-box\n\nReadable text box content.\n\n:::',
  },
}

export const textBoxBlockAdapters: BlockAdapterContribution = {
  id: 'text-box',
  flavours: ['text-box'],
  html: [textBoxBlockHtmlAdapterMatcher],
  markdown: [createGenericMarkdownBlockMatcher(markdownOptions)],
  markdownSyntax: [createGenericMarkdownSyntaxDescriptor(markdownOptions)!],
}

export {textBoxBlockHtmlAdapterMatcher}
