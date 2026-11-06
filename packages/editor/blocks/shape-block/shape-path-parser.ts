import type {ShapeDefinition} from './shape-definitions'
import {SHAPE_GEOMETRY_VERSION} from './shape-geometry.constants'
import type {
  CustomShapeGeometry,
  CustomShapePath,
  ShapePathCommand,
} from './shape.types'

interface Point {
  x: number
  y: number
}

const COMMAND_ARITY: Readonly<Record<string, number>> = {
  M: 2,
  L: 2,
  H: 1,
  V: 1,
  C: 6,
  S: 4,
  Q: 4,
  T: 2,
  A: 7,
  Z: 0,
}

const TOKEN = /[A-Za-z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g

const reflect = (control: Point, around: Point): Point => ({
  x: around.x * 2 - control.x,
  y: around.y * 2 - control.y,
})

const coordinate = (value: number): number => Math.round(value * 1000) / 1000

const vectorAngle = (u: Point, v: Point): number => {
  const denominator = Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y)
  if (denominator === 0) return 0
  const cosine = Math.min(1, Math.max(-1, (u.x * v.x + u.y * v.y) / denominator))
  const angle = Math.acos(cosine)
  return u.x * v.y - u.y * v.x < 0 ? -angle : angle
}

const arcAsCubics = (
  start: Point,
  radiusX: number,
  radiusY: number,
  rotation: number,
  largeArc: boolean,
  sweep: boolean,
  end: Point,
): ShapePathCommand[] => {
  const phi = rotation * Math.PI / 180
  const cosPhi = Math.cos(phi)
  const sinPhi = Math.sin(phi)
  const halfX = (start.x - end.x) / 2
  const halfY = (start.y - end.y) / 2
  const transformedX = cosPhi * halfX + sinPhi * halfY
  const transformedY = -sinPhi * halfX + cosPhi * halfY
  let rx = Math.abs(radiusX)
  let ry = Math.abs(radiusY)
  const scale = transformedX ** 2 / rx ** 2 + transformedY ** 2 / ry ** 2
  if (scale > 1) {
    const factor = Math.sqrt(scale)
    rx *= factor
    ry *= factor
  }
  const numerator = Math.max(
    0,
    rx ** 2 * ry ** 2 - rx ** 2 * transformedY ** 2 -
      ry ** 2 * transformedX ** 2,
  )
  const denominator = rx ** 2 * transformedY ** 2 +
    ry ** 2 * transformedX ** 2
  const sign = largeArc === sweep ? -1 : 1
  const factor = denominator === 0
    ? 0
    : sign * Math.sqrt(numerator / denominator)
  const centerXPrime = factor * rx * transformedY / ry
  const centerYPrime = factor * -ry * transformedX / rx
  const center = {
    x: cosPhi * centerXPrime - sinPhi * centerYPrime +
      (start.x + end.x) / 2,
    y: sinPhi * centerXPrime + cosPhi * centerYPrime +
      (start.y + end.y) / 2,
  }
  const startVector = {
    x: (transformedX - centerXPrime) / rx,
    y: (transformedY - centerYPrime) / ry,
  }
  const endVector = {
    x: (-transformedX - centerXPrime) / rx,
    y: (-transformedY - centerYPrime) / ry,
  }
  const startAngle = vectorAngle({x: 1, y: 0}, startVector)
  let sweepAngle = vectorAngle(startVector, endVector)
  if (!sweep && sweepAngle > 0) sweepAngle -= Math.PI * 2
  if (sweep && sweepAngle < 0) sweepAngle += Math.PI * 2
  const segments = Math.max(1, Math.ceil(Math.abs(sweepAngle) / (Math.PI / 2)))
  const segmentAngle = sweepAngle / segments
  const map = (value: Point): Point => ({
    x: coordinate(center.x + rx * cosPhi * value.x - ry * sinPhi * value.y),
    y: coordinate(center.y + rx * sinPhi * value.x + ry * cosPhi * value.y),
  })
  return Array.from({length: segments}, (_, index) => {
    const from = startAngle + index * segmentAngle
    const to = from + segmentAngle
    const alpha = 4 / 3 * Math.tan((to - from) / 4)
    const control1 = map({
      x: Math.cos(from) - alpha * Math.sin(from),
      y: Math.sin(from) + alpha * Math.cos(from),
    })
    const control2 = map({
      x: Math.cos(to) + alpha * Math.sin(to),
      y: Math.sin(to) - alpha * Math.cos(to),
    })
    const target = index === segments - 1
      ? {x: coordinate(end.x), y: coordinate(end.y)}
      : map({x: Math.cos(to), y: Math.sin(to)})
    return {
      type: 'cubic',
      control1X: control1.x,
      control1Y: control1.y,
      control2X: control2.x,
      control2Y: control2.y,
      x: target.x,
      y: target.y,
    }
  })
}

const quadraticAsCubic = (
  start: Point,
  control: Point,
  end: Point,
): ShapePathCommand => ({
  type: 'cubic',
  control1X: coordinate(start.x + (control.x - start.x) * 2 / 3),
  control1Y: coordinate(start.y + (control.y - start.y) * 2 / 3),
  control2X: coordinate(end.x + (control.x - end.x) * 2 / 3),
  control2Y: coordinate(end.y + (control.y - end.y) * 2 / 3),
  x: end.x,
  y: end.y,
})

export function parseTrustedShapePath(pathData: string): ShapePathCommand[] | null {
  const tokens = pathData.match(TOKEN) ?? []
  const commands: ShapePathCommand[] = []
  let index = 0
  let commandName = ''
  let current: Point = {x: 0, y: 0}
  let subpathStart: Point = current
  let previousCubicControl: Point | null = null
  let previousQuadraticControl: Point | null = null

  const number = (): number | null => {
    const token = tokens[index++]
    const value = Number(token)
    return token !== undefined && Number.isFinite(value) ? value : null
  }

  while (index < tokens.length) {
    const token = tokens[index]!
    if (/^[A-Za-z]$/.test(token)) {
      commandName = token
      index += 1
    }
    if (!commandName) return null
    const upper = commandName.toUpperCase()
    const arity = COMMAND_ARITY[upper]
    if (arity === undefined || commandName !== upper) return null
    if (upper === 'Z') {
      commands.push({type: 'close'})
      current = subpathStart
      previousCubicControl = null
      previousQuadraticControl = null
      commandName = ''
      continue
    }
    if (index + arity > tokens.length) return null

    if (upper === 'M' || upper === 'L' || upper === 'T') {
      const x = number()
      const y = number()
      if (x === null || y === null) return null
      const end = {x, y}
      if (upper === 'M') {
        commands.push({type: 'move', x, y})
        subpathStart = end
        commandName = 'L'
      } else if (upper === 'T') {
        const control: Point = previousQuadraticControl
          ? reflect(previousQuadraticControl, current)
          : current
        commands.push(quadraticAsCubic(current, control, end))
        previousQuadraticControl = control
      } else {
        commands.push({type: 'line', x, y})
        previousQuadraticControl = null
      }
      current = end
      previousCubicControl = null
      continue
    }

    if (upper === 'H' || upper === 'V') {
      const value = number()
      if (value === null) return null
      current = upper === 'H'
        ? {x: value, y: current.y}
        : {x: current.x, y: value}
      commands.push({type: 'line', ...current})
      previousCubicControl = null
      previousQuadraticControl = null
      continue
    }

    if (upper === 'C' || upper === 'S') {
      let control1: Point
      if (upper === 'C') {
        const x = number()
        const y = number()
        if (x === null || y === null) return null
        control1 = {x, y}
      } else {
        control1 = previousCubicControl
          ? reflect(previousCubicControl, current)
          : current
      }
      const control2X = number()
      const control2Y = number()
      const x = number()
      const y = number()
      if (
        control2X === null || control2Y === null ||
        x === null || y === null
      ) return null
      commands.push({
        type: 'cubic',
        control1X: control1.x,
        control1Y: control1.y,
        control2X,
        control2Y,
        x,
        y,
      })
      current = {x, y}
      previousCubicControl = {x: control2X, y: control2Y}
      previousQuadraticControl = null
      continue
    }

    if (upper === 'Q') {
      const controlX = number()
      const controlY = number()
      const x = number()
      const y = number()
      if (controlX === null || controlY === null || x === null || y === null) {
        return null
      }
      const control = {x: controlX, y: controlY}
      const end = {x, y}
      commands.push(quadraticAsCubic(current, control, end))
      current = end
      previousQuadraticControl = control
      previousCubicControl = null
      continue
    }

    if (upper === 'A') {
      const radiusX = number()
      const radiusY = number()
      const rotation = number()
      const largeArc = number()
      const sweep = number()
      const x = number()
      const y = number()
      if (
        radiusX === null || radiusY === null || rotation === null ||
        largeArc === null || sweep === null || x === null || y === null ||
        radiusX <= 0 || radiusY <= 0 ||
        (largeArc !== 0 && largeArc !== 1) || (sweep !== 0 && sweep !== 1)
      ) return null
      const end = {x, y}
      commands.push(...arcAsCubics(
        current,
        radiusX,
        radiusY,
        rotation,
        largeArc === 1,
        sweep === 1,
        end,
      ))
      current = end
      previousCubicControl = null
      previousQuadraticControl = null
      continue
    }
    return null
  }

  return commands.length >= 2 && commands[0]?.type === 'move'
    ? commands
    : null
}

const definitionPath = (
  pathData: string,
  fill: boolean,
): CustomShapePath | null => {
  const commands = parseTrustedShapePath(pathData)
  return commands ? {fill, commands} : null
}

export function createEditableShapeGeometryFromDefinition(
  definition: ShapeDefinition,
): CustomShapeGeometry | undefined {
  const main = definitionPath(definition.path, definition.fillable !== false)
  if (!main) return undefined
  const detail = definition.detailPath
    ? definitionPath(definition.detailPath, false)
    : null
  if (definition.detailPath && !detail) return undefined
  return {
    version: SHAPE_GEOMETRY_VERSION,
    width: 1000,
    height: 1000,
    ...(definition.fillRule ? {fillRule: definition.fillRule} : {}),
    paths: [main, ...(detail ? [detail] : [])],
  }
}
