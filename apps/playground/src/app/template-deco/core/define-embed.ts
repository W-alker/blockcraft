import { Observable, Subscription } from 'rxjs'
import { EmbedConverter, DeltaInsertEmbed } from '@ccc/blockcraft'
import { TemplateData } from '../data/template-data'
import { MaterialKind } from './deco.category'

type EmbedAttrs = Record<string, unknown>
// 把订阅与属性快照挂在 DOM 节点上：onDestroy 时退订；toDelta 时写回 attributes。
type EmbedEl = HTMLElement & { __sub?: Subscription; __attrs?: EmbedAttrs }

export interface EmbedSpec<V> {
  name: string; label: string; svgIcon: string
  fetch: (data: TemplateData, attrs: EmbedAttrs) => Observable<V>   // 渲染态取值
  renderDom: (el: HTMLElement, value: V) => void                    // 渲染态画 DOM
  editDom: (el: HTMLElement, attrs: EmbedAttrs) => void             // 编辑态画 DOM
}

/** 懒取当前 surface 的 doc：建 embed 时 doc 还没创建，交互（如改图标大小）时才调用。 */
//行内内容的真源是 Y.Text，所以行内 embed 改属性（必须写回 Y.Text，需要 doc
export type DocRef = () => BlockCraft.Doc

export interface EmbedRegistration {
  kind: MaterialKind.Embed
  def: { name: string; label: string; svgIcon: string }
  templateEdit(docRef?: DocRef): [string, EmbedConverter]
  templateRender(data: TemplateData, docRef?: DocRef): [string, EmbedConverter]
}
//吃一份 spec → 吐一个 registration
export function defineEmbed<V>(spec: EmbedSpec<V>): EmbedRegistration {
  // toView 通用骨架：建一个不可编辑 span、缓存 attrs、交给 paint 画内部。
  const makeView = (paint: (el: EmbedEl) => void) => (delta: DeltaInsertEmbed): HTMLElement => {
    const el = document.createElement('span') as EmbedEl
    el.setAttribute('contenteditable', 'false')
    // 框架 attributes 是 IInlineNodeAttrs（无字符串索引）；这里桥到作者面向的宽松 Record。
    el.__attrs = (delta.attributes ?? {}) as unknown as EmbedAttrs
    paint(el)
    return el
  }
  const toDelta = (el: HTMLElement): DeltaInsertEmbed => ({
    insert: { [spec.name]: '' },
    // 反向桥回框架的 IInlineNodeAttrs。
    attributes: ((el as EmbedEl).__attrs ?? {}) as unknown as DeltaInsertEmbed['attributes'],
  })
  return {
    kind: MaterialKind.Embed,
    def: { name: spec.name, label: spec.label, svgIcon: spec.svgIcon },
    // 编辑态：不取数，只画占位/配置。（docRef：generic embed 用不到，仅 icon embed 交互用）
    templateEdit: (_docRef) => [spec.name, {
      toView: makeView(el => spec.editDom(el, el.__attrs!)),
      toDelta,
    }],
    // 渲染态：闭包拿到 data，订阅取值画 DOM；onDestroy 退订。
    templateRender: (data, _docRef) => [spec.name, {
      toView: makeView(el => { el.__sub = spec.fetch(data, el.__attrs!).subscribe(v => spec.renderDom(el, v)) }),
      toDelta,
      onDestroy: (el) => (el as EmbedEl).__sub?.unsubscribe(),
    }],
  }
}
