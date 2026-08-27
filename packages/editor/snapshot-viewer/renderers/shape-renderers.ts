import {
  SHAPE_OBJECT_FORMAT_CAPABILITY,
  getShapeDefinition,
  normalizeCustomShapeGeometry,
  normalizeShapeProps,
  resolveShapeRenderGeometry,
  shapeGradientToSvgVector,
  type ShapeBlockProps,
} from '../../blocks/shape-block'
import {
  type IBlockSnapshot,
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
} from '../../framework'
import {createBlockShell} from '../dom/create-block-shell'
import type {SnapshotBlockRenderer} from '../types'

const SVG_NS = 'http://www.w3.org/2000/svg'

export function createShapeRenderers(): SnapshotBlockRenderer[] {
  return [{
    canRender: snapshot => snapshot.flavour === 'shape',
    render(ctx, snapshot) {
      const element = createBlockShell(snapshot)
      const props = normalizeShapeProps(snapshot.props as Partial<ShapeBlockProps>)
      const format = normalizeBlockObjectFormat(
        snapshot.props as Partial<ShapeBlockProps>,
        SHAPE_OBJECT_FORMAT_CAPABILITY,
      )
      const definition = getShapeDefinition(props.shapeType)
      const geometry = resolveShapeRenderGeometry(
        props.shapeType,
        definition,
        normalizeCustomShapeGeometry(props.customGeometry),
        props.adjustments,
      )
      const shell = document.createElement('div')
      shell.classList.add('shape-block__shell')
      shell.setAttribute('data-bc-print-visual-surface', '')
      shell.setAttribute('data-bc-object-surface', '')
      Object.assign(shell.style, {
        width: `${props.width}px`, height: `${props.height}px`,
        transform: props.rotation ? `rotate(${props.rotation}deg)` : '',
      })
      const svg = document.createElementNS(SVG_NS, 'svg')
      svg.classList.add('shape-block__geometry')
      svg.setAttribute('viewBox', geometry.viewBox)
      svg.setAttribute('preserveAspectRatio', 'none')
      const defs = document.createElementNS(SVG_NS, 'defs')
      const fill = format.shapeFill!
      let fillPaint = fill.type === 'solid' ? fill.color : 'none'
      if (fill.type === 'linear-gradient') {
        const id = `bc-shape-viewer-gradient-${safeId(snapshot.id)}`
        const gradient = document.createElementNS(SVG_NS, 'linearGradient')
        gradient.id = id
        const vector = shapeGradientToSvgVector(fill.angle)
        for (const key of ['x1', 'y1', 'x2', 'y2'] as const) {
          gradient.setAttribute(key, `${vector[key]}`)
        }
        fill.stops.forEach(item => {
          const stop = document.createElementNS(SVG_NS, 'stop')
          stop.setAttribute('offset', `${item.offset}`)
          stop.setAttribute('stop-color', item.color)
          stop.setAttribute('stop-opacity', `${item.opacity}`)
          gradient.append(stop)
        })
        defs.append(gradient)
        fillPaint = `url(#${id})`
      } else if (fill.type === 'picture' && fill.src && ctx.options.resourcePolicy !== 'off') {
        const id = `bc-shape-viewer-picture-${safeId(snapshot.id)}`
        const pattern = document.createElementNS(SVG_NS, 'pattern')
        pattern.id = id
        pattern.setAttribute('width', '1')
        pattern.setAttribute('height', '1')
        pattern.setAttribute('patternContentUnits', 'objectBoundingBox')
        const image = document.createElementNS(SVG_NS, 'image')
        image.setAttribute('href', fill.src)
        image.setAttribute('width', '1')
        image.setAttribute('height', '1')
        image.setAttribute('preserveAspectRatio', objectPicturePreserveAspectRatio(fill))
        pattern.append(image)
        defs.append(pattern)
        fillPaint = `url(#${id})`
      }
      const outline = format.shapeOutline!
      const markerBase = `bc-shape-viewer-arrow-${safeId(snapshot.id)}`
      const startMarkerId = outline.startArrow === 'none' ? null : `${markerBase}-start`
      const endMarkerId = outline.endArrow === 'none' ? null : `${markerBase}-end`
      if (startMarkerId) {
        defs.append(createArrowMarker(
          startMarkerId,
          outline.startArrow,
          outline.color,
          'auto-start-reverse',
        ))
      }
      if (endMarkerId) {
        defs.append(createArrowMarker(
          endMarkerId,
          outline.endArrow,
          outline.color,
          'auto',
        ))
      }
      svg.append(defs)
      const dasharray = objectLineDasharray(outline)
      for (const item of geometry.paths) {
        const path = document.createElementNS(SVG_NS, 'path')
        path.setAttribute('d', item.d)
        path.setAttribute('fill', item.fillable ? fillPaint : 'none')
        path.setAttribute('fill-opacity', `${fill.type === 'none' ? 0 : fill.opacity}`)
        path.setAttribute('stroke', outline.type === 'none' ? 'none' : outline.color)
        path.setAttribute('stroke-opacity', `${outline.opacity}`)
        path.setAttribute('stroke-width', `${outline.width}`)
        path.setAttribute('stroke-linecap', outline.cap)
        path.setAttribute('stroke-linejoin', outline.join)
        path.setAttribute('vector-effect', 'non-scaling-stroke')
        if (dasharray) path.setAttribute('stroke-dasharray', dasharray)
        if (startMarkerId) path.setAttribute('marker-start', `url(#${startMarkerId})`)
        if (endMarkerId) path.setAttribute('marker-end', `url(#${endMarkerId})`)
        if (geometry.fillRule && item.fillable) path.setAttribute('fill-rule', geometry.fillRule)
        svg.append(path)
      }
      svg.style.filter = objectEffectsFilter(format.shapeEffects!)
      const text = document.createElement('div')
      text.classList.add('shape-block__text-frame', 'children-render-container')
      text.setAttribute('data-bc-snapshot-children', '')
      ;(['top', 'right', 'bottom', 'left'] as const).forEach((side, index) => {
        text.style[side] = `calc(${definition.textInsets[side] * 100}% + ${format.textFrame!.margins[index]}px)`
      })
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
      if (format.textStyle!.fill.type === 'picture') {
        text.style.opacity = `${format.textStyle!.fill.opacity}`
      }
      text.style.textAlign = format.textFrame!.horizontalAlign
      text.style.whiteSpace = format.textFrame!.wrap ? '' : 'nowrap'
      text.style.justifyContent = format.textFrame!.verticalAlign === 'top'
        ? 'flex-start'
        : format.textFrame!.verticalAlign === 'bottom' ? 'flex-end' : 'center'
      if (format.textFrame!.direction === 'vertical-rl') text.style.writingMode = 'vertical-rl'
      const transforms: string[] = []
      if (textFrame.direction === 'rotate-90') transforms.push('rotate(90deg)')
      if (textFrame.direction === 'rotate-270') transforms.push('rotate(270deg)')
      if (!textFrame.rotateWithShape && props.rotation) {
        transforms.push(`rotate(${-props.rotation}deg)`)
      }
      const textTransform = objectTextTransformCss(textStyle.transform)
      if (textTransform) transforms.push(textTransform)
      text.style.transform = transforms.join(' ')
      for (const child of snapshot.children as IBlockSnapshot[]) {
        text.append(ctx.renderBlock(child))
      }
      if (definition.supportsText === false) text.hidden = true
      shell.append(svg, text)
      element.append(shell)
      return {element}
    },
  }]
}

function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '-')
}

function createArrowMarker(
  id: string,
  arrow: NonNullable<ReturnType<typeof normalizeBlockObjectFormat>['shapeOutline']>['startArrow'],
  color: string,
  orient: string,
): SVGMarkerElement {
  const marker = document.createElementNS(SVG_NS, 'marker')
  marker.id = id
  marker.setAttribute('viewBox', '0 0 10 10')
  marker.setAttribute('refX', '9')
  marker.setAttribute('refY', '5')
  marker.setAttribute('markerWidth', '7')
  marker.setAttribute('markerHeight', '7')
  marker.setAttribute('orient', orient)
  const path = document.createElementNS(SVG_NS, 'path')
  path.setAttribute('d', objectLineArrowPath(arrow))
  path.setAttribute('fill', color)
  marker.append(path)
  return marker
}
