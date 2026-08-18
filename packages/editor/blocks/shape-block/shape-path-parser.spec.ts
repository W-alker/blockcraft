import {SHAPE_DEFINITIONS} from './shape-definitions'
import {
  createEditableShapeGeometryFromDefinition,
  parseTrustedShapePath,
} from './shape-path-parser'
import {
  normalizeCustomShapeGeometry,
  serializeCustomShapeGeometry,
  shapePathCommandsToSvgData,
} from './shape-geometry'

describe('Trusted catalogue path projection', () => {
  it('projects every built-in Shape definition into validated editable geometry', () => {
    expect(SHAPE_DEFINITIONS).toHaveSize(103)

    for (const definition of SHAPE_DEFINITIONS) {
      const geometry = createEditableShapeGeometryFromDefinition(definition)
      expect(geometry).withContext(definition.type).toBeDefined()
      const serialized = serializeCustomShapeGeometry(geometry)
      expect(serialized).withContext(definition.type).toBeDefined()
      expect(normalizeCustomShapeGeometry(serialized))
        .withContext(definition.type)
        .toEqual(geometry)
    }
  })

  it('keeps every projected catalogue path visually aligned in SVG', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    document.body.appendChild(svg)
    try {
      for (const definition of SHAPE_DEFINITIONS) {
        const geometry = createEditableShapeGeometryFromDefinition(definition)!
        const sources = [definition.path, definition.detailPath].filter(
          (path): path is string => !!path,
        )
        sources.forEach((source, index) => {
          const original = document.createElementNS(
            'http://www.w3.org/2000/svg',
            'path',
          )
          const projected = document.createElementNS(
            'http://www.w3.org/2000/svg',
            'path',
          )
          original.setAttribute('d', source)
          projected.setAttribute(
            'd',
            shapePathCommandsToSvgData(geometry.paths[index]!.commands),
          )
          svg.append(original, projected)
          const originalLength = original.getTotalLength()
          const projectedLength = projected.getTotalLength()
          expect(Math.abs(projectedLength - originalLength))
            .withContext(`${definition.type}:${index}:length`)
            .toBeLessThan(Math.max(0.5, originalLength * 0.001))
          for (const ratio of [0, 0.25, 0.5, 0.75, 1]) {
            const a = original.getPointAtLength(originalLength * ratio)
            const b = projected.getPointAtLength(projectedLength * ratio)
            expect(Math.hypot(a.x - b.x, a.y - b.y))
              .withContext(`${definition.type}:${index}:${ratio}`)
              .toBeLessThan(1.5)
          }
          original.remove()
          projected.remove()
        })
      }
    } finally {
      svg.remove()
    }
  })

  it('converts quadratic and smooth commands into editable cubic controls', () => {
    const commands = parseTrustedShapePath(
      'M0 0Q100 0 100 100T200 200S300 300 400 200',
    )!

    expect(commands.map(command => command.type))
      .toEqual(['move', 'cubic', 'cubic', 'cubic'])
    expect(shapePathCommandsToSvgData(commands)).not.toContain('Q')
    expect(shapePathCommandsToSvgData(commands)).not.toContain('S')
  })

  it('projects catalogue arcs into distributed cubic nodes', () => {
    const commands = parseTrustedShapePath('M500 0A500 500 0 1 1 499.9 0Z')!

    expect(commands.filter(command => command.type === 'cubic').length)
      .toBe(4)
    expect(shapePathCommandsToSvgData(commands)).not.toContain('A')
    expect(parseTrustedShapePath('M0 0A10 10 0 2 0 20 20'))
      .toBeNull()
  })

  it('retains even-odd holes for compound catalogue shapes', () => {
    const donut = SHAPE_DEFINITIONS.find(definition => definition.type === 'donut')!
    const geometry = createEditableShapeGeometryFromDefinition(donut)!

    expect(geometry.fillRule).toBe('evenodd')
    expect(normalizeCustomShapeGeometry(serializeCustomShapeGeometry(geometry))
      ?.fillRule).toBe('evenodd')
  })

  it('rejects relative or unknown commands at the trusted-code boundary', () => {
    expect(parseTrustedShapePath('m0 0l10 10')).toBeNull()
    expect(parseTrustedShapePath('M0 0R10 10')).toBeNull()
  })
})
