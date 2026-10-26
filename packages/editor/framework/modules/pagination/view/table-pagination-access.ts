import {TableCellFlowPlan} from '../engine/table-cell-flow'
import {TableRowGeom} from './item-builder'
import {TableBreak} from './table-split'

export interface TablePaginationMeasureOptions {
  contentHeight: number
  widowOrphanLines: number
}

export interface TablePaginationGeometry {
  naturalHeight: number
  headerHeight: number
  rows: TableRowGeom[]
  cellFlowPlan?: TableCellFlowPlan
}

interface TablePaginationAccess {
  measure(options?: TablePaginationMeasureOptions): TablePaginationGeometry
  apply(breaks: TableBreak[]): void
  clear(): void
}

const accessByTable = new WeakMap<object, TablePaginationAccess>()

export function registerTablePaginationAccess(
  table: object,
  access: TablePaginationAccess,
): () => void {
  accessByTable.set(table, access)
  return () => accessByTable.delete(table)
}

export function hasTablePaginationAccess(table: object): boolean {
  return accessByTable.has(table)
}

export function measureTablePaginationGeometry(
  table: object,
  options?: TablePaginationMeasureOptions,
): TablePaginationGeometry | undefined {
  return accessByTable.get(table)?.measure(options)
}

export function applyTablePaginationBreaks(
  table: object,
  breaks: TableBreak[],
): boolean {
  const access = accessByTable.get(table)
  if (!access) return false
  access.apply(breaks)
  return true
}

export function clearTablePaginationBreaks(table: object): void {
  accessByTable.get(table)?.clear()
}
