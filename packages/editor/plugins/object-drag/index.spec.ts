import {Subject} from 'rxjs'
import {ObjectDragPlugin} from './index'
import {IBlockSchemaOptions} from '../../framework'
import {ImageBlockSchema} from '../../blocks/image-block'
import {ShapeBlockSchema} from '../../blocks/shape-block'
import {TextBoxBlockSchema} from '../../blocks/text-box-block'
import {WordArtBlockSchema} from '../../blocks/word-art-block'
import {ObjectGroupBlockSchema} from '../../blocks/object-group-block'
import {StickerBlockSchema} from '../../blocks/sticker-block'

describe('ObjectDragPlugin', () => {
  const cleanups: Array<() => void> = []
  afterEach(() => cleanups.splice(0).forEach(cleanup => cleanup()))

  const builtinSchemas = [ImageBlockSchema, ShapeBlockSchema, TextBoxBlockSchema,
    WordArtBlockSchema, ObjectGroupBlockSchema, StickerBlockSchema]

  function harness(flavour = 'person-card', metadataOverride?: Partial<IBlockSchemaOptions['metadata']>) {
    const metadata = {...builtinSchemas.find(schema => schema.flavour === flavour)?.metadata, ...metadataOverride}
    const root = document.createElement('div')
    root.innerHTML = '<div data-block-id="card"><span>卡片内容</span></div>'
    document.body.append(root)
    const host = root.firstElementChild as HTMLElement
    const target = host.firstElementChild as HTMLElement
    const block = {id: 'card', flavour, hostElement: host}
    target.setAttribute('data-bc-object-drag-surface', '')
    const doc = {
      isReadonly: false, root: {hostElement: root}, onDestroy$: new Subject<void>(),
      getBlockById: () => block,
      schemas: {get: () => ({metadata})},
      dragController: {state: 'idle', state$: new Subject<string>(), startDrag: jasmine.createSpy('flowStartDrag')},
      placement: {state: 'idle', state$: new Subject<string>(), supports: jasmine.createSpy('supports').and.returnValue(true),
        getAbsoluteObjectSelectionIds: jasmine.createSpy('getAbsoluteObjectSelectionIds').and.returnValue(null),
        getState: () => ({mode: 'absolute'}), startDrag: jasmine.createSpy('startDrag')},
      selection: {value: null, selectBlock: jasmine.createSpy('selectBlock'), blur: jasmine.createSpy('blur')},
      readonlyManager: {isReadonly: () => false},
    }
    const plugin = new ObjectDragPlugin()
    ;(plugin as any).doc = doc
    plugin.init()
    cleanups.push(() => {plugin.destroy(); root.remove()})
    const down = (element = target, button = 0) => element.dispatchEvent(
      new PointerEvent('pointerdown', {button, bubbles: true, cancelable: true}),
    )
    return {plugin, doc, block, host, target, down}
  }

  for (const flavour of ['person-card', 'date-card', 'weather', 'sticker', 'image', 'shape', 'custom-object']) {
    it(`${flavour} 按能力选择并启动移动`, () => {
      const h = harness(flavour)
      h.down()
      expect(h.doc.selection.selectBlock).toHaveBeenCalledOnceWith(h.block as any)
      expect(h.doc.placement.startDrag).toHaveBeenCalledTimes(1)
    })
  }
  for (const flavour of ['text-box', 'word-art', 'object-group']) {
    it(`${flavour} 的正文不会启动移动`, () => {
      const h = harness(flavour)
      h.down()
      expect(h.doc.selection.selectBlock).not.toHaveBeenCalled()
      expect(h.doc.placement.startDrag).not.toHaveBeenCalled()
    })
  }
  it('上下型贴纸在禁止绝对定位的容器中仍可从本体启动正文流排序', () => {
    const h = harness('sticker')
    h.doc.placement.getState = () => ({mode: 'relative'})
    h.doc.placement.supports.and.callFake((_block: unknown, mode: string) => mode === 'relative')
    h.down()
    expect(h.doc.selection.selectBlock).toHaveBeenCalledOnceWith(h.block as any)
    expect(h.doc.dragController.startDrag).toHaveBeenCalledOnceWith(
      jasmine.any(PointerEvent), {kind: 'origin-block', blockId: h.block.id}, {ghostLabel: '贴纸'},
    )
    expect(h.doc.placement.startDrag).not.toHaveBeenCalled()
  })
  it('自定义对象无需修改通用插件即可启用容器内本体排序', () => {
    const h = harness('custom-object', {objectDrag: 'body', label: '自定义卡片'})
    h.doc.placement.getState = () => ({mode: 'relative'})
    h.doc.placement.supports.and.callFake((_block: unknown, mode: string) => mode === 'relative')
    h.down()
    expect(h.doc.dragController.startDrag).toHaveBeenCalledOnceWith(
      jasmine.any(PointerEvent), {kind: 'origin-block', blockId: h.block.id}, {ghostLabel: '自定义卡片'},
    )
    expect(h.doc.placement.startDrag).not.toHaveBeenCalled()
  })
  for (const objectDrag of [undefined, 'placement'] as const) {
    it(`贴纸覆盖为 ${objectDrag} 时不会通过类型特判启动正文排序`, () => {
      const h = harness('sticker', {objectDrag})
      h.doc.placement.getState = () => ({mode: 'relative'})
      h.down()
      expect(h.doc.dragController.startDrag).not.toHaveBeenCalled()
    })
  }
  it('自定义专属交互由 Schema 声明后，通用插件不再拾取', () => {
    const h = harness('custom-object', {objectDrag: 'custom'})
    h.down()
    expect(h.doc.selection.selectBlock).not.toHaveBeenCalled()
    expect(h.doc.placement.startDrag).not.toHaveBeenCalled()
    expect(h.doc.dragController.startDrag).not.toHaveBeenCalled()
    expect(h.doc.placement.supports).not.toHaveBeenCalled()
  })
  for (const mode of ['relative', 'absolute']) {
    it(`本体拖拽不能越过 ${mode} 定位能力限制`, () => {
      const h = harness('custom-object', {objectDrag: 'body'})
      h.doc.placement.getState = () => ({mode})
      h.doc.placement.supports.and.callFake((_block: unknown, candidate: string) => candidate !== mode)
      h.down()
      expect(h.doc.placement.startDrag).not.toHaveBeenCalled()
      expect(h.doc.dragController.startDrag).not.toHaveBeenCalled()
    })
  }
  for (const guard of ['readonly', 'locked', 'control', 'gap', 'other-drag', 'secondary']) {
    it(`上下型贴纸 ${guard} 不启动正文流排序`, () => {
      const h = harness('sticker')
      h.doc.placement.getState = () => ({mode: 'relative'})
      if (guard === 'readonly') h.doc.isReadonly = true
      if (guard === 'locked') h.doc.readonlyManager.isReadonly = () => true
      if (guard === 'control') h.target.setAttribute('data-bc-placement-pick-ignore', '')
      if (guard === 'gap') h.target.setAttribute('data-block-zero-space', 'true')
      if (guard === 'other-drag') h.doc.dragController.state = 'dragging'
      h.down(h.target, guard === 'secondary' ? 2 : 0)
      expect(h.doc.dragController.startDrag).not.toHaveBeenCalled()
      expect(h.doc.placement.startDrag).not.toHaveBeenCalled()
    })
  }
  for (const control of [
    '<shape-resizer data-bc-placement-pick-ignore><button></button></shape-resizer>',
    '<block-resizer><button></button></block-resizer>',
    '<mtl-scale-resizer data-bc-nodrag><button></button></mtl-scale-resizer>',
    '<div data-bc-placement-pick-ignore><button></button></div>',
    '<span data-block-zero-space="true"><span></span></span>',
  ]) {
    it(`不接管控件子节点：${control}`, () => {
      const h = harness()
      h.host.innerHTML = control
      const target = h.host.firstElementChild!.firstElementChild as HTMLElement
      const onControl = jasmine.createSpy('onControl')
      target.addEventListener('pointerdown', onControl)
      h.down(target)
      expect(onControl).toHaveBeenCalledTimes(1)
      expect(h.doc.selection.selectBlock).not.toHaveBeenCalled()
      expect(h.doc.placement.startDrag).not.toHaveBeenCalled()
      expect(h.doc.dragController.startDrag).not.toHaveBeenCalled()
    })
  }
  for (const guard of ['readonly', 'locked', 'flow', 'other-drag', 'placement-drag', 'unsupported', 'secondary']) {
    it(`${guard} 不启动浮动移动`, () => {
      const h = harness()
      if (guard === 'readonly') h.doc.isReadonly = true
      if (guard === 'locked') h.doc.readonlyManager.isReadonly = () => true
      if (guard === 'flow') h.doc.placement.getState = () => ({mode: 'relative'})
      if (guard === 'other-drag') h.doc.dragController.state = 'dragging'
      if (guard === 'placement-drag') h.doc.placement.state = 'armed'
      if (guard === 'unsupported') h.doc.placement.supports.and.returnValue(false)
      h.down(h.target, guard === 'secondary' ? 2 : 0)
      expect(h.doc.placement.startDrag).not.toHaveBeenCalled()
      expect(h.doc.dragController.startDrag).not.toHaveBeenCalled()
    })
  }
  for (const flavour of ['image', 'sticker', 'shape', 'text-box', 'word-art', 'object-group']) {
    for (const mode of ['relative', 'absolute']) {
      it(`${flavour} 的标记移动边框复用 ${mode} 拖拽`, () => {
        const h = harness(flavour)
        h.doc.placement.getState = () => ({mode})
        h.host.innerHTML = '<shape-resizer data-bc-placement-pick-ignore><span data-bc-object-drag-handle></span><button></button></shape-resizer>'
        const edge = h.host.querySelector('span')!
        h.down(edge)
        expect(h.doc.selection.selectBlock).toHaveBeenCalledOnceWith(h.block as any)
        expect(h.doc.placement.startDrag).toHaveBeenCalledTimes(mode === 'absolute' ? 1 : 0)
        expect(h.doc.dragController.startDrag).toHaveBeenCalledTimes(mode === 'relative' ? 1 : 0)
        h.doc.selection.selectBlock.calls.reset()
        h.down(h.host.querySelector('button')!)
        expect(h.doc.selection.selectBlock).not.toHaveBeenCalled()
      })
    }
  }
  for (const flavour of ['image', 'sticker', 'shape']) {
    it(`${flavour} 的本体空白不借用可视区域的拖拽声明`, () => {
      const h = harness(flavour)
      h.down(h.host)
      expect(h.doc.selection.selectBlock).not.toHaveBeenCalled()
    })
  }
  it('嵌套对象不能借用外层的可视区域标记', () => {
    const h = harness('custom-object', {objectDrag: 'body'})
    h.target.removeAttribute('data-bc-object-drag-surface')
    h.host.parentElement!.setAttribute('data-bc-object-drag-surface', '')
    h.host.parentElement!.setAttribute('data-block-id', 'outer')
    h.down()
    expect(h.doc.selection.selectBlock).not.toHaveBeenCalled()
  })
  it('重复点击已选中的对象会重新发布选区以恢复工具栏', () => {
    const h = harness('image')
    ;(h.doc.selection as any).value = {firstBlockId: h.block.id, anchor: {type: 'selected'}, head: {type: 'selected'}}
    h.down()
    expect(h.doc.selection.blur).toHaveBeenCalledTimes(1)
    expect(h.doc.selection.selectBlock).toHaveBeenCalledOnceWith(h.block as any)
  })
  it('拖动多选中的对象保留整个选区，纯点击也不会收回单选', () => {
    const h = harness('image')
    h.doc.placement.getAbsoluteObjectSelectionIds.and.returnValue(['card', 'sibling'])
    h.down()
    window.dispatchEvent(new PointerEvent('pointerup', {pointerId: 0}))
    expect(h.doc.selection.selectBlock).not.toHaveBeenCalled()
    expect(h.doc.selection.blur).not.toHaveBeenCalled()
    expect(h.doc.placement.startDrag).toHaveBeenCalledTimes(1)
  })
  it('点击多选以外的对象仍重新单选', () => {
    const h = harness('image')
    h.doc.placement.getAbsoluteObjectSelectionIds.and.returnValue(['other', 'sibling'])
    h.down()
    expect(h.doc.selection.selectBlock).toHaveBeenCalledOnceWith(h.block as any)
  })
  for (const mode of ['relative', 'absolute']) {
    it(`${mode} 纯点击在释放后确认选区，鼠标默认选区不会覆盖对象`, () => {
      const h = harness('image')
      h.doc.placement.getState = () => ({mode})
      h.down()
      const mouse = new MouseEvent('mousedown', {button: 0, bubbles: true, cancelable: true})
      h.target.dispatchEvent(mouse)
      expect(mouse.defaultPrevented).toBeTrue()
      window.dispatchEvent(new PointerEvent('pointerup', {pointerId: 0}))
      expect(h.doc.selection.selectBlock).toHaveBeenCalledTimes(2)
      const after = new MouseEvent('mousedown', {button: 0, bubbles: true, cancelable: true})
      h.target.dispatchEvent(after)
      expect(after.defaultPrevented).toBeFalse()
    })
    it(`${mode} 真正拖拽后不重新选择源对象`, () => {
      const h = harness('image')
      h.doc.placement.getState = () => ({mode})
      h.down()
      const controller = mode === 'relative' ? h.doc.dragController : h.doc.placement
      controller.state$.next('dragging')
      controller.state$.next('idle')
      window.dispatchEvent(new PointerEvent('pointerup', {pointerId: 0}))
      expect(h.doc.selection.selectBlock).toHaveBeenCalledTimes(1)
    })
  }
  for (const cancel of ['pointercancel', 'Escape', 'blur', 'destroy', 'doc-destroy', 'removed', 'readonly']) {
    it(`${cancel} 后不再确认旧点击选区`, () => {
      const h = harness('sticker')
      h.down()
      if (cancel === 'Escape') window.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape'}))
      if (cancel === 'pointercancel') window.dispatchEvent(new PointerEvent('pointercancel', {pointerId: 0}))
      if (cancel === 'blur') window.dispatchEvent(new Event('blur'))
      if (cancel === 'destroy') h.plugin.destroy()
      if (cancel === 'doc-destroy') h.doc.onDestroy$.next()
      if (cancel === 'removed') h.host.remove()
      if (cancel === 'readonly') h.doc.isReadonly = true
      window.dispatchEvent(new PointerEvent('pointerup', {pointerId: 0}))
      expect(h.doc.selection.selectBlock).toHaveBeenCalledTimes(1)
    })
  }
  it('不同文档相互隔离，卸载和文档销毁都会停止监听', () => {
    const first = harness(), second = harness()
    first.down()
    expect(first.doc.placement.startDrag).toHaveBeenCalledTimes(1)
    expect(second.doc.placement.startDrag).not.toHaveBeenCalled()
    first.plugin.destroy()
    first.down()
    expect(first.doc.placement.startDrag).toHaveBeenCalledTimes(1)
    second.doc.onDestroy$.next()
    second.down()
    expect(second.doc.placement.startDrag).not.toHaveBeenCalled()
  })
  it('已消费的事件不改变选择或启动移动', () => {
    const h = harness()
    const event = new PointerEvent('pointerdown', {button: 0, bubbles: true, cancelable: true})
    event.preventDefault()
    h.target.dispatchEvent(event)
    expect(h.doc.selection.selectBlock).not.toHaveBeenCalled()
    expect(h.doc.placement.startDrag).not.toHaveBeenCalled()
  })
})
