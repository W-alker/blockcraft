export interface SelectionModelReader {
  exists(blockId: string): boolean
  getParentId(blockId: string): string | null
  getChildrenIds(blockId: string): readonly string[]
  getTextLength(blockId: string): number
}

/** Structural selection reads that remain valid without mounted block components. */
export class SelectionModelResolver {
  constructor(private readonly reader: SelectionModelReader) {}

  exists(blockId: string): boolean {
    return this.reader.exists(blockId)
  }

  getChildrenIds(blockId: string): readonly string[] {
    return this.reader.getChildrenIds(blockId)
  }

  getTextLength(blockId: string): number {
    return this.reader.getTextLength(blockId)
  }

  directChildIndexUnder(parentId: string, blockId: string): number | null {
    if (!this.exists(parentId) || !this.exists(blockId)) return null

    let currentId = blockId
    const visited = new Set<string>()
    while (!visited.has(currentId)) {
      visited.add(currentId)
      const currentParentId = this.reader.getParentId(currentId)
      if (currentParentId === parentId) {
        const index = this.getChildrenIds(parentId).indexOf(currentId)
        return index < 0 ? null : index
      }
      if (currentParentId === null) return null
      currentId = currentParentId
    }
    return null
  }

  contentBlockId(
    boundaryBlockId: string,
    boundaryIndex: number,
    side: "start" | "end",
  ): string {
    const ids = this.getChildrenIds(boundaryBlockId)
    if (!ids.length) return boundaryBlockId
    const index = side === "start"
      ? Math.min(Math.max(0, boundaryIndex), ids.length - 1)
      : Math.max(0, Math.min(boundaryIndex, ids.length) - 1)
    return ids[index]
  }
}
