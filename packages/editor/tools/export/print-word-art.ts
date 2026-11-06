import {PaginationExportError} from './pdf-export.types'

const PRINT_PROPS_ATTR = 'data-bc-word-art-print-props'
const EFFECT_TRANSFORM_ATTR = 'data-bc-word-art-effect-transform'
const VECTOR_MIRROR_ATTR = 'data-bc-word-art-vector-mirror'
const VECTOR_READY_ATTR = 'data-bc-word-art-vector-ready'
const PRINT_CSS_ATTR = 'data-bc-print-word-art-css'
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

/**
 * 把稳定只读副本里的真实文字节点切换成确定性的 print-only CSS 视觉层。
 *
 * 这里不读取 Range/DOMRect、不重排文字，也不创建或重用 SVG。字体与文字盒继续使用
 * 稳定 clone 已有的 inline layout style；渐变、描边、阴影只由 snapshot 中的确定性
 * props 写成 inline CSS。纯 WebKit 的 PDF painter 对 `background-clip:text` 的结果并不
 * 稳定，因此渐变在该引擎降级成首个色标；Chromium 等引擎仍保留 CSS 渐变。
 */
export function finalizeWordArtCssForPrint(root: HTMLElement): number {
  const targets = [
    ...(root.matches(`[${PRINT_PROPS_ATTR}]`) ? [root] : []),
    ...Array.from(root.querySelectorAll<HTMLElement>(`[${PRINT_PROPS_ATTR}]`)),
  ]
  const useWebKitGradientFallback = isPureWebKitUserAgent(readUserAgent())
  let count = 0
  for (const target of targets) {
    const blockId = target.closest<HTMLElement>('[data-block-id]')
      ?.dataset['blockId']
    const props = parsePrintProps(target.getAttribute(PRINT_PROPS_ATTR))
    if (!props) {
      throw new PaginationExportError(
        'layout-not-ready',
        `艺术字${blockId ? ` ${blockId}` : ''}缺少稳定 CSS 打印参数`,
        {stage: 'layout', ...(blockId ? {blockId} : {})},
      )
    }
    prepareWordArtCssTarget(target, props, useWebKitGradientFallback)
    count += 1
  }
  return count
}

function prepareWordArtCssTarget(
  target: HTMLElement,
  props: WordArtPrintProps,
  useWebKitGradientFallback: boolean,
): void {
  const owner = target.closest<HTMLElement>(
    '.word-art-block__surface, .bc-inline-word-art-frame',
  )
  owner?.removeAttribute(VECTOR_READY_ATTR)
  owner?.querySelectorAll(
    `:scope > [${VECTOR_MIRROR_ATTR}], :scope > [data-bc-print-word-art-vector]`,
  ).forEach(element => element.remove())
  target.querySelectorAll(TRANSIENT_EDITOR_UI_SELECTOR)
    .forEach(element => element.remove())

  const useGradient = props.fillType === 'linear-gradient'
    && !useWebKitGradientFallback
  const gradientStops = props.gradientColors.map((color, index) => {
    const fallback = index / Math.max(1, props.gradientColors.length - 1)
    const stop = clamp(props.gradientStops[index] ?? fallback, 0, 1)
    return `${color} ${Math.round(stop * 10_000) / 100}%`
  })
  const gradient = useGradient
    ? `linear-gradient(${props.gradientAngle}deg, ${gradientStops.join(', ')})`
    : 'none'
  const textFill = useGradient
    ? 'transparent'
    : props.fillType === 'linear-gradient'
      ? props.gradientColors[0] || props.fillColor
      : props.fillColor
  const backgroundClip = useGradient ? 'text' : 'border-box'
  const shadow = props.shadowEnabled
    ? `${props.shadowOffsetXEm}em ${props.shadowOffsetYEm}em `
      + `${props.shadowBlurEm}em ${toRgba(props.shadowColor, props.shadowOpacity)}`
    : 'none'
  const effectTransform = target.getAttribute(EFFECT_TRANSFORM_ATTR)?.trim()

  target.setAttribute(PRINT_CSS_ATTR, 'true')
  target.setAttribute('contenteditable', 'false')
  const setPrintStyle = (property: string, value: string): void => {
    target.style.setProperty(property, value, 'important')
  }
  setPrintStyle('color', textFill)
  setPrintStyle('-webkit-text-fill-color', textFill)
  setPrintStyle('background-image', gradient)
  setPrintStyle('background-clip', backgroundClip)
  setPrintStyle('-webkit-background-clip', backgroundClip)
  setPrintStyle(
    '-webkit-text-stroke',
    `${Math.max(0, props.outlineWidthEm)}em ${props.outlineColor}`,
  )
  setPrintStyle('text-shadow', shadow)
  setPrintStyle('transform', effectTransform || 'none')
  setPrintStyle('transform-origin', 'center center')
  setPrintStyle('-webkit-print-color-adjust', 'exact')
  setPrintStyle('print-color-adjust', 'exact')
}

function readUserAgent(): string {
  return typeof navigator === 'undefined' ? '' : navigator.userAgent
}

function isPureWebKitUserAgent(userAgent: string): boolean {
  return /AppleWebKit/i.test(userAgent)
    // CriOS/EdgiOS 等 iOS 品牌浏览器仍由 WebKit 绘制 PDF，必须使用同一
    // fallback；这里只排除真正使用 Chromium 打印管线的桌面/Android UA。
    && !/(?:Chrome|HeadlessChrome|Chromium|Edg|EdgA|OPR|SamsungBrowser)\//i
      .test(userAgent)
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

function toRgba(color: string, opacity: number): string {
  const raw = color.replace(/^#/, '')
  const normalized = raw.length === 3
    ? raw.split('').map(character => `${character}${character}`).join('')
    : raw
  const value = Number.parseInt(normalized, 16)
  if (!Number.isFinite(value)) return color
  const red = value >> 16 & 255
  const green = value >> 8 & 255
  const blue = value & 255
  return `rgba(${red}, ${green}, ${blue}, ${clamp(opacity, 0, 1)})`
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
