import {BlockNodeType, IBlockSnapshot} from '../framework'
import {
  LAYOUT_FLAVOUR,
  normalizeTemplateSnapshots,
  replaceRootChildren,
} from '../../../apps/playground/src/app/template-deco/core/placement'
import {
  createTemplateUseMutationPolicy,
} from '../../../apps/playground/src/app/template-deco/core/template-region'

const snapshot = (
  id: string,
  flavour: string,
  nodeType: BlockNodeType,
  props: Record<string, unknown> = {},
  children: unknown[] = [],
): IBlockSnapshot => ({
  id,
  flavour,
  nodeType,
  props,
  meta: {},
  children,
} as IBlockSnapshot)

describe('template placement snapshot migration', () => {
  it('merges legacy layouts and migrates placement, sizing and inline images', () => {
    const text = snapshot(
      'text',
      'paragraph',
      BlockNodeType.editable,
      {},
      [
        {insert: 'before'},
        {
          insert: {'template-image-inline': ''},
          attributes: {src: 'data:image/png;base64,x', width: 25, height: 80},
        },
      ],
    )
    const misplacedFlow = snapshot(
      'flow-logo',
      'template-logo',
      BlockNodeType.void,
      {src: 'flow', width: 20},
    )
    const legacyLogo = snapshot(
      'legacy-logo',
      'template-logo',
      BlockNodeType.void,
      {src: 'absolute', width: 30, x: 12.5, y: 40, z: -1},
    )
    const coreImage = snapshot(
      'core-image',
      'image',
      BlockNodeType.block,
      {position: {x: 50, y: 100}},
    )
    const weather = snapshot(
      'weather',
      'template-weather',
      BlockNodeType.void,
      {position: {x: 5, y: 8}},
    )
    const children = [
      text,
      snapshot(
        'legacy-layout',
        'template-layout',
        BlockNodeType.block,
        {},
        [legacyLogo, misplacedFlow],
      ),
      coreImage,
      snapshot(
        'second-layout',
        LAYOUT_FLAVOUR,
        BlockNodeType.block,
        {},
        [weather],
      ),
    ]

    const migrated = normalizeTemplateSnapshots(children)
    expect(migrated.map(child => child.id)).toEqual([
      'text',
      'flow-logo',
      'legacy-layout',
    ])
    const migratedInline = migrated[0].children as any[]
    expect(migratedInline[1]).toEqual({
      insert: {image: 'data:image/png;base64,x'},
      attributes: {width: 192, height: 80},
    })
    expect(migrated[1].props).toEqual({
      src: 'flow',
      wr: 20,
      ar: 1,
    })

    const layout = migrated[2]
    expect(layout.flavour).toBe(LAYOUT_FLAVOUR)
    expect((layout.children as IBlockSnapshot[]).map(child => child.id))
      .toEqual(['core-image', 'legacy-logo', 'weather'])
    expect((layout.children as IBlockSnapshot[])[0].props['position'])
      .toEqual({x: 50, y: 100})
    expect((layout.children as IBlockSnapshot[])[1].props).toEqual({
      src: 'absolute',
      wr: 30,
      ar: 1,
      position: {x: 12.5, y: 40},
      placementLayer: 'under',
    })
    expect((layout.children as IBlockSnapshot[])[2].props['position'])
      .toEqual({x: 5, y: 8})
  })

  it('is idempotent after the first migration', () => {
    const source = [
      snapshot(
        'logo',
        'template-logo',
        BlockNodeType.void,
        {src: 'x', width: 25, x: 10, y: 20},
      ),
    ]
    const once = normalizeTemplateSnapshots(source)
    const twice = normalizeTemplateSnapshots(once)
    expect(twice).toEqual(once)
  })

  it('marks valid legacy template locks without inventing locks', () => {
    const locked = snapshot(
      'locked',
      'callout',
      BlockNodeType.block,
      {},
      [snapshot('nested', 'paragraph', BlockNodeType.editable)],
    )
    locked.meta.lock = 'template-creator'
    const nested = (locked.children as IBlockSnapshot[])[0]
    nested.meta.lock = 'nested-owner'
    const unlocked = snapshot('unlocked', 'paragraph', BlockNodeType.editable)
    unlocked.meta.lock = true as unknown as string

    const migrated = normalizeTemplateSnapshots([locked, unlocked])
    const migratedNested = (migrated[0].children as IBlockSnapshot[])[0]

    expect(migrated[0].meta).toEqual({
      lock: 'template-creator',
      lockKind: 'template',
    })
    expect(migratedNested.meta).toEqual({
      lock: 'nested-owner',
      lockKind: 'template',
    })
    expect(migrated[1].meta.lockKind).toBeUndefined()
  })

  it('moves legacy region placeholders onto their editable child', () => {
    const paragraph = snapshot(
      'region-paragraph',
      'paragraph',
      BlockNodeType.editable,
    )
    const region = snapshot(
      'region',
      'render-unit',
      BlockNodeType.block,
      {},
      [paragraph],
    )
    region.meta = {
      tplRegion: true,
      plh: '请在此填写内容',
      plhMode: 'always',
    }

    const [migrated] = normalizeTemplateSnapshots([region])
    const [migratedParagraph] = migrated.children as IBlockSnapshot[]

    expect(migrated.meta).toEqual({tplRegion: true})
    expect(migratedParagraph.meta).toEqual({
      plh: '请在此填写内容',
      plhMode: 'always',
    })
    expect(normalizeTemplateSnapshots([migrated])).toEqual([migrated])
  })

  it('clears snapshot hydration from the user undo history', () => {
    const child = snapshot(
      'loaded',
      'paragraph',
      BlockNodeType.editable,
    )
    const clearHistory = jasmine.createSpy('clearHistory')
    const transact = jasmine.createSpy('transact').and.callFake(
      (callback: () => void) => callback(),
    )
    const deleteBlocks = jasmine.createSpy('deleteBlocks')
    const insertBlocks = jasmine.createSpy('insertBlocks')
    const doc = {
      root: {childrenLength: 1},
      rootId: 'root',
      crud: {
        transact,
        deleteBlocks,
        insertBlocks,
        undoManager: {clearHistory},
      },
    } as unknown as BlockCraft.Doc

    replaceRootChildren(doc as never, [child])

    expect(deleteBlocks).toHaveBeenCalledWith('root', 0, 1, true)
    expect(insertBlocks).toHaveBeenCalledWith('root', 0, [child])
    expect(clearHistory).toHaveBeenCalledTimes(1)
  })
})

describe('template region use policy', () => {
  const createDoc = () => {
    const children: Record<string, string[]> = {
      root: ['section'],
      section: ['region'],
      region: ['placeholder'],
      placeholder: [],
    }
    const parents: Record<string, string | null> = {
      root: null,
      section: 'root',
      region: 'section',
      placeholder: 'region',
    }
    return {
      model: {
        getChildrenIds: (id: string) => children[id] ?? [],
        getParentId: (id: string) => parents[id] ?? null,
        getYBlock: (id: string) => ({
          get: (key: string) => key === 'meta'
            ? {get: (metaKey: string) => {
                if (metaKey === 'tplRegion') return id === 'region'
                if (metaKey === 'plh') {
                  return id === 'placeholder' ? '请填写' : undefined
                }
                return undefined
              }}
            : undefined,
        }),
      },
    } as unknown as BlockCraft.Doc
  }

  it('allows deleting a region and replaying its text history', () => {
    const policy = createTemplateUseMutationPolicy()
    const doc = createDoc()

    expect(policy({
      operation: 'delete',
      blockIds: ['region'],
      parentId: 'section',
    }, doc)).toBeTrue()
    expect(policy({
      operation: 'delete',
      blockIds: ['section'],
      parentId: 'root',
    }, doc)).toBeTrue()
    expect(policy({
      operation: 'undo',
      blockIds: ['placeholder'],
    }, doc)).toBeTrue()
    expect(policy({
      operation: 'redo',
      blockIds: ['placeholder'],
    }, doc)).toBeTrue()
  })

  it('keeps region configuration and the placeholder paragraph protected', () => {
    const policy = createTemplateUseMutationPolicy()
    const doc = createDoc()

    expect(policy({
      operation: 'move',
      blockIds: ['region'],
      parentId: 'section',
      targetId: 'root',
    }, doc)).toEqual({
      allowed: false,
      message: '模板内容区域不能被替换或移动',
    })
    expect(policy({
      operation: 'delete',
      blockIds: ['placeholder'],
      parentId: 'region',
    }, doc)).toEqual({
      allowed: false,
      message: '模板内容区域的提示段落不能单独删除、替换或移动',
    })
    expect(policy({
      operation: 'update-meta',
      blockIds: ['region'],
      metaKeys: ['incl'],
    }, doc)).toEqual({
      allowed: false,
      message: '使用模板时不能修改内容区域配置',
    })
  })
})
