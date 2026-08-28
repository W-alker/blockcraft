import type {Element} from 'hast'
import {
  normalizeBlockObjectFormat,
  storeObjectEffects,
  storeObjectLine,
  storeObjectPaint,
  storeObjectTextFrame,
  storeObjectTextStyle,
  type BlockObjectFormatCapability,
  type BlockObjectFormatProps,
} from '../../..'

const MAX_SECTION_LENGTH = 32_000

export function objectFormatPropsFromHtml(
  node: Element,
): Partial<BlockObjectFormatProps> {
  const section = (name: string): unknown => {
    const value = node.properties?.[name]
    if (typeof value !== 'string' || value.length > MAX_SECTION_LENGTH) {
      return undefined
    }
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed
        : undefined
    } catch {
      return undefined
    }
  }
  const number = (name: string) => {
    const value = node.properties?.[name]
    const parsed = typeof value === 'number' ? value : Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  const lock = node.properties?.['dataBcObjectLockRatio']
  const shapeType = node.properties?.['dataBcObjectShape']
  return {
    width: number('dataBcObjectWidth'),
    height: number('dataBcObjectHeight'),
    rotation: number('dataBcObjectRotation'),
    ...(lock === true || lock === 'true' ? {lockRatio: true} : {}),
    ...(typeof shapeType === 'string' ? {shape: shapeType} : {}),
    fill: section('dataBcObjectFill') as BlockObjectFormatProps['fill'],
    outline: section('dataBcObjectOutline') as BlockObjectFormatProps['outline'],
    effects: section('dataBcObjectEffects') as BlockObjectFormatProps['effects'],
    textFrame: section('dataBcObjectTextFrame') as BlockObjectFormatProps['textFrame'],
    textStyle: section('dataBcObjectTextStyle') as BlockObjectFormatProps['textStyle'],
  }
}

export function objectFormatPropsToHtml(
  props: Readonly<Partial<BlockObjectFormatProps>>,
  capability: Readonly<BlockObjectFormatCapability>,
): Record<string, string | number | boolean> {
  const normalized = normalizeBlockObjectFormat(props, capability)
  return {
    dataBcObjectWidth: normalized.width,
    dataBcObjectHeight: normalized.height,
    dataBcObjectRotation: normalized.rotation,
    dataBcObjectLockRatio: normalized.lockAspectRatio,
    ...(normalized.shapeType
      ? {dataBcObjectShape: normalized.shapeType}
      : {}),
    ...(normalized.shapeFill
      ? {dataBcObjectFill: JSON.stringify(storeObjectPaint(normalized.shapeFill))}
      : {}),
    ...(normalized.shapeOutline
      ? {dataBcObjectOutline: JSON.stringify(storeObjectLine(normalized.shapeOutline))}
      : {}),
    ...(normalized.shapeEffects
      ? {dataBcObjectEffects: JSON.stringify(storeObjectEffects(normalized.shapeEffects))}
      : {}),
    ...(normalized.textFrame
      ? {dataBcObjectTextFrame: JSON.stringify(storeObjectTextFrame(normalized.textFrame))}
      : {}),
    ...(normalized.textStyle
      ? {dataBcObjectTextStyle: JSON.stringify(storeObjectTextStyle(normalized.textStyle))}
      : {}),
  }
}
