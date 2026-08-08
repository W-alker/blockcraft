import {PaginationItem, PaginationResult} from '../engine'
import {cloneTableCellFlowPlan} from '../engine/table-cell-flow'
import {copyTableCellFlowPlan} from '../engine/table-cell-flow-metadata'
import {PaginationConfig, ResolvedPaginationGeometry} from '../pagination.types'

/**
 * 一次分页计算的纯数据快照。它不持有 DOM/Block 引用，可安全交给异步打印流程。
 */
export interface StablePaginationLayout {
  readonly revision: number
  readonly config: Readonly<PaginationConfig>
  readonly geometry: Readonly<ResolvedPaginationGeometry>
  /**
   * placement-layout 相对分页首张纸顶部的 canonical Y 原点（layout px）。
   * 由同一稳定分页几何的正文起点与首页额外占位直接组成，不读取视觉 DOM。
   */
  readonly placementOriginY?: number
  /** placement content box 相对首张纸左缘的 canonical X 原点（layout px）。 */
  readonly placementOriginX?: number
  /** placement content box 的 canonical 宽度；不包含 root 左右 padding。 */
  readonly placementWidth?: number
  readonly items: readonly PaginationItem[]
  readonly result: PaginationResult
}

export function createStablePaginationLayout(
  revision: number,
  config: PaginationConfig,
  geometry: ResolvedPaginationGeometry,
  items: readonly PaginationItem[],
  result: PaginationResult,
): StablePaginationLayout {
  return {
    revision,
    config: cloneConfig(config),
    geometry: cloneGeometry(geometry),
    items: items.map(cloneItem),
    result: {
      pages: result.pages.map(page => ({
        index: page.index,
        usedHeight: page.usedHeight,
        slots: page.slots.map(slot => ({
          id: slot.id,
          fragment: slot.fragment ? {...slot.fragment} : undefined,
        })),
      })),
      byBlock: new Map(
        Array.from(result.byBlock.entries(), ([id, placement]) => [id, {...placement}]),
      ),
    },
  }
}

function cloneConfig(config: PaginationConfig): PaginationConfig {
  return {
    ...config,
    pageSize: typeof config.pageSize === 'object' ? {...config.pageSize} : config.pageSize,
    margins: config.margins ? {...config.margins} : undefined,
    header: config.header ? {...config.header} : undefined,
    footer: config.footer ? {...config.footer} : undefined,
  }
}

function cloneGeometry(geometry: ResolvedPaginationGeometry): ResolvedPaginationGeometry {
  return {
    ...geometry,
    margins: {...geometry.margins},
    geometry: {...geometry.geometry},
  }
}

function cloneItem(item: PaginationItem): PaginationItem {
  const clone: PaginationItem = {
    ...item,
    splitOffsets: item.splitOffsets ? [...item.splitOffsets] : undefined,
    preferredSplitOffsets: item.preferredSplitOffsets
      ? [...item.preferredSplitOffsets]
      : undefined,
  }
  copyTableCellFlowPlan(item, clone, cloneTableCellFlowPlan)
  return clone
}
