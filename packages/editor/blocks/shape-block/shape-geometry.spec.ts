import * as Y from 'yjs'
import {normalizeShapeSnapshotProps} from './shape.types'
import {ShapeBlockComponent} from './shape.block'
import {normalizeShapeProps} from './shape.types'
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

  it('rejects invalid syntax, incomplete paths, bounds and command budgets', () => {
    for (const value of [
      'v2|1000 1000|nonzero|f:M0 0L1 1',
      'v1|0 1000|nonzero|f:M0 0L1 1',
      'v1|1000 1000|invalid|f:M0 0L1 1',
      'v1|1000 1000|nonzero|x:M0 0L1 1',
      'v1|1000 1000|nonzero|f:L0 0L1 1',
      'v1|1000 1000|nonzero|f:M0 0',
      'v1|1000 1000|nonzero|f:M0 0L1',
      'v1|1000 1000|nonzero|f:M0 0L1 1<script/>',
      'v1|1000 1000|nonzero|f:M0 0L1 1@',
      'v1|1000 1000|nonzero|f:M0 0L1e999 0',
      'v1|1000 1000|nonzero|f:M0 0L1000001 0',
      'v1|1000 1000|nonzero|f:M0 0A1 1 0 2 0 1 1',
      'v1|1000 1000|nonzero|' + Array(9).fill('s:M0 0L1 1').join('|'),
      'v1|1000 1000|nonzero|s:M0 0' + 'L1 1'.repeat(512),
      'v1|1000 1000|nonzero|s:M0 0L1 1' + ' '.repeat(65536),
    ]) expect(normalizeCustomShapeGeometry(value)).withContext(value.slice(0, 100)).toBeUndefined()
  })

  it('keeps multi-path fills, holes, negative subpixels and independent extents', () => {
    const geometry = normalizeCustomShapeGeometry({version: 1, width: 1200, height: 800,
      fillRule: 'evenodd', paths: [
        {fill: true, commands: [{type: 'move', x: -0.125, y: 0},
          {type: 'cubic', control1X: 3.141, control1Y: -10.321, control2X: 20, control2Y: 30, x: 40, y: 50}, {type: 'close'}]},
        {fill: false, commands: [{type: 'move', x: 1, y: 2}, {type: 'line', x: 3, y: 4}]},
      ]})!
    const encoded = serializeCustomShapeGeometry(geometry)!
    expect(encoded).toContain('|evenodd|f:')
    expect(encoded).toContain('|s:')
    expect(normalizeCustomShapeGeometry(encoded)).toEqual(geometry)
  })

  it('omits catalogue-equivalent snapshots but retains altered curves', () => {
    const geometry = createDefaultEditableShapeGeometry('curved-connector')!
    const base = {shape: 'curved-connector' as const, customGeometry: serializeCustomShapeGeometry(geometry)}
    expect(normalizeShapeSnapshotProps(base).customGeometry).toBeUndefined()
    geometry.width = 1200
    const customGeometry = serializeCustomShapeGeometry(geometry)
    expect(normalizeShapeSnapshotProps({...base, customGeometry}).customGeometry).toBe(customGeometry)
    expect(normalizeShapeSnapshotProps({...base, customGeometry: 'invalid' as any}).customGeometry).toBeUndefined()
  })

  it('skips unchanged commits, deletes restored presets and undoes the atomic override', () => {
    const doc = new Y.Doc(), props = doc.getMap<any>('props')
    props.set('shape', 'curved-connector')
    const undo = new Y.UndoManager(props)
    const updateObjectGeometry = jasmine.createSpy('updateObjectGeometry').and.callFake((_block, patch) => {
      doc.transact(() => patch.customGeometry === null ? props.delete('customGeometry') : props.set('customGeometry', patch.customGeometry))
      return true
    })
    const context = {isReadonly: false, doc: {placement: {updateObjectGeometry}},
      get props() { return props.toJSON() }, get shapeProps() { return normalizeShapeProps(props.toJSON()) },
    } as unknown as ShapeBlockComponent
    const preset = createDefaultEditableShapeGeometry('curved-connector')!
    const commit = (value: typeof preset) => ShapeBlockComponent.prototype.onGeometryCommit.call(context, value)
    commit(preset)
    expect(updateObjectGeometry).not.toHaveBeenCalled()
    const changed = {...preset, width: 1200}
    commit(changed)
    commit(changed)
    expect(updateObjectGeometry).toHaveBeenCalledTimes(1)
    const encoded = props.get('customGeometry')
    undo.stopCapturing()
    commit(preset)
    expect(props.has('customGeometry')).toBeFalse()
    expect(updateObjectGeometry.calls.mostRecent().args[1]).toEqual({customGeometry: null})
    undo.undo()
    expect(props.get('customGeometry')).toBe(encoded)
    undo.redo()
    expect(props.has('customGeometry')).toBeFalse()
    undo.destroy(); doc.destroy()
  })

  it('serializes one validated versioned path as an atomic props value', () => {
    const geometry = createDefaultEditableShapeGeometry('curved-connector')!
    const serialized = serializeCustomShapeGeometry(geometry)

    expect(String(serialized)).toBe('v1|1000 1000|nonzero|s:M0 800C260 800 260 200 520 200C780 200 740 800 1000 800')
    expect(normalizeCustomShapeGeometry(JSON.stringify(geometry))).toBeUndefined()
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
    expect(normalizeCustomShapeGeometry(serializeCustomShapeGeometry(geometry))).toEqual(geometry)
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
