import {HeightObserver} from './height-observer'

describe('HeightObserver', () => {
  it('observes only the mounted host set and falls back to positive border-box heights', () => {
    const a = document.createElement('div')
    const b = document.createElement('div')
    const observed = new Set<Element>()
    let callback!: ResizeObserverCallback
    const observer = {
      observe: jasmine.createSpy('observe').and.callFake((element: Element) => observed.add(element)),
      unobserve: jasmine.createSpy('unobserve').and.callFake((element: Element) => observed.delete(element)),
      disconnect: jasmine.createSpy('disconnect').and.callFake(() => observed.clear()),
    } as unknown as ResizeObserver
    const measurements: Array<readonly [string, number]>[] = []
    const heightObserver = new HeightObserver(
      (values: Array<readonly [string, number]>) => measurements.push(values),
      (cb: ResizeObserverCallback) => {
        callback = cb
        return observer
      },
    )

    const hosts: Record<string, HTMLElement> = {a, b}
    heightObserver.sync(['a', 'b'], (id: string) => hosts[id])
    callback(
      [
        {target: a, borderBoxSize: [{blockSize: 24}]},
        {
          target: b,
          borderBoxSize: [{blockSize: 0}],
          contentRect: {height: 0},
        },
      ] as unknown as ResizeObserverEntry[],
      observer,
    )
    heightObserver.sync(['b'], (id: string) => hosts[id])

    expect(measurements).toEqual([[['a', 24]]])
    expect(observer.observe).toHaveBeenCalledTimes(2)
    expect(observer.unobserve).toHaveBeenCalledOnceWith(a)

    heightObserver.disconnect()
    expect(observer.disconnect).toHaveBeenCalled()
  })

  it('measures the layout stride between adjacent mounted blocks', () => {
    const container = document.createElement('div')
    const a = document.createElement('div')
    const b = document.createElement('div')
    container.append(a, b)
    spyOn(a, 'getBoundingClientRect').and.returnValue({
      top: 10,
      height: 24,
    } as DOMRect)
    spyOn(b, 'getBoundingClientRect').and.returnValue({
      top: 44,
      height: 24,
    } as DOMRect)

    let callback!: ResizeObserverCallback
    const observer = {
      observe: jasmine.createSpy('observe'),
      unobserve: jasmine.createSpy('unobserve'),
      disconnect: jasmine.createSpy('disconnect'),
    } as unknown as ResizeObserver
    const measurements: Array<readonly [string, number]>[] = []
    const heightObserver = new HeightObserver(
      (values) => measurements.push(values),
      (cb) => {
        callback = cb
        return observer
      },
    )

    const hosts: Record<string, HTMLElement> = {a, b}
    heightObserver.sync(['a', 'b'], (id) => hosts[id])
    callback([{target: a, borderBoxSize: [{blockSize: 24}]}] as unknown as ResizeObserverEntry[], observer)

    expect(measurements).toEqual([[['a', 34]]])
  })

  it('normalizes visual stride back to layout px under document zoom', () => {
    const container = document.createElement('div')
    const a = document.createElement('div')
    const b = document.createElement('div')
    container.append(a, b)
    spyOn(a, 'getBoundingClientRect').and.returnValue({top: 20} as DOMRect)
    spyOn(b, 'getBoundingClientRect').and.returnValue({top: 88} as DOMRect)

    let callback!: ResizeObserverCallback
    const observer = {
      observe: jasmine.createSpy('observe'),
      unobserve: jasmine.createSpy('unobserve'),
      disconnect: jasmine.createSpy('disconnect'),
    } as unknown as ResizeObserver
    const measurements: Array<readonly [string, number]>[] = []
    const heightObserver = new HeightObserver(
      values => measurements.push(values),
      cb => {
        callback = cb
        return observer
      },
      () => 2,
    )

    heightObserver.sync(['a', 'b'], id => ({a, b})[id])
    callback(
      [{target: a, borderBoxSize: [{blockSize: 24}]}] as unknown as ResizeObserverEntry[],
      observer,
    )

    expect(measurements).toEqual([[['a', 34]]])
  })

  it('retains stable layout strides across re-observation without suppressing new hosts', () => {
    const container = document.createElement('div')
    const a = document.createElement('div')
    const replacementA = document.createElement('div')
    const b = document.createElement('div')
    container.append(a, b)
    let nextTop = 44
    spyOn(a, 'getBoundingClientRect').and.returnValue({top: 10} as DOMRect)
    spyOn(replacementA, 'getBoundingClientRect').and.returnValue({top: 10} as DOMRect)
    spyOn(b, 'getBoundingClientRect').and.callFake(() => ({top: nextTop}) as DOMRect)

    let callback!: ResizeObserverCallback
    const observer = {
      observe: jasmine.createSpy('observe'),
      unobserve: jasmine.createSpy('unobserve'),
      disconnect: jasmine.createSpy('disconnect'),
    } as unknown as ResizeObserver
    const measurements: Array<readonly [string, number]>[] = []
    const heightObserver = new HeightObserver(
      values => measurements.push(values),
      cb => {
        callback = cb
        return observer
      },
    )
    const entryFor = (target: Element) => ([{
      target,
      borderBoxSize: [{blockSize: 24}],
    }] as unknown as ResizeObserverEntry[])

    heightObserver.sync(['a', 'b'], id => ({a, b})[id])
    callback(entryFor(a), observer)
    heightObserver.sync(['b'], id => ({b})[id])
    heightObserver.sync(['a', 'b'], id => ({a, b})[id])

    nextTop = 44.5
    callback(entryFor(a), observer)
    expect(measurements).toEqual([[['a', 34]]])

    nextTop = 44.6
    callback(entryFor(a), observer)
    expect(measurements).toEqual([
      [['a', 34]],
      [['a', 34.6]],
    ])

    container.replaceChild(replacementA, a)
    heightObserver.sync(['a', 'b'], id => ({a: replacementA, b})[id])
    callback(entryFor(replacementA), observer)
    expect(measurements).toEqual([
      [['a', 34]],
      [['a', 34.6]],
      [['a', 34.6]],
    ])
  })
})
