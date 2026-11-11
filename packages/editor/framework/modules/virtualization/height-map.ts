const INITIAL_CAPACITY = 64

/** Compact root-child heights with incremental Fenwick-tree prefix sums. */
export class HeightMap {
  private heights = new Float64Array(INITIAL_CAPACITY)
  private tree = new Float64Array(INITIAL_CAPACITY + 1)
  private size = 0

  get length(): number {
    return this.size
  }

  get totalHeight(): number {
    return this.prefixSum(this.size)
  }

  bulkInit(values: readonly number[]): void {
    values.forEach(assertHeight)
    this.ensureCapacity(values.length)
    this.heights.set(values, 0)
    this.size = values.length
    this.recompute()
  }

  append(height: number): void {
    assertHeight(height)
    this.ensureCapacity(this.size + 1)
    this.heights[this.size] = height
    this.size++
    const span = this.size & -this.size
    this.tree[this.size] = this.prefixSum(this.size - 1) - this.prefixSum(this.size - span) + height
  }

  insertAt(index: number, values: readonly number[]): void {
    assertIntegerInRange(index, 0, this.size, 'insert index')
    values.forEach(assertHeight)
    if (!values.length) return

    this.ensureCapacity(this.size + values.length)
    this.heights.copyWithin(index + values.length, index, this.size)
    this.heights.set(values, index)
    this.size += values.length
    this.recompute()
  }

  removeAt(index: number, count: number): void {
    assertIntegerInRange(index, 0, this.size, 'remove index')
    assertIntegerInRange(count, 0, this.size - index, 'remove count')
    if (count === 0) return

    const previousSize = this.size
    this.heights.copyWithin(index, index + count, previousSize)
    this.size -= count
    this.heights.fill(0, this.size, previousSize)
    this.recompute()
  }

  update(index: number, height: number): void {
    assertIntegerInRange(index, 0, this.size - 1, 'update index')
    assertHeight(height)
    if (this.heights[index] === height) return
    const delta = height - this.heights[index]
    this.heights[index] = height
    this.addToTree(index, delta)
  }

  get(index: number): number {
    assertIntegerInRange(index, 0, this.size - 1, 'height index')
    return this.heights[index]
  }

  /** Sum of all entries before index. Index may equal length. */
  getOffset(index: number): number {
    assertIntegerInRange(index, 0, this.size, 'offset index')
    return this.prefixSum(index)
  }

  getRangeHeight(start: number, end: number): number {
    if (start > end) return 0
    assertIntegerInRange(start, 0, this.size - 1, 'range start')
    assertIntegerInRange(end, start, this.size - 1, 'range end')
    return this.getOffset(end + 1) - this.getOffset(start)
  }

  /** Returns the block whose half-open height interval contains offset. */
  findIndexByOffset(offset: number): number {
    if (!this.size) return -1
    if (Number.isNaN(offset) || offset <= 0) return 0
    if (offset >= this.totalHeight) return this.size - 1

    let index = 0
    let prefix = 0
    let step = 2 ** Math.floor(Math.log2(this.size))
    while (step > 0) {
      const next = index + step
      if (next <= this.size && prefix + this.tree[next] <= offset) {
        index = next
        prefix += this.tree[next]
      }
      step = Math.floor(step / 2)
    }
    return Math.min(index, this.size - 1)
  }

  recompute(): void {
    if (this.tree.length < this.heights.length + 1) {
      this.tree = new Float64Array(this.heights.length + 1)
    } else {
      this.tree.fill(0)
    }

    for (let index = 1; index <= this.size; index++) {
      this.tree[index] += this.heights[index - 1]
      const parent = index + (index & -index)
      if (parent <= this.size) this.tree[parent] += this.tree[index]
    }
  }

  private addToTree(index: number, delta: number): void {
    for (let cursor = index + 1; cursor <= this.size; cursor += cursor & -cursor) {
      this.tree[cursor] += delta
    }
  }

  private prefixSum(end: number): number {
    let sum = 0
    for (let cursor = end; cursor > 0; cursor -= cursor & -cursor) {
      sum += this.tree[cursor]
    }
    return sum
  }

  private ensureCapacity(required: number): void {
    if (required <= this.heights.length) return
    let capacity = this.heights.length
    while (capacity < required) capacity *= 2

    const next = new Float64Array(capacity)
    next.set(this.heights.subarray(0, this.size))
    this.heights = next
    this.tree = new Float64Array(capacity + 1)
    this.recompute()
  }
}

function assertHeight(height: number): void {
  if (!Number.isFinite(height) || height < 0) {
    throw new RangeError(`invalid block height: ${height}`)
  }
}

function assertIntegerInRange(
  value: number,
  minimum: number,
  maximum: number,
  label: string,
): void {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${label} out of range: ${value}`)
  }
}
