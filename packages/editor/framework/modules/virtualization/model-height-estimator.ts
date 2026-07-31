import {
  BlockNodeType,
  DeltaInsert,
  DeltaInsertEmbed,
  readInlineImageDelta,
} from '../../block-std'
import {
  resolveInlineFloatGeometry,
} from '../../block-std/inline/runtime/inline-float-layout'

const DEFAULT_INLINE_IMAGE_WIDTH = 320
const DEFAULT_INLINE_IMAGE_HEIGHT = 240
const DEFAULT_ESTIMATED_LINE_HEIGHT = 24
const DEFAULT_ESTIMATED_CHARACTER_WIDTH = 8
const LINEAR_ESTIMATED_CONTAINERS = new Set(['callout'])

export interface ModelHeightEstimatorOptions {
  estimatedHeights?: Readonly<Partial<Record<string, number>>>
  defaultHeight?: number
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

const positiveNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value > 0
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
  if (flavour === 'placement-layout' || flavour === 'page-divider') {
    return {height: 0, modelDriven: true}
  }

  const fallback =
    positiveNumber(options.estimatedHeights?.[flavour]) ??
    defaultHeight
  visiting.add(blockId)
  try {
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
      const inlineImageHeight = estimateInlineImageLineHeight(
        doc.model.getTextDeltas?.(blockId) ?? [],
        doc.objectSizing?.rootContentWidth ?? 0,
      )
      return {
        height: Math.max(fallback, inlineImageHeight),
        modelDriven: inlineImageHeight > 0,
      }
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
    if (
      typeof delta.insert !== 'object' ||
      delta.insert === null ||
      typeof delta.insert['image'] !== 'string'
    ) {
      continue
    }

    const data = readInlineImageDelta(delta as DeltaInsertEmbed)
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
      side: data.side,
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
