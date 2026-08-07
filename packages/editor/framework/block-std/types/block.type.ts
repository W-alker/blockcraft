import {SimpleBasicType, SimpleRecord, SimpleValue, UnknownRecord} from "../../../global";
import {InlineModel} from "./inline.type";

/**
 * root = 'root',
 * block: 普通的块级节点，一般这代表它有children\
 * void: 无children的block节点，且不可编辑，类似html的 \<img /> 闭合标签类型 \
 * editable: 可编辑的文本块节点，和void一样，是最底层的block节点\
 */
export enum BlockNodeType {
  root = 'root',
  block = 'block',
  void = 'void',
  editable = 'editable'
}

export type BlockPlaceholderMode = 'focused' | 'always'

export interface IBaseMetadata {
  folded?: boolean
  selected?: boolean
  /**
   * Per-block placeholder override for editable blocks.
   * An empty string explicitly disables the placeholder for this block.
   */
  plh?: string
  /**
   * Placeholder visibility for this block.
   * Omitted is equivalent to the legacy focused-only behavior.
   */
  plhMode?: BlockPlaceholderMode
  /**
   * Instance-level direct-child allow patterns.
   * Only interpreted by Schemas that opt into instance child constraints.
   */
  incl?: string[]
  /**
   * Instance-level direct-child deny patterns. Deny wins over `incl`.
   * Only interpreted by Schemas that opt into instance child constraints.
   */
  excl?: string[]
  /** Non-empty user id of the block's explicit lock owner. */
  lock?: string
  /**
   * Business origin of the explicit lock. Omitted/invalid values are treated
   * as a normal user lock; only template locks need a persisted marker.
   */
  lockKind?: 'template'
  createdTime?: number
  lastModified?: {
    time: number
    [key: string]: SimpleBasicType
  }
}

export type IMetadata = IBaseMetadata & SimpleRecord

export type BlockPlacementMode = 'relative' | 'absolute'
export type BlockPlacementLayer = 'under' | 'over'

/**
 * Persistent block placement. The omitted value is equivalent to
 * `{ mode: 'relative' }`.
 *
 * New absolute placements use fixed CSS layout pixels for both `x` and `y`
 * relative to the root placement plane. Legacy documents omitted `unit` and
 * stored `x` as a percentage; renderers keep that format read-compatible but
 * every new mutation writes the canonical pixel form.
 */
export type BlockPositionState = {
  mode: BlockPlacementMode
  x?: number
  y?: number
  unit?: 'px'
  layer?: BlockPlacementLayer
}

export type ResolvedBlockPosition = {
  mode: BlockPlacementMode
  x: number
  y: number
  unit?: 'px'
  layer: BlockPlacementLayer
}

export interface IBlockProps {
  textAlign?: 'center' | 'right'
  depth?: number
  placement?: BlockPositionState

  [key: string]: SimpleValue
}

export interface IEditableBlockProps extends IBlockProps {
  depth: number
  heading?: number
}

export interface BaseBlockDesc<P extends SimpleRecord = SimpleRecord, M extends SimpleRecord = SimpleRecord> {
  id: string
  flavour: BlockCraft.BlockFlavour
  nodeType: BlockNodeType | `${BlockNodeType}`
  meta: IMetadata & M
  props: IBlockProps & P
}

export type IBlockSnapshot<P extends SimpleRecord = SimpleRecord, M extends SimpleRecord = SimpleRecord> =
  UnknownRecord
  & Exclude<BaseBlockDesc<P, M>, 'nodeType'>
  & ({
  nodeType: BlockNodeType.block | BlockNodeType.root
  children: IBlockSnapshot[]
} | {
  nodeType: BlockNodeType.void
  children: []
} | {
  nodeType: BlockNodeType.editable
  children: InlineModel
})
