import {TableColumnWidthObserver} from './table-column-width-observer'

describe('TableColumnWidthObserver scheduling', () => {
  let original: typeof ResizeObserver
  let deliver: (entries: ResizeObserverEntry[]) => void
  let observe: jasmine.Spy
  let disconnect: jasmine.Spy
  let frames: Map<number, FrameRequestCallback>
  let nextFrame: number
  let view: Window
  let publish: jasmine.Spy
  let watcher: TableColumnWidthObserver

  const entry = (target: HTMLElement, width: number): ResizeObserverEntry => ({
    target,
    contentRect: {width},
    borderBoxSize: [{inlineSize: width, blockSize: 0}],
  } as unknown as ResizeObserverEntry)

  const flush = () => {
    const pending = [...frames.values()]
    frames.clear()
    pending.forEach(callback => callback(0))
  }

  beforeEach(() => {
    original = globalThis.ResizeObserver
    observe = jasmine.createSpy('observe')
    disconnect = jasmine.createSpy('disconnect')
    class Observer {
      constructor(callback: (entries: ResizeObserverEntry[]) => void) { deliver = callback }
      observe = observe
      disconnect = disconnect
      unobserve() {}
    }
    globalThis.ResizeObserver = Observer as unknown as typeof ResizeObserver
    frames = new Map()
    nextFrame = 0
    view = {
      requestAnimationFrame: (callback: FrameRequestCallback) => {
        const id = ++nextFrame
        frames.set(id, callback)
        return id
      },
      cancelAnimationFrame: (id: number) => frames.delete(id),
    } as unknown as Window
    publish = jasmine.createSpy('publish')
    watcher = new TableColumnWidthObserver(view, publish)
  })

  afterEach(() => {
    watcher.destroy()
    globalThis.ResizeObserver = original
  })

  it('coalesces multiple observer deliveries and publishes only a complete column set', () => {
    const cells = [document.createElement('td'), document.createElement('td')]
    const parent = document.createElement('div')
    watcher.observe(cells, parent)
    deliver([entry(cells[0], 80), entry(parent, 400)])
    flush()
    expect(publish).not.toHaveBeenCalled()

    deliver([entry(cells[1], 300)])
    deliver([entry(cells[0], 100)])
    expect(frames.size).toBe(1)
    expect(publish).not.toHaveBeenCalled()
    flush()
    expect(publish).toHaveBeenCalledOnceWith([100, 300], 400)
  })

  it('ignores unchanged dimensions while still publishing a changed parent budget', () => {
    const cell = document.createElement('td')
    const parent = document.createElement('div')
    watcher.observe([cell], parent)
    deliver([entry(cell, 200), entry(parent, 400)])
    flush()
    publish.calls.reset()

    deliver([entry(cell, 200.04), entry(parent, 400.04)])
    expect(frames.size).toBe(0)
    expect(publish).not.toHaveBeenCalled()
    deliver([entry(parent, 350)])
    flush()
    expect(publish).toHaveBeenCalledOnceWith([200], 350)
  })

  it('rebinds a replacement column set without accepting a stale cell notification', () => {
    const oldCell = document.createElement('td')
    const newCells = [document.createElement('td'), document.createElement('td')]
    watcher.observe([oldCell], undefined)
    deliver([entry(oldCell, 200)])
    watcher.observe(newCells, undefined)
    deliver([entry(oldCell, 900)])
    flush()
    expect(publish).not.toHaveBeenCalled()
    deliver(newCells.map(cell => entry(cell, 100)))
    flush()
    expect(publish).toHaveBeenCalledOnceWith([100, 100], 0)
    expect(disconnect).toHaveBeenCalledTimes(2)
  })

  it('disconnects and cancels the pending publication when detached or destroyed', () => {
    const cell = document.createElement('td')
    watcher.observe([cell], undefined)
    deliver([entry(cell, 200)])
    expect(frames.size).toBe(1)
    watcher.destroy()
    expect(frames.size).toBe(0)
    flush()
    expect(publish).not.toHaveBeenCalled()
    expect(disconnect).toHaveBeenCalledTimes(2)
  })
})
