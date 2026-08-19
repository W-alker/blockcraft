import type {
  BlockPlacementLayer,
  BlockPlacementMode,
  IBlockProps,
} from '../../block-std/types'

export const BLOCK_PLACEMENT_LAYOUT_FLAVOUR = 'placement-layout' as const
export const BLOCK_OBJECT_GROUP_FLAVOUR = 'object-group' as const
/** Fixed layout-pixel inset between a group frame and its local object plane. */
export const BLOCK_OBJECT_GROUP_PADDING = 8

export interface BlockObjectGroupProps extends IBlockProps {
  width: number
  height: number
}

const MIN_OBJECT_GROUP_CONTENT_SIZE = 1
const DEFAULT_OBJECT_GROUP_SIZE =
  BLOCK_OBJECT_GROUP_PADDING * 2 + MIN_OBJECT_GROUP_CONTENT_SIZE

const normalizeGroupLength = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.max(DEFAULT_OBJECT_GROUP_SIZE, value)
    : DEFAULT_OBJECT_GROUP_SIZE

export function normalizeBlockObjectGroupProps(
  props: Partial<BlockObjectGroupProps> | null | undefined,
): BlockObjectGroupProps {
  return {
    width: normalizeGroupLength(props?.width),
    height: normalizeGroupLength(props?.height),
  }
}

export type BlockPlacementDragState = 'idle' | 'armed' | 'dragging'

/** One-shot alignment commands for objects in the same placement plane. */
export type BlockObjectAlignment =
  | 'left'
  | 'horizontal-center'
  | 'right'
  | 'top'
  | 'vertical-center'
  | 'bottom'
  | 'center'
  | 'horizontal-distribute'
  | 'vertical-distribute'

/**
 * User-facing object layout vocabulary.
 *
 * `inline` changes the object representation and is therefore handled by a
 * flavour adapter. The other three states are the semantic projection of the
 * generic block placement model.
 */
export type BlockObjectLayout = 'inline' | 'top-bottom' | 'under' | 'over'
export type BlockObjectBlockLayout = Exclude<BlockObjectLayout, 'inline'>

export interface BlockObjectLayoutOption {
  value: BlockObjectLayout
  label: string
  icon: string
}

export const BLOCK_OBJECT_LAYOUT_OPTIONS: readonly BlockObjectLayoutOption[] = [
  {
    value: 'inline',
    label: '嵌入型',
    icon: 'bc_tuwenraopaiqianrushi',
  },
  {
    value: 'top-bottom',
    label: '上下型',
    icon: 'bc_tuwenraopaishangxiashi',
  },
  {
    value: 'under',
    label: '衬于文字下方',
    icon: 'bc_cengji-xia',
  },
  {
    value: 'over',
    label: '浮于文字上方',
    icon: 'bc_cengji-shang',
  },
] as const

export interface BlockObjectLayoutAdapterContext {
  doc: BlockCraft.Doc
  block: BlockCraft.BlockComponent
}

export interface BlockObjectLayoutAdapter {
  /**
   * Replace the block representation with an inline object. Returning true
   * means the adapter accepted the transition.
   */
  toInline(context: BlockObjectLayoutAdapterContext): boolean
}

export interface BlockPlacementTransitionContext {
  doc: BlockCraft.Doc
  block: BlockCraft.BlockComponent
  from: BlockPlacementMode
  to: BlockPlacementMode
  /** Apply the standard props transition at most once. */
  applyDefault(): boolean
}

export interface BlockPlacementConfig {
  /**
   * Synchronous host transition hook. Return true when the host handled the
   * complete transition; false/void falls back to the standard props update.
   */
  transitionMode?: (context: BlockPlacementTransitionContext) => boolean | void
}

export interface AbsoluteBlockInsertOptions {
  /**
   * Viewport-relative visual anchor. `undefined` reads the current editor
   * selection; `null` deliberately uses the safe root-origin fallback.
   */
  anchorRect?: DOMRect | null
  layer?: BlockPlacementLayer
}

export interface PlacementBox {
  container: HTMLElement
  originX: number
  originY: number
  width: number
  /** 实测 visual px / layout px，比配置值更能覆盖 WebKit 的 CSS zoom 差异。 */
  visualScale: number
  /**
   * 内容原点到容器 padding box 各边的距离（layout px）。
   *
   * placement x/y 的原点是内容盒左上角，但对象允许压在编辑器内边距上，因此
   * 「可放置区」比内容盒大一圈。这三个值把这一圈换算回同一套内容原点坐标，
   * 不变量：`contentInsetLeft + width + contentInsetRight === clientWidth`。
   */
  contentInsetLeft: number
  contentInsetRight: number
  contentInsetTop: number
}

/**
 * 可放置区边界，用 placement 内容原点坐标表达（左/上为负即压在内边距上）。
 *
 * 纵向只给下界：向下的可用高度由具体调用方按自己的视图（根高度、页面高度）
 * 决定，几何层不假设文档有多长。
 */
export interface PlacementPlaneBounds {
  minX: number
  maxX: number
  minY: number
}

/**
 * Stable flow insertion point resolved from the current visual geometry.
 *
 * Block ids are intentionally stored instead of array indexes: callers may
 * execute the move inside a larger Yjs transaction and sibling indexes can
 * shift before the anchor is consumed.
 */
export interface BlockPlacementFlowAnchor {
  parentId: string
  anchorBlockId: string
  side: 'before' | 'after'
}
