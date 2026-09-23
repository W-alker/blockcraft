import {SchemaManager} from '../../framework/block-std/schema'
import {ParagraphBlockSchema, BulletBlockSchema, CalloutBlockSchema, DividerBlockSchema} from '../../blocks'
import {preserveTransformPlaceholder} from './placeholder'
import {BlockTransformerPlugin} from './index'
import {blockTransforms} from './const'

describe('块转换保留填写提示', () => {
  const schemas = new SchemaManager([ParagraphBlockSchema, BulletBlockSchema, CalloutBlockSchema, DividerBlockSchema])
  const doc = {schemas} as any
  const source = {
    meta: {plh: '请填写感悟', plhMode: 'always', tplFieldName: '不能继承', lock: true},
    props: {lh: 1.8},
  }

  it('可编辑块保留提示，且不复制区域身份、锁或源对象', () => {
    const bullet = schemas.createSnapshot('bullet', [[{insert: '已有内容'}]])
    const before = JSON.stringify(source)
    preserveTransformPlaceholder(doc, source, [bullet])
    expect(bullet.meta).toEqual({plh: '请填写感悟', plhMode: 'always'})
    expect(bullet.children).toEqual([{insert: '已有内容'}])
    expect(JSON.stringify(source)).toBe(before)
  })

  it('高亮容器仅给第一个可编辑后代保留提示', () => {
    const callout = schemas.createSnapshot('callout', [])
    const first = schemas.createSnapshot('paragraph', [[]])
    const second = schemas.createSnapshot('paragraph', [[]])
    callout.children = [first, second]
    preserveTransformPlaceholder(doc, source, [callout])
    expect(first.meta['plh']).toBe('请填写感悟')
    expect(second.meta['plh']).toBeUndefined()
    expect(callout.meta['plh']).toBeUndefined()
  })

  it('纯非文本块追加可填写提示段，已有尾段时不重复追加', () => {
    const divider = schemas.createSnapshot('divider', [])
    const replacements = [divider] as any[]
    preserveTransformPlaceholder(doc, source, replacements)
    expect(replacements.length).toBe(2)
    expect(replacements[1].flavour).toBe('paragraph')
    expect(replacements[1].meta['plh']).toBe('请填写感悟')
    preserveTransformPlaceholder(doc, source, replacements)
    expect(replacements.length).toBe(2)
  })

  it('无提示的普通正文不增加块或 meta', () => {
    const replacements = [schemas.createSnapshot('divider', [])]
    const before = JSON.stringify(replacements)
    preserveTransformPlaceholder(doc, {meta: {}, props: {}}, replacements)
    expect(JSON.stringify(replacements)).toBe(before)
  })

  it('快捷键转换实际把提示传给 replaceWithSnapshots', () => {
    const chain: any = {}
    for (const key of ['replaceWithSnapshots', 'nextTick', 'selectOrSetCursorAtBlock', 'recalculateSelection', 'run']) {
      chain[key] = jasmine.createSpy(key).and.returnValue(chain)
    }
    BlockTransformerPlugin.transformEditableBlock(
      {...doc, chain: () => chain},
      {...source, id: 'source', textDeltas: () => [{insert: '正文'}]} as any,
      'bullet',
    )
    const [, replacements] = chain.replaceWithSnapshots.calls.mostRecent().args
    expect(replacements[0].meta['plh']).toBe('请填写感悟')
  })

  it('Markdown 高亮转换的自定义分支也继承提示', () => {
    const chain: any = {}
    for (const key of ['replaceWithSnapshots', 'nextTick', 'selectOrSetCursorAtBlock', 'recalculateSelection', 'run']) {
      chain[key] = jasmine.createSpy(key).and.returnValue(chain)
    }
    blockTransforms.find(item => item.flavour === 'callout')!.onConvert!(
      {...doc, chain: () => chain},
      {...source, id: 'source', textDeltas: () => [{insert: '! 正文'}]} as any,
      '! ',
    )
    const [, replacements] = chain.replaceWithSnapshots.calls.mostRecent().args
    expect(replacements[0].children[0].meta['plh']).toBe('请填写感悟')
  })

  for (const state of ['writable', 'readonly', 'user-lock', 'schema-denied'] as const) {
    it(`slash 转换填写首段：${state}，失败前不替换、不改原文`, async () => {
      const plugin = new BlockTransformerPlugin() as any
      const block = {
        ...source, id: 'source', parentId: 'region', flavour: 'paragraph',
        textDeltas: () => [{insert: '/bullet'}],
      }
      const chain: any = {}
      for (const key of ['replaceWithSnapshots', 'nextTick', 'selectOrSetCursorAtBlock', 'recalculateSelection', 'run']) {
        chain[key] = jasmine.createSpy(key).and.returnValue(chain)
      }
      plugin.doc = {
        schemas, getBlockById: () => block,
        isReadonly: state === 'readonly',
        ...(state === 'user-lock' ? {readonlyManager: {isReadonly: () => true}} : {}),
        canInsertChild: () => state !== 'schema-denied',
        chain: () => chain,
      }
      const before = JSON.stringify(block)
      await plugin.insertBlockAtQuery({block}, 'bullet', [[]], {
        consume: () => ({block, index: 0, length: 7}),
      })
      if (state === 'writable') {
        const [id, replacements] = chain.replaceWithSnapshots.calls.mostRecent().args
        expect(id).toBe('source')
        expect(replacements[0].flavour).toBe('bullet')
        expect(replacements[0].meta).toEqual({plh: '请填写感悟', plhMode: 'always'})
        expect(replacements[0].children).toEqual([])
      } else {
        expect(chain.replaceWithSnapshots).not.toHaveBeenCalled()
      }
      expect(JSON.stringify(block)).toBe(before)
    })
  }

})
