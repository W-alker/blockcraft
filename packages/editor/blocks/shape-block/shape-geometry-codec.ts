import type {CustomShapeGeometry, CustomShapePath, ShapePathCommand} from './shape.types'

const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i
const TOKEN = /[MLCAZ]|[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gy
const ARITY: Readonly<Record<string, number>> = {M: 2, L: 2, C: 6, A: 7, Z: 0}

/** Parse only our explicit absolute path subset, consuming every input byte. */
function decodePath(data: string, limit: number): ShapePathCommand[] | undefined {
  const tokens: string[] = []
  let offset = 0
  while (offset < data.length) {
    if (/\s/.test(data[offset]!)) { offset++; continue }
    TOKEN.lastIndex = offset
    const match = TOKEN.exec(data)
    if (!match || tokens.length >= limit * 8) return undefined
    tokens.push(match[0])
    offset = TOKEN.lastIndex
  }
  const commands: ShapePathCommand[] = []
  let index = 0
  while (index < tokens.length) {
    if (commands.length >= limit) return undefined
    const name = tokens[index++]!
    const arity = ARITY[name]
    if (arity === undefined || index + arity > tokens.length) return undefined
    const values: number[] = []
    for (let i = 0; i < arity; i++) {
      const token = tokens[index++]!
      if (!NUMBER.test(token)) return undefined
      values.push(Number(token))
    }
    const [a, b, c, d, e, f, g] = values as [number, number, number, number, number, number, number]
    if (name === 'M' || name === 'L') commands.push({type: name === 'M' ? 'move' : 'line', x: a, y: b})
    else if (name === 'C') commands.push({type: 'cubic', control1X: a, control1Y: b, control2X: c, control2Y: d, x: e, y: f})
    else if (name === 'A') {
      if ((d !== 0 && d !== 1) || (e !== 0 && e !== 1)) return undefined
      commands.push({type: 'arc', radiusX: a, radiusY: b, rotation: c, largeArc: d === 1, sweep: e === 1, x: f, y: g})
    } else commands.push({type: 'close'})
  }
  return commands.length >= 2 && commands[0]?.type === 'move' ? commands : undefined
}

/** Numeric bounds and rounding belong to the shared geometry normalizer. */
export function decodeCompactShapeGeometry(
  value: string, maxPaths: number, maxCommands: number,
): CustomShapeGeometry | undefined {
  const [version, extent, fillRule, ...parts] = value.split('|')
  if (version !== 'v1' || (fillRule !== 'nonzero' && fillRule !== 'evenodd') ||
    !parts.length || parts.length > maxPaths) return undefined
  const dimensions = extent?.trim().split(/\s+/)
  if (dimensions?.length !== 2 || dimensions.some(value => !NUMBER.test(value))) return undefined
  const paths: CustomShapePath[] = []
  let commandCount = 0
  for (const part of parts) {
    if (!/^[fs]:/.test(part)) return undefined
    const commands = decodePath(part.slice(2), maxCommands - commandCount)
    if (!commands) return undefined
    commandCount += commands.length
    paths.push({fill: part[0] === 'f', commands})
  }
  return {version: 1, width: Number(dimensions[0]), height: Number(dimensions[1]),
    ...(fillRule === 'evenodd' ? {fillRule} : {}), paths}
}
