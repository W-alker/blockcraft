function nonNegativeFinite(value: number, fallback: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : fallback
}

/**
 * Schedules one replaceable prefetch task after a short quiet period.
 *
 * @internal This is a package-local scheduling primitive. It deliberately
 * owns no retry loop: the caller decides whether and when more work is useful.
 */
export class IdlePrefetchScheduler {
  private quietTimer: number | null = null
  private idleHandle: number | null = null
  private fallbackTimer: number | null = null
  private generation = 0
  private disposed = false

  private readonly quietDelayMs: number
  private readonly fallbackBudgetMs: number

  constructor(
    private readonly ownerWindow: Window,
    quietDelayMs = 150,
    fallbackBudgetMs = 4,
  ) {
    this.quietDelayMs = nonNegativeFinite(quietDelayMs, 150)
    this.fallbackBudgetMs = nonNegativeFinite(fallbackBudgetMs, 4)
  }

  schedule(callback: IdleRequestCallback): void {
    if (this.disposed) return
    this.cancel()
    const generation = this.generation

    this.quietTimer = this.ownerWindow.setTimeout(() => {
      if (this.disposed || generation !== this.generation) return
      this.quietTimer = null
      this.scheduleIdle(callback, generation)
    }, this.quietDelayMs)
  }

  /** Schedule the next slice of an active batch without another quiet delay. */
  scheduleContinuation(callback: IdleRequestCallback): void {
    if (this.disposed) return
    this.cancel()
    this.scheduleIdle(callback, this.generation)
  }

  cancel(): void {
    this.generation++

    if (this.quietTimer !== null) {
      this.ownerWindow.clearTimeout(this.quietTimer)
      this.quietTimer = null
    }
    if (this.idleHandle !== null) {
      const cancelIdleCallback = this.ownerWindow.cancelIdleCallback
      if (typeof cancelIdleCallback === 'function') {
        cancelIdleCallback.call(this.ownerWindow, this.idleHandle)
      }
      this.idleHandle = null
    }
    if (this.fallbackTimer !== null) {
      this.ownerWindow.clearTimeout(this.fallbackTimer)
      this.fallbackTimer = null
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.cancel()
  }

  private scheduleIdle(
    callback: IdleRequestCallback,
    generation: number,
  ): void {
    const requestIdleCallback = this.ownerWindow.requestIdleCallback
    if (typeof requestIdleCallback === 'function') {
      let started = false
      const handle = requestIdleCallback.call(this.ownerWindow, deadline => {
        started = true
        if (this.disposed || generation !== this.generation) return
        this.idleHandle = null
        callback(this.boundedDeadline(deadline))
      })
      // Browsers invoke idle callbacks asynchronously. Keeping this guard makes
      // the state correct under a synchronous test double as well.
      if (!started && !this.disposed && generation === this.generation) {
        this.idleHandle = handle
      }
      return
    }

    this.fallbackTimer = this.ownerWindow.setTimeout(() => {
      if (this.disposed || generation !== this.generation) return
      this.fallbackTimer = null
      const startedAt = this.ownerWindow.performance.now()
      callback({
        didTimeout: false,
        timeRemaining: () => {
          const elapsed = Math.max(
            0,
            this.ownerWindow.performance.now() - startedAt,
          )
          return Math.max(0, this.fallbackBudgetMs - elapsed)
        },
      })
    }, 0)
  }

  private boundedDeadline(deadline: IdleDeadline): IdleDeadline {
    const startedAt = this.ownerWindow.performance.now()
    return {
      didTimeout: deadline.didTimeout,
      timeRemaining: () => {
        const elapsed = Math.max(
          0,
          this.ownerWindow.performance.now() - startedAt,
        )
        return Math.max(
          0,
          Math.min(
            deadline.timeRemaining(),
            this.fallbackBudgetMs - elapsed,
          ),
        )
      },
    }
  }
}
