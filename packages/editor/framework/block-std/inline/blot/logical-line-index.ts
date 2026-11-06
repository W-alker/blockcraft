import {BlotType, IBlot} from './blot'
import {TextBlot} from './text-blot'
import {EmbedBlot} from './embed-blot'
import type {LogicalLineAccess, LogicalSourceLine} from './logical-line-access'

type Leaf = TextBlot | EmbedBlot
type Entry = {line: LogicalSourceLine; childIndex: number; leafIndex: number; offset: number}

/** Small numeric index: structural line changes rebuild; token changes update one row. */
class LineSums {
  private readonly tree: number[]
  constructor(values: readonly number[]) {
    this.tree = new Array(values.length + 1).fill(0)
    values.forEach((value, index) => {
      this.tree[index + 1] += value
      const parent = (index + 1) + ((index + 1) & -(index + 1))
      if (parent < this.tree.length) this.tree[parent] += this.tree[index + 1]
    })
  }
  add(index: number, delta: number): void {
    for (let i = index + 1; i < this.tree.length; i += i & -i) this.tree[i] += delta
  }
  before(index: number): number {
    let sum = 0
    for (let i = index; i > 0; i -= i & -i) sum += this.tree[i]
    return sum
  }
  firstEndAtLeast(offset: number): number {
    let index = 0
    let sum = 0
    let step = 1
    while (step * 2 < this.tree.length) step *= 2
    for (; step; step >>>= 1) {
      const next = index + step
      if (next < this.tree.length && sum + this.tree[next] < offset) {
        index = next
        sum += this.tree[next]
      }
    }
    return Math.min(index, this.tree.length - 2)
  }
}

/** @internal Actual Blot-derived line records, independent of Y.Text and delta input. */
export class LogicalLineIndex implements LogicalLineAccess {
  private readonly _lines: LogicalSourceLine[] = []
  private readonly _lineNumbers = new Map<LogicalSourceLine, number>()
  private readonly _entries = new Map<IBlot, Entry>()
  private readonly _byDom = new WeakMap<Node, IBlot>()
  private readonly _lengths: LineSums
  private readonly _childCounts: LineSums
  private readonly _leafCounts: LineSums
  private _plainText: string | undefined
  private _hasEmbeds = false

  constructor(children: readonly IBlot[]) {
    let group: IBlot[] = []
    for (const child of children) {
      group.push(child)
      if (child instanceof TextBlot && child.text === '\n') {
        this._append(group)
        group = []
      }
    }
    // The trailing Break belongs to the final source line, including an empty tail.
    if (group.length || !this._lines.length) this._append(group)
    this._lengths = new LineSums(this._lines.map(line => line.length))
    this._childCounts = new LineSums(this._lines.map(line => line.children.length))
    this._leafCounts = new LineSums(this._lines.map(line => line.leaves.length))
  }

  private _append(children: readonly IBlot[]): void {
    const line = this._makeLine(children)
    this._lineNumbers.set(line, this._lines.length)
    this._lines.push(line)
  }

  private _makeLine(children: readonly IBlot[]): LogicalSourceLine {
    const leaves: Leaf[] = []
    const parts: string[] = []
    const offsets: number[] = []
    let length = 0
    for (const child of children) {
      offsets.push(length)
      if (child instanceof TextBlot) {
        const text = child.text
        parts.push(text)
        length += text.length
        leaves.push(child)
      } else if (child instanceof EmbedBlot) {
        this._hasEmbeds = true
        length += child.length
        leaves.push(child)
      }
    }
    const line: LogicalSourceLine = {children, leaves, text: parts.join(''), length}
    let leafIndex = 0
    children.forEach((child, childIndex) => {
      this._byDom.set(child.domNode, child)
      this._entries.set(child, {line, childIndex, leafIndex, offset: offsets[childIndex]})
      if (child.type === BlotType.Text || child.type === BlotType.Embed) leafIndex++
    })
    return line
  }

  get textLength(): number { return this._lengths.before(this._lines.length) }

  sourceLines(): readonly LogicalSourceLine[] { return this._lines }

  locate(line: LogicalSourceLine) {
    const lineIndex = this._lineNumbers.get(line)
    return lineIndex === undefined ? undefined : {
      lineIndex,
      modelOffset: this._lengths.before(lineIndex),
      childStart: this._childCounts.before(lineIndex),
      leafStart: this._leafCounts.before(lineIndex),
    }
  }

  lineOf(blot: IBlot): LogicalSourceLine | undefined { return this._entries.get(blot)?.line }

  lineAtLeafIndex(index: number): LogicalSourceLine {
    const total = this._leafCounts.before(this._lines.length)
    return index >= total ? this._lines[this._lines.length - 1]
      : this._lines[this._leafCounts.firstEndAtLeast(index + 1)]
  }

  blotFromDom(node: Node): IBlot | undefined { return this._byDom.get(node) }

  offsetOf(blot: IBlot): number {
    const entry = this._entries.get(blot)
    if (!entry) return -1
    return this._lengths.before(this._lineNumbers.get(entry.line)!) + entry.offset
  }

  childIndexOf(blot: IBlot): number {
    const entry = this._entries.get(blot)
    if (!entry) return -1
    return this._childCounts.before(this._lineNumbers.get(entry.line)!) + entry.childIndex
  }

  nextLeaf(leaf: Leaf): Leaf | undefined {
    const entry = this._entries.get(leaf)
    if (!entry) return undefined
    const next = entry.line.leaves[entry.leafIndex + 1]
    if (next) return next
    for (let i = this._lineNumbers.get(entry.line)! + 1; i < this._lines.length; i++) {
      if (this._lines[i].leaves.length) return this._lines[i].leaves[0]
    }
    return undefined
  }

  findByOffset(offset: number): {blot: Leaf; localOffset: number} | null {
    let lineIndex = this._lengths.firstEndAtLeast(offset)
    while (lineIndex > 0 && !this._lines[lineIndex].leaves.length) lineIndex--
    const line = this._lines[lineIndex]
    if (!line?.leaves.length) return null
    let remaining = offset - this._lengths.before(lineIndex)
    for (const leaf of line.leaves) {
      const entry = this._entries.get(leaf)!
      const end = entry.leafIndex + 1 < line.leaves.length
        ? this._entries.get(line.leaves[entry.leafIndex + 1])!.offset
        : line.length
      const length = end - entry.offset
      if (remaining <= length || leaf === line.leaves.at(-1)) return {blot: leaf, localOffset: remaining}
      remaining -= length
    }
    return null
  }

  replaceLine(previous: LogicalSourceLine, children: readonly IBlot[]): LogicalSourceLine {
    const index = this._lineNumbers.get(previous)!
    for (const child of previous.children) {
      this._entries.delete(child)
      this._byDom.delete(child.domNode)
    }
    const next = this._makeLine(children)
    this._lines[index] = next
    this._lineNumbers.delete(previous)
    this._lineNumbers.set(next, index)
    this._lengths.add(index, next.length - previous.length)
    this._childCounts.add(index, next.children.length - previous.children.length)
    this._leafCounts.add(index, next.leaves.length - previous.leaves.length)
    this._plainText = undefined
    return next
  }

  trustedPlainText(): string | undefined {
    if (this._hasEmbeds) return undefined
    return this._plainText ??= this._lines.map(line => line.text).join('')
  }
}
