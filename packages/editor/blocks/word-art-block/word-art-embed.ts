import type {
  DeltaInsert,
  DeltaInsertEmbed,
  EmbedConverter,
} from '../../framework'
import {
  normalizeBlockObjectFormat,
  objectEffectsFilter,
  objectPaintBackgroundPosition,
  objectPaintBackgroundSize,
  objectPicturePreserveAspectRatio,
} from '../../framework'
import {
  cloneInlineObjectDeltas,
  createInlineObjectAttributes,
  createInlineObjectShell,
  inlineObjectPlainText,
  parseInlineObjectPayload,
  readInlineObjectLayout,
  readInlineObjectWrapFromShell,
  serializeInlineObjectPayload,
  type InlineObjectWrapOptions,
} from '../inline-object'
import {
  normalizeWordArtProps,
  normalizeWordArtSnapshotProps,
  resolveWordArtPresentation,
  resolveWordArtProjectionPath,
  WORD_ART_OBJECT_FORMAT_CAPABILITY,
  type WordArtBlockProps,
} from './word-art.types'

export const INLINE_WORD_ART_EMBED_KEY = 'word-art'

export interface InlineWordArtPayload {
  /** Placement is deliberately omitted at runtime; the full type keeps schema keys typed. */
  props: WordArtBlockProps
  text: DeltaInsert[]
}

export interface InlineWordArtData extends InlineWordArtPayload {
  width: number
  height: number
  wrap?: true
  x?: number
  gap?: number
}

export type InlineWordArtWrapOptions = Omit<InlineObjectWrapOptions, 'side'>

const sanitizeText = (value: unknown): DeltaInsert[] => {
  if (!Array.isArray(value)) return []
  const result: DeltaInsert[] = []
  for (const delta of value as DeltaInsert[]) {
    if (typeof delta?.insert === 'string') {
      if (delta.insert) result.push({insert: delta.insert})
    } else if (delta?.insert?.['break']) {
      result.push({insert: {break: '\n'}})
    }
  }
  return result
}

const payloadFromUnknown = (value: unknown): InlineWordArtPayload => {
  const raw = parseInlineObjectPayload<{
    props?: Partial<WordArtBlockProps>
    text?: DeltaInsert[]
  }>(value)
  const props = normalizeWordArtSnapshotProps(raw?.props)
  const {
    position: _position,
    placementLayer: _placementLayer,
    ...inlineProps
  } = props
  return {
    props: inlineProps,
    text: sanitizeText(raw?.text),
  }
}

export function createInlineWordArtDelta(
  props: Partial<WordArtBlockProps> | null | undefined,
  text: readonly DeltaInsert[] = [],
  wrap?: Partial<InlineWordArtWrapOptions>,
): DeltaInsertEmbed {
  const normalized = normalizeWordArtSnapshotProps(props)
  const dimensions = normalizeWordArtProps(normalized)
  const {
    position: _position,
    placementLayer: _placementLayer,
    ...inlineProps
  } = normalized
  const payload: InlineWordArtPayload = {
    props: inlineProps,
    text: sanitizeText(cloneInlineObjectDeltas(text)),
  }
  const {side: _side, ...attributes} = createInlineObjectAttributes(
    dimensions.width,
    dimensions.height,
    wrap,
  )
  return {
    insert: {
      [INLINE_WORD_ART_EMBED_KEY]: serializeInlineObjectPayload(payload),
    },
    attributes,
  }
}

export function readInlineWordArtDelta(
  delta: DeltaInsertEmbed,
): InlineWordArtData {
  const payload = payloadFromUnknown(delta.insert[INLINE_WORD_ART_EMBED_KEY])
  const {side: _side, ...layout} = readInlineObjectLayout(
    delta,
    payload.props.width,
    payload.props.height,
  )
  return {
    ...payload,
    ...layout,
  }
}

const findShell = (element: HTMLElement): HTMLElement =>
  element.matches(
    '.bc-inline-object-shell[data-bc-inline-object="word-art"]',
  )
    ? element
    : element.closest<HTMLElement>(
      '.bc-inline-object-shell[data-bc-inline-object="word-art"]',
    ) ?? element.querySelector<HTMLElement>(
      '.bc-inline-object-shell[data-bc-inline-object="word-art"]',
    ) ?? element

export const createInlineWordArtEmbedConverter = (): EmbedConverter => ({
  toView: delta => {
    const data = readInlineWordArtDelta(delta)
    const presentation = resolveWordArtPresentation({
      ...data.props,
      width: data.width,
      height: data.height,
    })
    const props = presentation.props
    const style = normalizeBlockObjectFormat(
      {...data.props, width: data.width, height: data.height},
      WORD_ART_OBJECT_FORMAT_CAPABILITY,
    ).textStyle!
    const {shell, frame} = createInlineObjectShell('word-art', data)
    shell.classList.add('bc-inline-word-art-shell')
    frame.classList.add('bc-inline-word-art-frame')
    frame.dataset['bcInlineObjectPayload'] = String(
      delta.insert[INLINE_WORD_ART_EMBED_KEY] ?? '',
    )
    frame.style.transform = props.rotation === 0
      ? ''
      : `rotate(${props.rotation}deg)`
    frame.style.alignItems = props.verticalAlign === 'top'
      ? 'flex-start'
      : props.verticalAlign === 'bottom'
        ? 'flex-end'
        : 'center'

    const text = document.createElement('span')
    text.classList.add('bc-inline-word-art__text')
    text.dataset['bcWordArtPrintProps'] = JSON.stringify(props)
    text.textContent = inlineObjectPlainText(data.text)
    text.style.fontFamily = presentation.fontFamily
    text.style.fontSize = `${props.fontSize}px`
    text.style.fontWeight = String(props.fontWeight)
    text.style.fontStyle = props.fontStyle
    text.style.letterSpacing = `${props.letterSpacingEm}em`
    text.style.lineHeight = String(props.lineHeight)
    text.style.textAlign = props.horizontalAlign
    text.style.color = presentation.textColor
    text.style.webkitTextFillColor = presentation.textColor
    text.style.caretColor = presentation.fallbackColor
    text.style.backgroundImage = presentation.backgroundImage
    text.style.backgroundSize = style.fill.type === 'picture'
      ? objectPaintBackgroundSize(style.fill)
      : 'auto'
    text.style.backgroundPosition = style.fill.type === 'picture'
      ? objectPaintBackgroundPosition(style.fill)
      : '0% 0%'
    text.style.backgroundClip = 'text'
    text.style.setProperty('-webkit-background-clip', 'text')
    text.style.setProperty('-webkit-text-stroke', presentation.textStroke)
    text.style.textShadow = presentation.textShadow
    text.style.transform = presentation.effectTransform
    text.style.opacity = `${presentation.textOpacity}`
    text.dataset['bcWordArtEffectTransform'] = presentation.effectTransform
    const path = resolveWordArtProjectionPath(
      props.effect,
      props.width,
      props.height,
    )
    if (path) {
      text.style.opacity = '0'
      frame.append(createInlineProjection(
        path,
        text.textContent ?? '',
        props,
        style,
        presentation.fontFamily,
      ))
    }
    frame.appendChild(text)
    return shell
  },
  toDelta: element => {
    const shell = findShell(element)
    const frame = shell.querySelector<HTMLElement>(
      '.bc-inline-word-art-frame',
    )
    const payload = payloadFromUnknown(
      frame?.dataset['bcInlineObjectPayload'],
    )
    return createInlineWordArtDelta(
      {
        ...payload.props,
        width: Number(frame?.style.width.replace('px', '')) ||
          payload.props.width,
        height: Number(frame?.style.height.replace('px', '')) ||
          payload.props.height,
      },
      payload.text,
      readInlineObjectWrapFromShell(shell),
    )
  },
})

export const inlineWordArtEmbedConverter = createInlineWordArtEmbedConverter()

function createInlineProjection(
  pathValue: string,
  textValue: string,
  props: ReturnType<typeof normalizeWordArtProps>,
  style: NonNullable<ReturnType<typeof normalizeBlockObjectFormat>['textStyle']>,
  fontFamily: string,
): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  svg.classList.add('word-art-block__projection')
  svg.setAttribute('viewBox', `0 0 ${props.width} ${props.height}`)
  const id = `bc-inline-word-art-path-${stableToken(pathValue + textValue)}`
  const path = document.createElementNS(ns, 'path')
  path.id = id
  path.setAttribute('d', pathValue)
  const defs = document.createElementNS(ns, 'defs')
  defs.append(path)
  let fill = style.fill.type === 'solid' ? style.fill.color : 'none'
  if (style.fill.type === 'linear-gradient') {
    const gradient = document.createElementNS(ns, 'linearGradient')
    gradient.id = `${id}-gradient`
    style.fill.stops.forEach(item => {
      const stop = document.createElementNS(ns, 'stop')
      stop.setAttribute('offset', `${item.offset}`)
      stop.setAttribute('stop-color', item.color)
      stop.setAttribute('stop-opacity', `${item.opacity}`)
      gradient.append(stop)
    })
    defs.append(gradient)
    fill = `url(#${gradient.id})`
  } else if (style.fill.type === 'picture' && style.fill.src) {
    const pattern = document.createElementNS(ns, 'pattern')
    pattern.id = `${id}-picture`
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
  Object.assign(text.style, {
    fontFamily,
    fontSize: `${style.fontSize}px`,
    fontWeight: `${style.fontWeight}`,
    fontStyle: style.fontStyle,
    letterSpacing: `${style.letterSpacingEm}em`,
    filter: objectEffectsFilter(style.effects),
  })
  const textPath = document.createElementNS(ns, 'textPath')
  textPath.setAttribute('href', `#${id}`)
  textPath.setAttribute('startOffset', '50%')
  textPath.textContent = textValue
  text.append(textPath)
  svg.append(defs, text)
  return svg
}

function stableToken(value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}
