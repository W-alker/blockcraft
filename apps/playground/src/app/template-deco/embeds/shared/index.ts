import {type DeltaInsertEmbed, type EmbedConverter} from '@ccc/blockcraft'
import {type Observable, Subscription} from 'rxjs'
import {MaterialKind} from '../../core/deco.category'
import {TemplateData} from '../../data/template-data'

type EmbedAttrs = Record<string, unknown>
type EmbedEl = HTMLElement & {
  __sub?: Subscription
  __attrs?: EmbedAttrs
}

export interface EmbedSpec<V> {
  name: string
  label: string
  svgIcon: string
  fetch: (data: TemplateData, attrs: EmbedAttrs) => Observable<V>
  renderDom: (element: HTMLElement, value: V) => void
  editDom: (element: HTMLElement, attrs: EmbedAttrs) => void
}

export interface EmbedRegistration {
  kind: MaterialKind.Embed
  def: {name: string; label: string; svgIcon: string}
  templateEdit(): [string, EmbedConverter]
  templateRender(data: TemplateData): [string, EmbedConverter]
}

/** Build the paired template-edit/template-render converters for one Embed spec. */
export function defineEmbed<V>(spec: EmbedSpec<V>): EmbedRegistration {
  const makeView = (
    paint: (element: EmbedEl) => void,
  ) => (delta: DeltaInsertEmbed): HTMLElement => {
    const element = document.createElement('span') as EmbedEl
    element.setAttribute('contenteditable', 'false')
    element.__attrs = (delta.attributes ?? {}) as unknown as EmbedAttrs
    paint(element)
    return element
  }
  const toDelta = (element: HTMLElement): DeltaInsertEmbed => ({
    insert: {[spec.name]: ''},
    attributes: ((element as EmbedEl).__attrs ?? {}) as unknown as
      DeltaInsertEmbed['attributes'],
  })
  return {
    kind: MaterialKind.Embed,
    def: {name: spec.name, label: spec.label, svgIcon: spec.svgIcon},
    templateEdit: () => [spec.name, {
      toView: makeView(element => spec.editDom(element, element.__attrs!)),
      toDelta,
    }],
    templateRender: data => [spec.name, {
      toView: makeView(element => {
        element.__sub = spec.fetch(data, element.__attrs!)
          .subscribe(value => spec.renderDom(element, value))
      }),
      toDelta,
      onDestroy: element => (element as EmbedEl).__sub?.unsubscribe(),
    }],
  }
}
