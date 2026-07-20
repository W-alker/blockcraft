import { DeltaInsertEmbed } from '@ccc/blockcraft'
import { DocRef } from '../core/define-embed'

/** 行内 embed 的 DOM 元素：把属性快照挂在 __attrs 上（toDelta 写回、交互时合并）。 */
export type AttrEl = HTMLElement & { __attrs?: Record<string, unknown> }

/**
 * 行内 embed 的 `toDelta`（写回 Y.Text 用）：把节点上缓存的 __attrs 原样搬回 delta 的 attributes。
 * 各 embed 只有 insert 的 key（embed name）不同、逻辑同一份——用法 `toDelta: attrsToDelta(NAME)`。
 */
export const attrsToDelta = (name: string) => (el: HTMLElement): DeltaInsertEmbed => ({
  insert: { [name]: '' },
  attributes: ((el as AttrEl).__attrs ?? {}) as unknown as DeltaInsertEmbed['attributes'],
})

/**
 * 「可编辑态」的点击接线（设计页可点开设置浮层，使用页只读）：enabled 为假直接返回。
 * mousedown preventDefault 保住编辑器光标/选区（否则点 embed 会丢落点）；click 阻断冒泡后触发 onTap。
 * date/icon/image 三个 embed 共用，别再各写一遍这三行监听。
 */
export function wireEditableTap(el: HTMLElement, enabled: boolean, onTap: () => void): void {
  if (!enabled) return
  el.classList.add('is-editable')
  el.addEventListener('mousedown', e => e.preventDefault())
  el.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); onTap() })
}

/**
 * 行内 embed 的「可写句柄」：打开浮层时建一次，之后多次 update 都用同一个 block + 固定下标。
 *
 * 为什么固定下标：行内真源是 Y.Text，改属性要写回 delta（删 1 重插）。重插后旧 el 会被替换，
 * 但 delete 1 + insert 1 长度不变、下标稳定，所以句柄记住 block+index，连续调（滑块连续提交）也不丢位。
 * state 累积合并，避免「先改图标再改尺寸把图标改丢」。只用公开 API（runtime.domPointToModel / applyDeltaOperations）。
 */
export interface InlineEmbedHandle {
  attrs: Record<string, unknown>
  update(next: Record<string, unknown>): void
}

export function inlineEmbedHandle(el: AttrEl, docRef: DocRef, name: string): InlineEmbedHandle | null {
  const doc = docRef()
  if (!doc || doc.isReadonly) return null
  const blockId = (el.closest('[data-block-id]') as HTMLElement | null)?.getAttribute('data-block-id')
  if (!blockId) return null
  const block = doc.getBlockById(blockId) as unknown as {
    runtime?: { domPointToModel(node: Node, offset: number): number }
    applyDeltaOperations?(delta: Array<Record<string, unknown>>): void
  } | null
  if (!block?.runtime || !block.applyDeltaOperations) return null

  let index: number
  try { index = block.runtime.domPointToModel(el, 0) } catch { return null }
  const state: Record<string, unknown> = { ...(el.__attrs ?? {}) }

  return {
    attrs: state,
    update(next: Record<string, unknown>): void {
      Object.assign(state, next)
      const ops: Array<Record<string, unknown>> = []
      if (index > 0) ops.push({ retain: index })
      ops.push({ delete: 1 })
      ops.push({ insert: { [name]: '' }, attributes: { ...state } })
      block.applyDeltaOperations!(ops)
    },
  }
}

/**
 * 尺寸控件（presets 档位 + 滑块 + 数字输入），随文图标/图片共用的「单独组件」（裸 DOM 版）。
 * 滑块拖动只刷新数字显示，松手(change)/输入/点档位才真正提交（onCommit），避免每像素都写一次 Y.Text。
 */
export function buildSizeControl(opts: {
  presets: { label: string; value: number }[]
  min: number
  max: number
  value: number
  onCommit: (px: number) => void
}): HTMLElement {
  const wrap = document.createElement('div')
  wrap.className = 'tpl-size'
  const clamp = (v: number): number => Math.min(opts.max, Math.max(opts.min, Math.round(v) || opts.min))

  const presetRow = document.createElement('div')
  presetRow.className = 'tpl-size__presets'
  const presetBtns: { b: HTMLButtonElement; v: number }[] = []

  const range = document.createElement('input')
  range.type = 'range'; range.className = 'tpl-size__range'
  range.min = String(opts.min); range.max = String(opts.max); range.value = String(opts.value)
  const num = document.createElement('input')
  num.type = 'number'; num.className = 'tpl-size__num'
  num.min = String(opts.min); num.max = String(opts.max); num.value = String(opts.value)

  // 三个控件 + 提交统一走这里：同步显示再 onCommit
  const sync = (v: number): void => {
    range.value = String(v); num.value = String(v)
    for (const { b, v: pv } of presetBtns) b.classList.toggle('is-active', pv === v)
    opts.onCommit(v)
  }

  for (const p of opts.presets) {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'tpl-size__preset' + (p.value === opts.value ? ' is-active' : '')
    b.textContent = p.label
    b.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); sync(p.value) })
    presetBtns.push({ b, v: p.value })
    presetRow.appendChild(b)
  }

  range.addEventListener('input', () => { num.value = range.value })           // 拖动：只更新数字显示，不提交
  range.addEventListener('change', () => sync(clamp(+range.value)))             // 松手：提交
  num.addEventListener('change', () => sync(clamp(+num.value)))                 // 手动输入：提交

  const sliderRow = document.createElement('div')
  sliderRow.className = 'tpl-size__slider-row'
  const unit = document.createElement('span')          // 值是「页宽%」，给数字框补个 % 后缀
  unit.className = 'tpl-size__unit'; unit.textContent = '%'
  sliderRow.append(range, num, unit)
  wrap.append(presetRow, sliderRow)
  return wrap
}

// ── 单例浮层（裸 DOM 挂 body，外部点击关闭）：图标/图片 embed 共用 ──
// 浮层元素 + 它的外部点击监听是一回事，捆成一个对象（同生同灭），不拆成两个游离变量
let active: { el: HTMLElement; outside: (e: Event) => void } | null = null

export function closeInlinePopover(): void {
  if (!active) return
  active.el.remove()
  document.removeEventListener('mousedown', active.outside, true)
  active = null
}

/** 在 anchor 下方弹出 content（已带样式类）。单例：再开会先关上一个。 */
export function openInlinePopover(anchor: HTMLElement, content: HTMLElement): void {
  closeInlinePopover()
  // 阻止 mousedown 默认行为以保住编辑器光标——但放过 <input>（滑块要靠原生 mousedown 拖动、数字框要聚焦输入）
  content.addEventListener('mousedown', e => {
    if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return
    e.preventDefault()
  })
  document.body.appendChild(content)
  const r = anchor.getBoundingClientRect()
  content.style.position = 'fixed'
  content.style.zIndex = '2147483600'
  content.style.left = `${Math.round(r.left)}px`
  content.style.top = `${Math.round(r.bottom + 6)}px`
  const outside = (e: Event): void => { if (active && !active.el.contains(e.target as Node)) closeInlinePopover() }
  active = { el: content, outside }
  // 下一拍再挂外部点击关闭，避免当前这次 click 立刻把它关掉
  setTimeout(() => active && document.addEventListener('mousedown', active.outside, true), 0)
}
