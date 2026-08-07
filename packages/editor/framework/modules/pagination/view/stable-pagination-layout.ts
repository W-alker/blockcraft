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
   * placement-layout 相对分页首张纸顶部的实际 Y 原点（layout px）。
   *
   * 该值在同步导出屏障中从已经投影完成的 live DOM 捕获；它和分页断点属于
   * 同一个稳定版本，固定页盒不得再根据页边距或宿主 documentHeader 重算。
   */
  readonly placementOriginY?: number
  /** placement plane 相对首张纸左缘的固定 X 原点（layout px）。 */
  readonly placementOriginX?: number
  /** placement plane 的实际 layout 宽度；固定坐标导出不得另选 containing block。 */
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
