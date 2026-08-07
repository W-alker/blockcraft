import {PaginationExportError} from './pdf-export.types'

const SVG_NS = 'http://www.w3.org/2000/svg'
const XML_NS = 'http://www.w3.org/XML/1998/namespace'
const PRINT_PROPS_ATTR = 'data-bc-word-art-print-props'
const EFFECT_TRANSFORM_ATTR = 'data-bc-word-art-effect-transform'
const VECTOR_MIRROR_ATTR = 'data-bc-word-art-vector-mirror'
const VECTOR_READY_ATTR = 'data-bc-word-art-vector-ready'
const TRANSIENT_EDITOR_UI_SELECTOR = [
  '.blockcraft-cursor',
  '[data-cursor-blot="true"]',
  '[data-blockcraft-cursor-label-layer="true"]',
].join(',')

interface WordArtPrintProps {
  fillType: 'solid' | 'linear-gradient'
  fillColor: string
  gradientAngle: number
  gradientColors: string[]
  gradientStops: number[]
  outlineColor: string
  outlineWidthEm: number
  shadowEnabled: boolean
  shadowColor: string
  shadowOpacity: number
  shadowOffsetXEm: number
  shadowOffsetYEm: number
  shadowBlurEm: number
}

interface VisualGlyph {
  text: string
  left: number
  right: number
  top: number
  bottom: number
}

interface VisualLine {
  text: string
  left: number
  right: number
  top: number
  bottom: number
  graphemeCount: number
}

interface SvgTextLine {
  element: SVGTextElement
  width: number
  graphemeCount: number
}

interface WordArtVectorGeometry {
  width: number
  height: number
  left: number
  top: number
}

let vectorSequence = 0

/**
 * 固定打印面只能复用可编辑、只读与 snapshot 稳定阶段已经生成的 SVG 视觉节点。
 * 这里不读取 Range/DOMRect，也不创建新 SVG；缺失稳定视觉层说明只读副本尚未完成渲染，
 * 必须终止导出，不能用另一套打印时几何悄悄替代页面上的实际结果。
 */
export function finalizeWordArtVectorsForPrint(root: HTMLElement): number {
  const targets = [
    ...(root.matches(`[${PRINT_PROPS_ATTR}]`) ? [root] : []),
    ...Array.from(root.querySelectorAll<HTMLElement>(`[${PRINT_PROPS_ATTR}]`)),
  ]
  let count = 0
  for (const target of targets) {
    if (!reuseVectorMirrorForPrint(target)) {
      const blockId = target.closest<HTMLElement>('[data-block-id]')
        ?.dataset['blockId']
      throw new PaginationExportError(
        'layout-not-ready',
        `艺术字${blockId ? ` ${blockId}` : ''}的稳定 SVG 尚未就绪，导出阶段禁止重新测量`,
        {stage: 'layout', ...(blockId ? {blockId} : {})},
      )
    }
    count += 1
  }
  return count
}

/**
 * 给可编辑 WordArt 保留真实 contenteditable，同时挂载与 PDF 完全相同的 SVG 视觉层。
 * HTML 字形在 SVG 就绪后保持透明，聚焦时也只由它承载光标和选区。
 */
export function refreshWordArtVectorMirror(target: HTMLElement): boolean {
  if (!target.isConnected) return false
  const owner = target.closest<HTMLElement>(
    '.word-art-block__surface, .bc-inline-word-art-frame',
  )
  if (!owner) return false
  owner.removeAttribute(VECTOR_READY_ATTR)
  const props = parsePrintProps(target.getAttribute(PRINT_PROPS_ATTR))
  if (!props) return false

  const previous = owner.querySelector<SVGSVGElement>(
    `:scope > [${VECTOR_MIRROR_ATTR}]`,
  )
  try {
    const {svg, textLines, geometry} = buildVectorFromTarget(target, props)
    svg.setAttribute(VECTOR_MIRROR_ATTR, 'true')
    svg.setAttribute('aria-hidden', 'true')
    svg.style.position = 'absolute'
    svg.style.left = `${geometry.left}px`
    svg.style.top = `${geometry.top}px`
    svg.style.pointerEvents = 'none'
    if (previous) previous.replaceWith(svg)
    else target.insertAdjacentElement('afterend', svg)
    fitSvgTextLines(textLines)
    owner.setAttribute(VECTOR_READY_ATTR, 'true')
    return true
  } catch {
    return false
  }
}

/**
 * 选区 FakeRange、协同光标与 IME CursorBlot 都是编辑器瞬态 UI，不属于艺术字内容。
 * 它们挂载/卸载时不能让 SVG 视觉层重新采样，否则 WebKit 在活跃选区下返回的
 * Range 几何可能与静止态不同，造成用户看到艺术字在“出现虚拟光标”时跳动。
 */
export function mutationAffectsWordArtVector(
  mutations: readonly MutationRecord[],
): boolean {
  return mutations.some(mutation => {
    if (mutation.type === 'characterData') {
      return !isTransientEditorUiNode(mutation.target)
    }
    if (mutation.type !== 'childList') return true
    if (isTransientEditorUiNode(mutation.target)) return false

    const changedNodes = [
      ...Array.from(mutation.addedNodes),
      ...Array.from(mutation.removedNodes),
    ]
    return changedNodes.length === 0
      || changedNodes.some(node => !isTransientEditorUiNode(node))
  })
}

function reuseVectorMirrorForPrint(target: HTMLElement): boolean {
  const owner = target.closest<HTMLElement>(
    '.word-art-block__surface, .bc-inline-word-art-frame',
  )
  const mirror = owner?.querySelector<SVGSVGElement>(
    `:scope > [${VECTOR_MIRROR_ATTR}]`,
  )
  if (!owner?.hasAttribute(VECTOR_READY_ATTR) || !mirror) return false
  target.remove()
  owner.removeAttribute(VECTOR_READY_ATTR)
  mirror.removeAttribute(VECTOR_MIRROR_ATTR)
  mirror.removeAttribute('aria-hidden')
  mirror.setAttribute('data-bc-print-word-art-vector', 'true')
  return true
}

function buildVectorFromTarget(
  target: HTMLElement,
  props: WordArtPrintProps,
): {
  svg: SVGSVGElement
  textLines: SvgTextLine[]
  geometry: WordArtVectorGeometry
} {
  const computed = getComputedStyle(target)
  const sourceTransform = target.style.transform
  const targetTransform =
    target.getAttribute(EFFECT_TRANSFORM_ATTR) ?? sourceTransform
  const transformOwner = target.closest<HTMLElement>(
    '.word-art-block__surface, .bc-inline-word-art-frame',
  )
  const ownerTransform = transformOwner?.style.transform ?? ''

  // Range 返回 viewport 坐标。先去掉 WordArt 自己的视觉变换（不参与 flow 几何），
  // 量完后把 effect 放到 SVG、rotation 还给外层 surface/frame。
  target.style.transform = 'none'
  if (transformOwner) transformOwner.style.transform = 'none'

  try {
    const targetRect = target.getBoundingClientRect()
    const width = readBorderBoxSize(target, computed, 'width', targetRect.width)
    const height = readBorderBoxSize(target, computed, 'height', targetRect.height)
    if (width <= 0 || height <= 0) {
      throw new Error(`艺术字打印盒尺寸无效：${width}x${height}`)
    }

    const scaleX = targetRect.width > 0 ? targetRect.width / width : 1
    const scaleY = targetRect.height > 0 ? targetRect.height / height : 1
    const lines = collectVisualLines(target, targetRect, scaleX, scaleY, computed)
    const vector = buildSvg(
      target,
      props,
      computed,
      width,
      height,
      lines,
      targetTransform,
    )
    return {
      ...vector,
      geometry: {
        width,
        height,
        ...readLocalPosition(target, transformOwner, targetRect),
      },
    }

  } finally {
    if (target.isConnected) target.style.transform = sourceTransform
    if (transformOwner) transformOwner.style.transform = ownerTransform
  }
}

function readBorderBoxSize(
  target: HTMLElement,
  computed: CSSStyleDeclaration,
  axis: 'width' | 'height',
  rectSize: number,
): number {
  const value = parseFloat(computed[axis])
  if (Number.isFinite(value) && value > 0) {
    if (computed.boxSizing === 'border-box') return value
    const isWidth = axis === 'width'
    const startPadding = parseFloat(
      isWidth ? computed.paddingLeft : computed.paddingTop,
    ) || 0
    const endPadding = parseFloat(
      isWidth ? computed.paddingRight : computed.paddingBottom,
    ) || 0
    const startBorder = parseFloat(
      isWidth ? computed.borderLeftWidth : computed.borderTopWidth,
    ) || 0
    const endBorder = parseFloat(
      isWidth ? computed.borderRightWidth : computed.borderBottomWidth,
    ) || 0
    return value + startPadding + endPadding + startBorder + endBorder
  }

  const offsetSize = axis === 'width' ? target.offsetWidth : target.offsetHeight
  return rectSize > 0 ? rectSize : offsetSize
}

function readLocalPosition(
  target: HTMLElement,
  owner: HTMLElement | null,
  targetRect: DOMRect,
): {left: number; top: number} {
  if (!owner) {
    return {left: target.offsetLeft, top: target.offsetTop}
  }

  const ownerRect = owner.getBoundingClientRect()
  const ownerComputed = getComputedStyle(owner)
  const ownerWidth = readBorderBoxSize(
    owner,
    ownerComputed,
    'width',
    ownerRect.width,
  )
  const ownerHeight = readBorderBoxSize(
    owner,
    ownerComputed,
    'height',
    ownerRect.height,
  )
  const scaleX = ownerRect.width > 0 && ownerWidth > 0
    ? ownerRect.width / ownerWidth
    : 1
  const scaleY = ownerRect.height > 0 && ownerHeight > 0
    ? ownerRect.height / ownerHeight
    : 1
  const borderLeft = parseFloat(ownerComputed.borderLeftWidth) || 0
  const borderTop = parseFloat(ownerComputed.borderTopWidth) || 0

  // offsetLeft/offsetTop 会把 flex/grid 的子像素布局取整。Chrome 在中文字体、
  // 非整数行高与页面缩放组合下经常产生 0.1~0.5px 误差，SVG 因此无法与承载
  // 光标/选区的透明 HTML 字形重合。用同一帧的 DOMRect 换算回 containing block
  // 坐标，保留子像素并同时抵消祖先 zoom/transform。
  return {
    left: (targetRect.left - ownerRect.left) / Math.max(scaleX, 0.0001)
      - borderLeft + owner.scrollLeft,
    top: (targetRect.top - ownerRect.top) / Math.max(scaleY, 0.0001)
      - borderTop + owner.scrollTop,
  }
}

function collectVisualLines(
  target: HTMLElement,
  targetRect: DOMRect,
  scaleX: number,
  scaleY: number,
  computed: CSSStyleDeclaration,
): VisualLine[] {
  const glyphs: VisualGlyph[] = []
  const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()
  while (node) {
    const textNode = node as Text
    const parent = textNode.parentElement
    if (
      textNode.data
      && parent
      && !parent.closest('svg')
      && !parent.closest('[aria-hidden="true"]')
      && !parent.closest('.bc-end-break')
      && !parent.closest(TRANSIENT_EDITOR_UI_SELECTOR)
    ) {
      for (const segment of segmentGraphemes(textNode.data)) {
        if (segment.text === '\n' || segment.text === '\r') continue
        const range = document.createRange()
        range.setStart(textNode, segment.start)
        range.setEnd(textNode, segment.end)
        // Safari may expose a zero-width boundary rect before the glyph's real
        // visual rect. This collector feeds SVG geometry, so only a painted
        // rect is usable; taking the first positive-height rect moves the line
        // origin to the boundary and loses the glyph's measured width.
        const rect = Array.from(range.getClientRects())
          .find(item => item.height > 0 && item.width > 0)
        range.detach()
        if (!rect) continue
        glyphs.push({
          text: segment.text,
          left: (rect.left - targetRect.left) / Math.max(scaleX, 0.0001),
          right: (rect.right - targetRect.left) / Math.max(scaleX, 0.0001),
          top: (rect.top - targetRect.top) / Math.max(scaleY, 0.0001),
          bottom: (rect.bottom - targetRect.top) / Math.max(scaleY, 0.0001),
        })
      }
    }
    node = walker.nextNode()
  }

  const lines: VisualLine[] = []
  for (const glyph of glyphs) {
    const center = (glyph.top + glyph.bottom) / 2
    let line = lines.find(candidate => {
      const candidateCenter = (candidate.top + candidate.bottom) / 2
      return Math.abs(candidateCenter - center) <= 1.5
    })
    if (!line) {
      line = {
        text: '',
        left: glyph.left,
        right: glyph.right,
        top: glyph.top,
        bottom: glyph.bottom,
        graphemeCount: 0,
      }
      lines.push(line)
    }
    line.text += glyph.text
    line.left = Math.min(line.left, glyph.left)
    line.right = Math.max(line.right, glyph.right)
    line.top = Math.min(line.top, glyph.top)
    line.bottom = Math.max(line.bottom, glyph.bottom)
    line.graphemeCount += 1
  }

  if (lines.length > 0) return lines.sort((a, b) => a.top - b.top)

  // 无布局实现的测试环境或空 Range 兜底；真实打印路径一定走上面的视觉行。
  const sourceLines = readRenderableText(target).split(/\r?\n/)
  const fontSize = parseFloat(computed.fontSize) || 16
  const lineHeight = parseFloat(computed.lineHeight) || fontSize * 1.2
  const left = parseFloat(computed.paddingLeft) || 0
  const top = parseFloat(computed.paddingTop) || 0
  return sourceLines
    .filter(text => text.length > 0)
    .map((text, index) => ({
      text,
      left,
      right: Math.max(left, target.clientWidth - (parseFloat(computed.paddingRight) || 0)),
      top: top + index * lineHeight,
      bottom: top + (index + 1) * lineHeight,
      graphemeCount: segmentGraphemes(text).length,
    }))
}

function isTransientEditorUiNode(node: Node): boolean {
  const element = node.nodeType === Node.ELEMENT_NODE
    ? node as Element
    : node.parentElement
  return !!element?.closest(TRANSIENT_EDITOR_UI_SELECTOR)
}

function readRenderableText(target: HTMLElement): string {
  const parts: string[] = []
  const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()
  while (node) {
    const parent = node.parentElement
    if (
      parent
      && !parent.closest('svg')
      && !parent.closest('[aria-hidden="true"]')
      && !parent.closest('.bc-end-break')
      && !parent.closest(TRANSIENT_EDITOR_UI_SELECTOR)
    ) {
      parts.push(node.textContent ?? '')
    }
    node = walker.nextNode()
  }
  return parts.join('')
}

function buildSvg(
  target: HTMLElement,
  props: WordArtPrintProps,
  computed: CSSStyleDeclaration,
  width: number,
  height: number,
  lines: VisualLine[],
  targetTransform: string,
): {svg: SVGSVGElement; textLines: SvgTextLine[]} {
  const sequence = ++vectorSequence
  const svg = createSvgElement('svg')
  svg.setAttribute('width', `${width}`)
  svg.setAttribute('height', `${height}`)
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`)
  svg.setAttribute('preserveAspectRatio', 'none')
  svg.setAttribute('role', 'img')
  const vectorText = lines.map(line => line.text).join('\n')
  svg.setAttribute('aria-label', vectorText)
  svg.setAttribute('data-bc-word-art-vector', 'true')
  svg.style.cssText = [
    'display:block',
    'box-sizing:border-box',
    `width:${width}px`,
    `height:${height}px`,
    'max-width:100%',
    'overflow:hidden',
    `transform:${targetTransform || 'none'}`,
    `transform-origin:${computed.transformOrigin || 'center center'}`,
    `align-self:${computed.alignSelf || 'auto'}`,
    `vertical-align:${computed.verticalAlign || 'baseline'}`,
  ].join(';')

  const title = createSvgElement('title')
  title.textContent = vectorText
  svg.appendChild(title)

  const defs = createSvgElement('defs')
  let fill = props.fillColor
  if (
    props.fillType === 'linear-gradient'
    && props.gradientColors.length > 0
  ) {
    const gradientId = `bc-word-art-gradient-${sequence}`
    const gradient = createLinearGradient(
      gradientId,
      props,
      width,
      height,
    )
    defs.appendChild(gradient)
    fill = `url(#${gradientId})`
  }

  let filterId = ''
  if (props.shadowEnabled && props.shadowOpacity > 0) {
    filterId = `bc-word-art-shadow-${sequence}`
    defs.appendChild(createShadowFilter(filterId, props, computed, width, height))
  }
  if (defs.childNodes.length > 0) svg.appendChild(defs)

  const group = createSvgElement('g')
  if (filterId) group.setAttribute('filter', `url(#${filterId})`)
  svg.appendChild(group)

  const fontSize = parseFloat(computed.fontSize) || 16
  const strokeWidth = Math.max(0, props.outlineWidthEm * fontSize)
  const direction = computed.direction || 'ltr'
  const textLines: SvgTextLine[] = []

  for (const line of lines) {
    if (!line.text) continue
    const element = createSvgElement('text')
    const lineWidth = Math.max(0, line.right - line.left)
    element.textContent = line.text
    element.setAttributeNS(XML_NS, 'xml:space', 'preserve')
    element.setAttribute('x', `${direction === 'rtl' ? line.right : line.left}`)
    // `Range` 已经给出了源字形的视觉顶部。用 before-edge 明确锚定这个坐标，
    // 不再把它换算成 alphabetic baseline：WKWebView 的 Quartz PDF painter 会把
    // SVG text 的 baseline y 当作绘制顶部，导致中文艺术字额外下移约一个 ascent。
    // 浏览器与原生 PDF 对 text-before-edge 都以同一视觉顶部解释，因此无需猜字体
    // ascent/descent，也不会受回退字体的 Canvas metrics 差异影响。
    element.setAttribute('y', `${line.top}`)
    element.setAttribute('dominant-baseline', 'text-before-edge')
    element.setAttribute('fill', fill)
    element.setAttribute('stroke', props.outlineColor)
    element.setAttribute('stroke-width', `${strokeWidth}`)
    element.setAttribute('stroke-linejoin', 'round')
    element.setAttribute('paint-order', 'stroke fill')
    element.setAttribute('font-family', computed.fontFamily)
    element.setAttribute('font-size', `${fontSize}`)
    element.setAttribute('font-weight', computed.fontWeight)
    element.setAttribute('font-style', computed.fontStyle)
    element.setAttribute('letter-spacing', computed.letterSpacing)
    element.setAttribute('direction', direction)
    element.setAttribute('text-anchor', direction === 'rtl' ? 'end' : 'start')
    element.style.unicodeBidi = computed.unicodeBidi
    group.appendChild(element)
    textLines.push({element, width: lineWidth, graphemeCount: line.graphemeCount})
  }

  return {svg, textLines}
}

function fitSvgTextLines(lines: SvgTextLine[]): void {
  for (const line of lines) {
    if (line.width <= 0) continue
    let measured = 0
    try {
      measured = line.element.getComputedTextLength()
    } catch {
      measured = 0
    }
    if (measured > 0 && Math.abs(measured - line.width) <= 0.5) continue
    line.element.setAttribute('textLength', `${line.width}`)
    line.element.setAttribute(
      'lengthAdjust',
      line.graphemeCount > 1 ? 'spacing' : 'spacingAndGlyphs',
    )
  }
}

function createLinearGradient(
  id: string,
  props: WordArtPrintProps,
  width: number,
  height: number,
): SVGLinearGradientElement {
  const gradient = createSvgElement('linearGradient')
  gradient.id = id
  gradient.setAttribute('gradientUnits', 'userSpaceOnUse')
  const radians = props.gradientAngle * Math.PI / 180
  const dx = Math.sin(radians)
  const dy = -Math.cos(radians)
  const length = Math.abs(width * dx) + Math.abs(height * dy)
  const half = length / 2
  const centerX = width / 2
  const centerY = height / 2
  gradient.setAttribute('x1', `${centerX - dx * half}`)
  gradient.setAttribute('y1', `${centerY - dy * half}`)
  gradient.setAttribute('x2', `${centerX + dx * half}`)
  gradient.setAttribute('y2', `${centerY + dy * half}`)

  props.gradientColors.forEach((color, index) => {
    const stop = createSvgElement('stop')
    const offset = clamp(props.gradientStops[index] ?? index / Math.max(1, props.gradientColors.length - 1), 0, 1)
    stop.setAttribute('offset', `${offset * 100}%`)
    stop.setAttribute('stop-color', color)
    gradient.appendChild(stop)
  })
  return gradient
}

function createShadowFilter(
  id: string,
  props: WordArtPrintProps,
  computed: CSSStyleDeclaration,
  width: number,
  height: number,
): SVGFilterElement {
  const fontSize = parseFloat(computed.fontSize) || 16
  const dx = props.shadowOffsetXEm * fontSize
  const dy = props.shadowOffsetYEm * fontSize
  const deviation = Math.max(0, props.shadowBlurEm * fontSize / 2)
  const stroke = Math.max(0, props.outlineWidthEm * fontSize)
  const padding = Math.max(1, Math.abs(dx), Math.abs(dy)) + deviation * 3 + stroke
  const filter = createSvgElement('filter')
  filter.id = id
  filter.setAttribute('filterUnits', 'userSpaceOnUse')
  filter.setAttribute('x', `${-padding}`)
  filter.setAttribute('y', `${-padding}`)
  filter.setAttribute('width', `${width + padding * 2}`)
  filter.setAttribute('height', `${height + padding * 2}`)
  const shadow = createSvgElement('feDropShadow')
  shadow.setAttribute('dx', `${dx}`)
  shadow.setAttribute('dy', `${dy}`)
  shadow.setAttribute('stdDeviation', `${deviation}`)
  shadow.setAttribute('flood-color', props.shadowColor)
  shadow.setAttribute('flood-opacity', `${clamp(props.shadowOpacity, 0, 1)}`)
  filter.appendChild(shadow)
  return filter
}

function parsePrintProps(value: string | null): WordArtPrintProps | null {
  if (!value) return null
  try {
    const props = JSON.parse(value) as Partial<WordArtPrintProps>
    if (
      (props.fillType !== 'solid' && props.fillType !== 'linear-gradient')
      || typeof props.fillColor !== 'string'
      || !Number.isFinite(props.gradientAngle)
      || !Array.isArray(props.gradientColors)
      || !Array.isArray(props.gradientStops)
      || typeof props.outlineColor !== 'string'
      || !Number.isFinite(props.outlineWidthEm)
      || typeof props.shadowEnabled !== 'boolean'
      || typeof props.shadowColor !== 'string'
      || !Number.isFinite(props.shadowOpacity)
      || !Number.isFinite(props.shadowOffsetXEm)
      || !Number.isFinite(props.shadowOffsetYEm)
      || !Number.isFinite(props.shadowBlurEm)
    ) return null
    return props as WordArtPrintProps
  } catch {
    return null
  }
}

function segmentGraphemes(value: string): Array<{
  text: string
  start: number
  end: number
}> {
  const Segmenter = (Intl as typeof Intl & {
    Segmenter?: new (
      locales?: string | string[],
      options?: {granularity: 'grapheme'},
    ) => {segment(input: string): Iterable<{segment: string; index: number}>}
  }).Segmenter
  if (Segmenter) {
    return Array.from(new Segmenter(undefined, {granularity: 'grapheme'}).segment(value))
      .map(item => ({
        text: item.segment,
        start: item.index,
        end: item.index + item.segment.length,
      }))
  }
  let offset = 0
  return Array.from(value).map(text => {
    const start = offset
    offset += text.length
    return {text, start, end: offset}
  })
}

function createSvgElement<K extends keyof SVGElementTagNameMap>(
  tag: K,
): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, tag)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
