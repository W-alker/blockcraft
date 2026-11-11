import type {BlockAdapterContribution} from '../../../adapters/registry'
import {formulaBlockHtmlAdapterMatcher} from './html'
import {formulaBlockMarkdownAdapterMatcher} from './markdown'

export const formulaBlockAdapters: BlockAdapterContribution = {
  id: 'formula',
  flavours: ['formula'],
  html: [formulaBlockHtmlAdapterMatcher],
  markdown: [formulaBlockMarkdownAdapterMatcher],
  markdownSyntax: [{
    id: 'block:formula',
    title: 'Display formula',
    description: 'Use standard display-math syntax for a standalone formula block.',
    kind: 'standard',
    example: '$$\nE = mc^2\n$$',
  }],
}

export {formulaBlockHtmlAdapterMatcher, formulaBlockMarkdownAdapterMatcher}
