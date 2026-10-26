import type {Link, PhrasingContent} from 'mdast'
import {createInlineDirectiveAdapterContribution} from '../../../adapters/generic'
import type {
  InlineDeltaToMarkdownAdapterMatcher,
  MarkdownASTToDeltaMatcher,
} from '../../../adapters/markdown-adapter'
import type {DeltaInsert, DeltaInsertEmbed} from '../../../framework'
import {
  INLINE_MENTION_EMBED_KEY,
  createInlineMentionEmbedConverter,
} from '..'

const MENTION_URN_PREFIX = 'urn:blockcraft:mention:'
const MENTION_LINK_TITLE = 'blockcraft:mention'
const DEFAULT_MENTION_TYPE = 'user'
const MAX_MENTION_TYPE_LENGTH = 64
const MAX_MENTION_ID_LENGTH = 1024

function readMentionAttribute(
  delta: DeltaInsertEmbed,
  name: 'mentionId' | 'mentionType',
): string {
  const value = delta.attributes?.[name] ?? delta.attributes?.[`d:${name}`]
  return typeof value === 'string' || typeof value === 'number'
    ? String(value).trim()
    : ''
}

function mentionLabel(delta: DeltaInsertEmbed): string {
  const value = String(delta.insert[INLINE_MENTION_EMBED_KEY] ?? '').trim()
    || readMentionAttribute(delta, 'mentionId')
  return value.startsWith('@') ? value : `@${value}`
}

function createMentionUrn(delta: DeltaInsertEmbed): string | null {
  const mentionId = readMentionAttribute(delta, 'mentionId')
  if (!mentionId || mentionId.length > MAX_MENTION_ID_LENGTH) return null

  const mentionType = readMentionAttribute(delta, 'mentionType')
    || DEFAULT_MENTION_TYPE
  if (mentionType.length > MAX_MENTION_TYPE_LENGTH) return null

  return `${MENTION_URN_PREFIX}${encodeURIComponent(mentionType)}:${encodeURIComponent(mentionId)}`
}

function parseMentionUrn(url: string): {
  mentionId: string
  mentionType: string
} | null {
  if (!url.toLowerCase().startsWith(MENTION_URN_PREFIX)) return null
  const payload = url.slice(MENTION_URN_PREFIX.length)
  const separator = payload.indexOf(':')
  if (separator <= 0 || separator === payload.length - 1) return null

  try {
    const mentionType = decodeURIComponent(payload.slice(0, separator)).trim()
    const mentionId = decodeURIComponent(payload.slice(separator + 1)).trim()
    if (
      !mentionType
      || !mentionId
      || mentionType.length > MAX_MENTION_TYPE_LENGTH
      || mentionId.length > MAX_MENTION_ID_LENGTH
    ) {
      return null
    }
    return {mentionId, mentionType}
  } catch {
    return null
  }
}

function mentionValueFromLink(
  link: Link,
  toDelta: (ast: PhrasingContent) => DeltaInsert[],
  fallback: string,
): string {
  const label = link.children
    .flatMap(child => toDelta(child))
    .map(delta => typeof delta.insert === 'string' ? delta.insert : '')
    .join('')
    .trim()
    .replace(/^@/, '')
  return label || fallback
}

const baseMentionEmbedAdapters = createInlineDirectiveAdapterContribution({
  key: INLINE_MENTION_EMBED_KEY,
  adapterName: 'mention',
  createDomConverter: createInlineMentionEmbedConverter,
})

const mentionMarkdownDeltaMatcher: InlineDeltaToMarkdownAdapterMatcher = {
  name: 'mention',
  match: delta => !!delta.insert
    && typeof delta.insert === 'object'
    && INLINE_MENTION_EMBED_KEY in delta.insert,
  toAST: delta => {
    const embed = delta as DeltaInsertEmbed
    const label = mentionLabel(embed)
    const urn = createMentionUrn(embed)
    if (!urn) return {type: 'text', value: label}
    return {
      type: 'link',
      url: urn,
      title: MENTION_LINK_TITLE,
      children: [{type: 'text', value: label}],
    }
  },
}

const mentionUrnMarkdownAstMatcher: MarkdownASTToDeltaMatcher = {
  name: 'mention-urn',
  match: ast => ast.type === 'link'
    && 'url' in ast
    && parseMentionUrn(ast.url) !== null,
  toDelta: (ast, context) => {
    if (ast.type !== 'link') return []
    const mention = parseMentionUrn(ast.url)
    if (!mention) return []
    return [{
      insert: {
        [INLINE_MENTION_EMBED_KEY]: mentionValueFromLink(
          ast,
          child => context.toDelta(child),
          mention.mentionId,
        ),
      },
      attributes: {
        mentionId: mention.mentionId,
        mentionType: mention.mentionType,
      },
    }]
  },
}

export const mentionEmbedAdapters = {
  ...baseMentionEmbedAdapters,
  markdownSyntax: [{
    id: 'inline:mention',
    title: 'Mention link',
    description: 'The visible label belongs in brackets and the stable entity type and ID belong in the BlockCraft mention URN. Never invent an ID.',
    kind: 'link',
    example: '[@张三](urn:blockcraft:mention:user:user-123 "blockcraft:mention")',
  }] as const,
  markdown: {
    deltaToAst: [mentionMarkdownDeltaMatcher],
    astToDelta: [
      mentionUrnMarkdownAstMatcher,
      ...baseMentionEmbedAdapters.markdown.astToDelta,
    ],
  },
}
