import { EmbedConverter, DeltaInsertEmbed } from '@ccc/blockcraft'
import { EmbedRegistration, DocRef } from '../core/define-embed'
import { MaterialKind } from '../core/deco.category'
import { AttrEl, inlineEmbedHandle, buildSizeControl, openInlinePopover, attrsToDelta, wireEditableTap } from './inline-embed-kit'

/**
 * 随文图标 embed（可设大小）。图标是字体字形，故用 font-size 直接缩放——点图标弹浮层选 图标 + 尺寸。
 * 尺寸存「相对所在文字字号的百分比」(100=齐文字)，渲染用 CSS `font-size:%`，随正文/移植后容器字号自动缩放，
 * 不碰列宽、不用 px、不用 JS 量；改动经 inline-embed-kit 写回 Y.Text，即时生效且随快照 round-trip。
 */
const NAME = 'template-icon-inline'

type IconAttrs = { icon?: string; size?: number }

// 单色字体图标（color/字号都能调）——都在 bc-iconfont.css 里验证存在
const ICONS = ['bc_shoucang', 'bc_aixin', 'bc_dianzan', 'bc_biaoqing', 'bc_tixing'] as const
// size = 相对「所在文字字号」的百分比：100 = 和正文一样大，150 = 1.5 倍（整数，配 buildSizeControl 整数滑块）
const PRESETS = [
  { label: '小', value: 80 },
  { label: '标准', value: 100 },
  { label: '大', value: 150 },
  { label: '特大', value: 200 },
]
const DEFAULT_ICON = 'bc_shoucang'
const DEFAULT_SIZE = 100   // 100% = 继承正文字号（和文字一样大）

function paint(el: AttrEl): void {
  const a = (el.__attrs ?? {}) as IconAttrs
  el.replaceChildren()
  const i = document.createElement('i')
  i.className = `bc_icon ${a.icon || DEFAULT_ICON}`
  i.style.fontSize = `${a.size || DEFAULT_SIZE}%`   // font-size:% 相对「所在文字字号」——100%=齐文字，随正文/容器字号自动缩放（含移植到 cses）
  el.appendChild(i)
}

// editable=false（使用模版页）时只渲染、点击不弹设置浮层——使用态不允许改样式
function makeConverter(docRef: DocRef | undefined, editable: boolean): EmbedConverter {
  const toView = (delta: DeltaInsertEmbed): HTMLElement => {
    const el = document.createElement('span') as AttrEl
    el.setAttribute('contenteditable', 'false')
    el.className = 'tpl-icon-embed'
    el.__attrs = (delta.attributes ?? {}) as unknown as Record<string, unknown>
    paint(el)
    wireEditableTap(el, editable && !!docRef, () => openIconPopover(el, docRef!))
    return el
  }
  const toDelta = attrsToDelta(NAME)
  return { toView, toDelta }
}

/** 随文图标 embed 注册项。设计页可点开设置浮层，使用页只读渲染。 */
export const IconInlineEmbed: EmbedRegistration = {
  kind: MaterialKind.Embed,
  def: { name: NAME, label: '图标', svgIcon: 'bc_tixing-color' },
  templateEdit: (docRef) => [NAME, makeConverter(docRef, true)],
  templateRender: (_data, docRef) => [NAME, makeConverter(docRef, false)],
}

function openIconPopover(el: AttrEl, docRef: DocRef): void {
  const handle = inlineEmbedHandle(el, docRef, NAME)
  if (!handle) return
  const cur = handle.attrs as IconAttrs
  const pop = document.createElement('div')
  pop.className = 'tpl-inline-pop'

  // 图标选择行
  const iconRow = document.createElement('div')
  iconRow.className = 'tpl-inline-pop__row'
  const iconBtns: { b: HTMLButtonElement; ic: string }[] = []
  for (const ic of ICONS) {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'tpl-inline-pop__icon' + (ic === (cur.icon || DEFAULT_ICON) ? ' is-active' : '')
    b.innerHTML = `<i class="bc_icon ${ic}"></i>`
    b.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation()
      handle.update({ icon: ic })
      for (const x of iconBtns) x.b.classList.toggle('is-active', x.ic === ic)
    })
    iconBtns.push({ b, ic })
    iconRow.appendChild(b)
  }

  // 尺寸控件（档位 + 滑块 + 数字）
  const size = buildSizeControl({
    presets: PRESETS, min: 50, max: 300,
    value: (cur.size as number) || DEFAULT_SIZE,
    onCommit: pct => handle.update({ size: pct }),
  })

  pop.append(iconRow, size)
  openInlinePopover(el, pop)
}
