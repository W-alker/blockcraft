import {
  normalizeBlockObjectFormat,
  objectEffectsFilter,
  objectLineArrowPath,
  objectLineDasharray,
  objectPaintBackgroundPosition,
  objectPaintBackgroundSize,
  objectPaintCssBackground,
  objectPaintTextColor,
  objectPicturePreserveAspectRatio,
  objectTextTransformCss,
} from '../../framework/block-std/block/object-format'
import type {EmbedConverter} from '../../framework/block-std/inline'
import type {
  DeltaInsert,
  DeltaInsertEmbed,
} from '../../framework/block-std/types'
import {generateId} from '../../framework/utils/id'
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
} from '../../blocks/inline-object'
import {getShapeDefinition} from '../../blocks/shape-block/shape-definitions'
import {
  normalizeCustomShapeGeometry,
  resolveShapeRenderGeometry,
} from '../../blocks/shape-block/shape-geometry'
import {
  normalizeShapeProps,
  normalizeShapeSnapshotProps,
  resolveShapeFillGradient,
  shapeGradientToSvgVector,
  type ShapeBlockProps,
  SHAPE_OBJECT_FORMAT_CAPABILITY,
} from '../../blocks/shape-block/shape.types'

export const INLINE_SHAPE_EMBED_KEY = 'shape'

export interface InlineShapePayload {
  /** Placement is deliberately omitted at runtime; the full type keeps schema keys typed. */
  props: ShapeBlockProps
  text: DeltaInsert[]
}

export interface InlineShapeData extends InlineShapePayload {
  width: number
  height: number
  wrap?: true
  x?: number
  gap?: number
}

export type InlineShapeWrapOptions = Omit<InlineObjectWrapOptions, 'side'>

const payloadFromUnknown = (value: unknown): InlineShapePayload => {
  const raw = parseInlineObjectPayload<{
    props?: Partial<ShapeBlockProps>
    text?: DeltaInsert[]
  }>(value)
  const props = normalizeShapeSnapshotProps(raw?.props)
  const {
    position: _position,
    placementLayer: _placementLayer,
    ...inlineProps
  } = props
  return {
    props: inlineProps,
    text: Array.isArray(raw?.text)
      ? cloneInlineObjectDeltas(raw.text)
      : [],
  }
}

export function createInlineShapeDelta(
  props: Partial<ShapeBlockProps> | null | undefined,
  text: readonly DeltaInsert[] = [],
  wrap?: Partial<InlineShapeWrapOptions>,
): DeltaInsertEmbed {
  const normalized = normalizeShapeSnapshotProps(props)
  const dimensions = normalizeShapeProps(normalized)
  const {
    position: _position,
    placementLayer: _placementLayer,
    ...inlineProps
  } = normalized
  const payload: InlineShapePayload = {
    props: inlineProps,
    text: cloneInlineObjectDeltas(text),
  }
  const {side: _side, ...attributes} = createInlineObjectAttributes(
    dimensions.width,
    dimensions.height,
    wrap,
  )
  return {
    insert: {
      [INLINE_SHAPE_EMBED_KEY]: serializeInlineObjectPayload(payload),
    },
    attributes,
  }
}

export function readInlineShapeDelta(
  delta: DeltaInsertEmbed,
): InlineShapeData {
  const payload = payloadFromUnknown(delta.insert[INLINE_SHAPE_EMBED_KEY])
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
  element.matches('.bc-inline-object-shell[data-bc-inline-object="shape"]')
    ? element
    : element.closest<HTMLElement>(
      '.bc-inline-object-shell[data-bc-inline-object="shape"]',
    ) ?? element.querySelector<HTMLElement>(
      '.bc-inline-object-shell[data-bc-inline-object="shape"]',
    ) ?? element

export const createInlineShapeEmbedConverter = (): EmbedConverter => ({
  toView: delta => {
    const data = readInlineShapeDelta(delta)
    const props = normalizeShapeProps({
      ...data.props,
      width: data.width,
      height: data.height,
    })
    const definition = getShapeDefinition(props.shapeType)
    const format = normalizeBlockObjectFormat(
      data.props,
      SHAPE_OBJECT_FORMAT_CAPABILITY,
    )
    const renderGeometry = resolveShapeRenderGeometry(
      props.shapeType,
      definition,
      normalizeCustomShapeGeometry(props.customGeometry),
      props.adjustments,
    )
    const {shell, frame} = createInlineObjectShell('shape', data)
    shell.classList.add('bc-inline-shape-shell')
    frame.classList.add('bc-inline-shape-frame')
    frame.dataset['bcInlineObjectPayload'] = String(
      delta.insert[INLINE_SHAPE_EMBED_KEY] ?? '',
    )
    frame.style.transform = props.rotation === 0
      ? ''
      : `rotate(${props.rotation}deg)`

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('viewBox', renderGeometry.viewBox)
    svg.setAttribute('preserveAspectRatio', 'none')
    svg.classList.add('bc-inline-shape__geometry')

    // 行内形状没有 block id，为本次渲染生成一次性的渐变 def id。
    const fill = format.shapeFill!
    const defs = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'defs',
    )
    let hasDefs = false
    const gradient = resolveShapeFillGradient(props)
    let fillPaint = fill.type === 'solid' ? fill.color : 'none'
    if (fill.type === 'linear-gradient' && gradient) {
      const gradientId = `bc-shape-fill-e-${generateId()}`
      const linearGradient = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'linearGradient',
      )
      linearGradient.setAttribute('id', gradientId)
      const vector = shapeGradientToSvgVector(gradient.angle)
      linearGradient.setAttribute('x1', String(vector.x1))
      linearGradient.setAttribute('y1', String(vector.y1))
      linearGradient.setAttribute('x2', String(vector.x2))
      linearGradient.setAttribute('y2', String(vector.y2))
      gradient.colors.forEach((color, index) => {
        const stop = document.createElementNS(
          'http://www.w3.org/2000/svg',
          'stop',
        )
        stop.setAttribute('offset', String(gradient.stops[index]))
        stop.setAttribute('stop-color', color)
        linearGradient.appendChild(stop)
      })
      defs.appendChild(linearGradient)
      hasDefs = true
      fillPaint = `url(#${gradientId})`
    } else if (fill.type === 'picture' && fill.src) {
      const pictureId = `bc-shape-picture-e-${generateId()}`
      const pattern = document.createElementNS('http://www.w3.org/2000/svg', 'pattern')
      pattern.id = pictureId
      pattern.setAttribute('width', '1')
      pattern.setAttribute('height', '1')
      pattern.setAttribute('patternContentUnits', 'objectBoundingBox')
      const image = document.createElementNS('http://www.w3.org/2000/svg', 'image')
      image.setAttribute('href', fill.src)
      image.setAttribute('width', '1')
      image.setAttribute('height', '1')
      image.setAttribute('preserveAspectRatio', objectPicturePreserveAspectRatio(fill))
      pattern.append(image)
      defs.append(pattern)
      hasDefs = true
      fillPaint = `url(#${pictureId})`
    }
    const outline = format.shapeOutline!
    const startMarkerId = outline.startArrow === 'none'
      ? null
      : `bc-shape-arrow-start-e-${generateId()}`
    const endMarkerId = outline.endArrow === 'none'
      ? null
      : `bc-shape-arrow-end-e-${generateId()}`
    if (startMarkerId) {
      defs.append(createArrowMarker(
        startMarkerId,
        outline.startArrow,
        outline.color,
        'auto-start-reverse',
      ))
      hasDefs = true
    }
    if (endMarkerId) {
      defs.append(createArrowMarker(
        endMarkerId,
        outline.endArrow,
        outline.color,
        'auto',
      ))
      hasDefs = true
    }
    if (hasDefs) svg.appendChild(defs)

    for (const item of renderGeometry.paths) {
      const path = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'path',
      )
      path.setAttribute('d', item.d)
      path.setAttribute('fill', item.fillable ? fillPaint : 'none')
      path.setAttribute(
        'fill-opacity',
        String(fill.type === 'none' ? 0 : fill.opacity),
      )
      if (item.fillable && renderGeometry.fillRule) {
        path.setAttribute('fill-rule', renderGeometry.fillRule)
      }
      path.setAttribute('stroke', format.shapeOutline!.type === 'none'
        ? 'none'
        : format.shapeOutline!.color)
      path.setAttribute('stroke-opacity', String(format.shapeOutline!.opacity))
      path.setAttribute('stroke-width', String(format.shapeOutline!.width))
      path.setAttribute('vector-effect', 'non-scaling-stroke')
      path.setAttribute('stroke-linecap', format.shapeOutline!.cap)
      path.setAttribute('stroke-linejoin', format.shapeOutline!.join)
      const dasharray = objectLineDasharray(format.shapeOutline!)
      if (dasharray) path.setAttribute('stroke-dasharray', dasharray)
      if (startMarkerId) path.setAttribute('marker-start', `url(#${startMarkerId})`)
      if (endMarkerId) path.setAttribute('marker-end', `url(#${endMarkerId})`)
      const filter = objectEffectsFilter(format.shapeEffects!)
      if (filter) path.style.filter = filter
      svg.appendChild(path)
    }

    const text = document.createElement('span')
    text.classList.add('bc-inline-shape__text')
    text.textContent = inlineObjectPlainText(data.text)
    text.style.inset = (['top', 'right', 'bottom', 'left'] as const)
      .map((side, index) =>
        `calc(${definition.textInsets[side] * 100}% + ${format.textFrame!.margins[index]}px)`,
      ).join(' ')
    const textStyle = format.textStyle!
    const textFrame = format.textFrame!
    text.style.color = objectPaintTextColor(textStyle.fill)
    text.style.webkitTextFillColor = objectPaintTextColor(textStyle.fill)
    const textBackground = objectPaintCssBackground(textStyle.fill)
    if (textBackground) {
      text.style.backgroundImage = textBackground
      if (textStyle.fill.type === 'picture') {
        text.style.backgroundSize = objectPaintBackgroundSize(textStyle.fill)
        text.style.backgroundPosition = objectPaintBackgroundPosition(textStyle.fill)
      }
      text.style.backgroundClip = 'text'
      text.style.setProperty('-webkit-background-clip', 'text')
    }
    text.style.setProperty(
      '-webkit-text-stroke',
      textStyle.outline.type === 'none'
        ? '0 transparent'
        : `${textStyle.outline.width}px ${textStyle.outline.color}`,
    )
    text.style.filter = objectEffectsFilter(textStyle.effects)
    text.style.fontFamily = format.textStyle!.fontFamily
    text.style.fontSize = `${format.textStyle!.fontSize}px`
    text.style.fontWeight = `${format.textStyle!.fontWeight}`
    text.style.fontStyle = format.textStyle!.fontStyle
    text.style.letterSpacing = `${format.textStyle!.letterSpacingEm}em`
    text.style.lineHeight = `${format.textStyle!.lineHeight}`
    text.style.textAlign = format.textFrame!.horizontalAlign
    text.style.whiteSpace = format.textFrame!.wrap ? '' : 'nowrap'
    text.style.writingMode = format.textFrame!.direction === 'vertical-rl'
      ? 'vertical-rl'
      : ''
    const transforms: string[] = []
    if (textFrame.direction === 'rotate-90') transforms.push('rotate(90deg)')
    if (textFrame.direction === 'rotate-270') transforms.push('rotate(270deg)')
    if (!textFrame.rotateWithShape && props.rotation) {
      transforms.push(`rotate(${-props.rotation}deg)`)
    }
    const textTransform = objectTextTransformCss(textStyle.transform)
    if (textTransform) transforms.push(textTransform)
    text.style.transform = transforms.join(' ')
    text.style.justifyContent = format.textFrame!.verticalAlign === 'top'
      ? 'flex-start'
      : format.textFrame!.verticalAlign === 'bottom'
        ? 'flex-end'
        : 'center'
    if (definition.supportsText === false) text.hidden = true
    frame.append(svg, text)
    return shell
  },
  toDelta: element => {
    const shell = findShell(element)
    const frame = shell.querySelector<HTMLElement>('.bc-inline-shape-frame')
    const payload = payloadFromUnknown(
      frame?.dataset['bcInlineObjectPayload'],
    )
    return createInlineShapeDelta(
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

export const inlineShapeEmbedConverter = createInlineShapeEmbedConverter()

function createArrowMarker(
  id: string,
  arrow: NonNullable<ReturnType<typeof normalizeBlockObjectFormat>['shapeOutline']>['startArrow'],
  color: string,
  orient: string,
): SVGMarkerElement {
  const ns = 'http://www.w3.org/2000/svg'
  const marker = document.createElementNS(ns, 'marker')
  marker.id = id
  marker.setAttribute('viewBox', '0 0 10 10')
  marker.setAttribute('refX', '9')
  marker.setAttribute('refY', '5')
  marker.setAttribute('markerWidth', '7')
  marker.setAttribute('markerHeight', '7')
  marker.setAttribute('orient', orient)
  const path = document.createElementNS(ns, 'path')
  path.setAttribute('d', objectLineArrowPath(arrow))
  path.setAttribute('fill', color)
  marker.append(path)
  return marker
}
