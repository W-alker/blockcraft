import {BlockNodeType, IBlockSnapshot, STR_LINE_BREAK} from "../block-std";
import {generateId} from "./id";
import {deltaToString} from "../../global";
import {isOrderedMarkerStyleId, resolveOrderedMarker} from '@ccc/blockcraft/global/utils';

export const replaceSnapshotsIdDeeply = (snapshots: IBlockSnapshot[]) => {
  snapshots.forEach(v => {
    v.id = generateId()

    if ((v.nodeType === BlockNodeType.root || v.nodeType === BlockNodeType.block) && v.children.length) {
      replaceSnapshotsIdDeeply(v.children)
    }
  })
}

export const replaceSnapshotsDepths = (snapshots: IBlockSnapshot[], startDepth: number) => {
  // snapshots.forEach(v => {
    // v.props.depth = startDepth
  // })
}

export const snapshots2Text = (
  snapshots: IBlockSnapshot[],
  options: {includeBlockFormatting?: boolean} = {},
) => {
  let str = ''

  const append = (snapshot: IBlockSnapshot) => {
    if (snapshot.nodeType === 'editable') {
      let prefix = ''
      if (options.includeBlockFormatting !== false) {
        const rawDepth = Number(snapshot.props.depth ?? 0)
        const depth = Number.isSafeInteger(rawDepth) && rawDepth > 0 ? rawDepth : 0
        prefix = '\t'.repeat(Math.min(depth, 100))
        if (snapshot.flavour === 'ordered') {
          const rawOrder = Number(snapshot.props['order'] ?? Number(snapshot.props['start'] ?? 1) - 1)
          const order = Number.isSafeInteger(rawOrder) && rawOrder >= 0 ? rawOrder : 0
          const style = snapshot.props['ms']
          // Bound legacy Roman output for malformed or extremely large counters.
          const marker = !isOrderedMarkerStyleId(style) && depth % 3 === 2 && order >= 3999
            ? `${order + 1}.`
            : resolveOrderedMarker(order, depth, isOrderedMarkerStyleId(style) ? style : undefined).text
          prefix += `${marker} `
        }
      }
      str += (prefix + deltaToString(snapshot.children) + STR_LINE_BREAK)
    }

    if (snapshot.nodeType === 'block' || snapshot.nodeType === 'root') {
      snapshot.children.forEach(append)
    }
  }

  snapshots.forEach(append)
  return str
}

