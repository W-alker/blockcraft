import type {EmbedConverter} from '../../framework/block-std/inline'
import type {DeltaInsertEmbed} from '../../framework/block-std/types'
import {readFrozenPersonCardData, type FrozenPersonCardData} from '../../blocks/dynamic-material-blocks/dynamic-material-data'

export const INLINE_PERSON_EMBED_KEY = 'person'
export const INLINE_PERSON_CLASS = 'bc-inline-person'
export const INLINE_PERSON_FORMATS = ['name', 'avatar-name', 'name-description', 'avatar-name-description'] as const
export type InlinePersonFormat = typeof INLINE_PERSON_FORMATS[number]
export const INLINE_PERSON_FORMAT_LABELS: Record<InlinePersonFormat, string> = {
  name: '仅姓名', 'avatar-name': '头像＋姓名', 'name-description': '姓名＋部门/职务',
  'avatar-name-description': '头像＋姓名＋部门/职务',
}

export function isInlinePersonFormat(value: unknown): value is InlinePersonFormat {
  return typeof value === 'string' && (INLINE_PERSON_FORMATS as readonly string[]).includes(value)
}

/** 建档来源和已定格人员分开保存；渲染不访问登录态或人员接口。 */
export function createInlinePersonDelta(person?: FrozenPersonCardData, format: InlinePersonFormat = 'name'): DeltaInsertEmbed {
  return {
    insert: {person: person ? JSON.stringify(person) : ''},
    attributes: person ? {personFormat: format} : {personFormat: format, personSource: 'creator'},
  }
}

export function readInlinePersonDelta(delta: DeltaInsertEmbed): FrozenPersonCardData | null {
  return readFrozenPersonCardData(delta.insert[INLINE_PERSON_EMBED_KEY])
}

export function formatInlinePersonDelta(delta: DeltaInsertEmbed): string {
  const person = readInlinePersonDelta(delta)
  if (!person) return delta.attributes?.['personSource'] === 'creator' ? '文档创建人' : '人员暂不可用'
  const format = delta.attributes?.['personFormat']
  return (format === 'name-description' || format === 'avatar-name-description') && person.description
    ? `${person.name} · ${person.description}` : person.name
}

export function createInlinePersonEmbedConverter(): EmbedConverter {
  return {
    toView: delta => {
      const host = document.createElement('span')
      host.className = INLINE_PERSON_CLASS
      host.dataset['bcPersonDelta'] = JSON.stringify(delta)
      const person = readInlinePersonDelta(delta)
      if (!person && delta.attributes?.['personSource'] === 'creator') host.title = '使用模板时填入文档创建人'
      const format = delta.attributes?.['personFormat']
      if (format === 'avatar-name' || format === 'avatar-name-description') {
        // 仅加载显式网络头像；不解释快照里的任意协议或 HTML。
        if (person?.avatar && /^https?:\/\//i.test(person.avatar)) {
          const avatar = document.createElement('img')
          avatar.className = `${INLINE_PERSON_CLASS}__avatar`
          avatar.src = person.avatar
          avatar.alt = ''
          avatar.draggable = false
          avatar.referrerPolicy = 'no-referrer'
          avatar.addEventListener('error', () => avatar.remove(), {once: true})
          host.append(avatar)
        } else if (!person) {
          const icon = document.createElement('i')
          icon.className = 'bc_icon bc_renwukapian'
          icon.setAttribute('aria-hidden', 'true')
          host.append(icon)
        }
      }
      const text = document.createElement('span')
      text.textContent = formatInlinePersonDelta(delta)
      host.append(text)
      return host
    },
    toDelta: element => {
      const host = element.closest<HTMLElement>(`.${INLINE_PERSON_CLASS}`)
        ?? element.querySelector<HTMLElement>(`.${INLINE_PERSON_CLASS}`)
      try {
        const delta = JSON.parse(host?.dataset['bcPersonDelta'] ?? '') as DeltaInsertEmbed
        if (delta?.insert && typeof delta.insert[INLINE_PERSON_EMBED_KEY] === 'string') return delta
      } catch { /* 损坏数据使用不可用占位。 */ }
      return {insert: {person: ''}}
    },
  }
}
