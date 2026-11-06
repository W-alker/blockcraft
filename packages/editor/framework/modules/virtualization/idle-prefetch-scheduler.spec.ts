import {IdlePrefetchScheduler} from './idle-prefetch-scheduler'

interface FakeWindowHarness {
  ownerWindow: Window
  setTimeoutSpy: jasmine.Spy
  clearTimeoutSpy: jasmine.Spy
  requestIdleCallbackSpy: jasmine.Spy
  cancelIdleCallbackSpy: jasmine.Spy
  timeoutIds(): number[]
  idleIds(): number[]
  timeoutCallback(id: number): () => void
  idleCallback(id: number): IdleRequestCallback
  runTimeout(id: number): void
  runIdle(id: number, deadline?: IdleDeadline): void
  advanceTime(ms: number): void
}

function createWindowHarness(withIdleCallback = true): FakeWindowHarness {
  let nextHandle = 0
  let now = 0
  const timeouts = new Map<number, () => void>()
  const idleCallbacks = new Map<number, IdleRequestCallback>()

  const setTimeoutSpy = jasmine.createSpy('setTimeout').and.callFake(
    (handler: TimerHandler) => {
      if (typeof handler !== 'function') throw new TypeError('Timer handler must be a function')
      const handle = ++nextHandle
      timeouts.set(handle, handler as () => void)
      return handle
    },
  )
  const clearTimeoutSpy = jasmine.createSpy('clearTimeout').and.callFake(
    (handle: number) => timeouts.delete(handle),
  )
  const requestIdleCallbackSpy = jasmine.createSpy('requestIdleCallback').and.callFake(
    (callback: IdleRequestCallback) => {
      const handle = ++nextHandle
      idleCallbacks.set(handle, callback)
      return handle
    },
  )
  const cancelIdleCallbackSpy = jasmine.createSpy('cancelIdleCallback').and.callFake(
    (handle: number) => idleCallbacks.delete(handle),
  )

  const ownerWindow = {
    setTimeout: setTimeoutSpy,
    clearTimeout: clearTimeoutSpy,
    performance: {now: () => now},
  } as unknown as Window
  if (withIdleCallback) {
    Object.assign(ownerWindow, {
      requestIdleCallback: requestIdleCallbackSpy,
      cancelIdleCallback: cancelIdleCallbackSpy,
    })
  }

  return {
    ownerWindow,
    setTimeoutSpy,
    clearTimeoutSpy,
    requestIdleCallbackSpy,
    cancelIdleCallbackSpy,
    timeoutIds: () => [...timeouts.keys()],
    idleIds: () => [...idleCallbacks.keys()],
    timeoutCallback: id => timeouts.get(id)!,
    idleCallback: id => idleCallbacks.get(id)!,
    runTimeout: id => {
      const callback = timeouts.get(id)
      if (!callback) throw new Error(`Unknown timeout: ${id}`)
      timeouts.delete(id)
      callback()
    },
    runIdle: (id, deadline = {
      didTimeout: false,
      timeRemaining: () => 8,
    }) => {
      const callback = idleCallbacks.get(id)
      if (!callback) throw new Error(`Unknown idle callback: ${id}`)
      idleCallbacks.delete(id)
      callback(deadline)
    },
    advanceTime: ms => {
      now += ms
    },
  }
}

describe('IdlePrefetchScheduler', () => {
  it('waits for the quiet period and prefers requestIdleCallback', () => {
    const harness = createWindowHarness()
    const scheduler = new IdlePrefetchScheduler(harness.ownerWindow)
    const callback = jasmine.createSpy('callback')

    scheduler.schedule(callback)

    expect(harness.setTimeoutSpy).toHaveBeenCalledOnceWith(
      jasmine.any(Function),
      150,
    )
    expect(harness.requestIdleCallbackSpy).not.toHaveBeenCalled()
    expect(callback).not.toHaveBeenCalled()

    harness.runTimeout(harness.timeoutIds()[0])
    expect(harness.requestIdleCallbackSpy).toHaveBeenCalledTimes(1)
    expect(callback).not.toHaveBeenCalled()

    const deadline: IdleDeadline = {
      didTimeout: true,
      timeRemaining: () => 3,
    }
    harness.runIdle(harness.idleIds()[0], deadline)

    expect(callback).toHaveBeenCalledTimes(1)
    const [received] = callback.calls.mostRecent().args as [IdleDeadline]
    expect(received.didTimeout).toBeTrue()
    expect(received.timeRemaining()).toBe(3)
    harness.advanceTime(2)
    expect(received.timeRemaining()).toBe(2)
    harness.advanceTime(3)
    expect(received.timeRemaining()).toBe(0)
    expect(harness.timeoutIds()).toEqual([])
    expect(harness.idleIds()).toEqual([])
    expect(harness.requestIdleCallbackSpy).toHaveBeenCalledTimes(1)
    scheduler.dispose()
  })

  it('replaces quiet and idle work without letting stale callbacks run', () => {
    const harness = createWindowHarness()
    const scheduler = new IdlePrefetchScheduler(harness.ownerWindow, 25)
    const first = jasmine.createSpy('first')
    const second = jasmine.createSpy('second')
    const third = jasmine.createSpy('third')

    scheduler.schedule(first)
    const firstQuietId = harness.timeoutIds()[0]
    const staleQuietCallback = harness.timeoutCallback(firstQuietId)
    scheduler.schedule(second)

    expect(harness.clearTimeoutSpy).toHaveBeenCalledWith(firstQuietId)
    staleQuietCallback()
    expect(harness.requestIdleCallbackSpy).not.toHaveBeenCalled()

    harness.runTimeout(harness.timeoutIds()[0])
    const secondIdleId = harness.idleIds()[0]
    const staleIdleCallback = harness.idleCallback(secondIdleId)
    scheduler.schedule(third)

    expect(harness.cancelIdleCallbackSpy).toHaveBeenCalledOnceWith(secondIdleId)
    staleIdleCallback({didTimeout: false, timeRemaining: () => 4})
    expect(second).not.toHaveBeenCalled()

    harness.runTimeout(harness.timeoutIds()[0])
    harness.runIdle(harness.idleIds()[0])

    expect(first).not.toHaveBeenCalled()
    expect(second).not.toHaveBeenCalled()
    expect(third).toHaveBeenCalledTimes(1)
    scheduler.dispose()
  })

  it('schedules a continuation directly and cancels the previous idle slice', () => {
    const harness = createWindowHarness()
    const scheduler = new IdlePrefetchScheduler(harness.ownerWindow)
    const first = jasmine.createSpy('first')
    const second = jasmine.createSpy('second')

    scheduler.scheduleContinuation(first)
    const firstIdleId = harness.idleIds()[0]
    const staleIdleCallback = harness.idleCallback(firstIdleId)

    expect(harness.setTimeoutSpy).not.toHaveBeenCalled()
    expect(harness.requestIdleCallbackSpy).toHaveBeenCalledTimes(1)

    scheduler.scheduleContinuation(second)

    expect(harness.cancelIdleCallbackSpy).toHaveBeenCalledOnceWith(firstIdleId)
    expect(harness.setTimeoutSpy).not.toHaveBeenCalled()
    expect(harness.requestIdleCallbackSpy).toHaveBeenCalledTimes(2)

    staleIdleCallback({didTimeout: false, timeRemaining: () => 4})
    harness.runIdle(harness.idleIds()[0])

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
    scheduler.dispose()
  })

  it('uses a bounded synthetic deadline when requestIdleCallback is unavailable', () => {
    const harness = createWindowHarness(false)
    const scheduler = new IdlePrefetchScheduler(harness.ownerWindow, 30, 6)
    let receivedDeadline: IdleDeadline | undefined

    scheduler.schedule(deadline => {
      receivedDeadline = deadline
    })
    harness.runTimeout(harness.timeoutIds()[0])

    expect(harness.setTimeoutSpy.calls.allArgs().map(args => args[1]))
      .toEqual([30, 0])
    expect(receivedDeadline).toBeUndefined()

    harness.runTimeout(harness.timeoutIds()[0])

    expect(receivedDeadline?.didTimeout).toBeFalse()
    expect(receivedDeadline?.timeRemaining()).toBe(6)
    harness.advanceTime(2.5)
    expect(receivedDeadline?.timeRemaining()).toBe(3.5)
    harness.advanceTime(10)
    expect(receivedDeadline?.timeRemaining()).toBe(0)
    expect(harness.timeoutIds()).toEqual([])
    expect(harness.setTimeoutSpy).toHaveBeenCalledTimes(2)
    scheduler.dispose()
  })

  it('uses the fallback budget for a continuation without another quiet delay', () => {
    const harness = createWindowHarness(false)
    const scheduler = new IdlePrefetchScheduler(harness.ownerWindow, 30, 5)
    const stale = jasmine.createSpy('stale')
    let receivedDeadline: IdleDeadline | undefined

    scheduler.scheduleContinuation(stale)
    const firstFallbackId = harness.timeoutIds()[0]
    const staleFallbackCallback = harness.timeoutCallback(firstFallbackId)

    scheduler.scheduleContinuation(deadline => {
      receivedDeadline = deadline
    })

    expect(harness.clearTimeoutSpy).toHaveBeenCalledOnceWith(firstFallbackId)
    expect(harness.setTimeoutSpy.calls.allArgs().map(args => args[1]))
      .toEqual([0, 0])

    staleFallbackCallback()
    expect(stale).not.toHaveBeenCalled()
    harness.runTimeout(harness.timeoutIds()[0])

    expect(receivedDeadline?.didTimeout).toBeFalse()
    expect(receivedDeadline?.timeRemaining()).toBe(5)
    harness.advanceTime(1.5)
    expect(receivedDeadline?.timeRemaining()).toBe(3.5)
    harness.advanceTime(10)
    expect(receivedDeadline?.timeRemaining()).toBe(0)
    expect(harness.timeoutIds()).toEqual([])
    scheduler.dispose()
  })

  it('makes cancel and dispose idempotent and rejects scheduling after disposal', () => {
    const harness = createWindowHarness()
    const scheduler = new IdlePrefetchScheduler(harness.ownerWindow)
    const callback = jasmine.createSpy('callback')

    scheduler.schedule(callback)
    harness.runTimeout(harness.timeoutIds()[0])
    const idleId = harness.idleIds()[0]
    const staleIdleCallback = harness.idleCallback(idleId)

    scheduler.cancel()
    scheduler.cancel()
    expect(harness.cancelIdleCallbackSpy).toHaveBeenCalledOnceWith(idleId)
    staleIdleCallback({didTimeout: false, timeRemaining: () => 4})
    expect(callback).not.toHaveBeenCalled()

    scheduler.schedule(callback)
    const quietId = harness.timeoutIds()[0]
    scheduler.dispose()
    scheduler.dispose()
    expect(harness.clearTimeoutSpy).toHaveBeenCalledWith(quietId)

    const timeoutCallCount = harness.setTimeoutSpy.calls.count()
    scheduler.schedule(callback)
    expect(harness.setTimeoutSpy).toHaveBeenCalledTimes(timeoutCallCount)
    expect(callback).not.toHaveBeenCalled()
  })
})
