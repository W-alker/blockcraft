import type {
  DeltaInsert,
  DeltaInsertEmbed,
  EmbedConverter,
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
import {getShapeDefinition} from './shape-definitions'
import {
  normalizeCustomShapeGeometry,
  resolveShapeRenderGeometry,
} from './shape-geometry'
import {
  normalizeShapeProps,
  type ShapeBlockProps,
} from './shape.types'

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
  const props = normalizeShapeProps(raw?.props)
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
  const normalized = normalizeShapeProps(props)
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
    normalized.width,
    normalized.height,
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
    for (const item of renderGeometry.paths) {
      const path = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'path',
      )
      path.setAttribute('d', item.d)
      path.setAttribute('fill', item.fillable ? props.fillColor : 'none')
      path.setAttribute('fill-opacity', String(props.fillOpacity))
      if (item.fillable && renderGeometry.fillRule) {
        path.setAttribute('fill-rule', renderGeometry.fillRule)
      }
      path.setAttribute('stroke', props.strokeColor)
      path.setAttribute('stroke-width', String(props.strokeWidth))
      path.setAttribute('vector-effect', 'non-scaling-stroke')
      if (props.strokeStyle === 'dashed') {
        path.setAttribute('stroke-dasharray', '10 7')
      }
      svg.appendChild(path)
    }

    const text = document.createElement('span')
    text.classList.add('bc-inline-shape__text')
    text.textContent = inlineObjectPlainText(data.text)
    text.style.inset = [
      `${definition.textInsets.top * 100}%`,
      `${definition.textInsets.right * 100}%`,
      `${definition.textInsets.bottom * 100}%`,
      `${definition.textInsets.left * 100}%`,
    ].join(' ')
    text.style.color = props.textColor
    text.style.textAlign = props.shapeTextAlign
    text.style.justifyContent = props.verticalAlign === 'top'
      ? 'flex-start'
      : props.verticalAlign === 'bottom'
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
