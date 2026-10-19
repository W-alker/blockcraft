export type PinRegistryListener = () => void

/** Independent mount ownership collapsed into one sorted index set. */
export class PinRegistry {
  private readonly sources = new Map<string, Set<number>>()
  private flattened = new Set<number>()
  private readonly listeners = new Set<PinRegistryListener>()

  get size(): number {
    return this.flattened.size
  }

  pin(source: string, indices: readonly number[]): void {
    if (!source) throw new TypeError('pin source must not be empty')
    indices.forEach(assertIndex)
    if (!indices.length) {
      this.unpin(source)
      return
    }

    this.sources.set(source, new Set(indices))
    this.rebuildAndNotifyIfChanged()
  }

  unpin(source: string): void {
    if (!this.sources.delete(source)) return
    this.rebuildAndNotifyIfChanged()
  }

  clear(): void {
    if (!this.sources.size) return
    this.sources.clear()
    this.rebuildAndNotifyIfChanged()
  }

  has(index: number): boolean {
    return this.flattened.has(index)
  }

  snapshot(): ReadonlySet<number> {
    return new Set(this.flattened)
  }

  subscribe(listener: PinRegistryListener): () => void {
    this.listeners.add(listener)
    let active = true
    return () => {
      if (!active) return
      active = false
      this.listeners.delete(listener)
    }
  }

  private rebuildAndNotifyIfChanged(): void {
    const values = new Set<number>()
    for (const source of this.sources.values()) {
      for (const index of source) values.add(index)
    }
    const next = new Set([...values].sort((left, right) => left - right))
    if (setsEqual(this.flattened, next)) return

    this.flattened = next
    for (const listener of [...this.listeners]) listener()
  }
}

function assertIndex(index: number): void {
  if (!Number.isInteger(index) || index < 0) {
    throw new RangeError(`invalid pinned index: ${index}`)
  }
}

function setsEqual(left: ReadonlySet<number>, right: ReadonlySet<number>): boolean {
  if (left.size !== right.size) return false
  for (const value of left) {
    if (!right.has(value)) return false
  }
  return true
}
