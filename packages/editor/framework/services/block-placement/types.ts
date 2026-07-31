import type {
  BlockPlacementLayer,
  BlockPlacementMode,
} from '../../block-std/types'

export const BLOCK_PLACEMENT_LAYOUT_FLAVOUR = 'placement-layout' as const

export type BlockPlacementDragState = 'idle' | 'armed' | 'dragging'

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
    icon: 'bc_fuwenben-qianruzuo',
  },
  {
    value: 'top-bottom',
    label: '上下型',
    icon: 'bc_fuwenben-shangxia',
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
