/**
 * 只观察原生列轨道的最终尺寸，不测量正文、不参与列宽分配、不写文档。
 * 用零高度 td 而不是 col：WebKit 的 col 不暴露可观察的布局盒。
 */
export class TableColumnWidthObserver {
  private readonly observer: ResizeObserver
  private readonly indices = new Map<Element, number>()
  private widths: number[] = []
  private frame: number | null = null
  private parent: HTMLElement | undefined
  private parentWidth = 0

  constructor(
    private readonly view: Window,
    private readonly publish: (widths: number[], parentWidth: number) => void,
  ) {
    this.observer = new ResizeObserver(entries => {
      let changed = false
      for (const entry of entries) {
        if (entry.target === this.parent) {
          if (Math.abs(this.parentWidth - entry.contentRect.width) >= 0.1) {
            this.parentWidth = entry.contentRect.width
            changed = true
          }
        } else {
          const index = this.indices.get(entry.target)
          if (index !== undefined) {
            const width = entry.borderBoxSize[0]?.inlineSize ?? 0
            if (Math.abs(this.widths[index] - width) >= 0.1) {
              this.widths[index] = width
              changed = true
            }
          }
        }
      }
      if (!changed || this.frame !== null) return
      this.frame = this.view.requestAnimationFrame(() => {
        this.frame = null
        if (this.widths.length && this.widths.every(width => width > 0)) {
          this.publish([...this.widths], this.parentWidth)
        }
      })
    })
  }

  observe(cells: readonly HTMLElement[], parent: HTMLElement | undefined): void {
    this.observer.disconnect()
    this.indices.clear()
    this.widths = Array(cells.length).fill(0)
    this.parent = parent
    cells.forEach((cell, index) => {
      this.indices.set(cell, index)
      this.observer.observe(cell, {box: 'border-box'})
    })
    if (parent) this.observer.observe(parent)
  }

  destroy(): void {
    this.observer.disconnect()
    this.indices.clear()
    if (this.frame !== null) this.view.cancelAnimationFrame(this.frame)
    this.frame = null
  }
}
