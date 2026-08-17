export type OrderedCounterBlock = {
  id: string
  flavour: string
  props: {
    depth?: number | string | null
    heading?: number | string | null
    order?: number | string | null
    start?: number | string | null
  } & Record<string, unknown>
}

export const normalizeOrderedCounterInteger = (value: unknown) => {
  const numberValue = Number(value ?? 0)
  if (!Number.isFinite(numberValue) || numberValue <= 0) return 0
  return Math.floor(numberValue)
}

export const getOrderedCounterDepth = (block: OrderedCounterBlock) =>
  normalizeOrderedCounterInteger(block.props.depth)

export const getOrderedCounterHeading = (block: OrderedCounterBlock) =>
  normalizeOrderedCounterInteger(block.props.heading)

export const getOrderedCounterStart = (block: OrderedCounterBlock) => {
  const start = normalizeOrderedCounterInteger(block.props.start)
  return start <= 0 ? null : start - 1
}

/**
 * Structural boundary used by the automatic numbering scan.
 * A normal paragraph at the same level deliberately does not prune a counter.
 */
export const prunesOrderedCounter = (
  block: OrderedCounterBlock,
  counterDepth: number,
  counterHeading: number,
) => {
  const depth = getOrderedCounterDepth(block)
  if (counterDepth > depth) return true

  const heading = getOrderedCounterHeading(block)
  return heading > 0 && (counterHeading === 0 || counterHeading > heading)
}

export const isSameOrderedCounter = (
  block: OrderedCounterBlock,
  depth: number,
  heading: number,
) => getOrderedCounterDepth(block) === depth &&
  getOrderedCounterHeading(block) === heading

export const getOrderedCounterKey = (depth: number, heading: number) =>
  `${depth}:${heading}`
