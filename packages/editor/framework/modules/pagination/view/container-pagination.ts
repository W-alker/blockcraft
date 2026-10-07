import {BlockNodeType} from '@ccc/blockcraft/framework/model'
import type {EditableBlockComponent} from '../../../block-std/block/component/editable-block'
import {resolveBlockPolicy} from '@ccc/blockcraft/framework/modules/pagination/engine'
import {
  applyInlinePaginationGaps, clearInlinePaginationGaps,
  isInlinePaginationProjectionWritable, measureInlinePaginationLineStarts,
  subscribeInlinePaginationProjectionInvalidated, whenInlinePaginationProjectionWritable,
} from '../../../block-std/inline/runtime/inline-pagination-access'
import type {InlinePaginationGap} from '../../../block-std/inline/runtime/inline-pagination-projection'
import {
  createInlinePaginationBreakPlan, InlinePaginationBreakPoint,
  visualDistanceToHostLayout,
} from './inline-break-plan'
import {
  applyTablePaginationBreaks, clearTablePaginationBreaks, measureTablePaginationGeometry,
  TablePaginationMeasureOptions,
} from './table-pagination-access'
import type {TableBreak} from './table-split'

/** 包内复合锚点：offset 仍是目标子块的 Y.Text 坐标；0 表示子块之前。 */
export interface ContainerPaginationGap extends InlinePaginationGap {
  blockId?: string
  layoutOffset?: number
}

/** 包内白名单；分栏、表格单元格等并行/原子容器不走这条顺序流。 */
export function isSequentialPaginationContainer(flavour: string): boolean {
  return flavour === 'render-unit' || flavour === 'callout'
}

/** live 和 Snapshot Viewer 共用结构；高亮块的 padding 在 Emoji/content 的外层。 */
export function paginationContainerElements(host: HTMLElement) {
  const callout = host.classList.contains('callout-block')
  if (!callout && !host.classList.contains('render-unit-block')) return null
  const content = host.querySelector<HTMLElement>(callout
    ? ':scope > .bc-block-content > .callout-content'
    : ':scope > .render-unit-content')
  return content ? {content, padding: callout ? content.parentElement! : content} : null
}

/** 填写区与高亮块共享顺序流测量，短高亮子块保持整体。 */
export function measureContainerBreakPlan(
  region: BlockCraft.BlockComponent,
  options: TablePaginationMeasureOptions,
) {
  const host = region.hostElement
  const rect = host.getBoundingClientRect()
  const naturalHeight = host.offsetHeight
  const toLayout = (value: number) => visualDistanceToHostLayout(value, rect.height, naturalHeight)
  const points: InlinePaginationBreakPoint[] = []
  let hasContent = false
  const visit = (parent: BlockCraft.BlockComponent, parentInset = 0) => {
    const hostStyle = getComputedStyle(parent.hostElement)
    const elements = paginationContainerElements(parent.hostElement)
    const contentStyle = elements ? getComputedStyle(elements.padding) : hostStyle
    const inset = parentInset + (parseFloat(hostStyle.borderTopWidth) || 0)
      + (parseFloat(hostStyle.borderBottomWidth) || 0)
      + (parseFloat(contentStyle.paddingTop) || 0) + (parseFloat(contentStyle.paddingBottom) || 0)
    for (const child of parent.getChildrenBlocks()) {
      const element = child.hostElement
      const style = getComputedStyle(element)
      if (style.display === 'none' || style.position === 'absolute') continue
      const childRect = element.getBoundingClientRect()
      const top = toLayout(childRect.top - rect.top)
      if (hasContent) points.push({layoutOffset: top, blockId: child.id, textOffset: 0})
      const budget = Math.max(1, options.contentHeight - inset)
      if (child.flavour === 'render-unit'
        || (child.flavour === 'callout' && toLayout(childRect.height) > budget)) {
        visit(child, inset)
        continue
      }
      hasContent = true
      const policy = resolveBlockPolicy({flavour: child.flavour, nodeType: child.nodeType})
      // 局部 padding/border 也占正文容量；不能等文本单独高过整页才检测。
      if (child.nodeType === BlockNodeType.editable && policy.breakable && toLayout(childRect.height) > budget) {
        const editable = child as EditableBlockComponent
        const lines = measureInlinePaginationLineStarts(editable.runtime, Math.min(
          2048, Math.max(64, Math.ceil(toLayout(childRect.height) / options.contentHeight) * 8),
        ))
        const minimum = Math.max(1, options.widowOrphanLines)
        const strict = lines.filter((_line, index) => index + 1 >= minimum && lines.length - index >= minimum)
        const containerTop = editable.containerElement.getBoundingClientRect().top
        for (const line of strict.length ? strict : lines) {
          points.push({
            layoutOffset: toLayout(containerTop + line.top - rect.top),
            blockId: child.id,
            textOffset: line.offset,
          })
        }
      } else if (child.flavour === 'table' && toLayout(childRect.height) > budget) {
        // 复用表格的自然行几何和内容合并保护；不侵入单元格并行流。
        const geometry = measureTablePaginationGeometry(child)
        const rows = geometry?.rows ?? []
        for (let index = 1; index < rows.length; index++) {
          if (rows[index].coveredByContentMerge) continue
          points.push({layoutOffset: top + rows[index].top, blockId: rows[index].id, textOffset: 0})
        }
      }
    }
  }
  visit(region)
  return createInlinePaginationBreakPlan(points, naturalHeight)
}

/**
 * 顺序容器的复合视图适配器。生命周期由根级分页 applier 统一管理，
 * 与文本共享 suspend / rollback / sparse / projection-ready 机制。
 */
export class ContainerPaginationProjection {
  private readonly runtimes = new Set<object>()
  private readonly tables = new Set<object>()
  private readonly spacers: HTMLElement[] = []
  private readonly masks: HTMLElement[] = []
  private clipStyle?: {value: string; priority: string}
  private signature = ''

  constructor(private readonly doc: BlockCraft.Doc, private readonly region: BlockCraft.BlockComponent) {}

  apply(gaps: readonly ContainerPaginationGap[]): boolean {
    if (JSON.stringify(gaps) === this.signature && this.masks.every(mask => mask.isConnected)) return true
    this.clear()
    const root = this.region.hostElement
    const inline = new Map<object, InlinePaginationGap[]>()
    const tableBreaks = new Map<object, TableBreak[]>()
    const targets = gaps.map(gap => {
      const block = gap.blockId ? this.doc.getBlockById(gap.blockId, () => undefined) : null
      return {gap, block}
    })
    if (targets.some(({gap, block}) => !block || !root.contains(block.hostElement) || gap.layoutOffset == null)) return false
    try {
      // 标记定位使用实际边框；裁切则以整个 border-box 为原点。
      const style = getComputedStyle(root)
      const borderTop = parseFloat(style.borderTopWidth) || 0
      const borderLeft = parseFloat(style.borderLeftWidth) || 0
      const borderRight = parseFloat(style.borderRightWidth) || 0
      // 先读自然间距，后批量写，避免每个锚点都产生一次读写交错。
      const offsets = targets.map(({gap, block}) => {
        if (gap.offset || block!.flavour === 'table-row') return 0
        const previous = block!.hostElement.previousElementSibling as HTMLElement | null
        const marginTop = parseFloat(getComputedStyle(block!.hostElement).marginTop) || 0
        const marginBottom = previous ? parseFloat(getComputedStyle(previous).marginBottom) || 0 : 0
        // spacer 阻断相邻 margin 折叠，扣掉原先重叠的部分以精确保留自然坐标。
        return Math.min(Math.max(0, marginTop), Math.max(0, marginBottom))
      })
      targets.forEach(({gap, block}, index) => {
        if (gap.offset > 0) {
          const runtime = (block as EditableBlockComponent).runtime
          if (!runtime) throw new Error('Missing inline pagination runtime')
          const values = inline.get(runtime) ?? []
          values.push(gap)
          inline.set(runtime, values)
        } else if (block!.flavour === 'table-row') {
          const tableHost = block!.hostElement.closest('.table-block')
          const tableId = tableHost?.getAttribute('data-block-id')
          const table = tableId ? this.doc.getBlockById(tableId) : null
          if (!table) throw new Error('Missing table pagination owner')
          const values = tableBreaks.get(table) ?? []
          values.push({beforeRowId: block!.id, gap: gap.height})
          tableBreaks.set(table, values)
        } else {
          const spacer = root.ownerDocument.createElement('div')
          spacer.setAttribute('data-bc-region-pagination-spacer', '')
          spacer.setAttribute('contenteditable', 'false')
          spacer.setAttribute('aria-hidden', 'true')
          spacer.style.cssText = `height:${Math.max(0, gap.height - offsets[index])}px;flex:none;pointer-events:none;user-select:none;`
          block!.hostElement.before(spacer)
          this.spacers.push(spacer)
        }
      })
      for (const [runtime, values] of inline) {
        this.runtimes.add(runtime)
        if (!applyInlinePaginationGaps(runtime, values)) throw new Error('Inline projection unavailable')
      }
      for (const [table, values] of tableBreaks) {
        this.tables.add(table)
        if (!applyTablePaginationBreaks(table, values)) throw new Error('Table projection unavailable')
      }
      let accumulated = 0
      // 从完整绘制平面扣除分页占位带，不额外测量/填充页内剩余高度。
      // 外轮廓扩展一个视口以保留外伸控件；不依赖控件尺寸或额外 DOM 测量。
      // 使用有限坐标，避免 WebKit 在 zoom > 1 时将 infinity 放大为溢出值。
      const start = '-100vmax'
      const end = 'calc(100% + 100vmax)'
      const origin = `${start} ${start}`
      const clipPoints = [origin, `${end} ${start}`, `${end} ${end}`, `${start} ${end}`, origin]
      for (const gap of gaps) {
        const mask = root.ownerDocument.createElement('div')
        mask.setAttribute('data-bc-region-pagination-mask', '')
        mask.setAttribute('contenteditable', 'false')
        mask.setAttribute('aria-hidden', 'true')
        const bandStart = gap.layoutOffset! + accumulated
        const bandEnd = bandStart + gap.height
        clipPoints.push(`${start} ${bandStart}px`, `${start} ${bandEnd}px`,
          `${end} ${bandEnd}px`, `${end} ${bandStart}px`, `${start} ${bandStart}px`, origin)
        // 标记只记录几何。透明带直接透出页眉页脚、页边距与真实纸张阴影。
        mask.style.cssText = `position:absolute;left:${-borderLeft}px;right:${-borderRight}px;top:${bandStart - borderTop}px;height:${gap.height}px;pointer-events:none;user-select:none;`
        root.appendChild(mask)
        this.masks.push(mask)
        accumulated += gap.height
      }
      this.clipStyle = {
        value: root.style.getPropertyValue('--bc-region-pagination-clip'),
        priority: root.style.getPropertyPriority('--bc-region-pagination-clip'),
      }
      root.style.setProperty('--bc-region-pagination-clip', `polygon(evenodd,${clipPoints.join(',')})`)
      this.signature = JSON.stringify(gaps)
      return true
    } catch {
      this.clear()
      return false
    }
  }

  clear(): void {
    for (const runtime of this.runtimes) clearInlinePaginationGaps(runtime)
    for (const table of this.tables) clearTablePaginationBreaks(table)
    for (const node of [...this.spacers, ...this.masks]) node.remove()
    if (this.clipStyle) {
      const style = this.region.hostElement.style
      if (this.clipStyle.value) style.setProperty('--bc-region-pagination-clip', this.clipStyle.value, this.clipStyle.priority)
      else style.removeProperty('--bc-region-pagination-clip')
      this.clipStyle = undefined
    }
    this.runtimes.clear()
    this.tables.clear()
    this.spacers.length = 0
    this.masks.length = 0
    this.signature = ''
  }

  private childRuntimes(): object[] {
    const runtimes: object[] = []
    const visit = (block: BlockCraft.BlockComponent) => {
      if (block.nodeType === BlockNodeType.editable) {
        const runtime = (block as EditableBlockComponent).runtime
        if (runtime) runtimes.push(runtime)
      } else if (isSequentialPaginationContainer(block.flavour)) {
        block.getChildrenBlocks().forEach(visit)
      }
    }
    visit(this.region)
    return runtimes
  }

  writable(): boolean {
    return this.childRuntimes().every(isInlinePaginationProjectionWritable)
  }

  whenWritable(listener: () => void): () => void {
    const releases = this.childRuntimes()
      .filter(runtime => !isInlinePaginationProjectionWritable(runtime))
      .map(runtime => whenInlinePaginationProjectionWritable(runtime, listener))
    return () => releases.forEach(release => release())
  }

  subscribeInvalidated(listener: () => void): () => void {
    const releases = [...this.runtimes].map(runtime =>
      subscribeInlinePaginationProjectionInvalidated(runtime, () => {
        this.signature = ''
        listener()
      }),
    )
    return () => releases.forEach(release => release())
  }
}

const projections = new WeakMap<object, ContainerPaginationProjection>()
export function containerPaginationProjection(doc: BlockCraft.Doc, region: BlockCraft.BlockComponent) {
  let projection = projections.get(region)
  if (!projection) {
    projection = new ContainerPaginationProjection(doc, region)
    projections.set(region, projection)
  }
  return projection
}

/** 只遍历根级及直接嵌套的顺序容器；跨过分栏/单元格边界仍交给其原有分页策略。 */
const flowHosts = new WeakMap<HTMLElement, Set<HTMLElement>>()
export function syncContainerPaginationFlow(root: HTMLElement): void {
  if (!root) return
  const next = new Set<HTMLElement>()
  const visit = (host: HTMLElement) => {
    const elements = paginationContainerElements(host)
    if (!elements) return
    next.add(host)
    for (const child of Array.from(elements.content.children)) visit(child as HTMLElement)
  }
  for (const child of Array.from(root.children)) visit(child as HTMLElement)
  for (const previous of flowHosts.get(root) ?? []) {
    if (!next.has(previous)) previous.removeAttribute('data-bc-region-pagination-flow')
  }
  for (const host of next) {
    if (!host.hasAttribute('data-bc-region-pagination-flow')) host.setAttribute('data-bc-region-pagination-flow', '')
  }
  flowHosts.set(root, next)
}

export function clearContainerPaginationFlow(root: HTMLElement): void {
  if (!root) return
  for (const host of flowHosts.get(root) ?? []) host.removeAttribute('data-bc-region-pagination-flow')
  flowHosts.delete(root)
}
