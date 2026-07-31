import { Subscription } from 'rxjs'
import { EmbedConverter, DeltaInsertEmbed } from '@ccc/blockcraft'
import { EmbedRegistration, DocRef } from '../core/define-embed'
import { MaterialKind } from '../core/deco.category'
import { TemplateData } from '../data/template-data'
import { AttrEl, inlineEmbedHandle, openInlinePopover, closeInlinePopover, attrsToDelta, wireEditableTap } from './inline-embed-kit'

/**
 * 随文日期 embed：渲染态订阅 data.doc.date(field) 显真实日期；编辑态预览今天 + 点击弹菜单选 创建/修改时间（存 attrs.field）。
 * 设计页可点开菜单，使用页只读渲染（和图标/图片一致）。
 */
const NAME = 'template-date-inline'
const FIELDS = [
  { value: 'createdAt', label: '创建时间' },
  { value: 'updatedAt', label: '修改时间' },
]
type DateEl = AttrEl & { __sub?: Subscription }

const toDelta = attrsToDelta(NAME)

// 编辑态：预览今天 + （设计页）点击选字段
function editConverter(docRef?: DocRef): EmbedConverter {
  const toView = (delta: DeltaInsertEmbed): HTMLElement => {
    const el = document.createElement('span') as DateEl
    el.setAttribute('contenteditable', 'false')
    el.className = 'tpl-inline'
    el.__attrs = (delta.attributes ?? {}) as unknown as Record<string, unknown>
    el.textContent = 'XXXX年XX月XX日'                  // 设计期是占位（不写真实日期，避免误以为是死数据）
    wireEditableTap(el, !!docRef, () => openFieldMenu(el, docRef!))
    return el
  }
  return { toView, toDelta }
}

// 渲染态：订阅真实日期，不带菜单
function renderConverter(data: TemplateData): EmbedConverter {
  const toView = (delta: DeltaInsertEmbed): HTMLElement => {
    const el = document.createElement('span') as DateEl
    el.setAttribute('contenteditable', 'false')
    el.className = 'tpl-inline'
    el.__attrs = (delta.attributes ?? {}) as unknown as Record<string, unknown>
    const field = (el.__attrs['field'] as string) ?? 'createdAt'
    el.__sub = data.doc.date(field).subscribe(v => { el.textContent = v })
    return el
  }
  return { toView, toDelta, onDestroy: el => (el as DateEl).__sub?.unsubscribe() }
}

export const DateInlineEmbed: EmbedRegistration = {
  kind: MaterialKind.Embed,
  def: { name: NAME, label: '日期(行内)', svgIcon: 'bc_shijianzhou-color' },
  templateEdit: (docRef) => [NAME, editConverter(docRef)],
  templateRender: (data, _docRef) => [NAME, renderConverter(data)],
}

function openFieldMenu(el: DateEl, docRef: DocRef): void {
  const handle = inlineEmbedHandle(el, docRef, NAME)
  if (!handle) return
  const cur = (handle.attrs['field'] as string) ?? 'createdAt'
  const pop = document.createElement('div')
  pop.className = 'tpl-inline-pop'
  for (const f of FIELDS) {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'tpl-inline-pop__opt' + (f.value === cur ? ' is-active' : '')
    b.textContent = f.label
    b.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); handle.update({ field: f.value }); closeInlinePopover() })
    pop.appendChild(b)
  }
  openInlinePopover(el, pop)
}
