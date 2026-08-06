import {PAGE_SIZES, ptToPx} from '../engine'
import {PaginationConfig} from '../pagination.types'

/**
 * 浏览器分页介质应使用纸张规范自身的物理单位，而不是把 PDF point 的两位小数
 * 再换算回 CSS 像素。后者在 WebKit/Chromium 中会经过两次舍入，纸张盒和 page area
 * 可能相差一个设备像素，表现为右侧细裁剪或额外空白页。
 */
const NAMED_PAGE_CSS_SIZES = {
  A0: {width: '841mm', height: '1189mm'},
  A1: {width: '594mm', height: '841mm'},
  A2: {width: '420mm', height: '594mm'},
  A3: {width: '297mm', height: '420mm'},
  A4: {width: '210mm', height: '297mm'},
  A5: {width: '148mm', height: '210mm'},
  A6: {width: '105mm', height: '148mm'},
  Letter: {width: '8.5in', height: '11in'},
  Legal: {width: '8.5in', height: '14in'},
  Tabloid: {width: '11in', height: '17in'},
} as const

export interface PrintPageDimensions {
  widthCss: string
  heightCss: string
  widthPx: number
  heightPx: number
  widthPt: number
  heightPt: number
}

/** 打印页盒和 `@page` 共用的物理尺寸，避免两套单位或取整结果发生漂移。 */
export function resolvePrintPageDimensions(config: PaginationConfig): PrintPageDimensions {
  const landscape = config.orientation === 'landscape'
  const size = config.pageSize ?? 'A4'
  if (typeof size === 'string') {
    const page = PAGE_SIZES[size] ?? PAGE_SIZES.A4
    const cssPage = NAMED_PAGE_CSS_SIZES[size] ?? NAMED_PAGE_CSS_SIZES.A4
    const widthPt = landscape ? page.height : page.width
    const heightPt = landscape ? page.width : page.height
    return {
      widthCss: landscape ? cssPage.height : cssPage.width,
      heightCss: landscape ? cssPage.width : cssPage.height,
      widthPx: ptToPx(widthPt),
      heightPx: ptToPx(heightPt),
      widthPt,
      heightPt,
    }
  }

  const widthPx = landscape ? size.height : size.width
  const heightPx = landscape ? size.width : size.height
  return {
    widthCss: `${widthPx}px`,
    heightCss: `${heightPx}px`,
    widthPx,
    heightPx,
    widthPt: widthPx * 72 / 96,
    heightPt: heightPx * 72 / 96,
  }
}
