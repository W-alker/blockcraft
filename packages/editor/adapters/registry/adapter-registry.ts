import type {BlockHtmlAdapterMatcher} from '../html-adapter/block-adapter'
import type {
  HtmlASTToDeltaMatcher,
  InlineDeltaToHtmlAdapterMatcher,
} from '../html-adapter/delta-converter'
import type {BlockMarkdownAdapterMatcher} from '../markdown-adapter/block-adapter'
import type {
  InlineDeltaToMarkdownAdapterMatcher,
  MarkdownASTToDeltaMatcher,
} from '../markdown-adapter/delta-converter'
import type {
  BlockAdapterContribution,
  InlineEmbedAdapterContribution,
} from './types'

function assertUnique(values: readonly string[], label: string): void {
  const seen = new Set<string>()
  for (const value of values) {
    if (seen.has(value)) throw new Error(`Duplicate ${label}: ${value}`)
    seen.add(value)
  }
}

function freezeUnique<T extends object>(values: readonly T[]): readonly T[] {
  return Object.freeze([...new Set(values)])
}

/** Immutable, pre-indexed adapter registry shared by HTML and Markdown. */
export class AdapterRegistry {
  readonly blocks: readonly BlockAdapterContribution[]
  readonly inlineEmbeds: readonly InlineEmbedAdapterContribution[]
  readonly htmlBlockMatchers: readonly BlockHtmlAdapterMatcher[]
  readonly markdownBlockMatchers: readonly BlockMarkdownAdapterMatcher[]
  readonly htmlInlineDeltaMatchers: readonly InlineDeltaToHtmlAdapterMatcher[]
  readonly htmlInlineAstMatchers: readonly HtmlASTToDeltaMatcher[]
  readonly markdownInlineDeltaMatchers: readonly InlineDeltaToMarkdownAdapterMatcher[]
  readonly markdownInlineAstMatchers: readonly MarkdownASTToDeltaMatcher[]

  private readonly htmlExportByFlavour = new Map<
    string,
    readonly BlockHtmlAdapterMatcher[]
  >()
  private readonly markdownExportByFlavour = new Map<
    string,
    readonly BlockMarkdownAdapterMatcher[]
  >()

  constructor(
    blocks: readonly BlockAdapterContribution[],
    inlineEmbeds: readonly InlineEmbedAdapterContribution[] = [],
  ) {
    this.blocks = Object.freeze([...blocks])
    this.inlineEmbeds = Object.freeze([...inlineEmbeds])
    assertUnique(blocks.map(item => item.id), 'Block adapter contribution id')
    assertUnique(
      blocks.flatMap(item => item.flavours),
      'Block adapter flavour',
    )
    assertUnique(inlineEmbeds.map(item => item.key), 'Inline Embed adapter key')

    // Sibling domains may intentionally share one grammar matcher (for
    // example ordered/bullet/todo or video/audio) while retaining separate
    // contribution ownership. De-duplicate the same matcher object once at
    // registry construction so an import node is never handled twice.
    this.htmlBlockMatchers = freezeUnique(
      blocks.flatMap(item => item.html ?? []),
    )
    this.markdownBlockMatchers = freezeUnique(
      blocks.flatMap(item => item.markdown ?? []),
    )
    this.htmlInlineDeltaMatchers = freezeUnique(inlineEmbeds.flatMap(
      item => item.html.deltaToAst,
    ))
    this.htmlInlineAstMatchers = freezeUnique(inlineEmbeds.flatMap(
      item => item.html.astToDelta,
    ))
    this.markdownInlineDeltaMatchers = freezeUnique(inlineEmbeds.flatMap(
      item => item.markdown.deltaToAst,
    ))
    this.markdownInlineAstMatchers = freezeUnique(inlineEmbeds.flatMap(
      item => item.markdown.astToDelta,
    ))

    for (const contribution of blocks) {
      for (const flavour of contribution.flavours) {
        if (contribution.html?.length) {
          this.htmlExportByFlavour.set(flavour, contribution.html)
        }
        if (contribution.markdown?.length) {
          this.markdownExportByFlavour.set(flavour, contribution.markdown)
        }
      }
    }
  }

  htmlMatchersForFlavour(
    flavour: string,
  ): readonly BlockHtmlAdapterMatcher[] {
    return this.htmlExportByFlavour.get(flavour) ?? []
  }

  markdownMatchersForFlavour(
    flavour: string,
  ): readonly BlockMarkdownAdapterMatcher[] {
    return this.markdownExportByFlavour.get(flavour) ?? []
  }
}
