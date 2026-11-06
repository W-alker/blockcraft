/** 测量事实与分配策略分离；此文件不读取 DOM，也不写文档。 */
export interface CellWidthMetrics {
  minimum: number
  natural: number
  samples: Array<{width: number; height: number}>
}

export interface TableCellWidthProfile extends CellWidthMetrics {
  row: number
  column: number
  rowspan: number
  colspan: number
}

function spanWidth(widths: readonly number[], cell: TableCellWidthProfile): number {
  let width = 0
  for (let col = cell.column; col < cell.column + cell.colspan; col++) width += widths[col]
  return width
}

// 采用较窄样本的高度，保守估计换行；不假设文本高度随宽度线性变化。
function heightAt(cell: TableCellWidthProfile, width: number): number {
  const samples = cell.samples
  let lo = 0
  let hi = samples.length - 1
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (samples[mid].width <= width) lo = mid
    else hi = mid - 1
  }
  return samples[lo]?.height ?? 0
}

function layoutCost(widths: readonly number[], cells: readonly TableCellWidthProfile[]): number {
  const rows: number[] = []
  let cellCost = 0
  for (const cell of cells) {
    const height = heightAt(cell, spanWidth(widths, cell)) / cell.rowspan
    for (let row = cell.row; row < cell.row + cell.rowspan; row++) {
      rows[row] = Math.max(rows[row] ?? 0, height)
    }
    // 小权重用于跨过“同一行两列同高”的平台，不让任意一列长期饿死。
    cellCost += height
  }
  return rows.reduce((sum, height) => sum + (height ?? 0), 0) + cellCost * 0.02
}

/**
 * 一次性整表布局启发式：短内容保全，长内容按换行收益分配，合并格约束总宽。
 * 最多 64 轮，无逐像素搜索；不足以容纳最小内容宽时保留横向溢出。
 */
export function smartTableColumnWidths(
  columnCount: number, available: number, cells: readonly TableCellWidthProfile[],
): number[] {
  const widths = Array<number>(columnCount).fill(50)
  const minimumFor = (cell: TableCellWidthProfile) => Math.ceil(Math.max(
    50 * cell.colspan, cell.minimum, cell.natural <= 128 ? cell.natural : 0,
  ))
  // 先满足单列，再处理跨度约束，避免合并标题强迫某一列独自承受整个标题宽度。
  for (const cell of cells) {
    if (cell.colspan === 1) widths[cell.column] = Math.max(widths[cell.column], minimumFor(cell))
  }
  for (const cell of cells) {
    let deficit = minimumFor(cell) - spanWidth(widths, cell)
    for (let i = 0; deficit > 0 && i < cell.colspan; i++) {
      const addition = Math.ceil(deficit / (cell.colspan - i))
      widths[cell.column + i] += addition
      deficit -= addition
    }
  }
  const byColumn = widths.map((_, col) => cells.filter(cell =>
    col >= cell.column && col < cell.column + cell.colspan))
  let remaining = Math.floor(available) - widths.reduce((sum, width) => sum + width, 0)
  const step = Math.max(8, Math.ceil(remaining / 64))
  for (let iteration = 0; remaining > 0 && iteration < 64; iteration++) {
    const cost = layoutCost(widths, cells)
    let bestColumn = -1
    let bestGain = -Infinity
    let bestPressure = -Infinity
    let bestAddition = 0
    for (let col = 0; col < columnCount; col++) {
      const related = byColumn[col]
      const deficit = related.reduce((max, cell) => Math.max(max, cell.natural - spanWidth(widths, cell)), 0)
      const addition = Math.min(step, remaining, Math.ceil(deficit))
      if (!addition) continue
      // 已达到自然宽的短列不会因为合并格而优先获得额外宽度。
      const pressure = related.reduce((sum, cell) => sum
        + Math.max(0, Math.log2(cell.natural / spanWidth(widths, cell))) / cell.colspan, 0)
        / Math.max(1, related.length)
      widths[col] += addition
      const gain = (cost - layoutCost(widths, cells)) / addition
      widths[col] -= addition
      if (gain > bestGain + 0.0001 || (Math.abs(gain - bestGain) <= 0.0001 && pressure > bestPressure)) {
        bestColumn = col
        bestGain = gain
        bestPressure = pressure
        bestAddition = addition
      }
    }
    if (bestColumn < 0) break
    widths[bestColumn] += bestAddition
    remaining -= bestAddition
  }
  return widths
}
