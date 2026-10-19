import {Subject} from 'rxjs'
import {ORIGIN_NO_RECORD} from '../../doc/origins'
import {TextContentAutoFit} from './text-content-auto-fit'

describe('TextContentAutoFit document batches', () => {
  const instances: Array<{helper: TextContentAutoFit; surface: HTMLElement; block: any}> = []
  let callbacks: Map<number, FrameRequestCallback>
  let nextId: number

  beforeEach(() => {
    callbacks = new Map()
    nextId = 0
    spyOn(window, 'requestAnimationFrame').and.callFake(callback => {
      callbacks.set(++nextId, callback)
      return nextId
    })
    spyOn(window, 'cancelAnimationFrame').and.callFake(id => { callbacks.delete(id) })
  })

  afterEach(() => {
    for (const {surface, block} of instances.splice(0)) {
      block.onDestroy$.next()
      surface.remove()
    }
  })

  const frame = () => {
    const pending = [...callbacks.values()]
    callbacks.clear()
    for (const callback of pending) callback(performance.now())
  }
  const makeDoc = () => ({
    objectSizing: {widthChange$: new Subject<void>()},
    layoutMetrics: {change$: new Subject<void>()},
    ngZone: {run: (fn: () => void) => fn(), runOutsideAngular: (fn: () => void) => fn()},
    crud: {transact: jasmine.createSpy('transact').and.callFake((fn: () => void) => fn())},
    placement: {updateObjectGeometry: jasmine.createSpy('updateObjectGeometry').and.callFake((block, patch) => {
      block.size = patch.textFit
    })},
  })
  const makeObject = (doc = makeDoc(), height = 40) => {
    const surface = document.createElement('div')
    surface.style.cssText = 'position:relative;width:240px;height:160px'
    const content = document.createElement('div')
    content.style.cssText = 'position:absolute;inset:0;overflow:hidden'
    const child = document.createElement('div')
    child.style.height = `${height}px`
    content.append(child)
    surface.append(content)
    document.body.append(surface)
    const block = {doc, size: 160, enabled: true, isReadonly: false,
      onPropsChange: new Subject(), onDetach$: new Subject<void>(), onReattach$: new Subject<void>(), onDestroy$: new Subject<void>()}
    const helper = new TextContentAutoFit(block as any, surface, content, () => block.enabled
      ? {axis: 'height', size: block.size, min: 32, max: 2000, padding: 0, inset: 0} : null)
    instances.push({helper, surface, block})
    return {doc, helper, surface, content, child, block}
  }

  it('prepares every content box before reading and restores every style before one transaction', () => {
    const doc = makeDoc()
    const objects = [makeObject(doc, 40), makeObject(doc, 80), makeObject(doc, 120)]
    const styles = objects.map(({content}) => content.getAttribute('style'))
    let reads = 0
    for (const {helper} of objects) {
      const original = (helper as any).fit
      spyOn<any>(helper, 'fit').and.callFake((measurement: unknown) => {
        expect(objects.every(({content}) => content.style.blockSize === 'max-content')).toBeTrue()
        expect(doc.placement.updateObjectGeometry).not.toHaveBeenCalled()
        reads++
        original.call(helper, measurement)
      })
      helper.schedule()
      helper.schedule()
    }
    doc.crud.transact.and.callFake((fn: () => void) => {
      expect(reads).toBe(3)
      expect(objects.map(({content}) => content.getAttribute('style'))).toEqual(styles)
      fn()
    })
    expect(callbacks.size).toBe(1)
    frame()
    expect(objects.map(({block}) => block.size)).toEqual([40, 80, 120])
    expect(doc.crud.transact).toHaveBeenCalledOnceWith(jasmine.any(Function), ORIGIN_NO_RECORD)
    expect(doc.placement.updateObjectGeometry).toHaveBeenCalledTimes(3)

    doc.crud.transact.calls.reset()
    doc.placement.updateObjectGeometry.calls.reset()
    objects.forEach(({helper}) => helper.schedule())
    frame()
    expect(doc.crud.transact).not.toHaveBeenCalled()
  })

  it('keeps different documents in separate batches', () => {
    const first = makeObject()
    const second = makeObject()
    expect(callbacks.size).toBe(2)
    frame()
    expect(first.doc.crud.transact).toHaveBeenCalledTimes(1)
    expect(second.doc.crud.transact).toHaveBeenCalledTimes(1)
  })

  it('cancels detached or destroyed work and measures fresh content on reattach', () => {
    const object = makeObject()
    object.block.onDetach$.next()
    expect(callbacks.size).toBe(0)
    object.child.style.height = '90px'
    object.block.onPropsChange.next(new Map([['textPadding', {}]]))
    expect(callbacks.size).toBe(0)
    expect((object.helper as any).observing).toBeFalse()
    object.block.onReattach$.next()
    expect(callbacks.size).toBe(1)
    frame()
    expect(object.block.size).toBe(90)
    object.helper.schedule()
    object.block.onDestroy$.next()
    expect(callbacks.size).toBe(0)
  })

  it('removes only the paused object from a shared batch and resumes after drag', () => {
    const doc = makeDoc()
    const first = makeObject(doc)
    const second = makeObject(doc, 80)
    first.helper.setPaused(true)
    expect(callbacks.size).toBe(1)
    frame()
    expect(first.block.size).toBe(160)
    expect(second.block.size).toBe(80)
    first.helper.setPaused(false)
    frame()
    expect(first.block.size).toBe(40)
  })

  it('rechecks disabled, readonly and disconnected objects before touching layout', () => {
    const doc = makeDoc()
    const disabled = makeObject(doc)
    const readonly = makeObject(doc)
    const disconnected = makeObject(doc)
    disabled.block.enabled = false
    readonly.block.isReadonly = true
    disconnected.surface.remove()
    frame()
    expect(doc.placement.updateObjectGeometry).not.toHaveBeenCalled()
    expect(doc.crud.transact).not.toHaveBeenCalled()
  })

  it('restores all styles if a measurement throws and does not publish partial sizes', () => {
    const doc = makeDoc()
    const first = makeObject(doc)
    const second = makeObject(doc)
    const styles = [first.content.getAttribute('style'), second.content.getAttribute('style')]
    spyOn<any>(second.helper, 'fit').and.throwError('measurement failed')
    expect(frame).toThrowError('measurement failed')
    expect([first.content.getAttribute('style'), second.content.getAttribute('style')]).toEqual(styles)
    expect(doc.crud.transact).not.toHaveBeenCalled()
  })
})
