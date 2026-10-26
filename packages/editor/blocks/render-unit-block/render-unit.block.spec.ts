import {RenderUnitBlockComponent} from './render-unit.block'
import {resolveRenderUnitDimensions} from './index'

describe('RenderUnitBlockComponent sizing', () => {
  const fixture = (readonly = false, basis = 800) => ({
    id: 'region', isReadonly: readonly,
    doc: {objectSizing: {getReferenceWidth: () => basis}},
    updateProps: jasmine.createSpy('updateProps'),
  })

  it('commits the same wr/ar geometry as a flow image and clears legacy pixels', () => {
    const block = fixture()
    RenderUnitBlockComponent.prototype.setSize.call(block as any, 400, 200)
    expect(block.updateProps).toHaveBeenCalledOnceWith({wr: 50, ar: 2, width: null, height: null})
  })

  it('allows width and height to change independently', () => {
    const block = fixture()
    RenderUnitBlockComponent.prototype.setSize.call(block as any, 400, 100)
    expect(block.updateProps).toHaveBeenCalledOnceWith({wr: 50, ar: 4, width: null, height: null})
  })

  it('rejects readonly, invalid dimensions and unavailable sizing planes', () => {
    for (const [block, width, height] of [
      [fixture(true), 400, 200], [fixture(false, 0), 400, 200],
      [fixture(), 0, 200], [fixture(), 400, NaN], [fixture(), -10, 200],
      [fixture(), Infinity, 200],
    ] as const) {
      RenderUnitBlockComponent.prototype.setSize.call(block as any, width, height)
      expect(block.updateProps).not.toHaveBeenCalled()
    }
  })

  it('restores natural height for ratio and legacy sizes without touching width or appearance', () => {
    for (const props of [{wr: 50, ar: 2}, {width: 320, height: 200}]) {
      const block = {...fixture(), objectDimensions: resolveRenderUnitDimensions(props, 800)}
      RenderUnitBlockComponent.prototype.resetHeight.call(block as any)
      expect(block.updateProps).toHaveBeenCalledOnceWith({ar: null, height: null})
    }
  })

  it('does not write a redundant reset for natural height or a readonly region', () => {
    for (const block of [
      {...fixture(), objectDimensions: null},
      {...fixture(true), objectDimensions: {width: 400, height: 200}},
    ]) {
      RenderUnitBlockComponent.prototype.resetHeight.call(block as any)
      expect(block.updateProps).not.toHaveBeenCalled()
    }
  })

  it('freezes layout dimensions rather than transformed screen bounds and supports both directions', () => {
    const hostElement = document.createElement('div')
    Object.defineProperties(hostElement, {offsetWidth: {value: 320}, offsetHeight: {value: 120}})
    const block = {...fixture(), hostElement, objectDimensions: null as any,
      setSize: jasmine.createSpy('setSize'), resetHeight: jasmine.createSpy('resetHeight')}
    RenderUnitBlockComponent.prototype.toggleSizeMode.call(block as any)
    expect(block.setSize).toHaveBeenCalledOnceWith(320, 120)
    block.objectDimensions = {width: 320, height: 120}
    RenderUnitBlockComponent.prototype.toggleSizeMode.call(block as any)
    expect(block.resetHeight).toHaveBeenCalledTimes(1)
    block.isReadonly = true
    RenderUnitBlockComponent.prototype.toggleSizeMode.call(block as any)
    expect(block.resetHeight).toHaveBeenCalledTimes(1)
  })
})


describe('RenderUnitBlockComponent focus handle', () => {
  function focus(isReadonly: boolean, event: MouseEvent) {
    const selectBlock = jasmine.createSpy('selectBlock')
    const block = {isReadonly, childrenLength: 1, doc: {selection: {selectBlock}}}
    const stop = spyOn(event, 'stopPropagation').and.callThrough()
    ;(RenderUnitBlockComponent.prototype as any).focusResizeHandles.call(block, event)
    return {block, selectBlock, stop}
  }

  it('selects a populated region from the handle and consumes the primary pointer event', () => {
    const event = new PointerEvent('pointerdown', {button: 0, isPrimary: true, cancelable: true})
    const {block, selectBlock, stop} = focus(false, event)
    expect(selectBlock).toHaveBeenCalledOnceWith(block)
    expect(event.defaultPrevented).toBeTrue()
    expect(stop).toHaveBeenCalled()
  })

  it('supports keyboard-generated button clicks', () => {
    const {block, selectBlock} = focus(false, new MouseEvent('click', {button: 0, detail: 0}))
    expect(selectBlock).toHaveBeenCalledOnceWith(block)
  })

  it('does not select readonly regions, secondary buttons or secondary touch pointers', () => {
    for (const [readonly, event] of [
      [true, new MouseEvent('click', {button: 0})],
      [false, new PointerEvent('pointerdown', {button: 2, isPrimary: true})],
      [false, new PointerEvent('pointerdown', {button: 0, isPrimary: false})],
    ] as const) {
      const {selectBlock, stop} = focus(readonly, event)
      expect(selectBlock).not.toHaveBeenCalled()
      expect(stop).not.toHaveBeenCalled()
    }
  })
})
