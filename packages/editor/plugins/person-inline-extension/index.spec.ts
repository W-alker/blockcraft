import {BehaviorSubject} from 'rxjs'
import {PersonInlineExtensionPlugin} from '.'
import {createInlinePersonDelta, createInlinePersonEmbedConverter} from '../../embeds/person'

describe('PersonInlineExtensionPlugin', () => {
  it('只替换一个 embed 的显示格式，保留真值和字体属性', () => {
    const plugin = new PersonInlineExtensionPlugin()
    const delta = createInlinePersonDelta({name: '张三'})
    delta.attributes!['a:bold'] = true
    const element = createInlinePersonEmbedConverter().toView(delta)
    document.body.append(element)
    const apply = jasmine.createSpy('applyDeltaOperations')
    const block = {id: 'p', applyDeltaOperations: apply}
    const doc = {isReadonly: false, getBlockById: () => block}
    ;(plugin as any).doc = doc
    spyOn<any>(plugin, '_tryGetEmbedRange').and.returnValue({start: {type: 'text', blockId: 'p', offset: 3}})
    spyOn(window, 'requestAnimationFrame').and.returnValue(1)
    try {
      ;(plugin as any)._applyUpdate(block, element, 'avatar-name-description')
      expect(apply).toHaveBeenCalledOnceWith([
        {retain: 3}, {delete: 1},
        {insert: delta.insert, attributes: {...delta.attributes, personFormat: 'avatar-name-description'}},
      ])
      doc.isReadonly = true
      ;(plugin as any)._applyUpdate(block, element, 'name-description')
      expect(apply).toHaveBeenCalledTimes(1)
      doc.isReadonly = false
      element.remove()
      ;(plugin as any)._applyUpdate(block, element, 'name-description')
      expect(apply).toHaveBeenCalledTimes(1)
    } finally { element.remove() }
  })

  it('进入只读关闭配置，销毁后不再监听', () => {
    const plugin = new PersonInlineExtensionPlugin()
    const readonly$ = new BehaviorSubject(false)
    ;(plugin as any).doc = {subscribeReadonlyChange: (fn: (value: boolean) => void) => readonly$.subscribe(fn)}
    const close = spyOn(plugin, 'closeDialog').and.callThrough()
    plugin.init()
    readonly$.next(true)
    expect(close).toHaveBeenCalledTimes(1)
    plugin.destroy()
    readonly$.next(false)
    readonly$.next(true)
    expect(close).toHaveBeenCalledTimes(2)
  })
})
