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
  MarkdownAdapterManifest,
  MarkdownAdapterProfile,
  MarkdownSyntaxDescriptor,
} from './types'

const MAX_MARKDOWN_SYNTAX_ITEMS = 128
const MAX_MARKDOWN_SYNTAX_FIELD_CHARS = 4_000

const STANDARD_MARKDOWN_SYNTAX: readonly MarkdownSyntaxDescriptor[] = Object.freeze(([
  {
    id: 'standard:prose',
    title: 'Standard Markdown prose',
    description: 'Use headings, paragraphs, emphasis and strong text for readable prose.',
    kind: 'standard',
    example: '# Heading\n\nReadable **paragraph** text.',
  },
  {
    id: 'standard:structure',
    title: 'Standard Markdown structure',
    description: 'Use lists, task lists, block quotes, tables, thematic breaks and fenced code when they carry the meaning.',
    kind: 'standard',
    example: '- Item\n- [ ] Task\n\n> Quote\n\n```ts\nconst value = 1\n```',
  },
  {
    id: 'standard:links-media',
    title: 'Standard Markdown links and images',
    description: 'Use ordinary links and images. Keep URLs readable and never hide internal metadata in opaque text.',
    kind: 'link',
    example: '[Reference](https://example.com)\n\n![Description](https://example.com/image.png)',
  },
] satisfies MarkdownSyntaxDescriptor[]).map(item => Object.freeze(item)))

const MARKDOWN_SYNTAX_KINDS = new Set([
  'standard',
  'link',
  'fenced-code',
  'text-directive',
  'leaf-directive',
  'container-directive',
])
const MARKDOWN_PROFILES = new Set(['portable', 'hybrid', 'blockcraft'])

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

function normalizeSyntaxField(value: string, label: string): string {
  const normalized = value.trim()
  if (!normalized) throw new Error(`Markdown syntax ${label} must not be empty.`)
  if (normalized.length > MAX_MARKDOWN_SYNTAX_FIELD_CHARS) {
    throw new Error(`Markdown syntax ${label} exceeds ${MAX_MARKDOWN_SYNTAX_FIELD_CHARS} characters.`)
  }
  return normalized
}

function normalizeSyntaxDescriptor(
  descriptor: MarkdownSyntaxDescriptor,
): MarkdownSyntaxDescriptor {
  if (!MARKDOWN_SYNTAX_KINDS.has(descriptor.kind)) {
    throw new Error(`Unsupported Markdown syntax kind: ${descriptor.kind}`)
  }
  const profiles = descriptor.profiles?.length
    ? [...new Set(descriptor.profiles)]
    : undefined
  if (profiles?.some(profile => !MARKDOWN_PROFILES.has(profile))) {
    throw new Error(`Unsupported Markdown syntax profile in ${descriptor.id}.`)
  }
  return Object.freeze({
    id: normalizeSyntaxField(descriptor.id, 'id'),
    title: normalizeSyntaxField(descriptor.title, 'title'),
    description: normalizeSyntaxField(descriptor.description, 'description'),
    kind: descriptor.kind,
    ...(profiles ? {profiles: Object.freeze(profiles)} : {}),
    example: normalizeSyntaxField(descriptor.example, 'example'),
  })
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
  private readonly markdownSyntax: readonly MarkdownSyntaxDescriptor[]

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

    const contributedSyntax = [
      ...blocks.flatMap(item => item.markdownSyntax ?? []),
      ...inlineEmbeds.flatMap(item => item.markdownSyntax ?? []),
    ].map(normalizeSyntaxDescriptor)
    assertUnique(contributedSyntax.map(item => item.id), 'Markdown syntax id')
    if (contributedSyntax.length > MAX_MARKDOWN_SYNTAX_ITEMS) {
      throw new Error(`Markdown syntax count exceeds ${MAX_MARKDOWN_SYNTAX_ITEMS}.`)
    }
    this.markdownSyntax = Object.freeze(contributedSyntax)

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

  /** Build the exact, bounded Markdown grammar manifest for model/UI consumers. */
  createMarkdownManifest(
    profile: MarkdownAdapterProfile,
  ): MarkdownAdapterManifest {
    if (!MARKDOWN_PROFILES.has(profile)) {
      throw new Error(`Unsupported Markdown adapter profile: ${profile}`)
    }
    const syntaxes = [
      ...STANDARD_MARKDOWN_SYNTAX,
      ...this.markdownSyntax
        .filter(item => !item.profiles || item.profiles.includes(profile))
        .sort((left, right) => left.id.localeCompare(right.id)),
    ]
    return Object.freeze({
      version: 1,
      profile,
      standardFirst: true,
      syntaxes: Object.freeze(syntaxes),
    })
  }
}
