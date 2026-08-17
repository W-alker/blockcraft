import {
  BlockNodeType,
  DeltaInsert,
  DeltaInsertEmbed,
  normalizeParagraphFontScale,
  normalizeParagraphSpacing,
  normalizeTypographyLineHeight,
  paragraphPointsToPixels,
  readInlineImageDelta,
  resolveEditableBlockFontScale,
} from '../../block-std'
import type {
  BlockModelHeightEstimateContext,
  BlockVirtualizationLayoutMode,
} from '../../block-std'
import {
  resolveInlineFloatGeometry,
} from '../../block-std/inline/runtime/inline-float-layout'
import type {IBlockModelContentChange} from '../../doc/model-graph'

const DEFAULT_INLINE_IMAGE_WIDTH = 320
const DEFAULT_INLINE_IMAGE_HEIGHT = 240
const DEFAULT_ESTIMATED_LINE_HEIGHT = 24
const DEFAULT_ESTIMATED_CHARACTER_WIDTH = 8
const TABLE_ESTIMATED_CHARACTER_WIDTH_RATIO = 0.75
const TABLE_ESTIMATED_LINE_HEIGHT_RATIO = 1.5
const DEFAULT_TABLE_ROW_HEIGHT = 60
const DEFAULT_TABLE_COLUMN_WIDTH = 100
const TABLE_CELL_HORIZONTAL_PADDING = 16
const TABLE_CELL_VERTICAL_PADDING = 24
const MAX_TABLE_CONTENT_SAMPLE_ROWS = 96
const MAX_TABLE_CONTENT_SAMPLE_CELLS_PER_ROW = 24
const MAX_TABLE_CONTENT_SAMPLE_CHILDREN = 12
const LINEAR_ESTIMATED_CONTAINERS = new Set(['callout'])

export interface ModelHeightEstimatorOptions {
  estimatedHeights?: Readonly<Partial<Record<string, number>>>
  defaultHeight?: number
  layoutMode?: BlockVirtualizationLayoutMode
  rootFacts?: {
    flavour: string
    nodeType: BlockNodeType
    props?: Record<string, unknown>
  }
}

export interface ModelHeightEstimate {
  height: number
  modelDriven: boolean
}

/** @internal Consumer-owned provenance used when applying one model estimate. */
export interface ModelHeightEstimateApplicationState {
  /** Whether the previous estimator result was model-driven rather than fallback. */
  previousModelDriven: boolean
  /** Whether the consumer still retains a height produced by live DOM measurement. */
  hasMeasuredHeight: boolean
  /** Whether that retained measurement still matches the current model/context. */
  measurementFresh: boolean
}

/**
 * @internal Decide whether the current estimator result should replace the
 * consumer's retained height. Provenance updates remain consumer-owned and
 * must happen even when this returns false or the numeric height is unchanged.
 */
export function shouldApplyModelHeightEstimate(
  estimate: ModelHeightEstimate,
  state: ModelHeightEstimateApplicationState,
): boolean {
  if (estimate.modelDriven) return true
  if (!state.hasMeasuredHeight) return true
  if (state.measurementFresh) return false
  return state.previousModelDriven
}

const positiveNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : null

const nonNegativeNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : null

/**
 * 使用纯模型数据估算一个 render unit 的高度。
 *
 * 该路径不会读取 DOM，可同时用于连续虚拟渲染和稀疏分页。媒体块使用
 * wr/ar，行内图片使用 delta 中的 width/height；缺失尺寸统一按 4:3 兜底。
 */
export function estimateModelBlockHeight(
  doc: BlockCraft.Doc,
  blockId: string,
  options: ModelHeightEstimatorOptions = {},
): number {
  return estimateModelBlockHeightDetails(doc, blockId, options).height
}

export function estimateModelBlockHeightDetails(
  doc: BlockCraft.Doc,
  blockId: string,
  options: ModelHeightEstimatorOptions = {},
): ModelHeightEstimate {
  return estimateBlock(
    doc,
    blockId,
    options,
    new Set(),
    options.rootFacts,
  )
}

/**
 * Whether a model content change can affect this block's model-only height.
 *
 * Table estimates deliberately ignore nested text changes. Mounted tables are
 * corrected by live DOM measurement, while an unmounted table must not rescan
 * sampled cell contents on every keystroke. Persisted props changes are rare
 * enough to refresh the bounded model-first estimate (column widths, merge
 * structure, media sizing, heading level, and so on).
 */
export function modelHeightEstimateAffectedByContentChange(
  doc: BlockCraft.Doc,
  blockId: string,
  change: IBlockModelContentChange,
): boolean {
  if (doc.model.getFlavour(blockId) !== 'table') return true
  if (!change.kinds.includes('props')) return false
  return change.blockIds.some(changedId =>
    changedId === blockId || isDescendantOf(doc, changedId, blockId),
  )
}

function estimateBlock(
  doc: BlockCraft.Doc,
  blockId: string,
  options: ModelHeightEstimatorOptions,
  visiting: Set<string>,
  knownFacts?: ModelHeightEstimatorOptions['rootFacts'],
): ModelHeightEstimate {
  const defaultHeight =
    positiveNumber(options.defaultHeight) ?? 48
  if (visiting.has(blockId)) {
    return {height: defaultHeight, modelDriven: false}
  }

  const flavour = knownFacts?.flavour ?? doc.model.getFlavour(blockId)
  if (!flavour) return {height: defaultHeight, modelDriven: false}
  if (flavour === 'placement-layout') {
    return {height: 0, modelDriven: true}
  }

  const fallback =
    positiveNumber(options.estimatedHeights?.[flavour]) ??
    defaultHeight
  visiting.add(blockId)
  try {
    const schemaEstimator = doc.schemas
      ?.get(flavour, false)
      ?.metadata.virtualization
      ?.estimateHeight
    if (schemaEstimator) {
      try {
        const props = knownFacts?.props ?? doc.model.getProps(blockId) ?? {}
        const nodeType = knownFacts?.nodeType ?? doc.model.getNodeType?.(blockId)
        const context = {
          blockId,
          flavour,
          nodeType,
          props,
          childIds: doc.model.getChildrenIds(blockId),
          layoutMode: options.layoutMode ?? 'flow',
          fallbackHeight: fallback,
          rootContentWidth: doc.objectSizing?.rootContentWidth ?? 0,
          baseFontSize: doc.layoutMetrics?.baseFontSize ?? 16,
          lineHeight: doc.layoutMetrics?.lineHeight ?? 24,
          estimateChildHeight: (childId: string) =>
            estimateBlock(doc, childId, options, visiting).height,
        } as BlockModelHeightEstimateContext
        const estimate = schemaEstimator(context)
        const height = nonNegativeNumber(estimate)
        if (height !== null) return {height, modelDriven: true}
      } catch (error) {
        doc.logger?.warn('blockModelHeightEstimatorError: ', error)
      }
    }

    const dimensions = doc.objectSizing?.resolve(
      flavour,
      knownFacts?.props ?? doc.model.getProps(blockId),
    )
    if (dimensions) {
      const childrenHeight = doc.model
        .getChildrenIds(blockId)
        .reduce(
          (height, childId) =>
            height + estimateBlock(
              doc,
              childId,
              options,
              visiting,
            ).height,
          0,
        )
      return {
        height: Math.max(1, dimensions.height + childrenHeight),
        modelDriven: true,
      }
    }

    const nodeType =
      knownFacts?.nodeType ??
      doc.model.getNodeType?.(blockId)
    if (nodeType === BlockNodeType.editable) {
      const props = knownFacts?.props ?? doc.model.getProps(blockId) ?? {}
      const inlineImageHeight = estimateInlineImageLineHeight(
        doc.model.getTextDeltas?.(blockId) ?? [],
        doc.objectSizing?.rootContentWidth ?? 0,
      )
      return estimateEditableBlockHeight(
        doc,
        blockId,
        props,
        fallback,
        doc.objectSizing?.rootContentWidth ?? 0,
        inlineImageHeight,
      )
    }

    if (flavour === 'table') {
      return estimateTableHeight(doc, blockId, options, fallback, visiting)
    }

    if (LINEAR_ESTIMATED_CONTAINERS.has(flavour)) {
      const children = doc.model.getChildrenIds(blockId)
      if (!children.length) {
        return {height: fallback, modelDriven: false}
      }
      const childEstimates = children.map(childId =>
        estimateBlock(doc, childId, options, visiting),
      )
      return {
        height: Math.max(
          fallback,
          childEstimates.reduce(
            (height, estimate) => height + estimate.height,
            0,
          ),
        ),
        modelDriven: childEstimates.some(estimate => estimate.modelDriven),
      }
    }

    return {height: fallback, modelDriven: false}
  } finally {
    visiting.delete(blockId)
  }
}

function estimateTableHeight(
  doc: BlockCraft.Doc,
  tableId: string,
  options: ModelHeightEstimatorOptions,
  fallback: number,
  visiting: Set<string>,
): ModelHeightEstimate {
  const rowFallback =
    positiveNumber(options.estimatedHeights?.['table-row']) ??
    DEFAULT_TABLE_ROW_HEIGHT
  const rowIds = doc.model.getChildrenIds(tableId)
    .filter(rowId => doc.model.getFlavour(rowId) === 'table-row')
  if (!rowIds.length) {
    return {height: fallback, modelDriven: false}
  }

  const tableProps = doc.model.getProps(tableId) ?? {}
  const rawColumnWidths = tableProps['colWidths']
  const columnWidths = Array.isArray(rawColumnWidths)
    ? rawColumnWidths.map(width =>
        positiveNumber(width) ?? DEFAULT_TABLE_COLUMN_WIDTH)
    : []
  const sampledRowIndices = stratifiedSampleIndices(
    rowIds.length,
    MAX_TABLE_CONTENT_SAMPLE_ROWS,
  )
  const sampledRowExtras = sampledRowIndices.map(rowIndex =>
    estimateTableRowContentExtra(
      doc,
      rowIds,
      rowIndex,
      columnWidths,
      rowFallback,
      options,
      visiting,
    ),
  )
  const projectedContentExtra = projectSampledTotal(
    sampledRowExtras,
    rowIds.length,
  )

  // `table-row.props.height` is intentionally not read here. In the current
  // dual continuous/paginated layout it is neither bound to the rendered row
  // nor a stable intrinsic measurement. Treating the legacy/import field as
  // geometry makes placeholder error accumulate once per row.
  return {
    height: Math.max(
      fallback,
      rowIds.length * rowFallback + projectedContentExtra,
    ),
    modelDriven: true,
  }
}

function estimateTableRowContentExtra(
  doc: BlockCraft.Doc,
  rowIds: readonly string[],
  rowIndex: number,
  columnWidths: readonly number[],
  rowFallback: number,
  options: ModelHeightEstimatorOptions,
  visiting: Set<string>,
): number {
  const cellIds = doc.model.getChildrenIds(rowIds[rowIndex])
  if (!cellIds.length) return 0
  const sampledCellIndices = stratifiedSampleIndices(
    cellIds.length,
    MAX_TABLE_CONTENT_SAMPLE_CELLS_PER_ROW,
  )
  let requiredExtra = 0

  for (const columnIndex of sampledCellIndices) {
    const cellId = cellIds[columnIndex]
    if (doc.model.getFlavour(cellId) !== 'table-cell') continue
    const props = doc.model.getProps(cellId) ?? {}
    if (props['display'] === 'none') continue
    const colspan = positiveInteger(props['colspan']) ?? 1
    const rowspan = Math.min(
      rowIds.length - rowIndex,
      positiveInteger(props['rowspan']) ?? 1,
    )
    const cellWidth = estimateTableCellWidth(
      columnWidths,
      columnIndex,
      colspan,
    )
    const contentHeight = estimateTableCellContentHeight(
      doc,
      cellId,
      Math.max(1, cellWidth - TABLE_CELL_HORIZONTAL_PADDING),
      options,
      visiting,
    )
    requiredExtra = Math.max(
      requiredExtra,
      contentHeight - rowFallback * rowspan,
    )
  }

  return Math.max(0, requiredExtra)
}

function estimateTableCellWidth(
  columnWidths: readonly number[],
  columnIndex: number,
  colspan: number,
): number {
  let width = 0
  for (let index = columnIndex; index < columnIndex + colspan; index++) {
    width += columnWidths[index] ?? DEFAULT_TABLE_COLUMN_WIDTH
  }
  return width
}

function estimateTableCellContentHeight(
  doc: BlockCraft.Doc,
  cellId: string,
  contentWidth: number,
  options: ModelHeightEstimatorOptions,
  visiting: Set<string>,
): number {
  const childIds = doc.model.getChildrenIds(cellId)
  if (!childIds.length) return TABLE_CELL_VERTICAL_PADDING
  const sampledChildIndices = stratifiedSampleIndices(
    childIds.length,
    MAX_TABLE_CONTENT_SAMPLE_CHILDREN,
  )
  const sampledChildHeights = sampledChildIndices.map(index =>
    estimateTableCellChildHeight(
      doc,
      childIds[index],
      contentWidth,
      options,
      visiting,
    ),
  )
  return TABLE_CELL_VERTICAL_PADDING + projectSampledTotal(
    sampledChildHeights,
    childIds.length,
  )
}

function estimateTableCellChildHeight(
  doc: BlockCraft.Doc,
  childId: string,
  contentWidth: number,
  options: ModelHeightEstimatorOptions,
  visiting: Set<string>,
): number {
  if (doc.model.getNodeType?.(childId) !== BlockNodeType.editable) {
    return estimateBlock(doc, childId, options, visiting).height
  }

  // Height projection needs a cheap placeholder, not browser-equivalent line
  // breaking. Y.Text.length is O(1); getTextDeltas()/toDelta plus per-character
  // inspection would make a large sampled table pay for rich-text materialize
  // work before it mounts. DOM measurement remains the exact correction path.
  const textLength = Math.max(0, doc.model.getTextLength?.(childId) ?? 0)
  const props = doc.model.getProps(childId) ?? {}
  const rootFontSize =
    positiveNumber(doc.layoutMetrics?.baseFontSize) ?? 16
  const paragraphLineHeight = normalizeTypographyLineHeight(props['lh'])
  const rootLineHeight = paragraphLineHeight === null
    ? positiveNumber(doc.layoutMetrics?.lineHeight) ??
      rootFontSize * TABLE_ESTIMATED_LINE_HEIGHT_RATIO
    : rootFontSize * paragraphLineHeight
  const fontScale = resolveEditableBlockFontScale(
    props,
    doc.model.getFlavour(childId),
  )
  const characterWidth = rootFontSize *
    TABLE_ESTIMATED_CHARACTER_WIDTH_RATIO * fontScale
  const lineHeight = rootLineHeight * fontScale
  const lineCount = Math.max(
    1,
    Math.ceil(
      textLength * characterWidth /
      Math.max(1, contentWidth),
    ),
  )
  if (!hasParagraphTypographyFacts(props)) return lineCount * lineHeight
  return lineCount * lineHeight + paragraphOuterSpacing(
    doc,
    childId,
    props,
  )
}

function estimateEditableBlockHeight(
  doc: BlockCraft.Doc,
  blockId: string,
  props: Record<string, unknown>,
  fallback: number,
  contentWidth: number,
  inlineImageHeight: number,
): ModelHeightEstimate {
  const hasParagraphFacts = hasParagraphTypographyFacts(props)
  if (!hasParagraphFacts) {
    return {
      height: Math.max(fallback, inlineImageHeight),
      modelDriven: inlineImageHeight > 0,
    }
  }
  const baseFontSize = positiveNumber(doc.layoutMetrics?.baseFontSize) ?? 16
  const defaultLineHeight = positiveNumber(doc.layoutMetrics?.lineHeight) ??
    baseFontSize * 1.5
  const defaultGap = nonNegativeNumber(doc.layoutMetrics?.segmentGap) ?? 10
  const lineHeightRatio = normalizeTypographyLineHeight(props['lh'])
  const headingScale = resolveEditableBlockFontScale(
    props,
    doc.model.getFlavour(blockId),
  )
  const lineHeight = (
    lineHeightRatio === null
      ? defaultLineHeight
      : baseFontSize * lineHeightRatio
  ) * headingScale
  const textLength = Math.max(0, doc.model.getTextLength?.(blockId) ?? 0)
  const characterWidth = baseFontSize * DEFAULT_ESTIMATED_CHARACTER_WIDTH /
    16 * headingScale
  const lineCount = contentWidth > 0
    ? Math.max(1, Math.ceil(
        textLength * characterWidth / contentWidth,
      ))
    : 1
  const estimatedTextHeight = lineCount * lineHeight
  const fallbackContentHeight = Math.max(0, fallback - defaultGap)
  const spacing = paragraphOuterSpacing(doc, blockId, props)
  const height = Math.max(
    fallbackContentHeight,
    estimatedTextHeight,
    inlineImageHeight,
  ) + spacing
  return {
    height,
    modelDriven: inlineImageHeight > 0 || hasParagraphFacts,
  }
}

function paragraphOuterSpacing(
  doc: BlockCraft.Doc,
  blockId: string,
  props: Record<string, unknown>,
): number {
  const previousId = siblingId(doc, blockId, -1)
  const nextId = siblingId(doc, blockId, 1)
  const leading = previousId
    ? 0
    : paragraphPointsToPixels(normalizeParagraphSpacing(props['psb']) ?? 0)
  const ownAfter = normalizeParagraphSpacing(props['psa'])
  if (!nextId) {
    return leading + paragraphPointsToPixels(ownAfter ?? 0)
  }

  const defaultGap = nonNegativeNumber(doc.layoutMetrics?.segmentGap) ?? 10
  const nextBefore = doc.model.getNodeType(nextId) === BlockNodeType.editable
    ? normalizeParagraphSpacing(doc.model.getProps(nextId)?.['psb'])
    : null
  const trailing = Math.max(
    ownAfter === null ? defaultGap : paragraphPointsToPixels(ownAfter),
    paragraphPointsToPixels(nextBefore ?? 0),
  )
  return leading + trailing
}

function hasParagraphTypographyFacts(props: Record<string, unknown>): boolean {
  return [
    normalizeParagraphFontScale(props['pfs']),
    normalizeTypographyLineHeight(props['lh']),
    normalizeParagraphSpacing(props['psb']),
    normalizeParagraphSpacing(props['psa']),
  ].some(value => value !== null)
}

function siblingId(
  doc: BlockCraft.Doc,
  blockId: string,
  offset: -1 | 1,
): string | null {
  const model = doc.model as typeof doc.model & {
    getPreviousSiblingId?: (id: string) => string | null
    getNextSiblingId?: (id: string) => string | null
  }
  const direct = offset < 0
    ? model.getPreviousSiblingId?.(blockId)
    : model.getNextSiblingId?.(blockId)
  if (direct !== undefined) return direct

  const parentId = model.getParentId?.(blockId)
  if (!parentId) return null
  const siblings = model.getChildrenIds?.(parentId) ?? []
  const index = siblings.indexOf(blockId)
  return index < 0 ? null : siblings[index + offset] ?? null
}

function projectSampledTotal(
  sampledValues: readonly number[],
  populationSize: number,
): number {
  if (!sampledValues.length || populationSize <= 0) return 0
  if (sampledValues.length >= populationSize) {
    return sampledValues.reduce((sum, value) => sum + value, 0)
  }

  // A 10% trimmed mean prevents one isolated giant sampled cell from being
  // multiplied across thousands of otherwise short rows, while still
  // projecting uniformly content-heavy tables accurately.
  const sorted = [...sampledValues].sort((left, right) => left - right)
  const trim = Math.floor(sorted.length * 0.1)
  const representative = sorted.slice(trim, sorted.length - trim)
  const average = representative.reduce((sum, value) => sum + value, 0) /
    Math.max(1, representative.length)
  return average * populationSize
}

function stratifiedSampleIndices(
  populationSize: number,
  limit: number,
): number[] {
  if (populationSize <= 0 || limit <= 0) return []
  if (populationSize <= limit) {
    return Array.from({length: populationSize}, (_, index) => index)
  }
  if (limit === 1) return [Math.floor((populationSize - 1) / 2)]

  const indices = new Set<number>()
  for (let index = 0; index < limit; index++) {
    indices.add(Math.round(index * (populationSize - 1) / (limit - 1)))
  }
  return [...indices]
}

function positiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
    ? value
    : null
}

function isDescendantOf(
  doc: BlockCraft.Doc,
  blockId: string,
  ancestorId: string,
): boolean {
  const seen = new Set<string>()
  let currentId: string | null = blockId
  while (currentId && !seen.has(currentId)) {
    seen.add(currentId)
    currentId = doc.model.getParentId(currentId)
    if (currentId === ancestorId) return true
  }
  return false
}

function estimateInlineImageLineHeight(
  deltas: readonly DeltaInsert[],
  rootContentWidth: number,
): number {
  let maxOrdinaryImageHeight = 0
  let wrappedExclusionHeight = 0
  let maxWrappedTextHeight = 0
  const textLength = deltas.reduce((length, delta) =>
    length + (typeof delta.insert === 'string' ? delta.insert.length : 0), 0)
  const availableWidth =
    positiveNumber(rootContentWidth) ??
    DEFAULT_INLINE_IMAGE_WIDTH

  for (const delta of deltas) {
    if (typeof delta.insert !== 'object' || delta.insert === null) {
      continue
    }
    const isImage = typeof delta.insert['image'] === 'string'
    const isShape = typeof delta.insert['shape'] === 'string'
    const isInlineObject = isShape ||
      typeof delta.insert['word-art'] === 'string'
    if (!isImage && !isInlineObject) continue
    const data = isImage
      ? readInlineImageDelta(delta as DeltaInsertEmbed)
      : {
          width: positiveNumber(delta.attributes?.['width']) ?? undefined,
          height: positiveNumber(delta.attributes?.['height']) ?? undefined,
          wrap: delta.attributes?.['wrap'] === true,
          side: 'auto',
          x: typeof delta.attributes?.['x'] === 'number'
            ? delta.attributes['x']
            : undefined,
          gap: typeof delta.attributes?.['gap'] === 'number'
            ? delta.attributes['gap']
            : undefined,
        }
    const rawWidth = positiveNumber(data.width)
    const rawHeight = positiveNumber(data.height)
    const width =
      rawWidth ??
      (rawHeight == null
        ? DEFAULT_INLINE_IMAGE_WIDTH
        : rawHeight * DEFAULT_INLINE_IMAGE_WIDTH / DEFAULT_INLINE_IMAGE_HEIGHT)
    const height =
      rawHeight ??
      width * DEFAULT_INLINE_IMAGE_HEIGHT / DEFAULT_INLINE_IMAGE_WIDTH
    if (!data.wrap) {
      const renderedWidth = Math.min(width, availableWidth)
      maxOrdinaryImageHeight = Math.max(
        maxOrdinaryImageHeight,
        renderedWidth * height / width,
      )
      continue
    }

    const geometry = resolveInlineFloatGeometry({
      containerWidth: availableWidth,
      imageWidth: width,
      imageHeight: height,
      x: data.x,
      side: data.side as 'auto' | 'left' | 'right' | undefined,
      gap: data.gap,
    })
    wrappedExclusionHeight += geometry.exclusionHeight

    if (textLength > 0) {
      const sideCharactersPerLine = Math.max(
        1,
        Math.floor(
          geometry.availableTextWidth /
          DEFAULT_ESTIMATED_CHARACTER_WIDTH,
        ),
      )
      const fullCharactersPerLine = Math.max(
        1,
        Math.floor(
          availableWidth /
          DEFAULT_ESTIMATED_CHARACTER_WIDTH,
        ),
      )
      const linesBesideImage = Math.max(
        1,
        Math.floor(
          geometry.exclusionHeight /
          DEFAULT_ESTIMATED_LINE_HEIGHT,
        ),
      )
      const charactersBesideImage = Math.min(
        textLength,
        sideCharactersPerLine * linesBesideImage,
      )
      const occupiedSideLines = Math.ceil(
        charactersBesideImage / sideCharactersPerLine,
      )
      const remainingCharacters = textLength - charactersBesideImage
      const fullWidthLines = Math.ceil(
        remainingCharacters / fullCharactersPerLine,
      )
      maxWrappedTextHeight = Math.max(
        maxWrappedTextHeight,
        (occupiedSideLines + fullWidthLines) *
          DEFAULT_ESTIMATED_LINE_HEIGHT,
      )
    }
  }
  return Math.max(
    maxOrdinaryImageHeight,
    wrappedExclusionHeight,
    maxWrappedTextHeight,
  )
}
