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
})
