import {BlockNodeType, type IBlockSnapshot} from '../framework'
import {materializeTemplateSnapshots} from
  '../../../apps/playground/src/app/template-deco/core/materialize-template'
import {
  MATERIALS,
  type Material,
} from '../../../apps/playground/src/app/template-deco/core/registry'
import {MaterialKind} from
  '../../../apps/playground/src/app/template-deco/core/deco.category'

const dynamicSnapshot = (
  id: string,
  flavour: 'weather' | 'date-card' | 'person-card',
  meta: Record<string, unknown>,
): IBlockSnapshot => ({
  id,
  flavour,
  nodeType: BlockNodeType.void,
  props: {width: 160, height: 42},
  meta,
  children: [],
} as IBlockSnapshot)

describe('template dynamic materialization', () => {
  it('registers only canonical dynamic block flavours with draft meta', () => {
    const blocks = MATERIALS.filter(
      (material): material is Extract<Material, {kind: MaterialKind.Block}> =>
        material.kind === MaterialKind.Block,
    )

    expect(blocks.map(material => material.flavour)).toEqual([
      'weather',
      'date-card',
      'person-card',
      'logo',
    ])
    expect(blocks.some(material => material.flavour.startsWith('template-')))
      .toBeFalse()
    expect(blocks[0].initMeta).toEqual({'draft:date': 'createdTime'})
    expect(blocks[1].initMeta).toEqual({'draft:date': 'createdTime'})
    expect(blocks[2].initMeta).toEqual({'draft:source': 'creator'})
  })

  it('turns draft meta into real document props and removes the draft keys', () => {
    const children = materializeTemplateSnapshots([
      dynamicSnapshot('weather', 'weather', {'draft:date': 'createdTime'}),
      dynamicSnapshot('date', 'date-card', {'draft:date': 'updatedTime'}),
      dynamicSnapshot('person', 'person-card', {'draft:source': 'creator'}),
    ], {
      createdAt: new Date(2026, 7, 28, 9, 0, 0),
      updatedAt: new Date(2026, 7, 29, 9, 0, 0),
      creator: {
        name: '张三',
        avatar: 'https://example.com/avatar.png',
        description: '产品部',
      },
    })

    expect(children[0].props['date']).toBe('2026-08-28')
    expect(children[1].props['date']).toBe('2026-08-29')
    expect(children[2].props['source']).toBe('creator')
    expect(JSON.parse(String(children[2].props['person']))).toEqual({
      name: '张三',
      avatar: 'https://example.com/avatar.png',
      description: '产品部',
    })
    expect(children.every(child =>
      Object.keys(child.meta).every(key => !key.startsWith('draft:')),
    )).toBeTrue()
  })

  it('materializes canonical blocks recursively without mutating the template', () => {
    const weather = dynamicSnapshot(
      'weather',
      'weather',
      {'draft:date': 'createdTime'},
    )
    const container = {
      id: 'container',
      flavour: 'callout',
      nodeType: BlockNodeType.block,
      props: {},
      meta: {},
      children: [weather],
    } as IBlockSnapshot

    const [materialized] = materializeTemplateSnapshots([container], {
      createdAt: new Date(2026, 7, 28),
      creator: {name: '张三'},
    })
    const child = (materialized.children as IBlockSnapshot[])[0]

    expect(child.props['date']).toBe('2026-08-28')
    expect(weather.props['date']).toBeUndefined()
    expect(weather.meta['draft:date']).toBe('createdTime')
  })
})
