import { ChangeDetectorRef, DestroyRef, ElementRef, NgZone, afterNextRender, inject } from '@angular/core'

/**
 * 物料尺寸的「页宽百分比」换算工具（可缩放块共用）。
 *
 * 块尺寸不存绝对 px，而存「占文档列内容宽的百分比」，渲染端把这个数当 CSS `%` 宽度用
 * （元素包含块是文档列，故页列变宽变窄时等比缩放、图片不变形）。
 * 这里负责「拖拽落点 px → 百分比数」的换算 + 写回（见 storeResizedWidth）。
 */

/** 模板设计基准列内容宽：.editor-container 满宽 908 − 左右 padding 70×2 = 768。量不到列宽时回退它。 */
export const DESIGN_BASE_WIDTH = 768

/**
 * 找最近的文档列 `.editor-container`（尺寸换算 / zoom 观察 / resizer 上限都以它为参照系）。
 * 选择器**唯一定义处**：三处度量共用，别再各写一遍 `closest('.editor-container')`——移植 cses 换选择器只改这里。
 */
export function closestPageColumn(fromEl: HTMLElement): HTMLElement | null {
  return fromEl.closest('.editor-container') as HTMLElement | null
}

/** 找最近的文档列 .editor-container，量它的「内容宽」(clientWidth 去掉左右 padding)。量不到回退基准宽。 */
export function pageColumnContentWidth(fromEl: HTMLElement): number {
  const col = closestPageColumn(fromEl)
  if (!col) return DESIGN_BASE_WIDTH
  const cs = getComputedStyle(col)
  const pad = parseFloat(cs.paddingLeft || '0') + parseFloat(cs.paddingRight || '0')
  const inner = col.clientWidth - pad
  return inner > 0 ? inner : DESIGN_BASE_WIDTH
}

/** px → 页宽百分比（拖拽落点用）。1 位小数，clamp [2,100]，避免 0 或溢出。 */
export function pxToPagePct(px: number, columnContentWidth: number): number {
  const base = columnContentWidth > 0 ? columnContentWidth : DESIGN_BASE_WIDTH
  const pct = Math.round((px / base) * 1000) / 10
  return Math.min(100, Math.max(2, pct))
}

/**
 * 可缩放块的公共「存储」逻辑：拖拽 emit 的 px → 量当前列宽 → 换算页宽% → 写进 block.props.width。
 * 各可缩放块的 onResized 调它一句即可，换算/度量不再各抄一遍（新块要缩放只需调这个函数）。
 * 只在拖拽那一下跑一次；渲染时各块自己读 props.width（见对应模板绑定）。
 * `maxPct`（可选）= 宽度上限%：自由定位(absolute)物料传 `100 - x`，防止缩放把右缘拉出定位父
 * （框架 resizer 只按整列宽封顶、不感知绝对定位块的固定 x 偏移，故在这一步兜住）。
 */
export function storeResizedWidth(
  block: {
    hostElement: HTMLElement
    updateProps(props: { width: number }): void
    changeDetectorRef: { markForCheck(): void }
  },
  px: number,
  maxPct?: number,
): void {
  let pct = pxToPagePct(px, pageColumnContentWidth(block.hostElement))
  if (maxPct != null) pct = Math.max(2, Math.min(pct, maxPct))   // 右缘不超出定位父：x% + width% ≤ 100%
  block.updateProps({ width: pct })
  block.changeDetectorRef.markForCheck()
}

/**
 * 观察文档列宽变化，回调「当前列内容宽 / 设计基准宽」的缩放比。
 * 复合卡片（内部写死 px、CSS % 缩不动内容，如天气 chip）用它整体 `zoom` 跟容器缩，
 * 比例与 logo/图片的 width% 一致（= 列内容宽 / 768）。ResizeObserver 自动跟 slider / 窗口；返回停止函数。
 * ⚠️ 必须在 host 已进 DOM 后调用（用组件的 afterNextRender），否则 closest 抓不到列、观察器挂不上。
 */
export function observeColumnScale(fromEl: HTMLElement, cb: (scale: number) => void): () => void {
  const col = closestPageColumn(fromEl)
  const emit = (): void => cb(pageColumnContentWidth(fromEl) / DESIGN_BASE_WIDTH)
  emit()
  if (!col || typeof ResizeObserver === 'undefined') return () => {}
  const ro = new ResizeObserver(() => emit())
  ro.observe(col)
  return () => ro.disconnect()
}

/**
 * 复合卡片 zoom 的组合式接线：组件字段初始化器 / constructor 里调一行，替代原 WeatherChipBase 的
 * 继承接入（基类继承位让给了排版链，"能力"接线走函数组合）。内部封装三件时序/生命周期事：
 * afterNextRender 后才挂观察器（ngOnInit 时 host 未进 DOM，closest 抓不到列 → zoom 卡 1）、
 * 停止函数交 DestroyRef 成对释放、回调回 zone 并 markForCheck（OnPush 下外部 ResizeObserver 不触发变更检测）。
 * 必须在注入上下文调用——内部依赖 inject()。
 */
export function wireColumnZoom(apply: (scale: number) => void): void {
  const zone = inject(NgZone)
  const cdr = inject(ChangeDetectorRef)
  const destroyRef = inject(DestroyRef)
  const el = inject(ElementRef).nativeElement as HTMLElement
  afterNextRender(() => destroyRef.onDestroy(observeColumnScale(el, s => zone.run(() => { apply(s); cdr.markForCheck() }))))
}
