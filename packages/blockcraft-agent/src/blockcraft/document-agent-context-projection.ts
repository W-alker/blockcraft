import type {
  DocumentAgentContext,
  DocumentAgentContextBlock,
  DocumentAgentContextCoverage,
  DocumentAgentModelContextOptions,
} from '../core/agent.types'

const DEFAULT_INITIAL_CONTEXT_CHARS = 24_000
const DEFAULT_INITIAL_CONTEXT_BLOCKS = 80
const DEFAULT_BLOCK_PREVIEW_CHARS = 480
const MAX_OUTLINE_PROP_KEYS = 24

const DETAIL_TOOLS: DocumentAgentContextCoverage['detailTools'] = [
  'blockcraft.get_document_context',
  'blockcraft.get_block',
  'blockcraft.search_document',
]

export interface DocumentAgentContextPageOptions {
  offset?: number
  maxBlocks?: number
  maxChars?: number
  previewCharsPerBlock?: number
  includeCapabilities?: boolean
}

/**
 * Keeps small requests lossless and turns only oversized document scope into a
 * bounded outline. The complete context remains host-owned for validation.
 */
export function projectDocumentAgentContextForModel(
  context: DocumentAgentContext,
  options: DocumentAgentModelContextOptions = {},
): DocumentAgentContext {
  if (context.scope !== 'document' || options.strategy === 'full') return context

  const maxChars = clampInteger(
    options.maxInitialChars,
    DEFAULT_INITIAL_CONTEXT_CHARS,
    8_000,
    100_000,
  )
  if (serializedLength(context) <= maxChars) return context

  return createDocumentAgentContextOutlinePage(context, {
    maxChars,
    maxBlocks: clampInteger(
      options.maxInitialBlocks,
      DEFAULT_INITIAL_CONTEXT_BLOCKS,
      8,
      200,
    ),
    previewCharsPerBlock: clampInteger(
      options.previewCharsPerBlock,
      DEFAULT_BLOCK_PREVIEW_CHARS,
      80,
      2_000,
    ),
  })
}

/** Build one bounded DFS-ordered outline page from a complete context. */
export function createDocumentAgentContextOutlinePage(
  context: DocumentAgentContext,
  options: DocumentAgentContextPageOptions = {},
): DocumentAgentContext {
  const totalBlocks = context.blocks.length
  const offset = clampInteger(options.offset, 0, 0, totalBlocks)
  const maxBlocks = clampInteger(options.maxBlocks, 40, 1, 200)
  const maxChars = clampInteger(options.maxChars, 10_000, 4_000, 100_000)
  const previewChars = clampInteger(
    options.previewCharsPerBlock,
    DEFAULT_BLOCK_PREVIEW_CHARS,
    40,
    2_000,
  )
  const totalTextChars = context.blocks.reduce(
    (total, block) => total + (block.text?.plain.length ?? 0),
    0,
  )
  const coverage: DocumentAgentContextCoverage = {
    mode: 'paged',
    detail: 'outline',
    totalBlocks,
    offset,
    returnedBlocks: 0,
    nextOffset: offset < totalBlocks ? offset : null,
    totalTextChars,
    includedTextChars: 0,
    detailTools: DETAIL_TOOLS,
  }
  const projected: DocumentAgentContext = {
    ...context,
    selectedText: '',
    blocks: [],
    coverage,
  }
  if (options.includeCapabilities === false) {
    delete projected.capabilities
  }

  const blocks: DocumentAgentContextBlock[] = []
  let includedTextChars = 0
  let usedChars = serializedLength(projected)
  let cursor = offset

  while (cursor < totalBlocks && blocks.length < maxBlocks) {
    let outline = toOutlineBlock(context.blocks[cursor], previewChars)
    let outlineChars = serializedLength(outline) + 1
    if (blocks.length > 0 && usedChars + outlineChars > maxChars) break
    if (blocks.length === 0 && usedChars + outlineChars > maxChars) {
      outline = toOutlineBlock(context.blocks[cursor], 0)
      outlineChars = serializedLength(outline) + 1
    }
    blocks.push(outline)
    includedTextChars += outline.outline?.textPreview?.length ?? 0
    usedChars += outlineChars
    cursor++
  }

  return {
    ...projected,
    blocks,
    coverage: {
      ...coverage,
      returnedBlocks: blocks.length,
      nextOffset: cursor < totalBlocks ? cursor : null,
      includedTextChars,
    },
  }
}

function toOutlineBlock(
  block: DocumentAgentContextBlock,
  previewChars: number,
): DocumentAgentContextBlock {
  const plain = block.text?.plain
  const propKeys = Object.keys(block.props ?? {})
  const textPreview = plain === undefined
    ? undefined
    : plain.slice(0, previewChars)

  return {
    blockId: block.blockId,
    flavour: block.flavour,
    nodeType: block.nodeType,
    ...(block.parentId === undefined ? {} : {parentId: block.parentId}),
    ...(block.index === undefined ? {} : {index: block.index}),
    ...(block.readonly === undefined ? {} : {readonly: block.readonly}),
    detail: 'outline',
    outline: {
      ...(plain === undefined ? {} : {
        textPreview,
        textLength: plain.length,
        textTruncated: plain.length > (textPreview?.length ?? 0),
      }),
      ...(block.props === undefined ? {} : {
        propKeys: propKeys.slice(0, MAX_OUTLINE_PROP_KEYS),
        propKeysTruncated: propKeys.length > MAX_OUTLINE_PROP_KEYS,
      }),
      ...(block.childIds === undefined ? {} : {childCount: block.childIds.length}),
    },
  }
}

function clampInteger(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.floor(value)))
}

function serializedLength(value: unknown): number {
  try {
    return JSON.stringify(value).length
  } catch {
    return Number.POSITIVE_INFINITY
  }
}
