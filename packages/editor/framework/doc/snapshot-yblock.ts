import * as Y from 'yjs'
import {BlockNodeType, IBlockSnapshot, native2YBlock, NativeBlockModel, YBlock} from '../block-std'

/** Materialize snapshot data without creating any Angular block views. */
export function writeSnapshotsToYBlockMap(
  yBlockMap: Y.Map<YBlock>,
  snapshots: readonly IBlockSnapshot[],
): YBlock[] {
  const write = (snapshot: IBlockSnapshot): YBlock => {
    const children = snapshot.nodeType === BlockNodeType.editable
      ? snapshot.children
      : snapshot.children.map(child => child.id)
    const yBlock = native2YBlock({...snapshot, children} as NativeBlockModel)
    yBlockMap.set(snapshot.id, yBlock)

    if (snapshot.nodeType !== BlockNodeType.editable) {
      snapshot.children.forEach(write)
    }
    return yBlock
  }

  return snapshots.map(write)
}
