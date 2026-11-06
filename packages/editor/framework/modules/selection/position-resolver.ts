export interface SelectionTreeReader {
  getParentId(blockId: string): string | null | undefined;
  getChildrenIds(blockId: string): readonly string[] | null;
}

export type SelectionPositionOrder = -1 | 0 | 1;

export interface SelectionPositionResolution {
  readonly order: SelectionPositionOrder;
  readonly commonAncestor: string;
}

export class SelectionPositionResolver {
  constructor(private readonly reader: SelectionTreeReader) {}

  resolve(a: string, b: string): SelectionPositionResolution | null {
    const aPath = this._pathToRoot(a);
    if (!aPath) return null;
    if (a === b) return {order: 0, commonAncestor: a};

    const bPath = this._pathToRoot(b);
    if (!bPath || aPath[0] !== bPath[0]) return null;

    const sharedLength = Math.min(aPath.length, bPath.length);
    let divergence = 0;
    while (divergence < sharedLength && aPath[divergence] === bPath[divergence]) {
      divergence++;
    }

    if (divergence === sharedLength) {
      const commonAncestor = aPath[sharedLength - 1];
      const descendantPath = aPath.length > bPath.length ? aPath : bPath;
      const descendants = this._readChildrenIds(commonAncestor);
      if (!descendants || !descendants.includes(descendantPath[sharedLength])) return null;
      return {
        order: aPath.length < bPath.length ? -1 : 1,
        commonAncestor,
      };
    }

    const parentId = aPath[divergence - 1];
    const siblings = this._readChildrenIds(parentId);
    if (!siblings) return null;

    const aIndex = siblings.indexOf(aPath[divergence]);
    const bIndex = siblings.indexOf(bPath[divergence]);
    if (aIndex < 0 || bIndex < 0 || aIndex === bIndex) return null;
    return {
      order: aIndex < bIndex ? -1 : 1,
      commonAncestor: parentId,
    };
  }

  private _pathToRoot(blockId: string): string[] | null {
    const reversedPath: string[] = [];
    const visited = new Set<string>();
    let currentId: string | null = blockId;

    while (currentId) {
      if (visited.has(currentId)) return null;
      visited.add(currentId);

      const parentId = this._readParentId(currentId);
      if (parentId === undefined) return null;
      reversedPath.push(currentId);
      if (parentId === null) break;
      currentId = parentId;
    }

    return reversedPath.reverse();
  }

  private _readParentId(blockId: string): string | null | undefined {
    try {
      return this.reader.getParentId(blockId);
    } catch {
      return undefined;
    }
  }

  private _readChildrenIds(blockId: string): readonly string[] | null {
    try {
      return this.reader.getChildrenIds(blockId);
    } catch {
      return null;
    }
  }
}
