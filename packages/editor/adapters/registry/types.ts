import type {EmbedConverter} from '../../framework'
import type {
  HtmlASTToDeltaMatcher,
  InlineDeltaToHtmlAdapterMatcher,
} from '../html-adapter/delta-converter'
import type {BlockHtmlAdapterMatcher} from '../html-adapter/block-adapter'
import type {
  InlineDeltaToMarkdownAdapterMatcher,
  MarkdownASTToDeltaMatcher,
} from '../markdown-adapter/delta-converter'
import type {BlockMarkdownAdapterMatcher} from '../markdown-adapter/block-adapter'

export type MarkdownAdapterProfile = 'portable' | 'hybrid' | 'blockcraft'
export const DEFAULT_MARKDOWN_ADAPTER_PROFILE: MarkdownAdapterProfile = 'hybrid'
export const MARKDOWN_ADAPTER_PROFILE_CONFIG = 'markdownProfile'

export type MarkdownSyntaxKind =
  | 'standard'
  | 'link'
  | 'fenced-code'
  | 'text-directive'
  | 'leaf-directive'
  | 'container-directive'

/**
 * A bounded, model-facing description of Markdown a registered Adapter can
 * actually import. It is intentionally declarative so hosts can build prompts,
 * help surfaces, and validators without duplicating Block-specific grammar.
 */
export interface MarkdownSyntaxDescriptor {
  readonly id: string
  readonly title: string
  readonly description: string
  readonly kind: MarkdownSyntaxKind
  readonly profiles?: readonly MarkdownAdapterProfile[]
  readonly example: string
}

export interface MarkdownAdapterManifest {
  readonly version: 1
  readonly profile: MarkdownAdapterProfile
  readonly standardFirst: true
  readonly syntaxes: readonly MarkdownSyntaxDescriptor[]
}

/**
 * One Block domain's format contribution. Implementations live beside the
 * Block, while the adapter composition root only aggregates these records.
 */
export interface BlockAdapterContribution {
  readonly id: string
  readonly flavours: readonly string[]
  readonly html?: readonly BlockHtmlAdapterMatcher[]
  readonly markdown?: readonly BlockMarkdownAdapterMatcher[]
  readonly markdownSyntax?: readonly MarkdownSyntaxDescriptor[]
}

/** Format adapters owned by one inline Embed domain. */
export interface InlineEmbedAdapterContribution {
  readonly key: string
  readonly createDomConverter?: () => EmbedConverter
  readonly markdownSyntax?: readonly MarkdownSyntaxDescriptor[]
  readonly html: {
    readonly deltaToAst: readonly InlineDeltaToHtmlAdapterMatcher[]
    readonly astToDelta: readonly HtmlASTToDeltaMatcher[]
  }
  readonly markdown: {
    readonly deltaToAst: readonly InlineDeltaToMarkdownAdapterMatcher[]
    readonly astToDelta: readonly MarkdownASTToDeltaMatcher[]
  }
}
