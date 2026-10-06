import {
  colorWithOpacity,
  normalizeObjectTextStyle,
  resolveTypographyFontFamily,
  storeObjectTextStyle,
} from '../../framework'

/** Content-region defaults reuse the compact text-style fields of text boxes. */
export interface RenderUnitTypographyProps {
  textFamily?: string | null
  textFont?: string | null
  textSpacing?: string | null
  textFill?: string | null
}

export function normalizeRenderUnitTypographyProps(
  input: Readonly<Record<string, unknown>> | null | undefined,
): RenderUnitTypographyProps {
  if (!input) return {}
  const has = (key: keyof RenderUnitTypographyProps) =>
    typeof input[key] === 'string' && !!(input[key] as string).trim()
  if (!(['textFamily', 'textFont', 'textSpacing', 'textFill'] as const).some(has)) return {}
  const style = normalizeObjectTextStyle(input)
  const stored = storeObjectTextStyle(style)
  return {
    ...(has('textFamily') ? {textFamily: stored.textFamily} : {}),
    ...(has('textFont') ? {textFont: stored.textFont} : {}),
    ...(has('textSpacing') ? {textSpacing: stored.textSpacing} : {}),
    ...(has('textFill') && style.fill.type === 'solid' ? {textFill: stored.textFill} : {}),
  }
}

/** Null fields keep the parent document style; explicit child formatting still wins. */
export function resolveRenderUnitTypography(input: Readonly<Record<string, unknown>> | null | undefined) {
  const props = normalizeRenderUnitTypographyProps(input)
  if (!Object.keys(props).length) return {
    fontFamily: null, fontSize: null, fontWeight: null, fontStyle: null,
    letterSpacing: null, lineHeight: null, color: null,
  }
  const style = normalizeObjectTextStyle(props)
  return {
    fontFamily: props.textFamily ? resolveTypographyFontFamily(style.fontFamily) : null,
    fontSize: props.textFont ? `${style.fontSize}px` : null,
    fontWeight: props.textFont ? `${style.fontWeight}` : null,
    fontStyle: props.textFont ? style.fontStyle : null,
    letterSpacing: props.textSpacing ? `${style.letterSpacingEm}em` : null,
    lineHeight: props.textSpacing ? `${style.lineHeight}` : null,
    color: props.textFill && style.fill.type === 'solid'
      ? colorWithOpacity(style.fill.color, style.fill.opacity)
      : null,
  }
}

/** Project only explicitly configured defaults, leaving child formatting intact. */
export function applyRenderUnitTypography(element: HTMLElement, input: Readonly<Record<string, unknown>> | null | undefined): void {
  const style = resolveRenderUnitTypography(input)
  const variables = {
    'font-family': style.fontFamily,
    'font-size': style.fontSize,
    'font-weight': style.fontWeight,
    'font-style': style.fontStyle,
    'letter-spacing': style.letterSpacing,
    'line-height': style.lineHeight,
    color: style.color,
  }
  for (const [key, value] of Object.entries(variables)) {
    const name = `--bc-render-unit-text-${key}`
    if (value === null) element.style.removeProperty(name)
    else element.style.setProperty(name, value)
  }
  // Editable children read these inherited theme tokens for their own font
  // size and line height. Scope overrides to this region's host only.
  if (style.fontSize === null) element.style.removeProperty('--bc-fs')
  else element.style.setProperty('--bc-fs', style.fontSize)
  if (style.lineHeight === null) element.style.removeProperty('--bc-lh')
  else element.style.setProperty('--bc-lh', style.lineHeight)
}
