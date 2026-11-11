import type {SimpleBasicType, SimpleRecord} from '@ccc/blockcraft/global/types';

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
