import {BlockCraftDoc, SchemaManager} from '../framework'
import {PageDividerBlockSchema, TableBlockSchema, RenderUnitBlockSchema, RootBlockSchema, ParagraphBlockSchema} from '../blocks'
import {insertTemplateRegion, resolveContentInsertionTarget} from '../../../apps/playground/src/app/template-deco/palette/content-block-insertion'

describe('模板物料顶层插入限制', () => {
  function harness() {
    const root = {id: 'root', parentId: null, parentBlock: null, childrenIds: ['region'], childrenLength: 1}
    const region = {id: 'region', parentId: 'root', parentBlock: root, getIndexOfParent: () => 0}
    const paragraph = {id: 'paragraph', parentId: 'region', parentBlock: region}
    const blocks: Record<string, unknown> = {root, region, paragraph}
    const schemas = new SchemaManager([PageDividerBlockSchema, TableBlockSchema, RenderUnitBlockSchema, RootBlockSchema, ParagraphBlockSchema])
    const selection: any = {value: {head: {blockId: 'paragraph'}}}
    const insertBlocks = jasmine.createSpy('insertBlocks').and.returnValue([])
    const doc = {
      rootId: 'root', root, schemas, selection, isReadonly: false,
      getBlockById: (id: string) => blocks[id],
      model: {getChildrenIds: () => root.childrenIds},
      placement: {isPlacementLayout: () => false},
      canInsertChild: (parentId: string, flavour: BlockCraft.BlockFlavour) =>
        schemas.isValidChildren(flavour, parentId === 'root' ? 'root' : 'render-unit'),
      messageService: {warn: jasmine.createSpy('warn')},
      crud: {insertBlocks},
    } as unknown as BlockCraftDoc
    return {doc, selection, root, region, paragraph, insertBlocks}
  }

  it('分页符、表格和填写区块不能从嵌套选区回退到 root', () => {
    const {doc, selection, region, paragraph} = harness()
    for (const flavour of ['page-divider', 'table', 'render-unit'] as const) {
      expect(resolveContentInsertionTarget(doc, flavour)).toBeNull()
      selection.value = {head: {blockId: 'region'}}
      expect(resolveContentInsertionTarget(doc, flavour)).toBe(region as any)
      selection.value = {head: {blockId: 'paragraph'}}
    }
    expect(resolveContentInsertionTarget(doc, 'paragraph')).toBe(paragraph as any)
  })

  it('填写区块命令拒绝嵌套位置并保留无选区/空 root 插入', () => {
    const {doc, selection, root, insertBlocks} = harness()
    insertTemplateRegion(doc)
    expect(insertBlocks).not.toHaveBeenCalled()
    selection.value = null
    root.childrenIds = []
    root.childrenLength = 0
    insertTemplateRegion(doc)
    expect(insertBlocks).toHaveBeenCalledTimes(1)
    const [parentId, index, snapshots] = insertBlocks.calls.mostRecent().args
    expect([parentId, index]).toEqual(['root', 0])
    expect(snapshots[0].flavour).toBe('render-unit')
    expect(snapshots[0].children[0].meta.plh).toBe('请在此填写内容')
    insertBlocks.calls.reset()
    selection.value = {head: {blockId: 'root'}}
    insertTemplateRegion(doc)
    expect(insertBlocks).toHaveBeenCalledTimes(1)
  })
})
