import {Subject} from 'rxjs'
import {ObjectDragPlugin} from './index'

describe('ObjectDragPlugin', () => {
  const cleanups: Array<() => void> = []
  afterEach(() => cleanups.splice(0).forEach(cleanup => cleanup()))

  function harness(flavour = 'person-card') {
    const root = document.createElement('div')
    root.innerHTML = '<div data-block-id="card"><span>卡片内容</span></div>'
    document.body.append(root)
    const host = root.firstElementChild as HTMLElement
    const target = host.firstElementChild as HTMLElement
    const block = {id: 'card', flavour}
    const doc = {
      isReadonly: false, root: {hostElement: root}, onDestroy$: new Subject<void>(),
      getBlockById: () => block,
      dragController: {state: 'idle'},
      placement: {state: 'idle', supports: jasmine.createSpy('supports').and.returnValue(true),
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

  for (const flavour of ['person-card', 'date-card', 'weather', 'custom-object']) {
    it(`${flavour} 按能力选择并启动移动`, () => {
      const h = harness(flavour)
      h.down()
      expect(h.doc.selection.selectBlock).toHaveBeenCalledOnceWith(h.block as any)
      expect(h.doc.placement.startDrag).toHaveBeenCalledTimes(1)
    })
  }
  for (const flavour of ['image', 'shape', 'text-box', 'word-art', 'object-group']) {
    it(`保留 ${flavour} 专属交互`, () => {
      const h = harness(flavour)
      h.down()
      expect(h.doc.selection.selectBlock).not.toHaveBeenCalled()
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
