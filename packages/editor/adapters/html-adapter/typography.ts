import type {Element, Properties} from 'hast'
import {
  INLINE_TYPOGRAPHY_ATTRS,
  IBlockProps,
  IInlineNodeAttrs,
  isTypographyFontFamilyId,
  matchTypographyFontFamily,
  normalizeDocumentFontSize,
  normalizeInlineFontScale,
  normalizeInlineLetterSpacing,
  normalizeTypographyLineHeight,
  resolveTypographyFontFamily,
} from '../../framework'

type StyleMap = ReadonlyMap<string, string>

const propertyValue = (
  properties: Properties | undefined,
  key: string,
): unknown => properties?.[key]

const parseStyle = (properties: Properties | undefined): StyleMap => {
  const raw = propertyValue(properties, 'style')
  const source = Array.isArray(raw)
    ? raw.join(';')
    : typeof raw === 'string'
      ? raw
      : ''
  const declarations = new Map<string, string>()
  for (const declaration of source.split(';')) {
    const colon = declaration.indexOf(':')
    if (colon <= 0) continue
    const property = declaration.slice(0, colon).trim().toLowerCase()
    const value = declaration.slice(colon + 1).trim()
    if (property && value) declarations.set(property, value)
  }
  return declarations
}

const relativeEm = (
  value: unknown,
  normalize: (value: unknown) => number | null,
): number | null => {
  if (typeof value === 'number') return normalize(value)
  if (typeof value !== 'string') return null
  const match = /^([+-]?(?:\d+(?:\.\d+)?|\.\d+))em$/i.exec(value.trim())
  return match ? normalize(Number(match[1])) : null
}

const unitless = (
  value: unknown,
  normalize: (value: unknown) => number | null,
): number | null => {
  if (typeof value === 'number') return normalize(value)
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(normalized)
    ? normalize(normalized)
    : null
}

const pixels = (value: unknown): number | null => {
  if (typeof value === 'number') return normalizeDocumentFontSize(value)
  if (typeof value !== 'string') return null
  const match = /^([+]?(?:\d+(?:\.\d+)?|\.\d+))px$/i.exec(value.trim())
  return match ? normalizeDocumentFontSize(Number(match[1])) : null
}

const safeFontId = (value: unknown) => {
  if (isTypographyFontFamilyId(value)) return value
  if (!resolveTypographyFontFamily(value)) return null
  return matchTypographyFontFamily(value)
}

const styleProperties = (declarations: string[]): Pick<Properties, 'style'> | object =>
  declarations.length ? {style: declarations.join('; ')} : {}

export const inlineTypographyToHtmlProperties = (
  attributes: IInlineNodeAttrs | undefined,
): Properties | null => {
  if (!attributes) return null

  const ff = safeFontId(
    attributes[INLINE_TYPOGRAPHY_ATTRS.fontFamily]
      ?? attributes['s:fontFamily']
      ?? attributes['s:font-family'],
  )
  const fs = normalizeInlineFontScale(
    attributes[INLINE_TYPOGRAPHY_ATTRS.fontScale],
  ) ?? relativeEm(attributes['s:fontSize'] ?? attributes['s:font-size'], normalizeInlineFontScale)
  const ls = normalizeInlineLetterSpacing(
    attributes[INLINE_TYPOGRAPHY_ATTRS.letterSpacing],
  ) ?? relativeEm(
    attributes['s:letterSpacing'] ?? attributes['s:letter-spacing'],
    normalizeInlineLetterSpacing,
  )

  const declarations: string[] = []
  const properties: Properties = {}
  if (ff) {
    properties['dataBcFf'] = ff
    declarations.push(`font-family: ${resolveTypographyFontFamily(ff)}`)
  }
  if (fs !== null) {
    properties['dataBcFs'] = fs
    declarations.push(`font-size: ${fs}em`)
  }
  if (ls !== null) {
    properties['dataBcLs'] = ls
    declarations.push(`letter-spacing: ${ls}em`)
  }
  if (!declarations.length) return null
  return {...properties, ...styleProperties(declarations)}
}

export const inlineTypographyFromHtml = (
  element: Element,
): IInlineNodeAttrs | null => {
  const style = parseStyle(element.properties)
  const dataFf = propertyValue(element.properties, 'dataBcFf')
  const styleFf = style.get('font-family')
  const ff = safeFontId(dataFf) ?? safeFontId(styleFf)
  const fs = normalizeInlineFontScale(
    propertyValue(element.properties, 'dataBcFs'),
  ) ?? relativeEm(style.get('font-size'), normalizeInlineFontScale)
  const ls = normalizeInlineLetterSpacing(
    propertyValue(element.properties, 'dataBcLs'),
  ) ?? relativeEm(style.get('letter-spacing'), normalizeInlineLetterSpacing)

  const attributes: IInlineNodeAttrs = {}
  if (ff) attributes[INLINE_TYPOGRAPHY_ATTRS.fontFamily] = ff
  if (fs !== null) attributes[INLINE_TYPOGRAPHY_ATTRS.fontScale] = fs
  if (ls !== null) attributes[INLINE_TYPOGRAPHY_ATTRS.letterSpacing] = ls
  return Object.keys(attributes).length ? attributes : null
}

export const editableTypographyToHtmlProperties = (
  props: IBlockProps,
): Properties => {
  const lh = normalizeTypographyLineHeight(props['lh'])
  const declarations: string[] = []
  const properties: Properties = {}
  if (lh !== null) {
    properties['dataBcLh'] = lh
    declarations.push(`line-height: ${lh}`)
  }
  return {...properties, ...styleProperties(declarations)}
}

export const editableTypographyFromHtml = (
  element: Element,
): Partial<Pick<IBlockProps, 'lh'>> => {
  const style = parseStyle(element.properties)
  const lh = normalizeTypographyLineHeight(
    propertyValue(element.properties, 'dataBcLh'),
  ) ?? unitless(style.get('line-height'), normalizeTypographyLineHeight)
  return {
    ...(lh === null ? {} : {lh}),
  }
}

export const rootTypographyToHtmlProperties = (
  props: IBlockProps,
): Properties => {
  const rawFf = props['ff']
  const ff = resolveTypographyFontFamily(rawFf)
  const fs = normalizeDocumentFontSize(props['fs'])
  const lh = normalizeTypographyLineHeight(props['lh'])
  const declarations: string[] = []
  const properties: Properties = {}
  if (ff) {
    properties['dataBcFf'] = `${rawFf}`.trim()
    declarations.push(`font-family: ${ff}`)
  }
  if (fs !== null) {
    properties['dataBcFs'] = fs
    declarations.push(`font-size: ${fs}px`)
  }
  if (lh !== null) {
    properties['dataBcLh'] = lh
    declarations.push(`line-height: ${lh}`)
  }
  return {...properties, ...styleProperties(declarations)}
}

export const rootTypographyFromHtml = (
  element: Element,
): Partial<Pick<IBlockProps, 'ff' | 'fs' | 'lh'>> => {
  const style = parseStyle(element.properties)
  const dataFf = propertyValue(element.properties, 'dataBcFf')
  const styleFf = style.get('font-family')
  const ff = isTypographyFontFamilyId(dataFf)
    ? dataFf
    : resolveTypographyFontFamily(dataFf)
      ? `${dataFf}`.trim()
      : safeFontId(styleFf) ?? (
        resolveTypographyFontFamily(styleFf) ? styleFf!.trim() : null
      )
  const fs = normalizeDocumentFontSize(
    propertyValue(element.properties, 'dataBcFs'),
  ) ?? pixels(style.get('font-size'))
  const lh = normalizeTypographyLineHeight(
    propertyValue(element.properties, 'dataBcLh'),
  ) ?? unitless(style.get('line-height'), normalizeTypographyLineHeight)
  return {
    ...(ff === null ? {} : {ff}),
    ...(fs === null ? {} : {fs}),
    ...(lh === null ? {} : {lh}),
  }
}
