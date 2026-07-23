import type {BlockViewRetention} from '../../block-std/schema'
import type {BlockNodeType} from '../../block-std/types'

/** A closed interval of direct root-child indices. */
export type RenderedSegment = readonly [start: number, end: number]

export interface BlockViewRetentionContext {
  readonly blockId: string
  readonly flavour: string
  readonly nodeType: BlockNodeType
  readonly schemaRetention: BlockViewRetention
}

export type BlockViewRetentionResolver = (
  context: BlockViewRetentionContext,
) => BlockViewRetention | undefined

export interface VirtualizationConfig {
  enabled?: boolean
  /** Direct root children kept mounted above and below the viewport. */
  overscan?: number
  /** Unmounted indices tolerated between two segments before they are merged. */
  segmentMergeGap?: number
  /** Recently unmounted root subtrees retained for fast remount before eviction. */
  retainedViewLimit?: number
  /** Per-flavour estimates used before a block has been measured. */
  estimatedHeights?: Readonly<Partial<Record<string, number>>>
  /** Override Schema `viewRetention` when a block view first materializes. */
  resolveViewRetention?: BlockViewRetentionResolver
}

export interface ResolvedVirtualizationConfig {
  enabled: boolean
  overscan: number
  segmentMergeGap: number
  retainedViewLimit: number
  estimatedHeights: Partial<Record<string, number>>
  resolveViewRetention?: BlockViewRetentionResolver
}

export const DEFAULT_VIRTUALIZATION_CONFIG: Readonly<ResolvedVirtualizationConfig> =
  Object.freeze({
    enabled: false,
    overscan: 5,
    segmentMergeGap: 2,
    retainedViewLimit: 12,
    estimatedHeights: Object.freeze({}),
    resolveViewRetention: undefined,
  })

export function resolveVirtualizationConfig(
  config: VirtualizationConfig | undefined,
): ResolvedVirtualizationConfig {
  return {
    enabled: config?.enabled ?? DEFAULT_VIRTUALIZATION_CONFIG.enabled,
    overscan: resolveInteger(
      config?.overscan,
      DEFAULT_VIRTUALIZATION_CONFIG.overscan,
      2,
    ),
    segmentMergeGap: resolveInteger(
      config?.segmentMergeGap,
      DEFAULT_VIRTUALIZATION_CONFIG.segmentMergeGap,
      0,
    ),
    retainedViewLimit: resolveInteger(
      config?.retainedViewLimit,
      DEFAULT_VIRTUALIZATION_CONFIG.retainedViewLimit,
      0,
    ),
    estimatedHeights: {...config?.estimatedHeights},
    resolveViewRetention: config?.resolveViewRetention,
  }
}

function resolveInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
): number {
  if (value === undefined || !Number.isFinite(value)) return fallback
  return Math.max(minimum, Math.floor(value))
}
