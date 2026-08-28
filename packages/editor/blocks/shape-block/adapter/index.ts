import type {BlockAdapterContribution} from '../../../adapters/registry'
import {shapeBlockHtmlAdapterMatcher} from './html'
import {shapeBlockMarkdownAdapterMatcher} from './markdown'

export const shapeBlockAdapters: BlockAdapterContribution = {
  id: 'shape-family',
  flavours: ['shape', 'shape-text'],
  html: [shapeBlockHtmlAdapterMatcher],
  markdown: [shapeBlockMarkdownAdapterMatcher],
  markdownSyntax: [{
    id: 'block:shape',
    title: 'Shape',
    description: 'Use the shape container only when typed visual-object semantics matter. Keep its shape text readable in the body.',
    kind: 'container-directive',
    profiles: ['hybrid', 'blockcraft'],
    example: ':::bc-shape\n\nReadable shape text.\n\n:::',
  }],
}

export {shapeBlockHtmlAdapterMatcher, shapeBlockMarkdownAdapterMatcher}
