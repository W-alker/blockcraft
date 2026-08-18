import {getShapeDefinition} from './shape-definitions'
import {
  createDefaultEditableShapeGeometry,
  getShapeGeometryHandles,
  normalizeCustomShapeGeometry,
  normalizeShapeAdjustments,
  resolveShapeRenderGeometry,
  serializeCustomShapeGeometry,
  shapePathCommandsToSvgData,
  updateShapeGeometryHandle,
} from './shape-geometry'
import type {ShapeCubicPathCommand} from './shape.types'

describe('Shape custom geometry', () => {
  it('serializes one validated versioned path as an atomic props value', () => {
    const geometry = createDefaultEditableShapeGeometry('curved-connector')!
    const serialized = serializeCustomShapeGeometry(geometry)

    expect(typeof serialized).toBe('string')
    expect(normalizeCustomShapeGeometry(serialized)).toEqual(geometry)
    expect(normalizeCustomShapeGeometry('{"version":2}')).toBeUndefined()
    expect(normalizeCustomShapeGeometry({
      ...geometry,
      paths: [{fill: false, commands: [
        {type: 'move', x: 0, y: 0},
        {type: 'script', x: 10, y: 10},
      ]}],
    })).toBeUndefined()
  })

  it('keeps adjustment values flat, finite and name constrained', () => {
    expect(normalizeShapeAdjustments({headWidth: 320, radius: 0.25}))
      .toEqual({headWidth: 320, radius: 0.25})
    expect(normalizeShapeAdjustments({'bad name': 10})).toBeUndefined()
    expect(normalizeShapeAdjustments({radius: Number.NaN})).toBeUndefined()
  })

  it('projects line and cubic commands without accepting raw SVG markup', () => {
    const geometry = createDefaultEditableShapeGeometry('curved-connector')!
    const path = shapePathCommandsToSvgData(geometry.paths[0]!.commands)

    expect(path).toContain('M0 800')
    expect(path).toContain('C260 800 260 200 520 200')
    expect(path).not.toContain('<')
  })

  it('validates and projects safe arc commands', () => {
    const geometry = normalizeCustomShapeGeometry({
      version: 1,
      width: 1000,
      height: 1000,
      paths: [{
        fill: true,
        commands: [
          {type: 'move', x: 500, y: 0},
          {
            type: 'arc',
            radiusX: 500,
            radiusY: 500,
            rotation: 0,
            largeArc: true,
            sweep: true,
            x: 499.9,
            y: 0,
          },
          {type: 'close'},
        ],
      }],
    })!

    expect(shapePathCommandsToSvgData(geometry.paths[0]!.commands))
      .toContain('A500 500 0 1 1 499.9 0')
  })

  it('derives arrowheads while retaining an editable centerline', () => {
    const geometry = createDefaultEditableShapeGeometry('line-double-arrow')!
    const resolved = resolveShapeRenderGeometry(
      'line-double-arrow',
      getShapeDefinition('line-double-arrow'),
      geometry,
    )

    expect(resolved.viewBox).toBe('0 0 1000 1000')
    expect(resolved.paths).toHaveSize(1)
    expect(resolved.paths[0]!.d.match(/M/g)?.length).toBe(3)
    expect(resolved.paths[0]!.fillable).toBeFalse()
  })

  it('moves a curve node and its adjacent handles as one local intent', () => {
    const geometry = createDefaultEditableShapeGeometry('curved-connector')!
    const projection = getShapeGeometryHandles(geometry)
    const middleNode = projection.handles.find(handle =>
      handle.commandIndex === 1 && handle.point === 'node'
    )!
    const next = updateShapeGeometryHandle(geometry, middleNode, 600, 260)
    const firstCurve = next.paths[0]!.commands[1] as ShapeCubicPathCommand
    const secondCurve = next.paths[0]!.commands[2] as ShapeCubicPathCommand

    expect(firstCurve.x).toBe(600)
    expect(firstCurve.y).toBe(260)
    expect(firstCurve.control2X).toBe(340)
    expect(firstCurve.control2Y).toBe(260)
    expect(secondCurve.control1X).toBe(860)
    expect(secondCurve.control1Y).toBe(260)
    expect(geometry.paths[0]!.commands[1]).toEqual(jasmine.objectContaining({
      x: 520,
      y: 200,
    }))
  })
})
