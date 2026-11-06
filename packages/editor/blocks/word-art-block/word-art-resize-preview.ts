import {wordArtTextLayout} from './word-art-text-layout'
import {normalizeWordArtProps, resolveWordArtProjectionPath} from './word-art.types'
import type {IBlockProps} from '../../framework/model'

/** Package-internal group preview. Cache surfaces once; never measure layout on pointer frames. */
export function createWordArtResizePreview(surface: HTMLElement, readProps: () => Readonly<IBlockProps>) {
  const start = normalizeWordArtProps(readProps())
  const editor = surface.querySelector<HTMLElement>('.word-art-block__editor')
  const projection = surface.querySelector<SVGSVGElement>('.word-art-block__projection')
  const path = projection?.querySelector<SVGPathElement>('defs > path')
  const text = projection?.querySelector<SVGTextElement>('text')
  const styles: [HTMLElement | SVGElement, string, string][] = []
  const attributes: [Element, string, string | null][] = []
  const saveStyle = (target: HTMLElement | SVGElement | null | undefined, properties: string[]) => {
    if (target) for (const property of properties) styles.push([target, property, target.style.getPropertyValue(property)])
  }
  saveStyle(surface, ['font-size'])
  saveStyle(editor, ['width', 'max-height'])
  saveStyle(projection, ['width', 'height'])
  saveStyle(text, ['font-size'])
  if (projection) attributes.push([projection, 'viewBox', projection.getAttribute('viewBox')])
  if (path) for (const key of ['d', 'transform']) attributes.push([path, key, path.getAttribute(key)])

  const render = (props: typeof start, width: number, height: number, fontSize: number) => {
    const layout = wordArtTextLayout({...props, width, height})
    surface.style.fontSize = `${fontSize}px`
    if (editor) {
      editor.style.width = layout.textStyle.width
      editor.style.maxHeight = layout.textStyle.maxHeight
    }
    if (projection) {
      projection.style.width = layout.projectionStyle.width
      projection.style.height = layout.projectionStyle.height
      projection.setAttribute('viewBox', layout.viewBox)
    }
    if (path) {
      path.setAttribute('d', resolveWordArtProjectionPath(props.effect, layout.pathWidth, layout.pathHeight) ?? '')
      if (layout.pathTransform) path.setAttribute('transform', layout.pathTransform)
      else path.removeAttribute('transform')
    }
    if (text) text.style.fontSize = `${fontSize}px`
  }
  return {
    update(width: number, height: number, fontSize = start.fontSize) {
      render(start, width, height, fontSize)
    },
    restore(stale: boolean) {
      if (stale) {
        const live = normalizeWordArtProps(readProps())
        render(live, live.width, live.height, live.fontSize)
        return
      }
      for (const [target, property, value] of styles) target.style.setProperty(property, value)
      for (const [target, key, value] of attributes) {
        if (value === null) target.removeAttribute(key)
        else target.setAttribute(key, value)
      }
    },
  }
}
