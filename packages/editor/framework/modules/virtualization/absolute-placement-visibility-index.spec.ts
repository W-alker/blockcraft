import {BlockNodeType} from '../../block-std'
import {AbsolutePlacementVisibilityIndex} from './absolute-placement-visibility-index'

describe('AbsolutePlacementVisibilityIndex', () => {
  it('projects persisted root-relative y and model media height', () => {
    const doc = createDoc({
      root: block('root', ['layout']),
      layout: block('placement-layout', ['image']),
      image: block('image', [], {
        position: "25 600",
        wr: 50,
        ar: 2,
      }),
    })
    doc.objectSizing.resolve.and.callFake((flavour: string) =>
      flavour === 'image'
        ? {
            width: 400,
            height: 200,
            wr: 50,
            ar: 2,
            source: 'ratio',
            exact: true,
          }
        : null,
    )
    const index = new AbsolutePlacementVisibilityIndex(doc as any)

    index.rebuild(['layout'])

    expect(index.bottom).toBeGreaterThan(0)
    expect(index.visibleLayoutIds(0, 100, 100)).toEqual([])
    expect(index.visibleLayoutIds(450, 100, 100)).toEqual(['layout'])
    expect(index.visibleLayoutIds(801, 100, 0)).toEqual([])
  })

  it('expands a rotated fixed-size shape around its root-relative y', () => {
    const doc = createDoc({
      root: block('root', ['layout']),
      layout: block('placement-layout', ['shape']),
      shape: block('shape', [], {
        position: "0 400",
        width: 200,
        height: 100,
        rotation: 90,
      }),
    })
    const index = new AbsolutePlacementVisibilityIndex(doc as any)

    index.rebuild(['layout'])

    // A 90° rotation grows the visual vertical extent from 100px to 200px,
    // centered around the unrotated box.
    expect(index.visibleLayoutIds(350, 1, 0)).toEqual(['layout'])
    expect(index.visibleLayoutIds(348, 1, 0)).toEqual([])
  })

  it('rebuilds moved objects without retaining stale visibility bands', () => {
    const imageProps = {
      position: "0 800",
      height: 120,
    }
    const doc = createDoc({
      root: block('root', ['layout']),
      layout: block('placement-layout', ['image']),
      image: block('image', [], imageProps),
    })
    const index = new AbsolutePlacementVisibilityIndex(doc as any)
    index.rebuild(['layout'])
    expect(index.bottom).toBeGreaterThan(0)
    expect(index.visibleLayoutIds(0, 100, 100)).toEqual([])

    imageProps.position = "0 20"
    index.rebuild(['layout'])

    expect(index.visibleLayoutIds(0, 100, 100)).toEqual(['layout'])
  })
  it('includes freely positioned objects and drops the extent when the last object is removed', () => {
    const layout = block('placement-layout', ['image'])
    const doc = createDoc({
      root: block('root', ['layout']), layout,
      image: block('image', [], {position: "0 800", height: 120}),
    })
    ;(doc as any).placement = {surface: {measuredWidth: () => undefined, measuredHeight: () => undefined}}
    const index = new AbsolutePlacementVisibilityIndex(doc as any)
    index.rebuild(['layout'])
    expect(index.bottom).toBe(920)
    expect(index.visibleLayoutIds(910, 1, 0)).toEqual(['layout'])
    layout.children = []
    index.rebuild(['layout'])
    expect(index.bottom).toBe(0)
  })

  it('refreshes a measured band once without another model edit', () => {
    const doc = createDoc({
      root: block('root', ['layout']), layout: block('placement-layout', ['image']),
      image: block('image', [], {position: "0 800", height: 120}),
    })
    const surface = {revision: 0, measuredWidth: () => undefined, measuredHeight: () => 150}
    ;(doc as any).placement = {surface}
    const index = new AbsolutePlacementVisibilityIndex(doc as any)
    index.rebuild(['layout'])
    expect(index.visibleLayoutIds(1000, 1, 0)).toEqual([])
    surface.measuredHeight = () => 350
    surface.revision++
    expect(index.visibleLayoutIds(1000, 1, 0)).toEqual(['layout'])
    const getProps = spyOn(doc.model, 'getProps').and.callThrough()
    index.visibleLayoutIds(1010, 1, 0)
    expect(getProps).not.toHaveBeenCalled()
  })

  it('keeps auto-fit objects resident without expanding the document extent', () => {
    const doc = textDoc({height: 180})
    const index = new AbsolutePlacementVisibilityIndex(doc)
    index.rebuild(['layout'])
    expect(index.bottom).toBe(3180)
    expect([...index.visibleObjectIds(100000, 100, 0).get('layout')!]).toEqual(['text'])
    const getProps = spyOn(doc.model, 'getProps').and.callThrough()
    for (let i = 0; i < 1000; i++) index.visibleObjectIds(4300 + i, 100, 0)
    expect(getProps).not.toHaveBeenCalled()
    Object.assign(doc.model.getProps('text')!, {textAutoFit: 'none'})
    index.rebuild(['layout'])
    expect(index.visibleLayoutIds(4400, 100, 0)).toEqual([])
  })

  it('uses the fitted axis for shrunk height and rotated vertical text width', () => {
    const doc = textDoc({height: 180, textFit: 32})
    const index = new AbsolutePlacementVisibilityIndex(doc)
    index.rebuild(['layout'])
    expect(index.bottom).toBe(3032)
    Object.assign(doc.model.getProps('text')!, {textDirection: 'vertical-rl', rotation: 90, textFit: 2000})
    index.rebuild(['layout'])
    expect(index.bottom).toBe(4090)
    expect(index.visibleLayoutIds(4080, 1, 0)).toEqual(['layout'])
    expect(index.visibleLayoutIds(4100, 1, 0)).toEqual(['layout'])
  })

  it('keeps readonly auto-fit resident and unsupported text modes virtual', () => {
    const doc = textDoc({height: 180})
    const index = new AbsolutePlacementVisibilityIndex(doc)
    ;(doc as any).isReadonly = true
    index.rebuild(['layout'])
    expect(index.visibleLayoutIds(4400, 100, 0)).toEqual(['layout'])
    ;(doc as any).isReadonly = false
    Object.assign(doc.model.getProps('text')!, {textDirection: 'rotate-90'})
    index.rebuild(['layout'])
    expect(index.visibleLayoutIds(4400, 100, 0)).toEqual([])
  })

  it('keeps groups with auto-fit descendants resident and excludes hidden objects', () => {
    const doc = createDoc({
      root: block('root', ['layout']), layout: block('placement-layout', ['group', 'fixed', 'hidden']),
      group: block('object-group', ['auto'], {position: '0 5000', width: 200, height: 100}),
      auto: block('text-box', [], {textAutoFit: 'resize-shape'}),
      fixed: block('shape', [], {position: '0 20', width: 100, height: 60}),
      hidden: block('text-box', [], {position: '0 0', textAutoFit: 'resize-shape'}),
    }) as any
    doc.schemas = {get: (flavour: string) => ({metadata: flavour === 'text-box'
      ? {objectFormat: {kind: 'text-box', defaults: {}}} : {}})}
    doc.revisions = {getBlockPresentation: (id: string) => ({hidden: id === 'hidden'})}
    const index = new AbsolutePlacementVisibilityIndex(doc)
    index.rebuild(['layout'])
    expect([...index.visibleObjectIds(0, 100, 0).get('layout')!]).toEqual(['group', 'fixed'])
    expect([...index.visibleObjectIds(100000, 100, 0).get('layout')!]).toEqual(['group'])
  })

  it('matches individual overlapping intervals even when a long object contains many short ones', () => {
    const ids = Array.from({length: 100}, (_, i) => `s${i}`)
    const doc = createDoc({
      root: block('root', ['layout']), layout: block('placement-layout', ids),
      ...Object.fromEntries(ids.map((id, i) => [id, block('shape', [], {
        position: `0 ${i * 30}`, width: 100, height: i % 7 === 0 ? 6000 : 60,
      })])),
    }) as any
    const index = new AbsolutePlacementVisibilityIndex(doc)
    index.rebuild(['layout'])
    for (let top = 0; top < 9000; top += 37) {
      const expected = ids.filter((_, i) => i * 30 <= top + 100 &&
        i * 30 + (i % 7 === 0 ? 6000 : 60) >= top).sort()
      expect([...(index.visibleObjectIds(top, 100, 0).get('layout') ?? [])].sort()).toEqual(expected)
    }
  })

  it('queries 1000 fixed floating objects repeatedly without rescanning models or text', () => {
    const ids = Array.from({length: 1000}, (_, i) => `text-${i}`)
    const doc = createDoc({
      root: block('root', ['layout']), layout: block('placement-layout', ids),
      ...Object.fromEntries(ids.map((id, i) => [id, block('text-box', [], {
        position: `0 ${i * 3000}`, width: 200, height: 180, textAutoFit: 'none',
      })])),
    }) as any
    doc.schemas = {get: () => ({metadata: {objectFormat: {kind: 'text-box', defaults: {}}}})}
    const index = new AbsolutePlacementVisibilityIndex(doc)
    index.rebuild(['layout'])
    const getProps = spyOn(doc.model, 'getProps').and.callThrough()
    const getText = spyOn(doc.model, 'getTextDeltas').and.callThrough()
    const start = performance.now()
    for (let i = 0; i < 10000; i++) {
      const y = (i % ids.length) * 3000
      expect(index.visibleLayoutIds(y + (i % 2 ? 1000 : 20), 100, 100))
        .toEqual(i % 2 ? [] : ['layout'])
    }
    console.info('floating visibility: 1000 objects / 10000 queries (including assertions), ms:', performance.now() - start)
    expect(getProps).not.toHaveBeenCalled()
    expect(getText).not.toHaveBeenCalled()
  })

})

function textDoc(props: Record<string, unknown>): BlockCraft.Doc {
  const doc = createDoc({
    root: block('root', ['layout']), layout: block('placement-layout', ['text']),
    text: block('text-box', [], {position: '0 3000', width: 200, textAutoFit: 'resize-shape', ...props}),
  })
  return Object.assign(doc, {schemas: {get: () => ({metadata: {
    objectFormat: {kind: 'text-box', defaults: {}},
  }})}}) as unknown as BlockCraft.Doc
}

function block(
  flavour: string,
  children: string[],
  props: Record<string, any> = {},
) {
  return {
    flavour,
    nodeType: BlockNodeType.block,
    props,
    children,
  }
}

function createDoc(
  blocks: Record<string, ReturnType<typeof block>>,
) {
  return {
    model: {
      getFlavour: (id: string) => blocks[id]?.flavour,
      getNodeType: (id: string) => blocks[id]?.nodeType,
      getProps: (id: string) => blocks[id]?.props,
      getChildrenIds: (id: string) => blocks[id]?.children ?? [],
      getTextDeltas: () => [],
    },
    objectSizing: {
      rootContentWidth: 800,
      resolve: jasmine.createSpy('resolve').and.returnValue(null),
    },
  }
}
