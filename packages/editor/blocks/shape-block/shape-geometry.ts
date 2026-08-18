import type {ShapeDefinition} from './shape-definitions'
import {resolveShapeAdjustmentProjection} from './shape-adjustments'
import {SHAPE_GEOMETRY_VERSION} from './shape-geometry.constants'
import type {
  CustomShapeGeometry,
  CustomShapePath,
  ShapeAdjustmentValues,
  ShapeCubicPathCommand,
  ShapeKind,
  ShapePathCommand,
  SerializedCustomShapeGeometry,
} from './shape.types'

const MAX_ADJUSTMENTS = 32
const MAX_PATHS = 8
const MAX_PATH_COMMANDS = 512
const MAX_SERIALIZED_GEOMETRY_LENGTH = 64 * 1024
const MAX_COORDINATE = 1_000_000
const ADJUSTMENT_NAME = /^[A-Za-z][A-Za-z0-9_-]{0,31}$/

const EDITABLE_GEOMETRY_KINDS = new Set<ShapeKind>([
  'line',
  'line-arrow',
  'line-double-arrow',
  'elbow-connector',
  'elbow-arrow-connector',
  'curved-connector',
  'curved-arrow-connector',
  'scribble',
])

const finiteCoordinate = (value: unknown): number | null => {
  const number = Number(value)
  if (!Number.isFinite(number) || Math.abs(number) > MAX_COORDINATE) {
    return null
  }
  return Math.round(number * 1000) / 1000
}

const finiteExtent = (value: unknown): number | null => {
  const number = finiteCoordinate(value)
  return number !== null && number > 0 ? number : null
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const normalizeCommand = (value: unknown): ShapePathCommand | null => {
  if (!isRecord(value) || typeof value['type'] !== 'string') return null
  if (value['type'] === 'close') return {type: 'close'}
  const x = finiteCoordinate(value['x'])
  const y = finiteCoordinate(value['y'])
  if (x === null || y === null) return null
  if (value['type'] === 'move' || value['type'] === 'line') {
    return {type: value['type'], x, y}
  }
  if (value['type'] === 'arc') {
    const radiusX = finiteExtent(value['radiusX'])
    const radiusY = finiteExtent(value['radiusY'])
    const rotation = finiteCoordinate(value['rotation'])
    if (
      radiusX === null || radiusY === null || rotation === null ||
      typeof value['largeArc'] !== 'boolean' ||
      typeof value['sweep'] !== 'boolean'
    ) return null
    return {
      type: 'arc',
      radiusX,
      radiusY,
      rotation,
      largeArc: value['largeArc'] === true,
      sweep: value['sweep'] === true,
      x,
      y,
    }
  }
  if (value['type'] !== 'cubic') return null
  const control1X = finiteCoordinate(value['control1X'])
  const control1Y = finiteCoordinate(value['control1Y'])
  const control2X = finiteCoordinate(value['control2X'])
  const control2Y = finiteCoordinate(value['control2Y'])
  if (
    control1X === null || control1Y === null ||
    control2X === null || control2Y === null
  ) {
    return null
  }
  return {
    type: 'cubic',
    control1X,
    control1Y,
    control2X,
    control2Y,
    x,
    y,
  }
}

const normalizePath = (value: unknown): CustomShapePath | null => {
  if (!isRecord(value) || !Array.isArray(value['commands'])) return null
  const commands = value['commands'].map(normalizeCommand)
  if (
    commands.length < 2 ||
    commands.some(command => command === null) ||
    commands[0]?.type !== 'move'
  ) {
    return null
  }
  return {
    fill: value['fill'] === true,
    commands: commands as ShapePathCommand[],
  }
}

export function normalizeShapeAdjustments(
  value: unknown,
): ShapeAdjustmentValues | undefined {
  if (!isRecord(value)) return undefined
  const entries = Object.entries(value)
  if (entries.length === 0 || entries.length > MAX_ADJUSTMENTS) {
    return undefined
  }
  const values: Record<string, number> = {}
  for (const [name, raw] of entries) {
    const number = finiteCoordinate(raw)
    if (!ADJUSTMENT_NAME.test(name) || number === null) return undefined
    values[name] = number
  }
  return values
}

export function normalizeCustomShapeGeometry(
  value: unknown,
): CustomShapeGeometry | undefined {
  if (typeof value === 'string') {
    if (value.length > MAX_SERIALIZED_GEOMETRY_LENGTH) return undefined
    try {
      value = JSON.parse(value)
    } catch {
      return undefined
    }
  }
  if (!isRecord(value) || value['version'] !== SHAPE_GEOMETRY_VERSION) {
    return undefined
  }
  let serializedLength = 0
  try {
    serializedLength = JSON.stringify(value).length
  } catch {
    return undefined
  }
  if (serializedLength > MAX_SERIALIZED_GEOMETRY_LENGTH) return undefined
  const width = finiteExtent(value['width'])
  const height = finiteExtent(value['height'])
  const rawPaths = value['paths']
  if (
    width === null || height === null ||
    !Array.isArray(rawPaths) || rawPaths.length === 0 ||
    rawPaths.length > MAX_PATHS
  ) {
    return undefined
  }
  const paths = rawPaths.map(normalizePath)
  if (paths.some(path => path === null)) return undefined
  const commandCount = paths.reduce(
    (count, path) => count + (path?.commands.length ?? 0),
    0,
  )
  if (commandCount > MAX_PATH_COMMANDS) return undefined
  return {
    version: SHAPE_GEOMETRY_VERSION,
    width,
    height,
    ...(value['fillRule'] === 'evenodd' ? {fillRule: 'evenodd' as const} : {}),
    paths: paths as CustomShapePath[],
  }
}

export function serializeCustomShapeGeometry(
  value: unknown,
): SerializedCustomShapeGeometry | undefined {
  const normalized = normalizeCustomShapeGeometry(value)
  return normalized
    ? JSON.stringify(normalized) as SerializedCustomShapeGeometry
    : undefined
}

export function shapePathCommandsToSvgData(
  commands: readonly ShapePathCommand[],
): string {
  return commands.map(command => {
    if (command.type === 'close') return 'Z'
    if (command.type === 'move') return `M${command.x} ${command.y}`
    if (command.type === 'line') return `L${command.x} ${command.y}`
    if (command.type === 'arc') {
      return `A${command.radiusX} ${command.radiusY} ${command.rotation} ` +
        `${command.largeArc ? 1 : 0} ${command.sweep ? 1 : 0} ` +
        `${command.x} ${command.y}`
    }
    return `C${command.control1X} ${command.control1Y} ` +
      `${command.control2X} ${command.control2Y} ${command.x} ${command.y}`
  }).join('')
}

const path = (...commands: ShapePathCommand[]): CustomShapeGeometry => ({
  version: SHAPE_GEOMETRY_VERSION,
  width: 1000,
  height: 1000,
  paths: [{fill: false, commands}],
})

export function createDefaultEditableShapeGeometry(
  shapeType: ShapeKind,
): CustomShapeGeometry | undefined {
  switch (shapeType) {
    case 'line':
    case 'line-arrow':
    case 'line-double-arrow':
      return path(
        {type: 'move', x: 0, y: 500},
        {type: 'line', x: 1000, y: 500},
      )
    case 'elbow-connector':
    case 'elbow-arrow-connector':
      return path(
        {type: 'move', x: 0, y: 200},
        {type: 'line', x: 520, y: 200},
        {type: 'line', x: 520, y: 800},
        {type: 'line', x: 1000, y: 800},
      )
    case 'curved-connector':
    case 'curved-arrow-connector':
      return path(
        {type: 'move', x: 0, y: 800},
        {
          type: 'cubic',
          control1X: 260,
          control1Y: 800,
          control2X: 260,
          control2Y: 200,
          x: 520,
          y: 200,
        },
        {
          type: 'cubic',
          control1X: 780,
          control1Y: 200,
          control2X: 740,
          control2Y: 800,
          x: 1000,
          y: 800,
        },
      )
    case 'scribble':
      return path(
        {type: 'move', x: 0, y: 620},
        {
          type: 'cubic',
          control1X: 100,
          control1Y: 160,
          control2X: 220,
          control2Y: 900,
          x: 340,
          y: 420,
        },
        {
          type: 'cubic',
          control1X: 460,
          control1Y: -60,
          control2X: 540,
          control2Y: 160,
          x: 620,
          y: 610,
        },
        {
          type: 'cubic',
          control1X: 700,
          control1Y: 1060,
          control2X: 830,
          control2Y: 900,
          x: 1000,
          y: 300,
        },
      )
    default:
      return undefined
  }
}

export function isEditableShapeGeometryKind(shapeType: ShapeKind): boolean {
  return EDITABLE_GEOMETRY_KINDS.has(shapeType)
}

interface Point {
  x: number
  y: number
}

const commandPoint = (command: ShapePathCommand): Point | null =>
  command.type === 'close' ? null : {x: command.x, y: command.y}

const arrowPath = (tip: Point, neighbour: Point, size: number): string => {
  const dx = tip.x - neighbour.x
  const dy = tip.y - neighbour.y
  const length = Math.hypot(dx, dy)
  if (length < 0.001) return ''
  const ux = dx / length
  const uy = dy / length
  const baseX = tip.x - ux * size
  const baseY = tip.y - uy * size
  const wing = size * 0.55
  const px = -uy * wing
  const py = ux * wing
  return `M${baseX + px} ${baseY + py}L${tip.x} ${tip.y}` +
    `L${baseX - px} ${baseY - py}`
}

const endpointTangent = (
  commands: readonly ShapePathCommand[],
  end: 'start' | 'end',
): {tip: Point; neighbour: Point} | null => {
  const drawable = commands.filter(command => command.type !== 'close')
  if (drawable.length < 2) return null
  if (end === 'start') {
    const first = commandPoint(drawable[0]!)
    const second = drawable[1]!
    const neighbour = second.type === 'cubic'
      ? {x: second.control1X, y: second.control1Y}
      : commandPoint(second)
    return first && neighbour ? {tip: first, neighbour} : null
  }
  const last = drawable[drawable.length - 1]!
  const tip = commandPoint(last)
  const previous = last.type === 'cubic'
    ? {x: last.control2X, y: last.control2Y}
    : commandPoint(drawable[drawable.length - 2]!)
  return tip && previous ? {tip, neighbour: previous} : null
}

export interface ResolvedShapeRenderPath {
  d: string
  fillable: boolean
}

export interface ResolvedShapeRenderGeometry {
  viewBox: string
  paths: readonly ResolvedShapeRenderPath[]
  fillRule?: 'evenodd'
}

export function resolveShapeRenderGeometry(
  shapeType: ShapeKind,
  definition: ShapeDefinition,
  customGeometry?: CustomShapeGeometry,
  adjustments?: ShapeAdjustmentValues,
): ResolvedShapeRenderGeometry {
  if (!customGeometry) {
    const adjusted = resolveShapeAdjustmentProjection(shapeType, adjustments)
    if (adjusted) {
      return {
        viewBox: '0 0 1000 1000',
        paths: [{d: adjusted.path, fillable: definition.fillable !== false}],
        fillRule: definition.fillRule,
      }
    }
    return {
      viewBox: '0 0 1000 1000',
      paths: [
        {d: definition.path, fillable: definition.fillable !== false},
        ...(definition.detailPath
          ? [{d: definition.detailPath, fillable: false}]
          : []),
      ],
      fillRule: definition.fillRule,
    }
  }

  const arrowStart = shapeType === 'line-double-arrow'
  const arrowEnd = shapeType === 'line-arrow' ||
    shapeType === 'line-double-arrow' ||
    shapeType === 'elbow-arrow-connector' ||
    shapeType === 'curved-arrow-connector'
  const paths = customGeometry.paths.map((item, index) => {
    let d = shapePathCommandsToSvgData(item.commands)
    if (index === 0 && (arrowStart || arrowEnd)) {
      const size = Math.max(customGeometry.width, customGeometry.height) * 0.1
      if (arrowStart) {
        const tangent = endpointTangent(item.commands, 'start')
        if (tangent) d += arrowPath(tangent.tip, tangent.neighbour, size)
      }
      if (arrowEnd) {
        const tangent = endpointTangent(item.commands, 'end')
        if (tangent) d += arrowPath(tangent.tip, tangent.neighbour, size)
      }
    }
    return {d, fillable: item.fill}
  })
  return {
    viewBox: `0 0 ${customGeometry.width} ${customGeometry.height}`,
    paths,
    fillRule: customGeometry.fillRule,
  }
}

export interface ShapeGeometryHandle {
  id: string
  pathIndex: number
  commandIndex: number
  point: 'node' | 'control1' | 'control2'
  x: number
  y: number
  control: boolean
}

export interface ShapeGeometryControlLine {
  id: string
  x1: number
  y1: number
  x2: number
  y2: number
}

export function getShapeGeometryHandles(geometry: CustomShapeGeometry): {
  handles: ShapeGeometryHandle[]
  controlLines: ShapeGeometryControlLine[]
} {
  const handles: ShapeGeometryHandle[] = []
  const controlLines: ShapeGeometryControlLine[] = []
  geometry.paths.forEach((item, pathIndex) => {
    let previous: Point | null = null
    item.commands.forEach((command, commandIndex) => {
      if (command.type === 'close') return
      if (command.type === 'cubic' && previous) {
        handles.push({
          id: `${pathIndex}:${commandIndex}:control1`,
          pathIndex,
          commandIndex,
          point: 'control1',
          x: command.control1X,
          y: command.control1Y,
          control: true,
        }, {
          id: `${pathIndex}:${commandIndex}:control2`,
          pathIndex,
          commandIndex,
          point: 'control2',
          x: command.control2X,
          y: command.control2Y,
          control: true,
        })
        controlLines.push({
          id: `${pathIndex}:${commandIndex}:in`,
          x1: previous.x,
          y1: previous.y,
          x2: command.control1X,
          y2: command.control1Y,
        }, {
          id: `${pathIndex}:${commandIndex}:out`,
          x1: command.x,
          y1: command.y,
          x2: command.control2X,
          y2: command.control2Y,
        })
      }
      handles.push({
        id: `${pathIndex}:${commandIndex}:node`,
        pathIndex,
        commandIndex,
        point: 'node',
        x: command.x,
        y: command.y,
        control: false,
      })
      previous = {x: command.x, y: command.y}
    })
  })
  return {handles, controlLines}
}

export function cloneCustomShapeGeometry(
  geometry: CustomShapeGeometry,
): CustomShapeGeometry {
  return {
    ...geometry,
    paths: geometry.paths.map(item => ({
      ...item,
      commands: item.commands.map(command => ({...command})),
    })),
  }
}

const moveCubicControl = (
  command: ShapeCubicPathCommand,
  point: 'control1' | 'control2',
  x: number,
  y: number,
): void => {
  if (point === 'control1') {
    command.control1X = x
    command.control1Y = y
  } else {
    command.control2X = x
    command.control2Y = y
  }
}

export function updateShapeGeometryHandle(
  geometry: CustomShapeGeometry,
  handle: ShapeGeometryHandle,
  x: number,
  y: number,
): CustomShapeGeometry {
  const next = cloneCustomShapeGeometry(geometry)
  const commands = next.paths[handle.pathIndex]?.commands
  const command = commands?.[handle.commandIndex]
  if (!commands || !command || command.type === 'close') return next
  if (handle.point !== 'node') {
    if (command.type === 'cubic') {
      moveCubicControl(command, handle.point, x, y)
    }
    return next
  }

  const deltaX = x - command.x
  const deltaY = y - command.y
  command.x = x
  command.y = y
  if (command.type === 'cubic') {
    command.control2X += deltaX
    command.control2Y += deltaY
  }
  const nextCommand = commands[handle.commandIndex + 1]
  if (nextCommand?.type === 'cubic') {
    nextCommand.control1X += deltaX
    nextCommand.control1Y += deltaY
  }
  return next
}
