import {IBlot} from './blot'
import {TextBlot} from './text-blot'

/** @internal Persistent canonical line wrappers; never owns model positions. */
export class LogicalLineDom {
  private _lines: HTMLElement[] = []
  private _registered = new Set<HTMLElement>()
  private _lineByNode = new WeakMap<Node, HTMLElement>()
  private _lineByEndNode = new WeakMap<Node, HTMLElement>()
  private _nodesByLine = new Map<HTMLElement, readonly Node[]>()

  constructor(private readonly _container: HTMLElement, private readonly _tag: 'c-line') {}

  clear(): void {
    this._lines = []
    this._registered.clear()
    this._lineByNode = new WeakMap()
    this._lineByEndNode = new WeakMap()
    this._nodesByLine.clear()
  }

  owns(node: Node): boolean {
    return this._registered.has(node as HTMLElement) && node.parentNode === this._container
  }

  sync(children: readonly IBlot[], leadingGap: HTMLElement | null): void {
    const groups: Node[][] = [[]]
    for (const child of children) {
      groups[groups.length - 1].push(child.domNode)
      // Hidden deletion revisions retain their model LF but visually join the
      // neighboring text. Only painted line breaks create another DOM row.
      if (child instanceof TextBlot && child.text === '\n' && child.attrs?.['s:display'] !== 'none') {
        groups.push([])
      }
    }

    // Reserve existing wrappers by stable child identity before assigning new
    // rows. Inserting a line above the first old row must not steal its wrapper.
    const reserved = new Set<HTMLElement>()
    const targets: Array<HTMLElement | undefined> = groups.map(group => {
      const end = group.at(-1)
      const oldLine = end && this._lineByEndNode.get(end)
      if (oldLine && this._registered.has(oldLine) && !reserved.has(oldLine)) {
        reserved.add(oldLine)
        return oldLine
      }
      return undefined
    })
    for (let index = 0; index < groups.length; index++) {
      if (targets[index]) continue
      const group = groups[index]
      for (const node of group) {
        const oldLine = this._lineByNode.get(node)
        if (oldLine && this._registered.has(oldLine) && !reserved.has(oldLine)) {
          reserved.add(oldLine)
          targets[index] = oldLine
          break
        }
      }
    }
    const available = this._lines.filter(line => !reserved.has(line))
    let availableIndex = 0
    const nextLines = targets.map(line =>
      line ?? available[availableIndex++] ?? this._container.ownerDocument.createElement(this._tag),
    )
    const retained = new Set(nextLines)
    const nextEndNodes = new WeakMap<Node, HTMLElement>()
    const nextNodes = new Map<HTMLElement, readonly Node[]>()
    let rootReference = this._container.firstChild
    for (let index = 0; index < groups.length; index++) {
      const line = nextLines[index]
      // Retired rows stay connected until their retained leaves have moved.
      // Skip them as anchors so deleting a row does not reinsert every suffix row.
      while (rootReference && this._registered.has(rootReference as HTMLElement) &&
        !retained.has(rootReference as HTMLElement)) {
        rootReference = rootReference.nextSibling
      }
      if (line === rootReference) rootReference = rootReference.nextSibling
      else this._container.insertBefore(line, rootReference)

      const nodes = groups[index]
      nextNodes.set(line, nodes.slice())
      const end = nodes.at(-1)
      if (end) nextEndNodes.set(end, line)
      if (index === 0 && leadingGap) nodes.unshift(leadingGap)
      let reference = line.firstChild
      for (const node of nodes) {
        if (node === reference) reference = reference.nextSibling
        else line.insertBefore(node, reference)
        this._lineByNode.set(node, line)
      }
    }
    for (const oldLine of this._lines) {
      if (!retained.has(oldLine)) oldLine.remove()
    }
    this._lines = nextLines
    this._registered = retained
    this._lineByEndNode = nextEndNodes
    this._nodesByLine = nextNodes
  }

  /** Same source-line boundaries: only its containing display row can change. */
  syncLine(previous: readonly IBlot[], next: readonly IBlot[], leadingGap: HTMLElement | null): boolean {
    if (!previous.length) return false
    const first = previous[0].domNode
    const line = this._lineByNode.get(first)
    const nodes = line && this._nodesByLine.get(line)
    if (!line || !nodes || !this.owns(line)) return false
    const start = nodes.indexOf(first)
    if (start < 0 || previous.some((child, index) => nodes[start + index] !== child.domNode)) return false
    const inserted = next.map(child => child.domNode)
    const updated = [...nodes.slice(0, start), ...inserted, ...nodes.slice(start + previous.length)]
    const previousSibling = start ? nodes[start - 1] : line === this._lines[0] ? leadingGap : null
    let reference = previousSibling ? previousSibling.nextSibling : line.firstChild
    for (const node of inserted) {
      if (node === reference) reference = reference.nextSibling
      else line.insertBefore(node, reference)
      this._lineByNode.set(node, line)
    }
    const retained = new Set(inserted)
    for (const child of previous) {
      if (!retained.has(child.domNode)) this._lineByNode.delete(child.domNode)
    }
    const oldEnd = nodes.at(-1)
    if (oldEnd) this._lineByEndNode.delete(oldEnd)
    const end = updated.at(-1)
    if (end) this._lineByEndNode.set(end, line)
    this._nodesByLine.set(line, updated)
    return true
  }

  /** Full recovery only: reject native siblings that canonical ordering ignores. */
  hasOnlyManagedNodes(leadingGap: HTMLElement | null): boolean {
    if (this._container.childNodes.length !== this._lines.length) return false
    for (let index = 0; index < this._lines.length; index++) {
      const line = this._lines[index]
      if (this._container.childNodes[index] !== line) return false
      const nodes = this._nodesByLine.get(line)!
      const gapCount = index === 0 && leadingGap ? 1 : 0
      if (line.childNodes.length !== nodes.length + gapCount) return false
      if (gapCount && line.firstChild !== leadingGap) return false
      for (let i = 0; i < nodes.length; i++) {
        if (line.childNodes[i + gapCount] !== nodes[i]) return false
      }
    }
    return true
  }

  hasCanonicalOrder(children: readonly IBlot[]): boolean {
    const expected = children.map(child => child.domNode)
    const owned = new Set<Node>(expected)
    let index = 0
    let lineIndex = 0
    for (const direct of Array.from(this._container.childNodes)) {
      if (!this._registered.has(direct as HTMLElement)) continue
      if (direct !== this._lines[lineIndex++]) return false
      for (const node of Array.from(direct.childNodes)) {
        if (owned.has(node) && node !== expected[index++]) return false
      }
    }
    return lineIndex === this._lines.length && index === expected.length
  }
}
