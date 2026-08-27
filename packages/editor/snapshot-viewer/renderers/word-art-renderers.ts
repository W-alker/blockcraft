import {
  normalizeWordArtProps,
  resolveWordArtPresentation,
  resolveWordArtProjectionPath,
  WORD_ART_OBJECT_FORMAT_CAPABILITY,
  type WordArtBlockProps,
} from '../../blocks'
import type {InlineModel} from '../../framework/block-std/types/inline.type'
import {
  normalizeBlockObjectFormat,
  objectEffectsFilter,
  objectPaintBackgroundPosition,
  objectPaintBackgroundSize,
  objectPicturePreserveAspectRatio,
} from '../../framework'
import {createBlockShell} from '../dom/create-block-shell'
import {projectAlwaysPlaceholder} from '../dom/always-placeholder'
import type {SnapshotBlockRenderer} from '../types'

export function createWordArtRenderers(): SnapshotBlockRenderer[] {
  return [{
    canRender: snapshot => snapshot.flavour === 'word-art',
    render(ctx, snapshot) {
      const element = createBlockShell(snapshot)
      const props = normalizeWordArtProps(
        snapshot.props as Partial<WordArtBlockProps>,
      )
      const presentation = resolveWordArtPresentation(
        snapshot.props as Partial<WordArtBlockProps>,
      )
      const format = normalizeBlockObjectFormat(
        snapshot.props as Partial<WordArtBlockProps>,
        WORD_ART_OBJECT_FORMAT_CAPABILITY,
      )

      const surface = document.createElement('div')
      surface.classList.add('word-art-block__surface')
      surface.setAttribute('data-bc-print-visual-surface', '')
      surface.style.width = `${props.width}px`
      surface.style.height = `${props.height}px`
      surface.style.transform = props.rotation === 0
        ? ''
        : `rotate(${props.rotation}deg)`
      surface.style.alignItems =
        props.verticalAlign === 'top'
          ? 'flex-start'
          : props.verticalAlign === 'bottom'
            ? 'flex-end'
            : 'center'

      const content = document.createElement('div')
      content.classList.add('word-art-block__editor', 'edit-container')
      content.dataset['bcWordArtPrintProps'] = JSON.stringify(props)
      content.style.fontFamily = presentation.fontFamily
      content.style.fontSize = `${props.fontSize}px`
      content.style.fontWeight = `${props.fontWeight}`
      content.style.fontStyle = props.fontStyle
      content.style.letterSpacing = `${props.letterSpacingEm}em`
      content.style.lineHeight = `${props.lineHeight}`
      content.style.textAlign = props.horizontalAlign
      content.style.color = presentation.textColor
      content.style.webkitTextFillColor = presentation.textColor
      content.style.caretColor = presentation.fallbackColor
      content.style.backgroundImage = presentation.backgroundImage
      const textFill = format.textStyle!.fill
      content.style.backgroundSize = textFill.type === 'picture'
        ? objectPaintBackgroundSize(textFill)
        : 'auto'
      content.style.backgroundPosition = textFill.type === 'picture'
        ? objectPaintBackgroundPosition(textFill)
        : '0% 0%'
      content.style.backgroundClip = 'text'
      content.style.setProperty('-webkit-background-clip', 'text')
      content.style.setProperty(
        '-webkit-text-stroke',
        presentation.textStroke,
      )
      content.style.textShadow = presentation.textShadow
      content.style.transform = presentation.effectTransform
      content.style.opacity = `${presentation.textOpacity}`
      content.dataset['bcWordArtEffectTransform'] =
        presentation.effectTransform
      content.append(
        ctx.createInlineContent(snapshot.children as InlineModel),
      )
      // Word-art is an editable flavour too — a fill-in region with
      // meta.plh/plhMode:'always' must show its hint here, same as paragraphs.
      projectAlwaysPlaceholder(element, content, snapshot)

      const path = resolveWordArtProjectionPath(
        props.effect,
        props.width,
        props.height,
      )
      if (path) {
        content.style.opacity = '0'
        surface.append(createProjection(
          snapshot.id,
          path,
          plainText(snapshot.children as InlineModel),
          props,
          format.textStyle!,
          presentation.fontFamily,
          ctx.options.resourcePolicy !== 'off',
        ))
      }
      surface.append(content)
      element.append(surface)
      return {element}
    },
  }]
}

function plainText(model: InlineModel): string {
  return model.map(delta => typeof delta.insert === 'string'
    ? delta.insert
    : delta.insert?.['break'] ? '\n' : '').join('')
}

function createProjection(
  id: string,
  pathValue: string,
  textValue: string,
  props: ReturnType<typeof normalizeWordArtProps>,
  style: NonNullable<ReturnType<typeof normalizeBlockObjectFormat>['textStyle']>,
  fontFamily: string,
  allowPicture: boolean,
): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  svg.classList.add('word-art-block__projection')
  svg.setAttribute('viewBox', `0 0 ${props.width} ${props.height}`)
  svg.setAttribute('preserveAspectRatio', 'none')
  const defs = document.createElementNS(ns, 'defs')
  const path = document.createElementNS(ns, 'path')
  const pathId = `bc-word-art-viewer-path-${id.replace(/[^a-zA-Z0-9_-]/g, '-')}`
  path.id = pathId
  path.setAttribute('d', pathValue)
  defs.append(path)
  let fill = style.fill.type === 'solid' ? style.fill.color : 'none'
  if (style.fill.type === 'linear-gradient') {
    const gradient = document.createElementNS(ns, 'linearGradient')
    gradient.id = `${pathId}-gradient`
    style.fill.stops.forEach(item => {
      const stop = document.createElementNS(ns, 'stop')
      stop.setAttribute('offset', `${item.offset}`)
      stop.setAttribute('stop-color', item.color)
      stop.setAttribute('stop-opacity', `${item.opacity}`)
      gradient.append(stop)
    })
    defs.append(gradient)
    fill = `url(#${gradient.id})`
  } else if (allowPicture && style.fill.type === 'picture' && style.fill.src) {
    const pattern = document.createElementNS(ns, 'pattern')
    pattern.id = `${pathId}-picture`
    pattern.setAttribute('width', '1')
    pattern.setAttribute('height', '1')
    pattern.setAttribute('patternContentUnits', 'objectBoundingBox')
    const image = document.createElementNS(ns, 'image')
    image.setAttribute('href', style.fill.src)
    image.setAttribute('width', '1')
    image.setAttribute('height', '1')
    image.setAttribute('preserveAspectRatio', objectPicturePreserveAspectRatio(style.fill))
    pattern.append(image)
    defs.append(pattern)
    fill = `url(#${pattern.id})`
  }
  const text = document.createElementNS(ns, 'text')
  text.setAttribute('text-anchor', 'middle')
  text.setAttribute('fill', fill)
  text.setAttribute(
    'fill-opacity',
    `${style.fill.type === 'none' ? 0 : style.fill.opacity}`,
  )
  text.setAttribute('stroke', style.outline.type === 'none' ? 'none' : style.outline.color)
  text.setAttribute(
    'stroke-width',
    `${style.outline.type === 'none' ? 0 : style.outline.width}`,
  )
  text.style.fontFamily = fontFamily
  text.style.fontSize = `${style.fontSize}px`
  text.style.fontWeight = `${style.fontWeight}`
  text.style.fontStyle = style.fontStyle
  text.style.letterSpacing = `${style.letterSpacingEm}em`
  text.style.filter = objectEffectsFilter(style.effects)
  const textPath = document.createElementNS(ns, 'textPath')
  textPath.setAttribute('href', `#${pathId}`)
  textPath.setAttribute('startOffset', '50%')
  textPath.textContent = textValue
  text.append(textPath)
  svg.append(defs, text)
  return svg
}
