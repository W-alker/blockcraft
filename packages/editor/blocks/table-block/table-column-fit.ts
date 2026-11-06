import type {CellWidthMetrics} from './table-smart-width'

/** 表格专用的一次性测量，不改变编辑 DOM，也不注册持续观察器。 */
const TEXT_STYLES = [
  'font-family', 'font-size', 'font-weight', 'font-style', 'font-stretch',
  'font-variant', 'font-feature-settings', 'font-variation-settings',
  'letter-spacing', 'word-spacing', 'line-height', 'text-transform', 'text-indent',
  'direction', 'writing-mode', 'tab-size', 'vertical-align',
  'padding-left', 'padding-right', 'border-left-width', 'border-right-width',
  'border-left-style', 'border-right-style', 'margin-left', 'margin-right',
  'display', 'flex-direction', 'column-gap', 'row-gap', 'align-items',
] as const

const VIEW_ONLY = '[data-bc-inline-pagination-gap], .bc-pagination-table-flow-mask, [data-bc-native-input], button, script, style'
const ATOMIC = 'img, svg, canvas, video, iframe'

/** 只复制排版信息和文字；不复制 ID、编辑属性、资源 URL 或交互节点。 */
function copyContent(source: Node, doc: Document, wrap = false): Node | null {
  if (source.nodeType === Node.TEXT_NODE) return doc.createTextNode(source.textContent ?? '')
  if (!(source instanceof Element)) return null
  if (source.matches(VIEW_ONLY)) return null
  if (source.tagName === 'BR') return doc.createElement('br')
  const style = doc.defaultView!.getComputedStyle(source)
  if (style.display === 'none' || style.position === 'absolute' || style.position === 'fixed') return null

  const copy = doc.createElement('span')
  for (const name of TEXT_STYLES) copy.style.setProperty(name, style.getPropertyValue(name))
  // 固定宽度和当前软换行不能进入自然宽度计算。显式 br/文本换行仍保留。
  copy.style.whiteSpace = wrap ? style.whiteSpace : 'pre'
  copy.style.flex = wrap ? style.flex : '0 0 auto'
  if (wrap) {
    for (const name of ['overflow-wrap', 'word-break', 'padding-top', 'padding-bottom',
      'border-top-width', 'border-bottom-width', 'border-top-style', 'border-bottom-style']) {
      copy.style.setProperty(name, style.getPropertyValue(name))
    }
  }
  copy.style.minWidth = '0'
  copy.style.boxSizing = 'content-box'
  if (source.matches(ATOMIC)) {
    copy.style.display = 'inline-block'
    copy.style.width = style.width
    copy.style.height = style.height
    copy.style.boxSizing = style.boxSizing
    return copy
  }
  for (const child of Array.from(source.childNodes)) {
    const cloned = copyContent(child, doc, wrap)
    if (cloned) copy.appendChild(cloned)
  }
  // 列表前缀等无文本装饰仍占据原来的布局宽度。
  if (!copy.hasChildNodes() && style.display !== 'inline') copy.style.width = style.width
  return copy
}

/** 同批先写后读，避免每个单元格触发一次布局；返回未缩放的布局像素。 */
export function measureTableCellWidths(cells: readonly HTMLElement[]): number[] {
  if (!cells.length) return []
  const doc = cells[0].ownerDocument
  const surface = doc.createElement('div')
  surface.setAttribute('aria-hidden', 'true')
  surface.inert = true
  surface.style.cssText = 'position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;contain:layout style;zoom:1;width:max-content;'
  const copies = cells.map(cell => {
    const copy = copyContent(cell, doc) as HTMLElement
    copy.style.display = 'block'
    copy.style.width = 'max-content'
    copy.style.margin = '0'
    surface.appendChild(copy)
    return copy
  })
  try {
    doc.body.appendChild(surface)
    return copies.map(copy => Math.ceil(copy.getBoundingClientRect().width))
  } finally {
    surface.remove()
  }
}

/** 每格最多 17 个宽度样本。复用隔离副本，同一宽度档先批量写入、再读取高度。 */
export function measureTableCellWidthMetrics(cells: readonly HTMLElement[], available: number): CellWidthMetrics[] {
  if (!cells.length) return []
  const natural = measureTableCellWidths(cells)
  const doc = cells[0].ownerDocument
  const surface = doc.createElement('div')
  surface.inert = true
  surface.setAttribute('aria-hidden', 'true')
  surface.style.cssText = 'position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;contain:layout style;zoom:1;width:max-content;'
  const copies = cells.map(cell => {
    const copy = copyContent(cell, doc, true) as HTMLElement
    copy.style.display = 'flow-root'
    copy.style.width = 'min-content'
    copy.style.boxSizing = 'border-box'
    copy.style.margin = '0'
    surface.appendChild(copy)
    return copy
  })
  try {
    doc.body.appendChild(surface)
    const metrics = copies.map((copy, index): CellWidthMetrics => ({
      natural: natural[index],
      minimum: Math.ceil(copy.getBoundingClientRect().width),
      samples: [],
    }))
    const widths = metrics.map(metric => {
      const low = Math.max(50, metric.minimum)
      const high = Math.max(low, Math.min(available, metric.natural))
      return [...new Set(Array.from({length: 17}, (_, i) => Math.ceil(low + (high - low) * i / 16)))]
    })
    for (let sample = 0; sample < 17; sample++) {
      copies.forEach((copy, i) => {
        if (sample < widths[i].length) copy.style.width = `${widths[i][sample]}px`
      })
      copies.forEach((copy, i) => {
        if (sample < widths[i].length) {
          metrics[i].samples.push({width: widths[i][sample], height: copy.getBoundingClientRect().height})
        }
      })
    }
    return metrics
  } finally {
    surface.remove()
  }
}

/** 未提供测量值的列（例如只有跨列合并格）保留原宽。 */
export function fitTableColumnWidths(
  current: readonly number[], measured: ReadonlyMap<number, number>, min: number, max: number,
): number[] {
  const upper = Math.max(min, Math.floor(max))
  return current.map((width, index) => {
    const natural = measured.get(index)
    return natural === undefined || !Number.isFinite(natural) || natural < 0
      ? width : Math.max(min, Math.min(upper, Math.ceil(natural)))
  })
}
