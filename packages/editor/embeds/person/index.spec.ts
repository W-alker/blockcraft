import {createInlinePersonDelta, createInlinePersonEmbedConverter, formatInlinePersonDelta, readInlinePersonDelta} from '.'
import {materializeInlinePersonSnapshots} from './materialize'
import type {DeltaInsertEmbed, IBlockSnapshot} from '../../framework/block-std/types'
import {renderInline} from '../../snapshot-viewer/inline/render-inline'

const person = {name: '张三', avatar: 'https://example.com/avatar.png', description: '产品部/设计师', pinyin: 'ZHANG SAN'}
const paragraph = (children: IBlockSnapshot['children']): IBlockSnapshot => ({
  id: 'p', flavour: 'paragraph', nodeType: 'editable', props: {}, meta: {}, children,
} as IBlockSnapshot)

describe('行内人员', () => {
  it('四种格式共享定格数据，编辑态和只读渲染保持一致', () => {
    const converter = createInlinePersonEmbedConverter()
    for (const [format, text, hasAvatar] of [
      ['name', '张三', false],
      ['avatar-name', '张三', true],
      ['name-description', '张三 · 产品部/设计师', false],
      ['avatar-name-description', '张三 · 产品部/设计师', true],
    ] as const) {
      const delta = createInlinePersonDelta(person, format)
      delta.attributes = {...delta.attributes, 's:color': '#45634b', 'a:bold': true}
      const view = converter.toView(delta)
      const preview = renderInline([delta])
      expect(view.textContent).toBe(text)
      expect(view.querySelector('img') !== null).toBe(hasAvatar)
      expect(preview.querySelector('.bc-inline-person img') !== null).toBe(hasAvatar)
      expect(preview.querySelector('.bc-inline-person')?.textContent).toBe(view.textContent)
      expect(converter.toDelta(view)).toEqual(delta)
      expect(readInlinePersonDelta(delta)).toEqual(person)
    }
  })

  it('缺失部门不留下分隔符，未知格式回落姓名，未实例化与不可用各有占位', () => {
    expect(formatInlinePersonDelta(createInlinePersonDelta({name: '张三'}, 'name-description'))).toBe('张三')
    const withoutDescription = createInlinePersonEmbedConverter().toView(
      createInlinePersonDelta({name: '张三', avatar: person.avatar}, 'avatar-name-description'))
    expect(withoutDescription.textContent).toBe('张三')
    expect(withoutDescription.querySelector('img')?.getAttribute('src')).toBe(person.avatar)
    expect(formatInlinePersonDelta({insert: {person: JSON.stringify(person)}, attributes: {personFormat: 'bad'}})).toBe('张三')
    expect(formatInlinePersonDelta(createInlinePersonDelta())).toBe('文档创建人')
    for (const raw of ['', 'null', '{bad', '[]', '{"name":42}']) {
      expect(formatInlinePersonDelta({insert: {person: raw}})).toBe('人员暂不可用')
    }
  })

  it('人员文字不会解释为 HTML，拒绝非网络头像，图片失败只移除头像', () => {
    const converter = createInlinePersonEmbedConverter()
    const unsafe = converter.toView(createInlinePersonDelta({name: '<img src=x>', avatar: 'javascript:alert(1)'}, 'avatar-name'))
    expect(unsafe.textContent).toBe('<img src=x>')
    expect(unsafe.querySelector('img')).toBeNull()
    const view = converter.toView(createInlinePersonDelta(person, 'avatar-name'))
    view.querySelector('img')!.dispatchEvent(new Event('error'))
    expect(view.querySelector('img')).toBeNull()
    expect(view.textContent).toBe('张三')
  })

  it('递归实例化创建人，保留文字格式，不重写已定格人员和源模板', () => {
    const draft = createInlinePersonDelta(undefined, 'name-description')
    draft.attributes!['s:color'] = '#284536'
    const existing = createInlinePersonDelta({name: '李四'})
    const source = [{id: 'c', flavour: 'callout', nodeType: 'block', props: {}, meta: {},
      children: [paragraph([{insert: '记录人：'}, draft, existing])]}] as IBlockSnapshot[]
    const result = materializeInlinePersonSnapshots(source, person)
    const children = (result[0].children[0] as IBlockSnapshot).children as DeltaInsertEmbed[]
    expect(readInlinePersonDelta(children[1])).toEqual(person)
    expect(children[1].attributes).toEqual({personFormat: 'name-description', 's:color': '#284536'})
    expect(children[2]).toBe(existing)
    expect(draft.insert['person']).toBe('')
    expect(materializeInlinePersonSnapshots(result, {name: '王五'})).toEqual(result)
  })

  it('缺失宿主人员不会阻断建档或在稍后打开时变成其他操作者', () => {
    const result = materializeInlinePersonSnapshots([paragraph([createInlinePersonDelta()])], null)
    const delta = result[0].children[0] as DeltaInsertEmbed
    expect(formatInlinePersonDelta(delta)).toBe('人员暂不可用')
    expect(materializeInlinePersonSnapshots(result, person)).toEqual(result)
    const unsupported = {insert: {person: ''}, attributes: {personSource: 'viewer'}}
    expect(materializeInlinePersonSnapshots([paragraph([unsupported])], person)[0].children[0]).toBe(unsupported)
  })
})
