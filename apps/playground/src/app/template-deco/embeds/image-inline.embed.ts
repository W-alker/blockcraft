import { EmbedConverter, DeltaInsertEmbed, DocFileService, DOC_FILE_SERVICE_TOKEN } from '@ccc/blockcraft'
import { EmbedRegistration, DocRef } from '../core/define-embed'
import { MaterialKind } from '../core/deco.category'
import { pickImageAsDataURL } from '../decos/_shared/image-pick'
import { AttrEl, inlineEmbedHandle, buildSizeControl, openInlinePopover, closeInlinePopover, attrsToDelta, wireEditableTap } from './inline-embed-kit'

/**
 * 随文图片 embed（真·位图，行内流动，可设宽度 / 换图）。
 *
 * 空态显「选择图片」占位 → 点击选本地图（读成 data URL，立即可显且随快照 round-trip）→ 显图。
 * 点图弹浮层：宽度（档位 + 滑块 + 数字，10–200px）/ 换图。src 与 width 存 attributes，经 inline-embed-kit 写回 Y.Text。
 * 与 Logo（void 块、整行、拖拽缩放）不同：这是随文行内、离散/滑块宽度（行内元素挂不了拖拽把手）。
 */
const NAME = 'template-image-inline'

type ImgAttrs = { src?: string; width?: number }

const PRESETS = [
  { label: '小', value: 15 },
  { label: '标准', value: 30 },
  { label: '大', value: 50 },
  { label: '特大', value: 80 },
]
const DEFAULT_WIDTH = 30   // 页宽 30%（≈ 旧 80px / 768）

function paint(el: AttrEl): void {
  const a = (el.__attrs ?? {}) as ImgAttrs
  el.replaceChildren()
  el.classList.toggle('is-empty', !a.src)
  if (!a.src) {
    const hint = document.createElement('span')
    hint.className = 'tpl-inline-img__hint'
    hint.innerHTML = `<i class="bc_icon bc_tianjiatupian"></i>选择图片`
    el.appendChild(hint)
    return
  }
  const img = document.createElement('img')
  img.className = 'tpl-inline-img__img'
  img.src = a.src
  img.draggable = false
  img.style.width = `${a.width || DEFAULT_WIDTH}%`   // 页宽百分比（% 参照文档列，随列宽等比）
  el.appendChild(img)
}

// editable=false（使用模版页）时只渲染、点击不选图/不弹浮层——使用态不允许改图/改样式
function makeConverter(docRef: DocRef | undefined, editable: boolean): EmbedConverter {
  const toView = (delta: DeltaInsertEmbed): HTMLElement => {
    const el = document.createElement('span') as AttrEl
    el.setAttribute('contenteditable', 'false')
    el.className = 'tpl-inline-img'
    el.__attrs = (delta.attributes ?? {}) as unknown as Record<string, unknown>
    paint(el)
    wireEditableTap(el, editable && !!docRef, () => void onClick(el, docRef!))
    return el
  }
  const toDelta = attrsToDelta(NAME)
  return { toView, toDelta }
}

/** 随文图片 embed 注册项。设计页可选图/改宽度，使用页只读渲染。 */
export const ImageInlineEmbed: EmbedRegistration = {
  kind: MaterialKind.Embed,
  def: { name: NAME, label: '随文图片', svgIcon: 'bc_tupian-color' },
  templateEdit: (docRef) => [NAME, makeConverter(docRef, true)],
  templateRender: (_data, docRef) => [NAME, makeConverter(docRef, false)],
}

async function onClick(el: AttrEl, docRef: DocRef): Promise<void> {
  const doc = docRef()
  if (!doc || doc.isReadonly) return
  const cur = (el.__attrs ?? {}) as ImgAttrs
  const fileService = doc.injector.get<DocFileService>(DOC_FILE_SERVICE_TOKEN)   // 复用 logo/背景同款选图（含大小限制）

  // 空态：选图设 src（带默认宽度）
  if (!cur.src) {
    const src = await pickImageAsDataURL(fileService)
    if (!src) return
    inlineEmbedHandle(el, docRef, NAME)?.update({ src, width: cur.width ?? DEFAULT_WIDTH })
    return
  }

  // 有图：浮层换宽度 / 换图
  const handle = inlineEmbedHandle(el, docRef, NAME)
  if (!handle) return
  const pop = document.createElement('div')
  pop.className = 'tpl-inline-pop'

  const size = buildSizeControl({
    presets: PRESETS, min: 2, max: 100,
    value: (handle.attrs as ImgAttrs).width || DEFAULT_WIDTH,
    onCommit: px => handle.update({ width: px }),
  })

  const actionRow = document.createElement('div')
  actionRow.className = 'tpl-inline-pop__row'
  const replace = document.createElement('button')
  replace.type = 'button'
  replace.className = 'tpl-inline-pop__btn'
  replace.textContent = '换图'
  replace.addEventListener('click', async e => {
    e.preventDefault(); e.stopPropagation()
    const src = await pickImageAsDataURL(fileService)
    if (src) handle.update({ src })
    else closeInlinePopover()
  })
  actionRow.appendChild(replace)

  pop.append(size, actionRow)
  openInlinePopover(el, pop)
}
