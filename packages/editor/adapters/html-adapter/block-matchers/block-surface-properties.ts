import type {Element} from 'hast'
import {
  type BlockSurfacePadding,
  type BlockSurfaceProps,
  normalizeBlockSurfaceProps,
} from '../../../framework'

export const stringProperty = (
  node: Element,
  name: string,
): string | undefined => {
  const value = node.properties?.[name]
  return typeof value === 'string' ? value : undefined
}

export const numberProperty = (
  node: Element,
  name: string,
): number | undefined => {
  const value = node.properties?.[name]
  if (typeof value === 'number') return value
  if (typeof value !== 'string' || value.trim() === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

export function blockSurfacePropsFromHtml(
  node: Element,
): BlockSurfaceProps {
  return normalizeBlockSurfaceProps({
    p: paddingProperty(node),
    bgi: stringProperty(node, 'dataBcBgi'),
    bgs: stringProperty(node, 'dataBcBgs'),
    bgx: numberProperty(node, 'dataBcBgx'),
    bgy: numberProperty(node, 'dataBcBgy'),
    bgo: numberProperty(node, 'dataBcBgo'),
  })
}

export function blockSurfacePropsToHtml(
  input: Readonly<Record<string, unknown>>,
): Element['properties'] {
  const props = normalizeBlockSurfaceProps(input)
  return {
    dataBcP: serializePadding(props.p),
    dataBcBgi: props.bgi,
    dataBcBgs: props.bgs,
    dataBcBgx: props.bgx,
    dataBcBgy: props.bgy,
    dataBcBgo: props.bgo,
  }
}

function paddingProperty(node: Element): BlockSurfacePadding | undefined {
  const value = node.properties?.['dataBcP']
  const tokens = typeof value === 'string' || typeof value === 'number'
    ? `${value}`.trim().split(/\s+/)
    : []
  if (!tokens.length || tokens.length > 4) return undefined
  const numbers = tokens.map(token => Number(token))
  if (numbers.some(number => !Number.isFinite(number))) return undefined
  switch (numbers.length) {
    case 1:
      return numbers[0]
    case 2:
      return [numbers[0]!, numbers[1]!]
    case 3:
      return [numbers[0]!, numbers[1]!, numbers[2]!]
    case 4:
      return [numbers[0]!, numbers[1]!, numbers[2]!, numbers[3]!]
    default:
      return undefined
  }
}

function serializePadding(
  value: BlockSurfacePadding | null | undefined,
): string | number | undefined {
  return Array.isArray(value) ? value.join(' ') : value ?? undefined
}
